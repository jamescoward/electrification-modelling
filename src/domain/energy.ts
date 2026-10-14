import Decimal from 'decimal.js';
import { Temporal } from '@js-temporal/polyfill';
import type { BillOverride, DateOnly, Interval, Project, Rate } from './types';

const TIMEZONE = 'Europe/London';
const HALF_HOUR = 30 * 60 * 1000;
const date = (value: DateOnly) => Temporal.PlainDate.from(value);
const midnight = (value: DateOnly) =>
  date(value).toZonedDateTime({ timeZone: TIMEZONE, plainTime: '00:00' }).epochMilliseconds;
const instant = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !/(Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new RangeError('Intervals and rates must use valid offset ISO timestamps.');
  return parsed;
};
const money = (value: Decimal) => value.toNumber();
const uniqueNotes = (notes: string[]) => [...new Set(notes)];

/** API pagination can repeat or correct a reading. The last exact-key record wins. */
export function deduplicateIntervals(intervals: Interval[]): Interval[] {
  const readings = new Map<string, Interval>();
  for (const reading of intervals) {
    readings.set(
      `${reading.direction}|${reading.meter}|${instant(reading.start)}|${instant(reading.end)}`,
      reading,
    );
  }
  return [...readings.values()].sort((a, b) => instant(a.start) - instant(b.start));
}

interface Reading {
  start: number;
  end: number;
  kWh: number;
  meter: string;
}
interface TimedRate {
  start: number;
  end: number;
  pence: number;
}
interface Charge {
  cost: Decimal | null;
  notes: string[];
}

function timedRates(rates: Rate[], direction: Rate['direction']): TimedRate[] {
  const records = new Map<string, TimedRate>();
  for (const rate of rates.filter((value) => value.direction === direction)) {
    const start = instant(rate.start),
      end = rate.end === null ? Infinity : instant(rate.end);
    if (end <= start || !Number.isFinite(rate.pence))
      throw new RangeError('Invalid rate period or price.');
    records.set(`${start}|${end}`, { start, end, pence: rate.pence });
  }
  return [...records.values()].sort((a, b) => a.start - b.start);
}

const readingCache = new WeakMap<
  Interval[],
  { snapshots: Interval[]; import: Reading[]; export: Reading[] }
>();
function readingsFor(intervals: Interval[], direction: Interval['direction']): Reading[] {
  const cached = readingCache.get(intervals);
  // Compare primitive snapshots so even in-place caller edits invalidate this
  // memoization. No immutability assumption is needed for correctness.
  if (
    cached &&
    cached.snapshots.length === intervals.length &&
    intervals.every((row, index) => {
      const previous = cached.snapshots[index];
      return (
        row.start === previous.start &&
        row.end === previous.end &&
        row.kWh === previous.kWh &&
        row.direction === previous.direction &&
        row.meter === previous.meter
      );
    })
  )
    return cached[direction];
  const grouped: { import: Map<string, Reading>; export: Map<string, Reading> } = {
    import: new Map(),
    export: new Map(),
  };
  for (const value of intervals) {
    const start = instant(value.start),
      end = instant(value.end);
    if (end <= start || !Number.isFinite(value.kWh) || value.kWh < 0)
      throw new RangeError('Invalid energy interval.');
    grouped[value.direction].set(`${value.meter}|${start}|${end}`, {
      start,
      end,
      kWh: value.kWh,
      meter: value.meter,
    });
  }
  const parsed = {
    snapshots: intervals.map((row) => ({ ...row })),
    import: [...grouped.import.values()].sort((a, b) => a.start - b.start),
    export: [...grouped.export.values()].sort((a, b) => a.start - b.start),
  };
  readingCache.set(intervals, parsed);
  return parsed[direction];
}

function charge(
  readings: Reading[],
  rates: TimedRate[],
  start: number,
  end: number,
  direction: string,
): Charge {
  if (end <= start) return { cost: new Decimal(0), notes: [] };
  const applicable = readings.filter((row) => row.start < end && row.end > start);
  const boundaries = new Set<number>([start, end]);
  for (const row of [...applicable, ...rates]) {
    if (row.start > start && row.start < end) boundaries.add(row.start);
    if (row.end > start && row.end < end) boundaries.add(row.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  let total = new Decimal(0),
    complete = true;
  const notes: string[] = [];
  const activeReadings = new Set<Reading>();
  const activeRates = new Set<TimedRate>();
  let readingIndex = 0,
    rateIndex = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index];
    while (readingIndex < applicable.length && applicable[readingIndex].start <= a) {
      const row = applicable[readingIndex++];
      if (row.end > a) activeReadings.add(row);
    }
    for (const row of activeReadings) if (row.end <= a) activeReadings.delete(row);
    while (rateIndex < rates.length && rates[rateIndex].start <= a) {
      const row = rates[rateIndex++];
      if (row.end > a) activeRates.add(row);
    }
    for (const row of activeRates) if (row.end <= a) activeRates.delete(row);
    const active = [...activeReadings];
    if (!active.length) {
      complete = false;
      notes.push(
        `Missing ${direction} readings; missing consumption is unknown, including export.`,
      );
      continue;
    }
    const meters = new Set(active.map((row) => row.meter));
    // A replacement meter may have adjacent readings; overlapping rows for the
    // same serial cannot safely be added. Distinct simultaneous meters are additive.
    if (meters.size !== active.length) {
      complete = false;
      notes.push(`Overlapping ${direction} readings for the same meter need review.`);
      continue;
    }
    const rate = [...activeRates].at(-1);
    if (!rate) {
      complete = false;
      notes.push(`Missing ${direction} rate agreement for part of the requested period.`);
      continue;
    }
    for (const row of active) {
      const energy = new Decimal(row.kWh).mul(b - a).div(row.end - row.start);
      total = total.plus(energy.mul(rate.pence).div(100));
      if (a !== row.start || b !== row.end || row.end - row.start > HALF_HOUR) {
        notes.push(
          'Energy spanning a rate or period boundary is apportioned by elapsed time (estimated).',
        );
      }
    }
  }
  return { cost: complete ? total : null, notes: uniqueNotes(notes) };
}

function standingCharge(
  rates: TimedRate[],
  start: DateOnly,
  end: DateOnly,
  exclusions: BillOverride[] = [],
): Charge {
  let cost = new Decimal(0),
    complete = true;
  const notes: string[] = [];
  for (
    let day = date(start);
    Temporal.PlainDate.compare(day, date(end)) < 0;
    day = day.add({ days: 1 })
  ) {
    const local = day.toString();
    if (exclusions.some((bill) => local >= bill.start && local < bill.end)) continue;
    const at = midnight(local);
    const rate = rates.filter((value) => value.start <= at && value.end > at).at(-1);
    if (!rate) {
      complete = false;
      notes.push('Missing standing-charge agreement for a local calendar day.');
    } else cost = cost.plus(new Decimal(rate.pence).div(100));
  }
  return { cost: complete ? cost : null, notes: uniqueNotes(notes) };
}

/** End is exclusive. Unknown components stay null; values retain signed rates.
 * Import bill overrides include standing charges. importCost then includes that
 * full bill amount; standingCost contains only days outside those bill periods. */
export function electricityCost(
  intervals: Interval[],
  rates: Rate[],
  start: DateOnly,
  end: DateOnly,
  overrides: BillOverride[] = [],
) {
  const from = midnight(start),
    until = midnight(end);
  if (until <= from) throw new RangeError('Electricity period must have a positive duration.');
  const notes: string[] = [];
  const standingRates = timedRates(rates, 'standing');
  function component(direction: 'import' | 'export'): number | null {
    const readings = readingsFor(intervals, direction),
      tariff = timedRates(rates, direction);
    const selected = overrides
      .filter((value) => value.component === direction)
      .map((value) => ({ ...value, from: midnight(value.start), until: midnight(value.end) }))
      .sort((a, b) => a.from - b.from);
    for (let index = 0; index < selected.length; index++) {
      const bill = selected[index];
      if (bill.until <= bill.from || !Number.isFinite(bill.amount))
        throw new RangeError('Invalid bill override.');
      if (index > 0 && bill.from < selected[index - 1].until) {
        notes.push(
          `Overlapping ${direction} bill overrides must be explicitly replaced before calculation.`,
        );
        return null;
      }
    }
    const matching = selected.filter((value) => value.from < until && value.until > from);
    if (matching.some((value) => value.from < from || value.until > until)) {
      notes.push(
        `The requested period covers only part of a ${direction} bill override; its amount cannot be safely apportioned.`,
      );
      return null;
    }
    let cursor = from,
      total = new Decimal(0),
      complete = true;
    for (const bill of matching) {
      const previous = charge(readings, tariff, cursor, bill.from, direction);
      notes.push(...previous.notes);
      if (previous.cost === null) complete = false;
      else total = total.plus(previous.cost);
      total = total.plus(bill.amount);
      const reconstructed = charge(readings, tariff, bill.from, bill.until, direction);
      const reconstructedStanding =
        direction === 'import'
          ? standingCharge(standingRates, bill.start, bill.end)
          : { cost: new Decimal(0), notes: [] };
      notes.push(
        `${direction === 'import' ? 'Import charges' : 'Export credit'} replaced by exact-period bill override ${bill.start} to ${bill.end} (end exclusive).`,
      );
      if (reconstructed.cost !== null && reconstructedStanding.cost !== null) {
        notes.push(
          `${direction === 'import' ? 'Import' : 'Export'} reconciliation: bill minus reconstruction £${new Decimal(bill.amount).minus(reconstructed.cost.plus(reconstructedStanding.cost)).toFixed(2)}.`,
        );
      } else
        notes.push(
          `Bill override supplies ${direction} cost; source readings/rates remain incomplete.`,
        );
      cursor = bill.until;
    }
    const remaining = charge(readings, tariff, cursor, until, direction);
    notes.push(...remaining.notes);
    if (remaining.cost === null) complete = false;
    else total = total.plus(remaining.cost);
    return complete ? money(total) : null;
  }
  const importCost = component('import'),
    exportCredit = component('export');
  const importBills = overrides.filter(
    (bill) => bill.component === 'import' && bill.start >= start && bill.end <= end,
  );
  const standing = standingCharge(standingRates, start, end, importBills);
  notes.push(...standing.notes);
  const standingCost = standing.cost === null ? null : money(standing.cost);
  const complete = importCost !== null && exportCredit !== null && standingCost !== null;
  const net = complete
    ? money(new Decimal(importCost!).minus(exportCredit!).plus(standingCost!))
    : null;
  return { importCost, exportCredit, standingCost, net, complete, notes: uniqueNotes(notes) };
}

export function petrolLitres(miles: number, mpg: number): number {
  if (!Number.isFinite(miles) || miles < 0 || !Number.isFinite(mpg) || mpg <= 0)
    throw new RangeError('Mileage must be non-negative and UK MPG must be positive.');
  return new Decimal(miles).div(mpg).mul('4.54609').toNumber();
}

export function oilAnnualLitres(oil: Project['oil']): {
  litres: number | null;
  estimated: boolean;
  notes: string[];
} {
  if (oil.annualLitresOverride !== null) {
    if (!Number.isFinite(oil.annualLitresOverride) || oil.annualLitresOverride < 0)
      throw new RangeError('Oil annual-use override must be non-negative.');
    return {
      litres: oil.annualLitresOverride,
      estimated: true,
      notes: ['Annual oil use is a manually entered override.'],
    };
  }
  if (!oil.coverageStart || !oil.coverageEnd)
    return {
      litres: null,
      estimated: true,
      notes: [
        'Declare the oil-consumption coverage period; delivery dates alone do not establish an annual baseline.',
      ],
    };
  const first = date(oil.coverageStart),
    last = date(oil.coverageEnd);
  const days = first.until(last).days;
  if (days <= 0)
    return {
      litres: null,
      estimated: true,
      notes: ['Oil coverage must have a positive duration, with an exclusive end date.'],
    };
  const deliveries = new Map(oil.deliveries.map((delivery) => [delivery.id, delivery]));
  let used = new Decimal(0),
    includedDeliveries = 0;
  for (const delivery of deliveries.values()) {
    if (!Number.isFinite(delivery.litres) || delivery.litres < 0)
      throw new RangeError('Oil delivery litres must be non-negative.');
    if (delivery.date >= oil.coverageStart && delivery.date < oil.coverageEnd) {
      used = used.plus(delivery.litres);
      includedDeliveries++;
    }
  }
  const stockKnown = oil.openingLitres !== null && oil.closingLitres !== null;
  if (!includedDeliveries && !stockKnown)
    return {
      litres: null,
      estimated: true,
      notes: [
        'No oil deliveries in the declared period and tank levels are unknown; consumption cannot be established.',
      ],
    };
  if (
    [oil.openingLitres, oil.closingLitres].some(
      (value) => value !== null && (!Number.isFinite(value) || value < 0),
    )
  )
    throw new RangeError('Tank levels must be non-negative.');
  if (stockKnown) used = used.plus(oil.openingLitres!).minus(oil.closingLitres!);
  if (used.isNegative())
    return {
      litres: null,
      estimated: true,
      notes: [
        'Oil stock and deliveries imply negative consumption; check the tank levels and coverage.',
      ],
    };
  const yearEnd = first.add({ years: 1 });
  const annualDays = first.until(yearEnd).days;
  const notes = stockKnown
    ? []
    : ['Tank levels are unknown: deliveries are an estimated consumption proxy.'];
  if (days !== annualDays)
    notes.push(
      `Oil use annualised from ${days} declared coverage days; seasonal coverage may bias the estimate.`,
    );
  return {
    litres: used.mul(annualDays).div(days).toNumber(),
    estimated: !stockKnown || days !== annualDays,
    notes,
  };
}

/** Uniform energy per local day. DST days share the same daily kWh, spread
 * over their actual 23/24/25 hours, so monthly kWh are conserved. */
const heatingRateCache = new Map<string, number>();
export function heatingCostForMonth(
  year: number,
  month: number,
  kWh: number,
  forecast: Project['forecast'],
  range?: { start: DateOnly; end: DateOnly },
): { cost: number; effectivePence: number } {
  if (
    !Number.isFinite(kWh) ||
    kWh < 0 ||
    forecast.importDayPence === null ||
    forecast.importCheapPence === null
  )
    throw new RangeError('Heating energy and both tariff rates are required.');
  const first = Temporal.PlainDate.from({ year, month, day: 1 });
  const { cheapStartHour: cheapStart, cheapEndHour: cheapEnd } = forecast;
  if (![cheapStart, cheapEnd].every((hour) => Number.isFinite(hour) && hour >= 0 && hour < 24))
    throw new RangeError('Tariff hours must be between 0 and 24.');
  const key = `${year}|${month}|${cheapStart}|${cheapEnd}|${forecast.importDayPence}|${forecast.importCheapPence}|${range?.start ?? ''}|${range?.end ?? ''}`;
  const cached = heatingRateCache.get(key);
  if (cached !== undefined)
    return { cost: new Decimal(kWh).mul(cached).div(100).toNumber(), effectivePence: cached };
  const isCheap = (hour: number) =>
    cheapStart < cheapEnd
      ? hour >= cheapStart && hour < cheapEnd
      : cheapStart > cheapEnd && (hour >= cheapStart || hour < cheapEnd);
  const cheapHours =
    cheapStart < cheapEnd
      ? cheapEnd - cheapStart
      : cheapStart > cheapEnd
        ? 24 - cheapStart + cheapEnd
        : 0;
  const normalRate = new Decimal(cheapHours)
    .div(24)
    .mul(forecast.importCheapPence)
    .plus(new Decimal(24 - cheapHours).div(24).mul(forecast.importDayPence));
  const monthEnd = first.add({ months: 1 });
  const periodStart = range && range.start > first.toString() ? date(range.start) : first;
  const periodEnd = range && range.end < monthEnd.toString() ? date(range.end) : monthEnd;
  const normalDays = periodStart.until(periodEnd).days;
  if (
    normalDays > 0 &&
    midnight(periodEnd.toString()) - midnight(periodStart.toString()) === normalDays * 86_400_000
  ) {
    if (heatingRateCache.size >= 1200)
      heatingRateCache.delete(heatingRateCache.keys().next().value!);
    heatingRateCache.set(key, normalRate.toNumber());
    return {
      cost: new Decimal(kWh).mul(normalRate).div(100).toNumber(),
      effectivePence: normalRate.toNumber(),
    };
  }
  let sumDailyRates = new Decimal(0),
    includedDays = 0;
  for (let day = first; day.month === month; day = day.add({ days: 1 })) {
    if (range && (day.toString() < range.start || day.toString() >= range.end)) continue;
    includedDays++;
    const start = midnight(day.toString()),
      end = midnight(day.add({ days: 1 }).toString());
    if (end - start === 86_400_000) {
      sumDailyRates = sumDailyRates.plus(normalRate);
      continue;
    }
    // Partition at actual hours and both possible instants of tariff boundaries.
    // Repeated local times in autumn therefore receive their tariff twice.
    const boundaries = new Set<number>([start, end]);
    for (let at = start; at < end; at += 3_600_000) boundaries.add(at);
    for (const hour of [cheapStart, cheapEnd]) {
      const hourInt = Math.floor(hour),
        minute = Math.round((hour - hourInt) * 60);
      for (const disambiguation of ['earlier', 'later'] as const) {
        const at = Temporal.ZonedDateTime.from(
          {
            year: day.year,
            month: day.month,
            day: day.day,
            hour: hourInt,
            minute,
            timeZone: TIMEZONE,
          },
          { disambiguation },
        ).epochMilliseconds;
        if (at > start && at < end) boundaries.add(at);
      }
    }
    const points = [...boundaries].sort((a, b) => a - b);
    let cheapDuration = 0;
    for (let index = 1; index < points.length; index++) {
      const time = Temporal.Instant.fromEpochMilliseconds(
        Math.floor((points[index - 1] + points[index]) / 2),
      ).toZonedDateTimeISO(TIMEZONE);
      if (isCheap(time.hour + time.minute / 60)) cheapDuration += points[index] - points[index - 1];
    }
    const fraction = new Decimal(cheapDuration).div(end - start);
    sumDailyRates = sumDailyRates.plus(
      fraction
        .mul(forecast.importCheapPence)
        .plus(new Decimal(1).minus(fraction).mul(forecast.importDayPence)),
    );
  }
  if (!includedDays) {
    if (kWh > 0) throw new RangeError('Cannot allocate heating to an empty date range.');
    return { cost: 0, effectivePence: 0 };
  }
  const effective = sumDailyRates.div(includedDays);
  if (heatingRateCache.size >= 1200) heatingRateCache.delete(heatingRateCache.keys().next().value!);
  heatingRateCache.set(key, effective.toNumber());
  return {
    cost: new Decimal(kWh).mul(effective).div(100).toNumber(),
    effectivePence: effective.toNumber(),
  };
}

export function deriveBaseline(
  intervals: Interval[],
  start: DateOnly,
  end: DateOnly,
): { annualKWh: number | null; completeDays: number; notes: string[] } {
  const readings = readingsFor(intervals, 'import');
  let total = new Decimal(0),
    completeDays = 0;
  const notes: string[] = [];
  for (
    let day = date(start);
    Temporal.PlainDate.compare(day, date(end)) < 0;
    day = day.add({ days: 1 })
  ) {
    const from = midnight(day.toString()),
      until = midnight(day.add({ days: 1 }).toString());
    const result = charge(
      readings,
      [{ start: from, end: until, pence: 100 }],
      from,
      until,
      'import',
    );
    if (result.cost === null)
      notes.push('Incomplete reference days excluded from baseline annualisation.');
    else {
      total = total.plus(result.cost);
      completeDays++;
      notes.push(...result.notes);
    }
  }
  if (!completeDays)
    return {
      annualKWh: null,
      completeDays,
      notes: ['No complete local days in the baseline reference period.'],
    };
  const annualDays = date(start).until(date(start).add({ years: 1 })).days;
  notes.push(
    `Flat baseline annualised from ${completeDays} complete local days to ${annualDays} days; seasonal household use is unknown.`,
  );
  return {
    annualKWh: total.div(completeDays).mul(annualDays).toNumber(),
    completeDays,
    notes: uniqueNotes(notes),
  };
}
