import Decimal from 'decimal.js';
import { Temporal } from '@js-temporal/polyfill';
import type { Project, Projection, MonthResult, LoanSchedule } from '../domain/types';
import {
  electricityCost,
  petrolLitres,
  oilAnnualLitres,
  heatingCostForMonth,
} from '../domain/energy';
import { loanSchedule, investmentCost, findPayback, loanBalanceAt } from '../domain/finance';
const D = (x: number) => new Decimal(x);
const day = (s: string) => Temporal.PlainDate.from(s);
const sum = (xs: number[]) => xs.reduce((a, x) => a.plus(x), D(0)).toNumber();
const overlapDays = (s: string, e: string, after: string | null) => {
  const a = after && after > s ? after : s;
  return a >= e ? 0 : day(a).until(day(e)).days;
};
const midnight = (s: string) =>
  day(s).toZonedDateTime({ timeZone: 'Europe/London', plainTime: '00:00' }).epochMilliseconds;
const endOfMonth = (s: string) => day(s).with({ day: 1 }).add({ months: 1 });
function allocated(annual: number, weights: number[], s: string, e: string): number {
  const d = day(s);
  const days = d.until(day(e)).days;
  const flat = weights.every((w) => Math.abs(w - 1 / 12) < 1e-9);
  return D(annual)
    .times(flat ? days / d.daysInYear : (weights[d.month - 1] * days) / d.daysInMonth)
    .toNumber();
}
export function projectModel(
  p: Project,
  asOf = Temporal.Now.plainDateISO('Europe/London').toString(),
): Projection {
  const result: Projection = {
    nextYearCosts: null,
    months: [],
    historicalSavings: null,
    nextYearSavings: null,
    investment: null,
    paybackMonth: null,
    recoveryLost: false,
    outstandingDebt: 0,
    loans: [],
    missing: [],
    warnings: [],
    effectiveHeatingPence: null,
  };
  const first = p.installations.map((x) => x.date).sort()[0];
  const heat =
    p.installations
      .filter((x) => x.type === 'heat-pump')
      .map((x) => x.date)
      .sort()[0] ?? null;
  const ev =
    p.installations
      .filter((x) => x.type === 'ev')
      .map((x) => x.date)
      .sort()[0] ?? null;
  if (!first) result.missing.push('Add an installation with its commissioning date and price.');
  if (
    p.baseline.annualKWh === null ||
    p.baseline.unitPence === null ||
    p.baseline.standingPence === null
  )
    result.missing.push('Enter baseline annual electricity, comparison rate and standing charge.');
  const oil = oilAnnualLitres(p.oil);
  const petrol =
    p.cars.annualMiles !== null &&
    p.cars.mpg !== null &&
    p.cars.mpg > 0 &&
    p.cars.petrolPence !== null
      ? D(petrolLitres(p.cars.annualMiles, p.cars.mpg))
          .times(p.cars.petrolPence)
          .div(100)
          .toNumber()
      : null;
  if (heat && oil.litres === null)
    result.missing.push('Declare oil coverage and deliveries, or an annual oil-use override.');
  if (heat && p.oil.historicalPence === null && !p.oil.deliveries.length)
    result.missing.push('Enter an historical oil price or delivery costs.');
  if (ev && petrol === null)
    result.missing.push('Enter annual mileage, positive UK MPG and petrol price.');
  const coveredDeliveries = p.oil.deliveries.filter(
    (d) =>
      (!p.oil.coverageStart || d.date >= p.oil.coverageStart) &&
      (!p.oil.coverageEnd || d.date < p.oil.coverageEnd),
  );
  const weightedOilPrice =
    p.oil.historicalPence ??
    (coveredDeliveries.length
      ? (sum(coveredDeliveries.map((d) => d.total)) * 100) /
        sum(coveredDeliveries.map((d) => d.litres))
      : null);
  const baselineReady =
    p.baseline.annualKWh !== null &&
    p.baseline.unitPence !== null &&
    p.baseline.standingPence !== null;
  const historicReady =
    baselineReady &&
    (!heat || (oil.litres !== null && weightedOilPrice !== null)) &&
    (!ev || petrol !== null);
  const f = p.forecast;
  const forecastStart = f.start;
  if (!forecastStart)
    result.missing.push('Choose the forecast start date after your historic cutoff.');
  const adoption = p.installations
    .filter((i) => i.type === 'solar-battery' || i.type === 'ev')
    .map((i) => i.date)
    .sort()
    .at(-1);
  const refDatesValid =
    !!f.referenceStart &&
    !!f.referenceEnd &&
    day(f.referenceStart).add({ years: 1 }).toString() === f.referenceEnd &&
    (!adoption || f.referenceStart >= adoption);
  const refValid =
    f.referenceConfirmed &&
    refDatesValid &&
    f.profile.length === 12 &&
    f.profile.every(
      (r) => r.importKWh !== null && r.exportKWh !== null && r.cheapFraction !== null,
    ) &&
    new Set(f.profile.map((x) => x.month)).size === 12;
  const incompleteMonths = f.profile.filter(
    (r) => r.importKWh === null || r.exportKWh === null || r.cheapFraction === null,
  );
  if (incompleteMonths.length)
    result.missing.push(
      `Reference readings or explicit estimates still needed for ${incompleteMonths.map((r) => new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, r.month - 1, 1)))).join(', ')}. Missing exports are not zero.`,
    );
  if (!refValid)
    result.missing.push(
      'Confirm a full seasonal pre-heat-pump reference profile (explicit estimates are allowed).',
    );
  if (
    f.importDayPence === null ||
    f.importCheapPence === null ||
    f.exportPence === null ||
    f.standingPence === null
  )
    result.missing.push('Enter forecast import, export and standing-charge assumptions.');
  if (heat && (p.heating.annualKWh === null || p.oil.quotePence === null))
    result.missing.push(
      'Enter heat-pump annual electrical input and a VAT/delivery-inclusive oil quote.',
    );
  if (heat && !p.oil.quoteIncludesVatDelivery)
    result.missing.push('Normalise the oil quote to include VAT and delivery before forecasting.');
  if (heat && f.referenceEnd && f.referenceEnd > heat)
    result.missing.push(
      'Reference year must end before heat-pump commissioning; mixed years would count heating twice.',
    );
  const forecastReady =
    historicReady &&
    refValid &&
    forecastStart &&
    f.importDayPence !== null &&
    f.importCheapPence !== null &&
    f.exportPence !== null &&
    f.standingPence !== null &&
    (!heat ||
      (p.heating.annualKWh !== null &&
        p.oil.quotePence !== null &&
        p.oil.quoteIncludesVatDelivery &&
        (!f.referenceEnd || f.referenceEnd <= heat)));
  result.warnings.push(
    ...oil.notes,
    'Historical savings compare actual electricity with estimated alternative-household costs.',
    'Public charging, maintenance, equipment replacement, degradation, residual values, price escalation and discounting are excluded.',
    'Forecast heating is additional grid input; reference exports stay unchanged. Extra Intelligent Go charging slots are excluded; reconstructed costs are provisional until reconciled.',
    'Loan interest uses a monthly approximation. Positive cash benefit does not mean debt-free.',
  );
  try {
    for (const loan of p.loans) {
      const schedule = loanSchedule(loan);
      const base = loanSchedule({
        ...loan,
        overpayments: loan.overpayments.filter((x) => x.kind === 'actual'),
      });
      result.loans.push({
        loan,
        schedule,
        remainingPrincipal: loanBalanceAt(schedule, loan, asOf),
        remainingInterest: sum(
          schedule.periods.filter((x) => x.start > asOf).map((x) => x.interest),
        ),
        withoutPlannedInterest: base.totalInterest,
        withoutPlannedPayoff: base.payoffDate,
      });
      result.warnings.push(...schedule.warnings);
      result.outstandingDebt += loanBalanceAt(schedule, loan, asOf);
    }
    result.investment = first
      ? investmentCost(
          p.installations,
          result.loans.map((x) => x.schedule),
          p.loans,
        )
      : null;
  } catch (error) {
    result.missing.push(`Finance: ${error instanceof Error ? error.message : 'Invalid loan'}`);
  }
  for (const installation of p.installations) {
    const linked = p.loans.filter((l) => l.installationIds.includes(installation.id));
    if (linked.some((l) => l.installationIds.length > 1))
      result.warnings.push(
        'Loans linked to several invoices need explicit funding reconciliation; no cost split is assumed.',
      );
    if (
      linked.every((l) => l.installationIds.length === 1) &&
      sum(linked.map((l) => l.principal)) > installation.cost + 0.01
    )
      result.warnings.push(
        `Loan funding linked to ${installation.type} exceeds its invoice; check funding.`,
      );
  }
  if (!first) return result;
  let horizon;
  try {
    horizon = day(first).add({ years: f.horizonYears });
  } catch {
    return { ...result, missing: [...result.missing, 'Invalid date or projection horizon.'] };
  }
  const sourceIntervals = p.cache.intervals.map((row) => ({
    row,
    start: Date.parse(row.start),
    end: Date.parse(row.end),
  }));
  const nextCosts = { baselineElectricity: 0, avoidedOil: 0, avoidedPetrol: 0, netElectricity: 0 };
  let cumulative = D(0),
    cash = D(0),
    heatingTotal = D(0),
    heatingCostTotal = D(0),
    histTotal = D(0),
    nextTotal = D(0);
  let historicCount = 0,
    forecastCount = 0;
  let allNextComplete = true;
  const nextEnd = forecastStart ? day(forecastStart).add({ years: 1 }).toString() : null;
  const calculationEnd = nextEnd && nextEnd > horizon.toString() ? day(nextEnd) : horizon;
  for (
    let cursor = day(first).with({ day: 1 });
    Temporal.PlainDate.compare(cursor, calculationEnd) < 0;

  ) {
    const ms = cursor.with({ day: 1 }).toString();
    const me = endOfMonth(ms).toString();
    const s = cursor.toString() < first ? first : cursor.toString();
    let e = me > calculationEnd.toString() ? calculationEnd.toString() : me;
    if (s < horizon.toString() && e > horizon.toString()) e = horizon.toString();
    if (nextEnd && s < nextEnd && e > nextEnd) e = nextEnd;
    const month: MonthResult = {
      month: ms.slice(0, 7),
      historical: !forecastStart || e <= forecastStart,
      complete: true,
      actualElectricity: null,
      baselineElectricity: 0,
      avoidedOil: 0,
      avoidedPetrol: 0,
      heatingKWh: 0,
      heatingCost: 0,
      savings: 0,
      cumulativeSavings: 0,
      cashFlow: 0,
      cumulativeCash: 0,
      debt: 0,
      notes: [],
    };
    let net = D(0),
      knownNet = true,
      savings = D(0);
    const parts: { start: string; end: string; historical: boolean }[] = [];
    const hsEnd = forecastStart && forecastStart < e ? forecastStart : e;
    if (s < hsEnd) parts.push({ start: s, end: hsEnd, historical: true });
    const fsStart = forecastStart && forecastStart > s ? forecastStart : s;
    if (forecastStart && fsStart < e) parts.push({ start: fsStart, end: e, historical: false });
    for (const part of parts) {
      const days = overlapDays(part.start, part.end, null);
      const baseline = baselineReady
        ? D(allocated(p.baseline.annualKWh!, p.baseline.monthlyWeights, part.start, part.end))
            .times(p.baseline.unitPence!)
            .div(100)
            .plus(D(days).times(p.baseline.standingPence!).div(100))
            .toNumber()
        : 0;
      month.baselineElectricity += baseline;
      let cost: number | null = null,
        complete = false;
      if (part.historical) {
        const midnightStart = midnight(part.start),
          midnightEnd = midnight(part.end);
        const actual = electricityCost(
          sourceIntervals
            .filter((r) => r.start < midnightEnd && r.end > midnightStart)
            .map((r) => r.row),
          p.cache.rates,
          part.start,
          part.end,
          p.overrides,
        );
        cost = actual.net;
        complete =
          actual.complete &&
          baselineReady &&
          (!heat || heat >= part.end || (oil.litres !== null && weightedOilPrice !== null)) &&
          (!ev || ev >= part.end || petrol !== null);
        month.notes.push(...actual.notes);
      } else if (forecastReady) {
        const profile = f.profile.find((x) => x.month === cursor.month)!;
        const fraction = days / cursor.daysInMonth;
        cost = D(profile.importKWh!)
          .times(fraction)
          .times(
            D(f.importCheapPence!)
              .times(profile.cheapFraction!)
              .plus(D(f.importDayPence!).times(1 - profile.cheapFraction!)),
          )
          .div(100)
          .minus(D(profile.exportKWh!).times(fraction).times(f.exportPence!).div(100))
          .plus(D(days).times(f.standingPence!).div(100))
          .toNumber();
        const heatDays = overlapDays(part.start, part.end, heat);
        if (heat && heatDays > 0) {
          const kWh = D(p.heating.annualKWh!)
            .times(p.heating.monthlyWeights[cursor.month - 1])
            .times(heatDays / cursor.daysInMonth)
            .toNumber();
          const heating = heatingCostForMonth(cursor.year, cursor.month, kWh, f, {
            start: heat && heat > part.start ? heat : part.start,
            end: part.end,
          });
          month.heatingKWh += kWh;
          month.heatingCost += heating.cost;
          cost += heating.cost;
          heatingTotal = heatingTotal.plus(kWh);
          heatingCostTotal = heatingCostTotal.plus(heating.cost);
        }
        complete = true;
        month.notes.push(
          `Reference import ${profile.importProvenance ?? profile.provenance}, export ${profile.exportProvenance ?? profile.provenance}; repriced with unchanged solar, battery and EV conditions.`,
        );
      }
      const heatStart = heat && heat > part.start ? heat : part.start;
      const avoidedOil =
        heat && heatStart < part.end && oil.litres !== null
          ? D(allocated(oil.litres, p.oil.monthlyWeights, heatStart, part.end))
              .times(
                part.historical
                  ? (weightedOilPrice ?? 0)
                  : D(p.oil.quotePence ?? 0)
                      .times(f.oilFactors[f.oilScenario])
                      .toNumber(),
              )
              .div(100)
              .toNumber()
          : 0;
      const avoidedPetrol =
        ev && petrol !== null
          ? D(petrol)
              .times(overlapDays(part.start, part.end, ev))
              .div(cursor.daysInYear)
              .toNumber()
          : 0;
      month.avoidedOil += avoidedOil;
      month.avoidedPetrol += avoidedPetrol;
      if (cost === null || !complete) {
        month.complete = false;
        knownNet = false;
      } else {
        net = net.plus(cost);
        const gain = D(baseline).plus(avoidedOil).plus(avoidedPetrol).minus(cost);
        savings = savings.plus(gain);
        if (part.historical) {
          histTotal = histTotal.plus(gain);
          historicCount++;
        } else if (nextEnd && part.start < nextEnd) {
          const coveredEnd = part.end > nextEnd ? nextEnd : part.end;
          nextTotal = nextTotal.plus(gain.times(overlapDays(part.start, coveredEnd, null) / days));
          forecastCount++;
          nextCosts.baselineElectricity += baseline;
          nextCosts.avoidedOil += avoidedOil;
          nextCosts.avoidedPetrol += avoidedPetrol;
          nextCosts.netElectricity += cost;
        }
      }
      if (!part.historical && nextEnd && part.start < nextEnd && !complete) allNextComplete = false;
    }
    month.actualElectricity = knownNet ? net.toNumber() : null;
    month.savings = month.complete ? savings.toNumber() : null;
    if (month.savings !== null) cumulative = cumulative.plus(month.savings);
    let flow = month.savings === null ? D(0) : D(month.savings);
    for (const i of p.installations) if (i.date >= s && i.date < e) flow = flow.minus(i.cost);
    for (const { loan, schedule } of result.loans) {
      if (loan.startDate >= s && loan.startDate < e)
        flow = flow.plus(loan.principal).minus(loan.fees);
      for (const period of schedule.periods)
        for (const payment of period.payments)
          if (payment.date >= s && payment.date < e) flow = flow.minus(payment.applied);
      month.debt += loanBalanceAt(schedule, loan, day(e).subtract({ days: 1 }).toString());
    }
    cash = cash.plus(flow);
    month.cashFlow = flow.toNumber();
    month.cumulativeCash = cash.toNumber();
    month.cumulativeSavings = cumulative.toNumber();
    if (!month.complete)
      month.notes.push(
        'Incomplete month excluded from savings; cumulative figures show included months only and are not a complete household total. Cash includes known finance movements.',
      );
    if (Temporal.PlainDate.compare(cursor, horizon) < 0) {
      const previous = result.months.at(-1);
      if (previous?.month === month.month) {
        previous.historical = previous.historical && month.historical;
        previous.complete = previous.complete && month.complete;
        previous.actualElectricity =
          previous.actualElectricity === null || month.actualElectricity === null
            ? null
            : previous.actualElectricity + month.actualElectricity;
        previous.savings =
          previous.savings === null || month.savings === null
            ? null
            : previous.savings + month.savings;
        for (const key of [
          'baselineElectricity',
          'avoidedOil',
          'avoidedPetrol',
          'heatingKWh',
          'heatingCost',
          'cashFlow',
        ] as const)
          previous[key] += month[key];
        previous.cumulativeCash = month.cumulativeCash;
        previous.cumulativeSavings = month.cumulativeSavings;
        previous.debt = month.debt;
        previous.notes.push(...month.notes);
      } else result.months.push(month);
    }
    cursor = day(e);
  }
  result.historicalSavings = historicCount ? histTotal.toNumber() : null;
  result.nextYearSavings = forecastCount && allNextComplete ? nextTotal.toNumber() : null;
  result.nextYearCosts = result.nextYearSavings === null ? null : nextCosts;
  result.effectiveHeatingPence = heatingTotal.gt(0)
    ? heatingCostTotal.div(heatingTotal).times(100).toNumber()
    : null;
  if (result.months.some((m) => !m.complete))
    result.warnings.push(
      'Cumulative charts and historical savings sum included complete months only. Gaps prevent a full-history payback claim.',
    );
  if (result.investment !== null) {
    const payback = findPayback(result.months, result.investment);
    result.paybackMonth = payback.month;
    result.recoveryLost = payback.recoveryLost;
  }
  return result;
}
