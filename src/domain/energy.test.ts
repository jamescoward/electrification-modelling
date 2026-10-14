import { describe, expect, it } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import {
  deduplicateIntervals,
  deriveBaseline,
  electricityCost,
  heatingCostForMonth,
  oilAnnualLitres,
  petrolLitres,
} from './energy';
import type { BillOverride, Interval, Project, Rate } from './types';

function readings(day: string, direction: 'import' | 'export' = 'import', kWh = 0): Interval[] {
  const local = Temporal.PlainDate.from(day);
  const from = local.toZonedDateTime('Europe/London').epochMilliseconds;
  const until = local.add({ days: 1 }).toZonedDateTime('Europe/London').epochMilliseconds;
  const result: Interval[] = [];
  for (let start = from; start < until; start += 1_800_000)
    result.push({
      start: Temporal.Instant.fromEpochMilliseconds(start).toString(),
      end: Temporal.Instant.fromEpochMilliseconds(start + 1_800_000).toString(),
      kWh,
      direction,
      meter: direction,
    });
  return result;
}
const tariff = (importPence = 30, exportPence = 15, standingPence = 60): Rate[] => [
  { start: '2020-01-01T00:00:00Z', end: null, pence: importPence, direction: 'import' },
  { start: '2020-01-01T00:00:00Z', end: null, pence: exportPence, direction: 'export' },
  { start: '2020-01-01T00:00:00Z', end: null, pence: standingPence, direction: 'standing' },
];
const forecast: Project['forecast'] = {
  start: null,
  horizonYears: 20,
  oilScenario: 'central',
  oilFactors: { low: 0.8, central: 1, high: 1.2 },
  importDayPence: 30,
  importCheapPence: 10,
  cheapStartHour: 0,
  cheapEndHour: 6,
  exportPence: 15,
  standingPence: 60,
  referenceStart: null,
  referenceEnd: null,
  referenceConfirmed: false,
  profile: [],
};
const oil: Project['oil'] = {
  deliveries: [{ id: 'delivery', date: '2025-04-01', litres: 1500, total: 1200 }],
  coverageStart: '2025-01-01',
  coverageEnd: '2026-01-01',
  openingLitres: 200,
  closingLitres: 100,
  annualLitresOverride: null,
  historicalPence: null,
  quotePence: null,
  quoteDate: null,
  quoteIncludesVatDelivery: true,
  supplier: '',
  orderLitres: null,
  monthlyWeights: [16, 14, 12, 9, 5, 3, 2, 2, 5, 8, 11, 13],
};

describe('electricity reconstruction', () => {
  it('A06: combines VAT-inclusive import, export and standing charges once', () => {
    const imported = readings('2025-01-01'),
      exported = readings('2025-01-01', 'export');
    imported[0].kWh = 10;
    imported[1].kWh = 5;
    exported[0].kWh = 4;
    const rates = tariff();
    rates[0].start = imported[1].start;
    rates.push({ direction: 'import', start: imported[0].start, end: imported[0].end, pence: 10 });
    expect(
      electricityCost([...imported, ...exported], rates, '2025-01-01', '2025-01-02'),
    ).toMatchObject({
      importCost: 2.5,
      exportCredit: 0.6,
      standingCost: 0.6,
      net: 2.5,
      complete: true,
    });
  });

  it('A04: repeated fetches and corrected exact records do not duplicate energy', () => {
    const imported = readings('2025-01-01', 'import', 1),
      exported = readings('2025-01-01', 'export', 0.5);
    const intervals = [...imported, ...exported];
    const original = electricityCost(intervals, tariff(), '2025-01-01', '2025-01-02');
    expect(
      electricityCost([...intervals, ...intervals], tariff(), '2025-01-01', '2025-01-02'),
    ).toEqual(original);
    const corrected = [...intervals, { ...imported[0], kWh: 2 }];
    expect(deduplicateIntervals(corrected)).toHaveLength(96);
    expect(electricityCost(corrected, tariff(), '2025-01-01', '2025-01-02').importCost).toBe(14.7);
  });

  it('deduplicates equal instants even when their original offsets differ', () => {
    const row = readings('2025-06-01')[0];
    const equivalent = {
      ...row,
      start: '2025-06-01T00:00:00+01:00',
      end: '2025-06-01T00:30:00+01:00',
      kWh: 2,
    };
    expect(deduplicateIntervals([row, equivalent])).toEqual([equivalent]);
  });

  it('cached reading parsing respects both appended corrections and in-place edits', () => {
    const imported = readings('2025-01-01', 'import', 1),
      intervals = [...imported, ...readings('2025-01-01', 'export')];
    expect(electricityCost(intervals, tariff(), '2025-01-01', '2025-01-02').importCost).toBe(14.4);
    intervals[0].kWh = 2;
    expect(electricityCost(intervals, tariff(), '2025-01-01', '2025-01-02').importCost).toBe(14.7);
    intervals.push({ ...intervals[0], kWh: 3 });
    expect(electricityCost(intervals, tariff(), '2025-01-01', '2025-01-02').importCost).toBe(15);
  });

  it('splits a half-hour at a tariff boundary and labels the apportionment estimated', () => {
    const imported = readings('2025-01-01'),
      exported = readings('2025-01-01', 'export');
    imported[0].kWh = 2;
    const rates = tariff(30, 0, 0);
    rates[0].start = '2025-01-01T00:15:00Z';
    rates.push({
      direction: 'import',
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T00:15:00Z',
      pence: 10,
    });
    const result = electricityCost([...imported, ...exported], rates, '2025-01-01', '2025-01-02');
    expect(result.net).toBe(0.4);
    expect(result.notes.join(' ')).toContain('estimated');
  });

  it('A20: absent export and missing tariffs stay unknown, even with all zero readings', () => {
    const imported = readings('2025-01-01');
    const missingExport = electricityCost(imported, tariff(), '2025-01-01', '2025-01-02');
    expect(missingExport).toMatchObject({ exportCredit: null, net: null, complete: false });
    expect(missingExport.notes.join(' ')).toContain('Missing export');
    const missingRate = electricityCost(
      [...imported, ...readings('2025-01-01', 'export')],
      tariff().filter((rate) => rate.direction !== 'import'),
      '2025-01-01',
      '2025-01-02',
    );
    expect(missingRate.importCost).toBeNull();
    expect(missingRate.notes.join(' ')).toContain('rate agreement');
  });

  it('detects a single missing half-hour and overlaps within one meter', () => {
    const imported = readings('2025-01-01'),
      exported = readings('2025-01-01', 'export');
    expect(
      electricityCost([...imported.slice(1), ...exported], tariff(), '2025-01-01', '2025-01-02')
        .importCost,
    ).toBeNull();
    const overlapping = { ...imported[0], end: imported[1].end };
    expect(
      electricityCost([...imported, overlapping, ...exported], tariff(), '2025-01-01', '2025-01-02')
        .importCost,
    ).toBeNull();
  });

  it('supports serial changes at adjacent interval boundaries', () => {
    const imported = readings('2025-01-01', 'import', 1).map((value, index) => ({
      ...value,
      meter: index < 24 ? 'old' : 'new',
    }));
    expect(
      electricityCost(
        [...imported, ...readings('2025-01-01', 'export')],
        tariff(),
        '2025-01-01',
        '2025-01-02',
      ).importCost,
    ).toBe(14.4);
  });

  it.each(['2025-03-30', '2025-10-26', '2024-02-29'])(
    'A08: %s counts one local standing day and all actual intervals',
    (day) => {
      const end = Temporal.PlainDate.from(day).add({ days: 1 }).toString();
      const imported = readings(day, 'import', 0.5),
        exported = readings(day, 'export');
      expect(imported.length).toBe(day.includes('03-30') ? 46 : day.includes('10-26') ? 50 : 48);
      const result = electricityCost([...imported, ...exported], tariff(), day, end);
      expect(result.standingCost).toBe(0.6);
      expect(result.importCost).toBeCloseTo(imported.length * 0.15, 10);
      expect(result.complete).toBe(true);
    },
  );

  it('A26: preserves signed negative import and export prices', () => {
    const result = electricityCost(
      [...readings('2025-01-01', 'import', 1), ...readings('2025-01-01', 'export', 0.5)],
      tariff(-10, -5, 0),
      '2025-01-01',
      '2025-01-02',
    );
    expect(result).toMatchObject({ importCost: -4.8, exportCredit: -1.2, net: -3.6 });
  });

  it('A21/A09: exact bill amounts replace reconstructed components and reveal differences', () => {
    const overrides: BillOverride[] = [
      {
        id: 'import',
        start: '2025-01-01',
        end: '2025-01-02',
        component: 'import',
        amount: 100,
        note: 'Whole-house charge includes EV/heating',
      },
      {
        id: 'export',
        start: '2025-01-01',
        end: '2025-01-02',
        component: 'export',
        amount: 5,
        note: 'Export bill',
      },
    ];
    const result = electricityCost(
      [...readings('2025-01-01', 'import', 1), ...readings('2025-01-01', 'export', 1)],
      tariff(),
      '2025-01-01',
      '2025-01-02',
      overrides,
    );
    expect(result).toMatchObject({ importCost: 100, exportCredit: 5, standingCost: 0, net: 95 });
    expect(result.notes.join(' ')).toContain('reconciliation');
    // Cost can be known from the bill while retaining an explicit source-data gap.
    expect(electricityCost([], tariff(), '2025-01-01', '2025-01-02', overrides)).toMatchObject({
      net: 95,
      complete: true,
    });
    expect(electricityCost([], [], '2025-01-01', '2025-01-02', overrides)).toMatchObject({
      standingCost: 0,
      net: 95,
      complete: true,
    });
  });

  it('adds non-overridden periods, and refuses partial or overlapping bill allocation', () => {
    const override: BillOverride = {
      id: 'bill',
      start: '2025-01-01',
      end: '2025-01-02',
      component: 'import',
      amount: 10,
      note: '',
    };
    const intervals = [
      ...readings('2025-01-01', 'import', 1),
      ...readings('2025-01-02', 'import', 1),
      ...readings('2025-01-01', 'export'),
      ...readings('2025-01-02', 'export'),
    ];
    expect(
      electricityCost(intervals, tariff(), '2025-01-01', '2025-01-03', [override]).importCost,
    ).toBe(24.4);
    expect(
      electricityCost(intervals, tariff(), '2025-01-02', '2025-01-03', [
        { ...override, end: '2025-01-03' },
      ]).importCost,
    ).toBeNull();
    expect(
      electricityCost(intervals, tariff(), '2025-01-01', '2025-01-03', [
        override,
        { ...override, id: 'other' },
      ]).importCost,
    ).toBeNull();
  });
});

describe('fuel and heating assumptions', () => {
  it('A10: uses UK imperial MPG, retaining precision until currency presentation', () => {
    expect(petrolLitres(10000, 40)).toBe(1136.5225);
    expect((petrolLitres(10000, 40) * 1.5).toFixed(2)).toBe('1704.78');
    expect(() => petrolLitres(100, 0)).toThrow(/MPG/);
  });

  it('A11: accounts for opening/closing tank stock, or labels a deliveries proxy', () => {
    expect(oilAnnualLitres(oil)).toEqual({ litres: 1600, estimated: false, notes: [] });
    expect(oilAnnualLitres({ ...oil, openingLitres: null, closingLitres: null })).toMatchObject({
      litres: 1500,
      estimated: true,
    });
    expect(
      oilAnnualLitres({ ...oil, openingLitres: null, closingLitres: null }).notes.join(' '),
    ).toContain('proxy');
  });

  it('requires declared oil coverage and permits an explicit annual override', () => {
    expect(oilAnnualLitres({ ...oil, coverageStart: null }).litres).toBeNull();
    expect(
      oilAnnualLitres({ ...oil, coverageStart: null, annualLitresOverride: 1300 }),
    ).toMatchObject({ litres: 1300, estimated: true });
    expect(oilAnnualLitres({ ...oil, closingLitres: 2000 }).litres).toBeNull();
    expect(
      oilAnnualLitres({ ...oil, deliveries: [], openingLitres: null, closingLitres: null }).litres,
    ).toBeNull();
  });

  it('A07: normal-day heating uniform across six cheap hours costs £6 per 24 kWh', () => {
    expect(heatingCostForMonth(2025, 1, 24 * 31, forecast)).toEqual({
      cost: 186,
      effectivePence: 25,
    });
  });

  it('A08: DST changes tariff duration without losing monthly allocated energy', () => {
    const march = heatingCostForMonth(2025, 3, 310, forecast);
    const october = heatingCostForMonth(2025, 10, 310, forecast);
    const springEffective = (30 * 25 + (5 * 10 + 18 * 30) / 23) / 31;
    const autumnEffective = (30 * 25 + (7 * 10 + 18 * 30) / 25) / 31;
    expect(march.effectivePence).toBeCloseTo(springEffective, 10);
    expect(october.effectivePence).toBeCloseTo(autumnEffective, 10);
    expect(march.cost).toBeCloseTo((310 * march.effectivePence) / 100, 10);
    expect(october.cost).toBeCloseTo((310 * october.effectivePence) / 100, 10);
    expect(heatingCostForMonth(2024, 2, 290, forecast).cost).toBe(72.5);
  });

  it('supports overnight half-hour tariffs and zero kWh without division by zero', () => {
    expect(
      heatingCostForMonth(2025, 1, 744, { ...forecast, cheapStartHour: 23.5, cheapEndHour: 5.5 }),
    ).toEqual({ cost: 186, effectivePence: 25 });
    expect(heatingCostForMonth(2025, 1, 0, forecast)).toEqual({ cost: 0, effectivePence: 25 });
    expect(() =>
      heatingCostForMonth(2025, 1, 100, { ...forecast, importDayPence: null }),
    ).toThrow();
  });

  it('prices partial commissioning/cutoff periods using their own local tariff days', () => {
    const normalOnly = heatingCostForMonth(2025, 3, 24, forecast, {
      start: '2025-03-29',
      end: '2025-03-30',
    });
    const dstOnly = heatingCostForMonth(2025, 3, 24, forecast, {
      start: '2025-03-30',
      end: '2025-03-31',
    });
    expect(normalOnly.cost).toBe(6);
    expect(dstOnly.effectivePence).toBeCloseTo((5 * 10 + 18 * 30) / 23, 10);
    expect(dstOnly.cost).toBeCloseTo((24 * dstOnly.effectivePence) / 100, 10);
  });
});

describe('baseline selection', () => {
  it('uses only complete occupied reference days and excludes partial days', () => {
    const intervals = [
      ...readings('2025-01-01', 'import', 0.5),
      ...readings('2025-01-02', 'import', 0.5).slice(1),
    ];
    expect(deriveBaseline(intervals, '2025-01-01', '2025-01-03')).toMatchObject({
      annualKWh: 8760,
      completeDays: 1,
    });
    expect(deriveBaseline([], '2025-01-01', '2025-01-03').annualKWh).toBeNull();
  });

  it('annualises leap-year days and includes every DST half-hour once', () => {
    expect(
      deriveBaseline(readings('2024-02-29', 'import', 0.5), '2024-02-29', '2024-03-01').annualKWh,
    ).toBe(8760);
    // From 1 January the following year-long period includes the leap day.
    expect(
      deriveBaseline(readings('2024-01-01', 'import', 0.5), '2024-01-01', '2024-01-02').annualKWh,
    ).toBe(8784);
    expect(
      deriveBaseline(readings('2025-03-30', 'import', 0.5), '2025-03-30', '2025-03-31'),
    ).toMatchObject({ annualKWh: 23 * 365, completeDays: 1 });
  });
});
