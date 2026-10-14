import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { emptyProject } from '../domain/project';
import type { SourceCache } from '../domain/types';
import { buildBaseline, buildReferenceProfile } from './sourceProfile';
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
