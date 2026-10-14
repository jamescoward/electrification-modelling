import { parseBackup, exportBackup } from '../adapters/backup';
import { projectModel } from './model';
import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { emptyProject } from '../domain/project';
import type { SourceCache } from '../domain/types';
import {
  buildBaseline,
  buildReferenceProfile,
  buildAvailableReferenceProfile,
} from './sourceProfile';
function source(): SourceCache {
  const cache = emptyProject().cache;
  let day = Temporal.PlainDate.from('2024-01-01');
  for (; day.year === 2024; day = day.add({ days: 1 })) {
    const a = day
      .toZonedDateTime({ timeZone: 'Europe/London', plainTime: '00:00' })
      .toInstant()
      .toString();
    const b = day
      .add({ days: 1 })
      .toZonedDateTime({ timeZone: 'Europe/London', plainTime: '00:00' })
      .toInstant()
      .toString();
    for (const direction of ['import', 'export'] as const)
      cache.intervals.push({
        start: a,
        end: b,
        kWh: direction === 'import' ? 24 : 4,
        meter: `synthetic-${direction}`,
        direction,
      });
  }
  return cache;
}
describe('explicit source-to-assumption workflows', () => {
  it('conserves a complete leap seasonal year across DST with both energy directions', () => {
    const cache = source();
    const p = emptyProject();
    p.forecast.cheapStartHour = 0;
    p.forecast.cheapEndHour = 6;
    const profile = buildReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    expect(profile.reduce((n, r) => n + r.importKWh, 0)).toBeCloseTo(366 * 24, 8);
    expect(profile.reduce((n, r) => n + r.exportKWh, 0)).toBeCloseTo(366 * 4, 8);
    expect(profile[0].cheapFraction).toBeCloseTo(0.25, 8);
    expect(profile[2].cheapFraction).not.toEqual(0.25);
    expect(profile[9].cheapFraction).not.toEqual(0.25);
    expect(p.forecast.profile).toEqual([]);
  });
  it('rejects missing export and partial years rather than labelling estimates measured', () => {
    const cache = source(),
      p = emptyProject();
    cache.intervals = cache.intervals.filter(
      (r) => !(r.direction === 'export' && r.start === '2024-01-01T00:00:00Z'),
    );
    expect(() => buildReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast)).toThrow(
      /missing export/,
    );
    expect(() => buildReferenceProfile(cache, '2024-01-01', '2024-03-01', p.forecast)).toThrow(
      /complete seasonal year/,
    );
  });
  it('annualises baseline from complete local import days independently of bill costs', () => {
    const cache = source();
    const derived = buildBaseline(cache, '2024-01-01', '2024-01-03');
    expect(derived.completeDays).toBe(2);
    expect(derived.annualKWh).toBe(366 * 24);
  });
});

describe('available API reference data', () => {
  it('keeps complete imports and cheap fractions when exports begin in December', () => {
    const cache = source(),
      p = emptyProject();
    cache.intervals = cache.intervals.filter(
      (row) => row.direction === 'import' || row.start >= '2024-12-01T00:00:00Z',
    );
    p.forecast.cheapStartHour = 0;
    p.forecast.cheapEndHour = 6;
    const before = JSON.stringify(cache);
    const profile = buildAvailableReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    expect(profile[0].importKWh).toBe(31 * 24);
    expect(profile[0].cheapFraction).toBeCloseTo(0.25);
    expect(profile[0].exportKWh).toBeNull();
    expect(profile[11].exportKWh).toBe(31 * 4);
    expect(profile.filter((row) => row.importKWh === null)).toEqual([]);
    expect(JSON.stringify(cache)).toBe(before);
    expect(p.forecast.profile).toEqual([]);
  });
  it('excludes unrepresentative exports without changing the measured import profile', () => {
    const cache = source(),
      p = emptyProject();
    const all = buildAvailableReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    p.forecast.exportRepresentativeFrom = '2024-12-01';
    const selected = buildAvailableReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    expect(selected.map((row) => row.importKWh)).toEqual(all.map((row) => row.importKWh));
    expect(selected.map((row) => row.cheapFraction)).toEqual(all.map((row) => row.cheapFraction));
    expect(selected.slice(0, 11).every((row) => row.exportKWh === null)).toBe(true);
    expect(selected[11].exportKWh).toBe(124);
    expect(selected[0].notes?.join(' ')).toContain('excluded');
  });
  it('treats a partly covered month as unknown and preserves genuinely recorded zero exports', () => {
    const cache = source(),
      p = emptyProject();
    for (const row of cache.intervals) if (row.direction === 'export') row.kWh = 0;
    p.forecast.exportRepresentativeFrom = '2024-01-02';
    const profile = buildAvailableReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    expect(profile[0].exportKWh).toBeNull();
    expect(profile[1].exportKWh).toBe(0);
    expect(profile[0].importKWh).toBe(744);
  });
  it('does not infer a cheap fraction from missing import intervals', () => {
    const cache = source(),
      p = emptyProject();
    cache.intervals = cache.intervals.filter(
      (row) => !(row.direction === 'import' && row.start === '2024-01-01T00:00:00Z'),
    );
    const profile = buildAvailableReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    expect(profile[0].importKWh).toBeNull();
    expect(profile[0].cheapFraction).toBeNull();
    expect(profile[0].exportKWh).toBe(124);
    expect(profile[1].importKWh).toBe(29 * 24);
  });
  it('weights cheap percentage by actual imported energy rather than cheap hours', () => {
    const cache = source(),
      p = emptyProject();
    p.forecast.cheapStartHour = 0;
    p.forecast.cheapEndHour = 6;
    cache.intervals = cache.intervals.filter((row) => row.direction === 'export');
    for (
      let day = Temporal.PlainDate.from('2024-01-01');
      day.year === 2024;
      day = day.add({ days: 1 })
    ) {
      const at = day.toZonedDateTime({ timeZone: 'Europe/London', plainTime: '00:00' }).toInstant();
      const until = day
        .add({ days: 1 })
        .toZonedDateTime({ timeZone: 'Europe/London', plainTime: '00:00' })
        .toInstant();
      for (
        let instant = at;
        Temporal.Instant.compare(instant, until) < 0;
        instant = instant.add({ minutes: 30 })
      ) {
        const local = instant.toZonedDateTimeISO('Europe/London');
        cache.intervals.push({
          start: instant.toString(),
          end: instant.add({ minutes: 30 }).toString(),
          direction: 'import',
          meter: 'weighted-synthetic',
          kWh: local.hour < 6 ? 1 : 1 / 9,
        });
      }
    }
    const profile = buildAvailableReferenceProfile(cache, '2024-01-01', '2025-01-01', p.forecast);
    expect(profile[0].cheapFraction).toBeCloseTo(0.75, 10);
    expect(profile[0].importKWh).toBeCloseTo(31 * 16, 10);
  });
});

it('saves incomplete API profiles without inventing export energy or permitting a forecast', () => {
  const p = emptyProject();
  p.installations = [{ id: 'solar', type: 'solar-battery', date: '2024-01-01', cost: 1 }];
  p.baseline = { ...p.baseline, annualKWh: 0, unitPence: 0, standingPence: 0 };
  p.forecast = {
    ...p.forecast,
    start: '2025-01-01',
    referenceStart: '2024-01-01',
    referenceEnd: '2025-01-01',
    referenceConfirmed: true,
    exportRepresentativeFrom: '2024-02-01',
    importDayPence: 0,
    importCheapPence: 0,
    exportPence: 0,
    standingPence: 0,
  };
  p.forecast.profile = buildAvailableReferenceProfile(
    source(),
    '2024-01-01',
    '2025-01-01',
    p.forecast,
  );
  const restored = parseBackup(exportBackup(p, true));
  expect(restored.forecast.profile[0].exportKWh).toBeNull();
  expect(restored.forecast.profile[0].importProvenance).toBe('api-derived');
  expect(restored.forecast.exportRepresentativeFrom).toBe('2024-02-01');
  expect(projectModel(restored).nextYearSavings).toBeNull();
  expect(projectModel(restored).missing.join(' ')).toContain('Jan');
  restored.forecast.profile[0] = {
    ...restored.forecast.profile[0],
    exportKWh: 0,
    exportProvenance: 'estimated',
    provenance: 'estimated',
  };
  expect(projectModel(restored).nextYearSavings).toBe(0);
});
