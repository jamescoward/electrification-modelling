import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
import type { Interval, MeterSelection, Project, Rate, SourceCache } from '../domain/types';
import { validTimestamp, compareTimestamps, timestampIdentity } from './timestamp';

const BASE = 'https://api.octopus.energy/v1/';
const stamp = z.string().refine(validTimestamp, 'Invalid API timestamp');
const consumptionSchema = z.object({
  interval_start: stamp,
  interval_end: stamp,
  consumption: z.number().finite().nonnegative(),
});
const rateSchema = z.object({
  valid_from: stamp,
  valid_to: stamp.nullable(),
  value_inc_vat: z.number().finite(),
  payment_method: z.enum(['DIRECT_DEBIT', 'NON_DIRECT_DEBIT']).nullish(),
});
const agreementSchema = z.object({
  tariff_code: z.string().min(1),
  valid_from: stamp,
  valid_to: stamp.nullable(),
});
const pointSchema = z.object({
  mpan: z.string().min(1),
  is_export: z.boolean(),
  meters: z.array(z.object({ serial_number: z.string().min(1) })),
  agreements: z.array(agreementSchema),
});
const accountSchema = z.object({
  properties: z.array(z.object({ electricity_meter_points: z.array(pointSchema) })),
});
export type PaymentMethod = 'DIRECT_DEBIT' | 'NON_DIRECT_DEBIT';
export interface DiscoveredAccount {
  propertyCount: number;
  meters: MeterSelection[];
}
export interface Product {
  code: string;
  displayName: string;
  availableFrom: string | null;
  availableTo: string | null;
}
export interface RefreshOptions {
  start?: string;
  end?: string;
  full?: boolean;
  onProgress?: (cache: SourceCache) => void | Promise<void>;
}
export class OctopusError extends Error {
  constructor(
    public status: number | null,
    public retryAfter: string | null = null,
  ) {
    super(
      status === 401 || status === 403
        ? 'Octopus rejected access. Check your key and account details.'
        : status === 429
          ? 'Octopus rate limit reached. Wait and retry; completed pages are retained.'
          : status
            ? `Octopus request failed (${status}). Completed pages are retained.`
            : 'Octopus could not be reached. Check network access or browser CORS. Completed pages are retained.',
    );
    this.name = 'OctopusError';
  }
}
function safeUrl(url: string): URL {
  const parsed = new URL(url, BASE);
  if (
    parsed.origin !== 'https://api.octopus.energy' ||
    !parsed.pathname.startsWith('/v1/') ||
    parsed.username ||
    parsed.password
  )
    throw new Error('Unexpected API pagination destination refused.');
  return parsed;
}
function instantKey(stamp: string): string {
  return timestampIdentity(stamp);
}
export function mergeIntervals(old: Interval[], fresh: Interval[]): Interval[] {
  const map = new Map<string, Interval>();
  for (const r of [...old, ...fresh])
    map.set(`${r.direction}|${r.meter}|${instantKey(r.start)}`, r);
  return [...map.values()].sort((a, b) => compareTimestamps(a.start, b.start));
}
export function mergeRates(old: Rate[], fresh: Rate[]): Rate[] {
  const records: Rate[] = [];
  for (const direction of ['import', 'export', 'standing'] as const) {
    const map = new Map<string, Rate>();
    for (const r of fresh.filter((r) => r.direction === direction)) map.set(instantKey(r.start), r);
    const incoming = [...map.values()].sort((a, b) => compareTimestamps(a.start, b.start));
    const previous = old
      .filter((r) => r.direction === direction)
      .sort((a, b) => compareTimestamps(a.start, b.start));
    const overlapping = incoming.some(
      (r, i) =>
        i > 0 &&
        (incoming[i - 1].end === null || compareTimestamps(r.start, incoming[i - 1].end!) < 0),
    );
    if (overlapping) {
      let merged = previous;
      for (const update of fresh.filter((r) => r.direction === direction)) {
        const retained: Rate[] = [];
        for (const existing of merged) {
          const overlap =
            (existing.end === null || compareTimestamps(update.start, existing.end) < 0) &&
            (update.end === null || compareTimestamps(existing.start, update.end) < 0);
          if (!overlap) {
            retained.push(existing);
            continue;
          }
          if (compareTimestamps(existing.start, update.start) < 0)
            retained.push({ ...existing, end: update.start });
          if (
            update.end &&
            (existing.end === null || compareTimestamps(existing.end, update.end) > 0)
          )
            retained.push({ ...existing, start: update.end });
        }
        merged = [...retained, update];
      }
      records.push(...merged);
      continue;
    }
    let cursor = 0;
    for (const existing of previous) {
      while (
        cursor < incoming.length &&
        incoming[cursor].end !== null &&
        compareTimestamps(incoming[cursor].end!, existing.start) <= 0
      )
        cursor++;
      let position = existing.start;
      for (
        let i = cursor;
        i < incoming.length &&
        (existing.end === null || compareTimestamps(incoming[i].start, existing.end) < 0);
        i++
      ) {
        const update = incoming[i];
        if (compareTimestamps(update.start, position) > 0)
          records.push({ ...existing, start: position, end: update.start });
        if (update.end === null) {
          position = '';
          break;
        }
        if (compareTimestamps(update.end, position) > 0) position = update.end;
        if (existing.end !== null && compareTimestamps(position, existing.end) >= 0) {
          position = '';
          break;
        }
      }
      if (position && (existing.end === null || compareTimestamps(position, existing.end) < 0))
        records.push({ ...existing, start: position });
    }
    records.push(...incoming);
  }
  return records.sort((a, b) => compareTimestamps(a.start, b.start));
}
export class OctopusClient {
  constructor(
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private now: () => Date = () => new Date(),
    private paymentMethod: PaymentMethod = 'DIRECT_DEBIT',
  ) {}
  private async json(url: string, key?: string): Promise<unknown> {
    const target = safeUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetcher(target.href, {
        method: 'GET',
        credentials: 'omit',
        headers: key ? { Authorization: `Basic ${btoa(`${key}:`)}` } : {},
        signal: controller.signal,
      });
      if (!response.ok)
        throw new OctopusError(response.status, response.headers.get('Retry-After'));
      return await response.json();
    } catch (error) {
      if (error instanceof OctopusError) throw error;
      throw new OctopusError(null);
    } finally {
      clearTimeout(timeout);
    }
  }
  private async pages(
    url: string,
    key: string | undefined,
    onPage: (rows: unknown[], endpoint: string) => void | Promise<void>,
  ): Promise<void> {
    const seen = new Set<string>();
    let next: string | null = url;
    while (next) {
      const endpoint: string = safeUrl(next).href;
      if (seen.has(endpoint))
        throw new Error('API pagination repeated a page. Completed pages are retained.');
      seen.add(endpoint);
      const page = z
        .object({ results: z.array(z.unknown()), next: z.string().nullable() })
        .parse(await this.json(endpoint, key));
      await onPage(page.results, endpoint);
      next = page.next ? new URL(page.next, endpoint).href : null;
    }
  }
  async discover(accountNumber: string, key: string): Promise<DiscoveredAccount> {
    const account = accountSchema.parse(
      await this.json(`accounts/${encodeURIComponent(accountNumber)}/`, key),
    );
    return {
      propertyCount: account.properties.length,
      meters: account.properties.flatMap((property) =>
        property.electricity_meter_points.flatMap((point) =>
          point.meters.map((meter) => ({
            mpan: point.mpan,
            serial: meter.serial_number,
            direction: point.is_export ? ('export' as const) : ('import' as const),
            agreements: point.agreements.map((a) => ({
              tariffCode: a.tariff_code,
              start: a.valid_from,
              end: a.valid_to,
            })),
          })),
        ),
      ),
    };
  }
  async products(availableAt?: string): Promise<Product[]> {
    const products: Product[] = [];
    const query = new URLSearchParams({ page_size: '100' });
    if (availableAt) query.set('available_at', availableAt);
    await this.pages(`products/?${query}`, undefined, (rows) => {
      for (const row of rows) {
        const p = z
          .object({
            code: z.string(),
            display_name: z.string(),
            available_from: stamp.nullable(),
            available_to: stamp.nullable(),
          })
          .parse(row);
        products.push({
          code: p.code,
          displayName: p.display_name,
          availableFrom: p.available_from,
          availableTo: p.available_to,
        });
      }
    });
    return products;
  }
  async consumption(
    meter: MeterSelection,
    key: string,
    start: string,
    end: string,
    onPage: (records: Interval[], endpoint: string) => void | Promise<void>,
  ): Promise<void> {
    const query = new URLSearchParams({
      period_from: start,
      period_to: end,
      page_size: '25000',
      order_by: 'period',
    });
    await this.pages(
      `electricity-meter-points/${encodeURIComponent(meter.mpan)}/meters/${encodeURIComponent(meter.serial)}/consumption/?${query}`,
      key,
      async (rows, url) => {
        const records = rows.map((row) => {
          const r = consumptionSchema.parse(row);
          if (compareTimestamps(r.interval_start, r.interval_end) >= 0)
            throw new Error('API returned an invalid meter interval.');
          return {
            start: r.interval_start,
            end: r.interval_end,
            kWh: r.consumption,
            direction: meter.direction,
            meter: meter.serial,
          };
        });
        await onPage(records, url);
      },
    );
  }
  async tariffRates(
    tariffCode: string,
    direction: Rate['direction'],
    start: string,
    end: string,
    onPage: (records: Rate[], endpoint: string) => void | Promise<void>,
    paymentMethod: PaymentMethod = this.paymentMethod,
  ): Promise<void> {
    const accepted: Rate[] = [];
    const match = /^E-\dR-(.+)-[A-P]$/.exec(tariffCode);
    if (!match)
      throw new Error('Unrecognised electricity tariff code. Confirm the selected agreement.');
    const endpoint = `products/${encodeURIComponent(match[1])}/electricity-tariffs/${encodeURIComponent(tariffCode)}/${direction === 'standing' ? 'standing-charges' : 'standard-unit-rates'}/`;
    const query = new URLSearchParams({ period_from: start, period_to: end, page_size: '25000' });
    await this.pages(`${endpoint}?${query}`, undefined, async (rows, url) => {
      const records: Rate[] = [];
      for (const row of rows) {
        const r = rateSchema.parse(row);
        if (r.payment_method && r.payment_method !== paymentMethod) continue;
        const record: Rate = {
          start: r.valid_from,
          end: r.valid_to,
          pence: r.value_inc_vat,
          direction,
          source: tariffCode,
        };
        if (record.end && compareTimestamps(record.start, record.end) >= 0)
          throw new Error('API returned an invalid tariff period.');
        records.push(record);
      }
      const ordered = [...accepted, ...records].sort((a, b) => compareTimestamps(a.start, b.start));
      let covering: Rate | undefined;
      for (const r of ordered) {
        if (covering && (covering.end === null || compareTimestamps(r.start, covering.end) < 0)) {
          if (covering.pence !== r.pence)
            throw new Error(
              'API returned ambiguous overlapping rates for the selected payment method. Confirm the tariff before reconstructing bills.',
            );
          if (
            covering.end !== null &&
            (r.end === null || compareTimestamps(r.end, covering.end) > 0)
          )
            covering = r;
        } else covering = r;
      }
      accepted.push(...records);
      await onPage(records, url);
    });
  }
  /** Only source cache is refreshed. Selected agreements, facts, overrides and assumptions remain unchanged. */
  async refresh(project: Project, key: string, options: RefreshOptions = {}): Promise<Project> {
    const end = options.end ?? this.now().toISOString();
    const initial = project.occupancyDate
      ? Temporal.PlainDate.from(project.occupancyDate)
          .toZonedDateTime({ timeZone: 'Europe/London', plainTime: '00:00' })
          .toInstant()
          .toString()
      : Temporal.Instant.from(end)
          .subtract({ hours: 24 * 365 })
          .toString();
    const latest = project.cache.intervals.reduce(
      (max, r) => (compareTimestamps(r.end, max) > 0 ? r.end : max),
      initial,
    );
    const recent = Temporal.Instant.from(latest)
      .subtract({ hours: 24 * 30 })
      .toString();
    const start =
      options.start ??
      (options.full ? initial : compareTimestamps(recent, initial) > 0 ? recent : initial);
    if (compareTimestamps(start, end) >= 0) throw new Error('Refresh end must follow start.');
    let cache: SourceCache = {
      ...project.cache,
      intervals: [...project.cache.intervals],
      rates: [...project.cache.rates],
      endpoints: [...project.cache.endpoints],
      requestPeriod: { start, end },
      refreshStatus: 'incomplete',
    };
    delete cache.error;
    const record = async (endpoint: string) => {
      cache = {
        ...cache,
        retrievedAt: this.now().toISOString(),
        endpoints: [...new Set([...cache.endpoints, endpoint])],
      };
      await options.onProgress?.(cache);
    };
    try {
      if (!project.connection.meters.length)
        throw new Error('Select and confirm at least one discovered meter first.');
      for (const direction of ['import', 'export'] as const) {
        if (
          new Set(
            project.connection.meters.filter((m) => m.direction === direction).map((m) => m.mpan),
          ).size > 1
        )
          throw new Error(
            'Select one property and one electricity meter point per direction before refresh. Multiple replacement serials for that meter point are supported.',
          );
      }
      for (const meter of project.connection.meters) {
        const fetched: Interval[] = [];
        await this.consumption(meter, key, start, end, async (records, url) => {
          fetched.push(...records);
          cache = { ...cache, intervals: mergeIntervals(cache.intervals, records) };
          await record(url);
        });
        // Completed endpoint is authoritative within its requested window. On a
        // partial failure this step is never reached, retaining the last good data.
        cache = {
          ...cache,
          intervals: mergeIntervals(
            cache.intervals.filter(
              (r) =>
                !(
                  r.meter === meter.serial &&
                  r.direction === meter.direction &&
                  compareTimestamps(r.start, start) >= 0 &&
                  compareTimestamps(r.start, end) < 0
                ),
            ),
            fetched,
          ),
        };
        if (
          !meter.agreements.some(
            (a) =>
              compareTimestamps(a.start, end) < 0 &&
              (a.end === null || compareTimestamps(a.end, start) > 0),
          )
        )
          throw new Error(
            'No confirmed tariff agreement covers this meter period. Confirm discovered agreements or enter a bill correction.',
          );
        for (const agreement of meter.agreements) {
          const from = compareTimestamps(agreement.start, start) > 0 ? agreement.start : start;
          const to =
            agreement.end && compareTimestamps(agreement.end, end) < 0 ? agreement.end : end;
          if (compareTimestamps(from, to) >= 0) continue;
          for (const direction of (meter.direction === 'import'
            ? ['import', 'standing']
            : ['export']) as Rate['direction'][]) {
            const fetchedRates: Rate[] = [];
            await this.tariffRates(
              agreement.tariffCode,
              direction,
              from,
              to,
              async (records, url) => {
                const clipped = records
                  .map((r) => ({
                    ...r,
                    start: compareTimestamps(r.start, from) < 0 ? from : r.start,
                    end: r.end === null || compareTimestamps(r.end, to) > 0 ? to : r.end,
                  }))
                  .filter((r) => r.end !== null && compareTimestamps(r.start, r.end) < 0);
                fetchedRates.push(...clipped);
                cache = { ...cache, rates: mergeRates(cache.rates, clipped) };
                await record(url);
              },
            );
            const retained = cache.rates.flatMap((r) => {
              if (
                r.direction !== direction ||
                (r.end !== null && compareTimestamps(r.end, from) <= 0) ||
                compareTimestamps(r.start, to) >= 0
              )
                return [r];
              const pieces: Rate[] = [];
              if (compareTimestamps(r.start, from) < 0) pieces.push({ ...r, end: from });
              if (r.end === null || compareTimestamps(r.end, to) > 0)
                pieces.push({ ...r, start: to });
              return pieces;
            });
            cache = { ...cache, rates: mergeRates(retained, fetchedRates) };
          }
        }
      }
      cache = { ...cache, refreshStatus: 'complete' };
    } catch (error) {
      cache = {
        ...cache,
        refreshStatus: 'incomplete',
        error:
          error instanceof OctopusError
            ? error.message
            : error instanceof z.ZodError
              ? 'API returned unexpected data; completed pages and manual inputs are retained.'
              : error instanceof Error
                ? error.message
                : 'Refresh failed; completed pages are retained.',
      };
    }
    await options.onProgress?.(cache);
    return { ...project, cache };
  }
}
