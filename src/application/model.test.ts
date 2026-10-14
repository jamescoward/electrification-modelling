import { describe, it, expect } from 'vitest';
import { Temporal } from '@js-temporal/polyfill';
import { emptyProject } from '../domain/project';
import { projectModel } from './model';
import { demoProject } from './demo';
import { validateProject } from '../adapters/backup';
import type { Project } from '../domain/types';
function entered(): Project {
  const p = emptyProject('demo');
  p.installations = [
    { id: 'solar', type: 'solar-battery', date: '2026-01-01', cost: 10000 },
    { id: 'heat', type: 'heat-pump', date: '2026-01-01', cost: 0 },
    { id: 'ev', type: 'ev', date: '2026-01-01', cost: 0 },
  ];
  p.baseline = { ...p.baseline, annualKWh: 3600, unitPence: 30, standingPence: 50 };
  p.oil.annualLitresOverride = 1500;
  p.oil.historicalPence = 60;
  p.oil.quotePence = 60;
  p.heating.annualKWh = 3000;
  p.cars = { annualMiles: 10000, mpg: 40, petrolPence: 150, priceDate: '2026-01-01' };
  p.forecast = {
    ...p.forecast,
    start: '2027-01-01',
    referenceStart: '2026-01-01',
    referenceEnd: '2027-01-01',
    referenceConfirmed: true,
    importDayPence: 30,
    importCheapPence: 10,
    exportPence: 15,
    standingPence: 50,
    profile: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      importKWh: 300,
      exportKWh: 100,
      cheapFraction: 0.5,
      provenance: 'entered',
    })),
  };
  return p;
}
describe('integrated model acceptance', () => {
  it('blank household has unknown headlines and setup requirements', () => {
    const r = projectModel(emptyProject());
    expect(r.months).toEqual([]);
    expect(r.investment).toBeNull();
    expect(r.nextYearSavings).toBeNull();
    expect(r.missing.length).toBeGreaterThan(0);
  });
  it('synthetic seasonal demo is validated and calculates historical, forecast, debt and payback', () => {
    const p = validateProject(demoProject());
    const r = projectModel(p, '2026-10-01');
    expect(r.missing).toEqual([]);
    expect(r.historicalSavings).not.toBeNull();
    expect(r.nextYearSavings).not.toBeNull();
    expect(r.months.every((m) => m.complete)).toBe(true);
    expect(r.investment).toBeGreaterThan(0);
    expect(r.paybackMonth).not.toBeNull();
  });
  it('A19 future oil scenario changes forecast without rewriting history or facts', () => {
    const p = demoProject();
    const original = JSON.stringify(p.oil.deliveries);
    const central = projectModel(p);
    p.forecast.oilScenario = 'high';
    const high = projectModel(p);
    expect(high.nextYearSavings!).toBeGreaterThan(central.nextYearSavings!);
    expect(high.historicalSavings).toBe(central.historicalSavings);
    expect(JSON.stringify(p.oil.deliveries)).toBe(original);
  });
  it('A18 planned overpayment changes finance and cash, leaves energy unchanged', () => {
    const p = demoProject();
    const r = projectModel(p);
    p.loans[0].overpayments.push({ id: 'extra', date: '2026-12-15', amount: 500, kind: 'planned' });
    const x = projectModel(p);
    expect(x.nextYearSavings).toBe(r.nextYearSavings);
    expect(x.historicalSavings).toBe(r.historicalSavings);
    expect(x.investment!).toBeLessThan(r.investment!);
    expect(x.months.find((m) => m.month === '2026-12')!.cashFlow).not.toBe(
      r.months.find((m) => m.month === '2026-12')!.cashFlow,
    );
  });
  it('A22 reprices reference exports once and adds only grid heating', () => {
    const p = entered();
    p.installations = p.installations.filter((i) => i.type !== 'heat-pump');
    const r = projectModel(p);
    const jan = r.months.find((m) => m.month === '2027-01')!;
    expect(jan.actualElectricity).toBeCloseTo(300 * 0.2 - 100 * 0.15 + 31 * 0.5);
    expect(jan.heatingCost).toBe(0);
  });
  it('A09 monthly bill overrides use actual £100 without extra heating or EV grid charges', () => {
    const p = entered();
    p.overrides = [
      {
        id: 'bill',
        start: '2026-01-01',
        end: '2026-02-01',
        component: 'import',
        amount: 100,
        note: 'includes standing charge handled separately: use unit charges here',
      },
      {
        id: 'export',
        start: '2026-01-01',
        end: '2026-02-01',
        component: 'export',
        amount: 0,
        note: 'bill',
      },
    ];
    p.cache.rates = [{ start: '2026-01-01T00:00:00Z', end: null, direction: 'standing', pence: 0 }];
    const r = projectModel(p);
    expect(r.months[0].actualElectricity).toBe(100);
    expect(r.months[0].heatingCost).toBe(0);
  });
  it('A28 rejects a mixed heat-pump reference year and keeps historic/forecast dates separate', () => {
    const p = entered();
    expect(projectModel(p).nextYearSavings).toBeNull();
    expect(projectModel(p).missing.join(' ')).toContain('count heating twice');
    const d = demoProject();
    const r = projectModel(d);
    expect(r.months.filter((m) => m.historical).at(-1)?.month).toBe('2026-09');
    expect(r.months.find((m) => !m.historical)?.month).toBe('2026-10');
  });
  it('A12 unknown future oil baseline does not suppress prior electricity savings', () => {
    const p = entered();
    p.installations.find((i) => i.type === 'heat-pump')!.date = '2026-10-01';
    p.oil.annualLitresOverride = null;
    p.oil.historicalPence = null;
    p.oil.quotePence = null;
    p.overrides = [
      {
        id: 'import',
        start: '2026-01-01',
        end: '2026-02-01',
        component: 'import',
        amount: 100,
        note: '',
      },
      {
        id: 'export',
        start: '2026-01-01',
        end: '2026-02-01',
        component: 'export',
        amount: 0,
        note: '',
      },
    ];
    p.cache.rates = [{ start: '2026-01-01T00:00:00Z', end: null, direction: 'standing', pence: 0 }];
    expect(projectModel(p).months[0].avoidedOil).toBe(0);
    expect(projectModel(p).months[0].savings).not.toBeNull();
  });
});
