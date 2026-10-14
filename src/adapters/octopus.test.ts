import { describe, it, expect, vi } from 'vitest';
import type { MeterSelection, Rate } from '../domain/types';
import { emptyProject } from '../domain/project';
import { OctopusClient, mergeIntervals, mergeRates } from './octopus';
const meter: MeterSelection = {
  mpan: 'synthetic-mpan',
  serial: 'synthetic-meter',
  direction: 'import',
  agreements: [
    { tariffCode: 'E-1R-SYNTHETIC-26-01-01-A', start: '2026-01-01T00:00:00Z', end: null },
  ],
};
const page = (results: unknown[], next: string | null = null) =>
  new Response(JSON.stringify({ results, next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
describe('Octopus adapter contract (mocked, no live-account claims)', () => {
  it('discovers old agreements, changed meters and export direction without unrelated account data', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            properties: [
              {
                address: 'unrelated do not retain',
                electricity_meter_points: [
                  {
                    mpan: 'synthetic-import',
                    is_export: false,
                    meters: [{ serial_number: 'old' }, { serial_number: 'new' }],
                    agreements: [
                      {
                        tariff_code: meter.agreements[0].tariffCode,
                        valid_from: '2025-01-01T00:00:00Z',
                        valid_to: '2026-01-01T00:00:00Z',
                      },
                      {
                        tariff_code: 'E-1R-SYNTHETIC-26-01-01-A',
                        valid_from: '2026-01-01T00:00:00Z',
                        valid_to: null,
                      },
                    ],
                  },
                  {
                    mpan: 'synthetic-export',
                    is_export: true,
                    meters: [{ serial_number: 'export' }],
                    agreements: [],
                  },
                ],
              },
            ],
          }),
        ),
    );
    const result = await new OctopusClient(fetcher).discover('synthetic-account', 'synthetic-key');
    expect(result.meters.map((m) => m.direction)).toEqual(['import', 'import', 'export']);
    expect(result.meters[0].agreements).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('address');
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it('retains successful pages through rate limits and permits corrected idempotent retry', async () => {
    const project = emptyProject();
    project.connection.meters = [meter];
    project.baseline.annualKWh = 4200;
    let fail = true;
    let corrected = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes('consumption')) {
        if (url.searchParams.has('page'))
          return fail
            ? new Response('', { status: 429 })
            : page([
                {
                  interval_start: '2026-01-01T00:30:00Z',
                  interval_end: '2026-01-01T01:00:00Z',
                  consumption: 2,
                },
              ]);
        return page(
          [
            {
              interval_start: corrected ? '2026-01-01T00:00:00+00:00' : '2026-01-01T00:00:00Z',
              interval_end: '2026-01-01T00:30:00Z',
              consumption: corrected ? 3 : 1,
            },
          ],
          `https://api.octopus.energy${url.pathname}?page=2`,
        );
      }
      return page([
        {
          valid_from: '2026-01-01T00:00:00Z',
          valid_to: '2026-02-01T00:00:00Z',
          value_inc_vat: url.pathname.includes('standing') ? 60 : -10,
        },
      ]);
    });
    const client = new OctopusClient(fetcher);
    const options = { start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' };
    const partial = await client.refresh(project, 'synthetic-key', options);
    expect(partial.cache.refreshStatus).toBe('incomplete');
    expect(partial.cache.intervals).toHaveLength(1);
    expect(partial.cache.error).toMatch(/rate limit/);
    expect(partial.baseline).toEqual(project.baseline);
    fail = false;
    corrected = true;
    const complete = await client.refresh(partial, 'synthetic-key', options);
    expect(complete.cache.refreshStatus).toBe('complete');
    expect(complete.cache.intervals.map((i) => i.kWh)).toEqual([3, 2]);
    const repeated = await client.refresh(complete, 'synthetic-key', options);
    expect(repeated.cache.intervals).toEqual(complete.cache.intervals);
    expect(repeated.cache.rates).toEqual(complete.cache.rates);
    expect(repeated.cache.rates[0].pence).toBe(-10);
    expect(repeated.connection).toEqual(project.connection);
  });
  it('refuses pagination to third-party destinations before exposing headers', async () => {
    const fetcher = vi.fn(async () => page([], 'https://unrelated.example/page'));
    const client = new OctopusClient(fetcher);
    await expect(
      client.consumption(
        meter,
        'synthetic-key',
        '2026-01-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
        () => {},
      ),
    ).rejects.toThrow(/destination/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses the explicit payment method and rejects unexplained overlapping prices', async () => {
    const base = { valid_from: '2026-01-01T00:00:00Z', valid_to: '2026-02-01T00:00:00Z' };
    const fetcher = vi.fn(async () =>
      page([
        { ...base, value_inc_vat: 28, payment_method: 'DIRECT_DEBIT' },
        { ...base, value_inc_vat: 30, payment_method: 'NON_DIRECT_DEBIT' },
      ]),
    );
    const collected: Rate[] = [];
    await new OctopusClient(fetcher).tariffRates(
      meter.agreements[0].tariffCode,
      'import',
      base.valid_from,
      base.valid_to,
      (rows) => {
        collected.push(...rows);
      },
    );
    expect(collected.map((r) => r.pence)).toEqual([28]);
    const ambiguous = new OctopusClient(async () =>
      page([
        { ...base, value_inc_vat: 28 },
        { ...base, value_inc_vat: 30 },
      ]),
    );
    await expect(
      ambiguous.tariffRates(
        meter.agreements[0].tariffCode,
        'import',
        base.valid_from,
        base.valid_to,
        () => {},
      ),
    ).rejects.toThrow(/ambiguous/);
  });
  it('merges UTC-equivalent meter corrections and splits a corrected rate window', () => {
    expect(
      mergeIntervals(
        [
          {
            start: '2026-07-01T00:00:00Z',
            end: '2026-07-01T00:30:00Z',
            kWh: 1,
            direction: 'export',
            meter: 'synthetic',
          },
        ],
        [
          {
            start: '2026-07-01T01:00:00+01:00',
            end: '2026-07-01T01:30:00+01:00',
            kWh: 2,
            direction: 'export',
            meter: 'synthetic',
          },
        ],
      ),
    ).toHaveLength(1);
    const old: Rate = {
      start: '2026-01-01T00:00:00Z',
      end: '2026-02-01T00:00:00Z',
      pence: 20,
      direction: 'import',
      source: 'synthetic',
    };
    const fresh: Rate = {
      ...old,
      start: '2026-01-15T00:00:00Z',
      end: '2026-01-20T00:00:00Z',
      pence: 10,
    };
    const merged = mergeRates([old], [fresh]);
    expect(merged.map((r) => r.pence)).toEqual([20, 10, 20]);
    expect(merged[0].end).toBe(fresh.start);
    expect(merged[2].start).toBe(fresh.end);
    expect(mergeRates(merged, [fresh])).toEqual(merged);
  });
});
