import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
import type { Project } from '../domain/types';
import { validTimestamp, compareTimestamps } from './timestamp';

const finite = z.number().finite();
const positive = finite.positive();
const nonnegative = finite.nonnegative();
const id = z.string().min(1);
const date = z.string().refine((value) => {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}, 'Use a real YYYY-MM-DD calendar date');
const instant = z.string().refine(validTimestamp, 'Use an ISO timestamp with an offset');
const provenance = z.enum(['entered', 'api-derived', 'estimated', 'overridden']);
const weights = z
  .array(nonnegative)
  .length(12)
  .refine(
    (values) => Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-8,
    'Twelve monthly weights must total 100%',
  );
const period = z.strictObject({ start: instant, end: instant });
const agreement = z.strictObject({ tariffCode: id, start: instant, end: instant.nullable() });
const interval = z.strictObject({
  start: instant,
  end: instant,
  kWh: nonnegative,
  direction: z.enum(['import', 'export']),
  meter: id,
});
const rate = z.strictObject({
  start: instant,
  end: instant.nullable(),
  pence: finite,
  direction: z.enum(['import', 'export', 'standing']),
  source: z.string().optional(),
});
export const projectSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    name: z.string(),
    mode: z.enum(['household', 'demo']),
    revision: nonnegative.int(),
    migrationHistory: z.array(z.string()),
    occupancyDate: date.nullable(),
    installations: z.array(
      z.strictObject({
        id,
        type: z.enum(['solar-battery', 'heat-pump', 'ev', 'charger']),
        date,
        cost: nonnegative,
        note: z.string().optional(),
      }),
    ),
    loans: z.array(
      z.strictObject({
        id,
        name: z.string(),
        installationIds: z.array(id).min(1),
        startDate: date,
        principal: nonnegative,
        annualRate: nonnegative,
        rateConvention: z.enum(['nominal', 'effective', 'apr-approximation']),
        monthlyPayment: positive,
        paymentProvenance: z.enum(['entered', 'estimated']).optional(),
        originalTermMonths: positive.int().max(12000).optional(),
        firstPaymentDate: date,
        paymentDay: positive.int().max(31),
        fees: nonnegative,
        overpayments: z.array(
          z.strictObject({ id, date, amount: nonnegative, kind: z.enum(['actual', 'planned']) }),
        ),
        anchor: z.strictObject({ date, balance: nonnegative, note: z.string() }).optional(),
      }),
    ),
    baseline: z.strictObject({
      annualKWh: nonnegative.nullable(),
      provenance,
      referenceStart: date.nullable(),
      referenceEnd: date.nullable(),
      monthlyWeights: weights,
      unitPence: finite.nullable(),
      standingPence: finite.nullable(),
      tariffNote: z.string(),
    }),
    oil: z.strictObject({
      deliveries: z.array(
        z.strictObject({
          id,
          date,
          litres: positive,
          total: nonnegative,
          unitPence: nonnegative.optional(),
          note: z.string().optional(),
        }),
      ),
      coverageStart: date.nullable(),
      coverageEnd: date.nullable(),
      openingLitres: nonnegative.nullable(),
      closingLitres: nonnegative.nullable(),
      annualLitresOverride: nonnegative.nullable(),
      historicalPence: nonnegative.nullable(),
      quotePence: nonnegative.nullable(),
      quoteDate: date.nullable(),
      quoteIncludesVatDelivery: z.boolean(),
      supplier: z.string(),
      orderLitres: positive.nullable(),
      monthlyWeights: weights,
    }),
    cars: z.strictObject({
      annualMiles: nonnegative.nullable(),
      mpg: positive.nullable(),
      petrolPence: nonnegative.nullable(),
      priceDate: date.nullable(),
    }),
    heating: z.strictObject({ annualKWh: nonnegative.nullable(), monthlyWeights: weights }),
    forecast: z.strictObject({
      start: date.nullable(),
      horizonYears: positive.int().max(100),
      oilScenario: z.enum(['low', 'central', 'high']),
      oilFactors: z.strictObject({ low: nonnegative, central: nonnegative, high: nonnegative }),
      importDayPence: finite.nullable(),
      importCheapPence: finite.nullable(),
      cheapStartHour: nonnegative.lt(24),
      cheapEndHour: nonnegative.lt(24),
      exportPence: finite.nullable(),
      standingPence: finite.nullable(),
      referenceStart: date.nullable(),
      referenceEnd: date.nullable(),
      referenceConfirmed: z.boolean(),
      profile: z.array(
        z.strictObject({
          month: positive.int().max(12),
          importKWh: nonnegative,
          exportKWh: nonnegative,
          cheapFraction: nonnegative.max(1),
          provenance,
        }),
      ),
    }),
    overrides: z.array(
      z.strictObject({
        id,
        start: date,
        end: date,
        component: z.enum(['import', 'export']),
        amount: finite,
        note: z.string(),
      }),
    ),
    connection: z.strictObject({
      accountNumber: z.string(),
      meters: z.array(
        z.strictObject({
          mpan: id,
          serial: id,
          direction: z.enum(['import', 'export']),
          agreements: z.array(agreement),
        }),
      ),
    }),
    cache: z.strictObject({
      intervals: z.array(interval),
      rates: z.array(rate),
      retrievedAt: instant.nullable(),
      requestPeriod: period.optional(),
      endpoints: z.array(z.string().url()),
      refreshStatus: z.enum(['idle', 'complete', 'incomplete']),
      error: z.string().optional(),
    }),
    lastBackupAt: instant.nullable(),
  })
  .superRefine((p, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const unique = (records: { id: string }[], path: (string | number)[]) => {
      const seen = new Set<string>();
      records.forEach((r, i) => {
        if (seen.has(r.id)) issue([...path, i, 'id'], 'Duplicate entity ID');
        seen.add(r.id);
      });
    };
    unique(p.installations, ['installations']);
    unique(p.loans, ['loans']);
    unique(p.oil.deliveries, ['oil', 'deliveries']);
    unique(p.overrides, ['overrides']);
    const installations = new Set(p.installations.map((i) => i.id));
    const evIds = new Set(p.installations.filter((i) => i.type === 'ev').map((i) => i.id));
    p.installations.forEach((installation, i) => {
      if (installation.type === 'ev' && installation.cost !== 0)
        issue(
          ['installations', i, 'cost'],
          'EV adoption records must have zero cost; vehicle ownership costs are outside this model.',
        );
    });
    p.loans.forEach((loan, i) => {
      unique(loan.overpayments, ['loans', i, 'overpayments']);
      if (new Set(loan.installationIds).size !== loan.installationIds.length)
        issue(['loans', i, 'installationIds'], 'Duplicate installation link');
      loan.installationIds.forEach((ref, j) => {
        if (!installations.has(ref))
          issue(['loans', i, 'installationIds', j], 'Unknown installation ID');
        if (evIds.has(ref))
          issue(
            ['loans', i, 'installationIds', j],
            'Vehicle finance is outside this model; loans cannot fund EV adoption records.',
          );
      });
      if (loan.firstPaymentDate < loan.startDate)
        issue(['loans', i, 'firstPaymentDate'], 'First payment precedes drawdown');
      if (loan.overpayments.some((o) => o.date < loan.startDate))
        issue(['loans', i, 'overpayments'], 'Overpayment precedes drawdown');
      if (loan.anchor && loan.anchor.date < loan.startDate)
        issue(['loans', i, 'anchor'], 'Balance anchor precedes drawdown');
    });
    const checkRange = (
      start: string | null,
      end: string | null,
      path: (string | number)[],
      equal = false,
    ) => {
      if (start && end && (equal ? start > end : start >= end))
        issue(path, 'Period end must follow start');
    };
    checkRange(p.baseline.referenceStart, p.baseline.referenceEnd, ['baseline', 'referenceEnd']);
    checkRange(p.oil.coverageStart, p.oil.coverageEnd, ['oil', 'coverageEnd']);
    checkRange(p.forecast.referenceStart, p.forecast.referenceEnd, ['forecast', 'referenceEnd']);
    if (new Set(p.forecast.profile.map((x) => x.month)).size !== p.forecast.profile.length)
      issue(['forecast', 'profile'], 'Duplicate profile month');
    p.overrides.forEach((r, i) => {
      checkRange(r.start, r.end, ['overrides', i, 'end']);
      p.overrides.slice(0, i).forEach((other) => {
        if (other.component === r.component && r.start < other.end && other.start < r.end)
          issue(['overrides', i], 'Overlapping bill corrections for the same component');
      });
    });
    const compareInstant = compareTimestamps;
    if (
      p.cache.requestPeriod &&
      compareInstant(p.cache.requestPeriod.start, p.cache.requestPeriod.end) >= 0
    )
      issue(['cache', 'requestPeriod'], 'Request end must follow start');
    p.cache.intervals.forEach((r, i) => {
      if (compareInstant(r.start, r.end) >= 0)
        issue(['cache', 'intervals', i], 'Interval end must follow start');
    });
    for (const [group, records] of [
      ['intervals', p.cache.intervals],
      ['rates', p.cache.rates],
    ] as const) {
      const ordered = [...records].sort((a, b) => compareInstant(a.start, b.start));
      const latest = new Map<string, string | null>();
      for (const r of ordered) {
        const key =
          group === 'intervals' ? `${r.direction}|${'meter' in r ? r.meter : ''}` : r.direction;
        if (latest.has(key)) {
          const previous = latest.get(key);
          if (previous === null || (previous && compareInstant(r.start, previous) < 0))
            issue(['cache', group], 'Overlapping or duplicated source records');
        }
        if (r.end && compareInstant(r.start, r.end) >= 0)
          issue(['cache', group], 'Source end must follow start');
        latest.set(key, r.end);
      }
    }
    const meters = new Set<string>();
    p.connection.meters.forEach((m, i) => {
      const key = `${m.mpan}|${m.serial}|${m.direction}`;
      if (meters.has(key)) issue(['connection', 'meters', i], 'Duplicate meter selection');
      meters.add(key);
      const ordered = [...m.agreements].sort((a, b) => compareInstant(a.start, b.start));
      ordered.forEach((a, j) => {
        if (a.end && compareInstant(a.start, a.end) >= 0)
          issue(['connection', 'meters', i, 'agreements'], 'Agreement end must follow start');
        const previous = ordered[j - 1];
        if (previous && (previous.end === null || compareInstant(a.start, previous.end) < 0))
          issue(['connection', 'meters', i, 'agreements'], 'Overlapping tariff agreements');
      });
    });
  });

export function validateProject(value: unknown): Project {
  return projectSchema.parse(value);
}
/** Version one is the initial supported schema. Future migrations must snapshot before applying. */
export function parseBackup(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Backup is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || (raw as { schemaVersion?: unknown }).schemaVersion !== 1)
    throw new Error('Unsupported backup schema version. Original data has not been changed.');
  return validateProject(raw);
}
/** Strict schema rejects credentials and all unknown fields, including nested additions. */
export function exportBackup(project: Project, full = false): string {
  const safe = validateProject(project);
  if (!full)
    safe.cache = {
      intervals: [],
      rates: [],
      retrievedAt: null,
      endpoints: [],
      refreshStatus: 'idle',
    };
  return JSON.stringify(safe, null, 2);
}
