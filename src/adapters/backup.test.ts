import { describe, it, expect } from 'vitest';
import { emptyProject } from '../domain/project';
import { parseBackup, exportBackup, validateProject, projectSchema } from './backup';
describe('strict portable input boundary', () => {
  it('round trips facts and signed electricity assumptions without exporting replaceable cache', () => {
    const p = emptyProject();
    p.baseline.unitPence = -2;
    p.cache.rates = [{ start: '2026-01-01T00:00:00Z', end: null, pence: -10, direction: 'import' }];
    expect(parseBackup(exportBackup(p)).cache.rates).toEqual([]);
    expect(parseBackup(exportBackup(p, true))).toEqual(p);
  });
  it('rejects credential fields, unknown schemas and invalid values before destructive use', () => {
    const p = emptyProject();
    expect(() => parseBackup(JSON.stringify({ ...p, apiKey: 'synthetic-do-not-store' }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...p, schemaVersion: 2 }))).toThrow(/schema/);
    p.cars.mpg = 0;
    expect(() => validateProject(p)).toThrow();
    p.cars.mpg = null;
    p.oil.monthlyWeights[0] = 0.5;
    expect(() => validateProject(p)).toThrow(/100%/);
  });
  it('validates references and overlapping corrections', () => {
    const p = emptyProject();
    p.overrides = [
      {
        id: 'a',
        start: '2026-01-01',
        end: '2026-02-01',
        component: 'import',
        amount: 20,
        note: '',
      },
      {
        id: 'b',
        start: '2026-01-15',
        end: '2026-02-01',
        component: 'import',
        amount: 25,
        note: '',
      },
    ];
    expect(() => validateProject(p)).toThrow(/Overlapping/);
    p.overrides[1].component = 'export';
    expect(() => validateProject(p)).not.toThrow();
  });
  it('rejects impossible calendar dates, nonfinite money and duplicate instants with different offsets', () => {
    const p = emptyProject();
    p.occupancyDate = '2026-02-30';
    expect(() => validateProject(p)).toThrow();
    p.occupancyDate = null;
    p.cars.annualMiles = Infinity;
    expect(() => validateProject(p)).toThrow();
    p.cars.annualMiles = null;
    p.cache.intervals = [
      {
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-01T00:30:00Z',
        kWh: 1,
        meter: 'synthetic',
        direction: 'import',
      },
      {
        start: '2026-07-01T01:00:00+01:00',
        end: '2026-07-01T01:30:00+01:00',
        kWh: 2,
        meter: 'synthetic',
        direction: 'import',
      },
    ];
    expect(() => validateProject(p)).toThrow(/duplicated/);
  });
  it('reports malformed source instants through schema issues without throwing a raw time error', () => {
    const p = emptyProject();
    p.cache.intervals = [
      {
        start: '2026-02-30T00:00:00Z',
        end: '2026-03-01T00:00:00Z',
        kWh: 1,
        meter: 'synthetic',
        direction: 'import',
      },
    ];
    const result = projectSchema.safeParse(p);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('start'))).toBe(true);
  });
  it('prevents backup imports from adding vehicle ownership costs or finance', () => {
    const p = emptyProject();
    p.installations = [{ id: 'synthetic-ev', type: 'ev', date: '2026-01-01', cost: 0 }];
    expect(() => parseBackup(JSON.stringify(p))).not.toThrow();
    p.installations[0].cost = 1000;
    expect(() => parseBackup(JSON.stringify(p))).toThrow(/zero cost/);
    p.installations[0].cost = 0;
    p.loans = [
      {
        id: 'synthetic-vehicle-loan',
        name: 'Excluded vehicle finance',
        installationIds: ['synthetic-ev'],
        startDate: '2026-01-01',
        principal: 1000,
        annualRate: 0,
        rateConvention: 'nominal',
        monthlyPayment: 100,
        firstPaymentDate: '2026-02-01',
        paymentDay: 1,
        fees: 0,
        overpayments: [],
      },
    ];
    expect(() => parseBackup(JSON.stringify(p))).toThrow(/Vehicle finance/);
  });
});
