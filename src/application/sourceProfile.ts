import Decimal from 'decimal.js';
import { Temporal } from '@js-temporal/polyfill';
import { deduplicateIntervals, deriveBaseline } from '../domain/energy';
import type { DateOnly, MonthlyProfile, Project, SourceCache } from '../domain/types';

const zone = 'Europe/London';
const midnight = (day: Temporal.PlainDate) =>
  day.toZonedDateTime({ timeZone: zone, plainTime: '00:00' }).epochMilliseconds;
/** Explicitly applied by the UI: refreshing source data never mutates the baseline. */
export function buildBaseline(cache: SourceCache, start: DateOnly, end: DateOnly) {
  return deriveBaseline(cache.intervals, start, end);
}
/** End-exclusive complete seasonal year; measured energy, never historic bill amounts.
 * The caller must confirm this range follows solar/EV adoption and precedes heating. */
export function buildReferenceProfile(
  cache: SourceCache,
  start: DateOnly,
  end: DateOnly,
  forecast: Project['forecast'],
): MonthlyProfile[] {
  const first = Temporal.PlainDate.from(start),
    last = Temporal.PlainDate.from(end);
  if (!first.add({ years: 1 }).equals(last))
    throw new Error(
      'Choose one complete seasonal year, with an exclusive end date one year after the start.',
    );
  const from = midnight(first),
    to = midnight(last),
    cheapStart = forecast.cheapStartHour,
    cheapEnd = forecast.cheapEndHour;
  if (![cheapStart, cheapEnd].every((v) => Number.isFinite(v) && v >= 0 && v < 24))
    throw new Error('Cheap tariff hours must be between 0 and 24.');
  const rows = deduplicateIntervals(cache.intervals)
    .filter((r) => Date.parse(r.start) < to && Date.parse(r.end) > from)
    .map((r) => ({ ...r, from: Date.parse(r.start), to: Date.parse(r.end) }));
  const totals = Array.from({ length: 12 }, () => ({
    import: new Decimal(0),
    export: new Decimal(0),
    cheap: new Decimal(0),
  }));
  for (const direction of ['import', 'export'] as const) {
    const selected = rows.filter((r) => r.direction === direction).sort((a, b) => a.from - b.from);
    let cursor = from;
    const meters = new Map<string, number>();
    for (const r of selected) {
      if (!Number.isFinite(r.kWh) || r.kWh < 0 || r.to <= r.from)
        throw new Error('Invalid reference interval.');
      const previous = meters.get(r.meter);
      if (previous !== undefined && previous > r.from)
        throw new Error(
          `Overlapping ${direction} readings need review before creating a reference profile.`,
        );
      meters.set(r.meter, r.to);
      if (r.from > cursor)
        throw new Error(
          `Reference year has missing ${direction} intervals. Enter an explicitly estimated monthly profile instead.`,
        );
      cursor = Math.max(cursor, r.to);
    }
    if (cursor < to)
      throw new Error(
        `Reference year has missing ${direction} intervals. Enter an explicitly estimated monthly profile instead.`,
      );
  }
  const isCheap = (hour: number) =>
    cheapStart < cheapEnd
      ? hour >= cheapStart && hour < cheapEnd
      : cheapStart > cheapEnd && (hour >= cheapStart || hour < cheapEnd);
  const segments: { from: number; to: number; month: number; cheap: boolean }[] = [];
  for (let day = first; Temporal.PlainDate.compare(day, last) < 0; day = day.add({ days: 1 })) {
    const dayFrom = midnight(day),
      dayTo = midnight(day.add({ days: 1 }));
    const boundaries = new Set<number>([dayFrom, dayTo]);
    // Actual-hour boundaries include both sides of the autumn clock change.
    for (let at = dayFrom; at < dayTo; at += 3_600_000) boundaries.add(at);
    for (const hour of [cheapStart, cheapEnd]) {
      let minutes = Math.round(hour * 60);
      if (minutes === 1440) minutes = 1439;
      for (const disambiguation of ['earlier', 'later'] as const) {
        const at = Temporal.ZonedDateTime.from(
          {
            year: day.year,
            month: day.month,
            day: day.day,
            hour: Math.floor(minutes / 60),
            minute: minutes % 60,
            timeZone: zone,
          },
          { disambiguation },
        ).epochMilliseconds;
        if (at > dayFrom && at < dayTo) boundaries.add(at);
      }
    }
    const points = [...boundaries].sort((x, y) => x - y);
    for (let i = 1; i < points.length; i++) {
      const begin = points[i - 1],
        until = points[i];
      const local = Temporal.Instant.fromEpochMilliseconds(
        Math.floor((begin + until) / 2),
      ).toZonedDateTimeISO(zone);
      segments.push({
        from: begin,
        to: until,
        month: day.month,
        cheap: isCheap(local.hour + local.minute / 60),
      });
    }
  }
  let segmentIndex = 0;
  for (const r of rows) {
    const a = Math.max(from, r.from),
      b = Math.min(to, r.to);
    while (segmentIndex < segments.length && segments[segmentIndex].to <= a) segmentIndex++;
    for (let i = segmentIndex; i < segments.length && segments[i].from < b; i++) {
      const segment = segments[i],
        begin = Math.max(a, segment.from),
        until = Math.min(b, segment.to);
      if (begin >= until) continue;
      const energy = new Decimal(r.kWh).mul(until - begin).div(r.to - r.from);
      const month = totals[segment.month - 1];
      month[r.direction] = month[r.direction].plus(energy);
      if (r.direction === 'import' && segment.cheap) month.cheap = month.cheap.plus(energy);
    }
  }

  return totals.map((r, i) => ({
    month: i + 1,
    importKWh: r.import.toNumber(),
    exportKWh: r.export.toNumber(),
    cheapFraction: r.import.isZero() ? 0 : r.cheap.div(r.import).toNumber(),
    provenance: 'api-derived',
  }));
}
