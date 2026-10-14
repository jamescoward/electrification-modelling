import { describe, expect, it } from 'vitest';
import { emptyProject } from '../domain/project';
import type { Project } from '../domain/types';
import { projectModel } from './model';

function configured(): Project {
  const p = emptyProject();
  p.installations = [{ id: 'solar', type: 'solar-battery', date: '2025-10-01', cost: 1000 }];
  p.baseline = { ...p.baseline, annualKWh: 0, unitPence: 0, standingPence: 0 };
  p.forecast = {
    ...p.forecast,
    start: '2026-10-01',
    horizonYears: 3,
    referenceStart: '2025-10-01',
    referenceEnd: '2026-10-01',
    referenceConfirmed: true,
    importCheapPence: 10,
    importDayPence: 30,
    exportPence: 15,
    standingPence: 0,
    profile: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      importKWh: 0,
      exportKWh: 0,
      cheapFraction: 0.5,
      provenance: 'entered',
    })),
  };
  return p;
}

describe('integration review of dates and funding', () => {
  it('partial heat-pump commissioning on autumn DST day uses only included days and preserves kWh', () => {
    const p = configured();
    p.installations.push({ id: 'heat', type: 'heat-pump', date: '2026-10-25', cost: 1000 });
    p.heating.annualKWh = 3100;
    p.heating.monthlyWeights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0];
    p.oil.annualLitresOverride = 1000;
    p.oil.historicalPence = 60;
    p.oil.quotePence = 60;
    const oct = projectModel(p).months.find((month) => month.month === '2026-10')!;
    // 100 kWh per local day, including seven days. On clock-change day the
    // cheap window lasts seven actual hours out of 25; others are six of 24.
    expect(oct.heatingKWh).toBe(700);
    expect(oct.heatingCost).toBeCloseTo(
      100 * ((7 / 25) * 0.1 + (18 / 25) * 0.3) + 6 * 100 * 0.25,
      10,
    );
  });

  it('historical oil price ignores deliveries outside its declared coverage', () => {
    const p = configured();
    p.installations[0].date = '2025-01-01';
    p.installations.push({ id: 'heat', type: 'heat-pump', date: '2026-01-01', cost: 1000 });
    p.forecast.start = '2026-02-01';
    p.forecast.referenceStart = '2025-01-01';
    p.forecast.referenceEnd = '2026-01-01';
    p.heating.annualKWh = 0;
    p.oil = {
      ...p.oil,
      coverageStart: '2025-01-01',
      coverageEnd: '2026-01-01',
      openingLitres: 0,
      closingLitres: 0,
      quotePence: 99,
      monthlyWeights: Array(12).fill(1 / 12),
      deliveries: [
        { id: 'covered', date: '2025-05-01', litres: 1000, total: 500 },
        { id: 'future', date: '2026-01-10', litres: 1000, total: 10000 },
      ],
    };
    p.overrides = [
      {
        id: 'import',
        component: 'import',
        start: '2026-01-01',
        end: '2026-02-01',
        amount: 0,
        note: '',
      },
      {
        id: 'export',
        component: 'export',
        start: '2026-01-01',
        end: '2026-02-01',
        amount: 0,
        note: '',
      },
    ];
    p.cache.rates = [{ start: '2025-01-01T00:00:00Z', end: null, direction: 'standing', pence: 0 }];
    const january = projectModel(p).months.find((month) => month.month === '2026-01')!;
    expect(january.complete).toBe(true);
    expect(january.avoidedOil).toBeCloseTo(((1000 * 31) / 365) * 0.5, 10);
  });

  it('A16 counts invoice/principal once and dated repayments reduce month-end and current principal', () => {
    const p = configured();
    p.installations = [{ id: 'solar', type: 'solar-battery', date: '2026-01-10', cost: 10000 }];
    p.forecast.start = '2027-01-10';
    p.forecast.referenceStart = '2026-01-10';
    p.forecast.referenceEnd = '2027-01-10';
    p.forecast.horizonYears = 1;
    p.loans = [
      {
        id: 'finance',
        name: 'Finance',
        installationIds: ['solar'],
        startDate: '2026-01-10',
        principal: 8000,
        annualRate: 0,
        rateConvention: 'nominal',
        monthlyPayment: 100,
        firstPaymentDate: '2026-01-15',
        paymentDay: 15,
        fees: 50,
        overpayments: [],
      },
    ];
    p.overrides = [
      {
        id: 'import',
        component: 'import',
        start: '2026-01-10',
        end: '2026-02-01',
        amount: 0,
        note: '',
      },
      {
        id: 'export',
        component: 'export',
        start: '2026-01-10',
        end: '2026-02-01',
        amount: 0,
        note: '',
      },
    ];
    p.cache.rates = [{ start: '2026-01-10T00:00:00Z', end: null, direction: 'standing', pence: 0 }];
    const result = projectModel(p, '2026-01-31');
    expect(result.investment).toBe(10050);
    expect(result.months[0].cashFlow).toBe(-2150);
    expect(result.months[0].debt).toBe(7900);
    expect(result.outstandingDebt).toBe(7900);
    expect(result.loans[0].schedule.periods.length).toBe(80);
  });

  it('exclusive monthly cutoff does not deduct next-month first-day repayment early', () => {
    const p = configured();
    p.loans = [
      {
        id: 'loan',
        name: 'Date fixture',
        installationIds: ['solar'],
        startDate: '2025-10-01',
        principal: 2000,
        annualRate: 0,
        rateConvention: 'nominal',
        monthlyPayment: 100,
        firstPaymentDate: '2025-11-01',
        paymentDay: 1,
        fees: 0,
        overpayments: [],
      },
    ];
    const r = projectModel(p, '2025-10-31');
    expect(r.months[0].debt).toBe(2000);
    expect(r.months[1].debt).toBe(1900);
    expect(r.outstandingDebt).toBe(2000);
  });

  it('horizon starts at first upgrade and includes only the final anniversary-month portion', () => {
    const p = configured();
    p.installations[0].date = '2025-10-20';
    p.forecast.start = '2026-10-20';
    p.forecast.referenceStart = '2025-10-20';
    p.forecast.referenceEnd = '2026-10-20';
    p.forecast.horizonYears = 2;
    p.forecast.profile = p.forecast.profile.map((profile) => ({ ...profile, importKWh: 310 }));
    p.forecast.importCheapPence = 10;
    p.forecast.importDayPence = 10;
    const r = projectModel(p);
    expect(r.months[0].month).toBe('2025-10');
    expect(r.months.at(-1)?.month).toBe('2027-10');
    expect(r.months.at(-1)?.actualElectricity).toBeCloseTo(19, 10);
  });

  it('next-year headline includes twelve months when the selected chart ends soon after forecast start', () => {
    const p = configured();
    p.installations = [{ id: 'charger', type: 'charger', date: '2025-10-20', cost: 1000 }];
    p.forecast.start = '2026-09-20';
    p.forecast.referenceStart = '2025-09-20';
    p.forecast.referenceEnd = '2026-09-20';
    p.forecast.horizonYears = 1;
    p.forecast.profile = p.forecast.profile.map((profile) => ({ ...profile, importKWh: 310 }));
    p.forecast.importCheapPence = 10;
    p.forecast.importDayPence = 10;
    p.loans = [
      {
        id: 'late-cash',
        name: 'Horizon cash fixture',
        installationIds: ['charger'],
        startDate: '2025-10-20',
        principal: 900,
        annualRate: 0,
        rateConvention: 'nominal',
        monthlyPayment: 10,
        firstPaymentDate: '2025-11-25',
        paymentDay: 25,
        fees: 0,
        overpayments: [
          { id: 'on-boundary', date: '2026-10-20', amount: 80, kind: 'planned' },
          { id: 'after-boundary', date: '2026-10-25', amount: 20, kind: 'planned' },
        ],
      },
    ];
    const r = projectModel(p);
    expect(r.nextYearSavings).toBeCloseTo(-372, 10);
    const finalMonth = r.months.at(-1)!;
    expect(finalMonth.month).toBe('2026-10');
    expect(finalMonth.actualElectricity).toBeCloseTo(19, 10);
    expect(finalMonth.cashFlow).toBeCloseTo(-19, 10);
    expect(finalMonth.debt).toBe(790);
    expect(r.nextYearCosts).toEqual({
      baselineElectricity: 0,
      avoidedOil: 0,
      avoidedPetrol: 0,
      netElectricity: 372,
    });
    const costs = r.nextYearCosts!;
    expect(
      costs.baselineElectricity + costs.avoidedOil + costs.avoidedPetrol - costs.netElectricity,
    ).toBeCloseTo(r.nextYearSavings!, 10);
  });

  it('next-year cost panel covers every seasonal month beyond a short chart horizon', () => {
    const p = configured();
    p.installations = [
      { id: 'charger', type: 'charger', date: '2025-10-20', cost: 1000 },
      { id: 'heat', type: 'heat-pump', date: '2026-09-20', cost: 1000 },
    ];
    p.baseline.annualKWh = 365;
    p.baseline.unitPence = 20;
    p.heating.annualKWh = 0;
    p.oil.annualLitresOverride = 1000;
    p.oil.monthlyWeights = Array(12).fill(1 / 12);
    p.oil.historicalPence = 50;
    p.oil.quotePence = 60;
    p.forecast.start = '2026-09-20';
    p.forecast.referenceStart = '2025-09-20';
    p.forecast.referenceEnd = '2026-09-20';
    p.forecast.horizonYears = 1;
    p.forecast.importCheapPence = 10;
    p.forecast.importDayPence = 10;
    p.forecast.profile = p.forecast.profile.map((profile) => ({
      ...profile,
      importKWh: profile.month * 10,
      exportKWh: profile.month,
    }));
    const result = projectModel(p);
    const costs = result.nextYearCosts!;
    // Each month occurs once across the September-to-September reporting year;
    // partial September portions together conserve its full seasonal amount.
    expect(costs.baselineElectricity).toBeCloseTo(73, 10);
    expect(costs.avoidedOil).toBeCloseTo(600, 10);
    expect(costs.avoidedPetrol).toBe(0);
    expect(costs.netElectricity).toBeCloseTo(78 - 78 * 0.15, 10);
    expect(result.nextYearSavings).toBeCloseTo(73 + 600 - (78 - 78 * 0.15), 10);
    expect(
      costs.baselineElectricity + costs.avoidedOil + costs.avoidedPetrol - costs.netElectricity,
    ).toBeCloseTo(result.nextYearSavings!, 10);
  });
});
