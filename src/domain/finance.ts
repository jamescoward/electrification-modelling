import Decimal from 'decimal.js';
import { Temporal } from '@js-temporal/polyfill';
import type { Installation, Loan, LoanPayment, LoanSchedule } from './types';

const nonnegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a finite nonnegative amount.`);
  return new Decimal(value);
};
const compare = Temporal.PlainDate.compare;
const date = (value: string) => Temporal.PlainDate.from(value);
// Adding to the original date preserves a 29th/30th/31st anniversary after short months.
const anniversary = (start: Temporal.PlainDate, offset: number) => start.add({ months: offset });

/** A labelled payment estimate for setup when the contractual amount is
 * unavailable. APR remains an approximation; fees are separate. Annual rates
 * use fractions (0.12 = 12%). The caller must preserve estimated provenance. */
export function estimatedMonthlyPayment(
  principal: number,
  annualRate: number,
  rateConvention: Loan['rateConvention'],
  termMonths: number,
): number {
  const amount = nonnegative(principal, 'Loan principal');
  const annual = nonnegative(annualRate, 'Annual interest rate');
  if (!Number.isSafeInteger(termMonths) || termMonths <= 0)
    throw new Error('Loan term must be a positive whole number of months.');
  const rate =
    rateConvention === 'effective'
      ? annual.plus(1).pow(new Decimal(1).div(12)).minus(1)
      : annual.div(12);
  if (rate.isZero()) return amount.div(termMonths).toNumber();
  return amount
    .mul(rate)
    .div(new Decimal(1).minus(rate.plus(1).pow(-termMonths)))
    .toNumber();
}

/** Fixed monthly approximation. Annual rates are fractions: 0.12 means 12%.
 * Periods are [start, end); cash events on an anniversary belong to the new period.
 * Interest uses the opening balance, without daily proration. No display rounding
 * is fed back into the amortisation arithmetic.
 */
export function loanSchedule(loan: Loan): LoanSchedule {
  const original = nonnegative(loan.principal, 'Loan principal');
  const annualRate = nonnegative(loan.annualRate, 'Annual interest rate');
  const payment = nonnegative(loan.monthlyPayment, 'Monthly payment');
  nonnegative(loan.fees, 'Finance fees');
  const start = date(loan.startDate);
  const firstPayment = date(loan.firstPaymentDate);
  if (compare(firstPayment, start) < 0)
    throw new Error('First repayment cannot precede loan drawdown.');
  if (!Number.isInteger(loan.paymentDay) || loan.paymentDay < 1 || loan.paymentDay > 31)
    throw new Error('Payment day must be between 1 and 31.');
  const monthlyRate =
    loan.rateConvention === 'effective'
      ? annualRate.plus(1).pow(new Decimal(1).div(12)).minus(1)
      : annualRate.div(12);
  const overpayments = loan.overpayments
    .map((entry) => {
      const when = date(entry.date);
      if (compare(when, start) < 0) throw new Error('Overpayment cannot precede loan drawdown.');
      return { ...entry, when, value: nonnegative(entry.amount, 'Overpayment') };
    })
    .sort((a, b) => compare(a.when, b.when));
  const anchor = loan.anchor
    ? { when: date(loan.anchor.date), value: nonnegative(loan.anchor.balance, 'Statement balance') }
    : undefined;
  if (anchor && compare(anchor.when, start) < 0)
    throw new Error('Statement balance cannot precede loan drawdown.');
  const warnings = [
    'Interest is a monthly opening-balance approximation; mid-period payments and irregular first repayments are not prorated.',
  ];
  if (loan.rateConvention === 'apr-approximation')
    warnings.push('APR is used as an approximate nominal interest rate; fees remain separate.');
  if (anchor)
    warnings.push(
      `Statement balance anchored on ${loan.anchor!.date}: ${loan.anchor!.note || 'User-entered lender balance'}. Original payments are retained; the adjustment is not a cash payment.`,
    );
  const result: LoanSchedule = {
    periods: [],
    totalInterest: 0,
    payoffDate: original.isZero() ? loan.startDate : null,
    warnings,
  };
  let balance = original;
  let totalInterest = new Decimal(0);
  let nextPayment = firstPayment;
  let paymentIndex = 0;
  let overpaymentIndex = 0;
  let anchored = !anchor;

  for (let index = 0; index < 12000; index++) {
    if (balance.isZero() && anchored && overpaymentIndex === overpayments.length) break;
    const periodStart = anniversary(start, index);
    const periodEnd = anniversary(start, index + 1);
    const opening = balance;
    const interest = opening.mul(monthlyRate);
    totalInterest = totalInterest.plus(interest);
    balance = balance.plus(interest);
    const events: {
      when: Temporal.PlainDate;
      kind: 'regular' | 'overpayment' | 'anchor';
      requested: Decimal;
      overpaymentKind?: 'actual' | 'planned';
    }[] = [];
    while (compare(nextPayment, periodEnd) < 0) {
      if (compare(nextPayment, periodStart) >= 0)
        events.push({ when: nextPayment, kind: 'regular', requested: payment });
      paymentIndex++;
      const paymentMonth = firstPayment.with({ day: 1 }).add({ months: paymentIndex });
      nextPayment = paymentMonth.with({ day: Math.min(loan.paymentDay, paymentMonth.daysInMonth) });
    }
    while (
      overpaymentIndex < overpayments.length &&
      compare(overpayments[overpaymentIndex].when, periodEnd) < 0
    ) {
      const entry = overpayments[overpaymentIndex++];
      events.push({
        when: entry.when,
        kind: 'overpayment',
        requested: entry.value,
        overpaymentKind: entry.kind,
      });
    }
    if (anchor && !anchored && compare(anchor.when, periodEnd) < 0)
      events.push({ when: anchor.when, kind: 'anchor', requested: anchor.value });
    const priority = { regular: 0, overpayment: 1, anchor: 2 };
    events.sort((a, b) => compare(a.when, b.when) || priority[a.kind] - priority[b.kind]);
    const payments: LoanPayment[] = [];
    let adjustment: number | undefined;
    for (const event of events) {
      if (event.kind === 'anchor') {
        adjustment = event.requested.minus(balance).toNumber();
        balance = event.requested;
        anchored = true;
        result.payoffDate = balance.isZero() ? event.when.toString() : null;
        continue;
      }
      // A satisfied loan has no subsequent contractual payment. Keep excess
      // overpayment requests so the user can see that they cannot be applied.
      if (balance.isZero() && event.kind === 'regular') continue;
      const applied = Decimal.min(event.requested, balance);
      const excess = event.requested.minus(applied);
      balance = balance.minus(applied);
      payments.push({
        date: event.when.toString(),
        kind: event.kind,
        requested: event.requested.toNumber(),
        applied: applied.toNumber(),
        excess: excess.toNumber(),
        ...(event.overpaymentKind ? { overpaymentKind: event.overpaymentKind } : {}),
      });
      if (excess.gt(0)) {
        warnings.push(
          `${event.kind === 'overpayment' ? 'Overpayment' : 'Final payment'} on ${event.when}: £${excess.toFixed(2)} of the requested amount exceeds the debt and is not applied.`,
        );
      }
      if (balance.isZero() && result.payoffDate === null) result.payoffDate = event.when.toString();
    }
    result.periods.push({
      start: periodStart.toString(),
      end: periodEnd.toString(),
      opening: opening.toNumber(),
      interest: interest.toNumber(),
      closing: balance.toNumber(),
      payments,
      ...(adjustment === undefined ? {} : { adjustment }),
    });
    // Scheduled lump sums and statement anchors may rescue a temporarily
    // non-amortising loan. Once they have passed, reject an endless schedule.
    if (
      !balance.isZero() &&
      anchored &&
      overpaymentIndex === overpayments.length &&
      compare(nextPayment, periodEnd) >= 0 &&
      events.some((event) => event.kind === 'regular') &&
      balance.mul(monthlyRate).gte(payment)
    ) {
      throw new Error(
        'Loan does not amortise: monthly payment must exceed monthly interest after scheduled adjustments.',
      );
    }
    if (index === 11999)
      throw new Error(
        'Loan does not amortise within 1,000 years; check the monthly payment and interest rate.',
      );
  }
  // Keep the complete schedule independently of any chart horizon.
  result.totalInterest = totalInterest.toNumber();
  return result;
}

/** Estimated principal at the end of the supplied real calendar date.
 * Current-period interest is accrued at the anniversary, but repayments pay
 * that interest before principal. Unpaid interest capitalises at the next
 * anniversary in this monthly approximation. A statement anchor replaces the
 * balance after same-day cash events; its adjustment is never a cash payment.
 */
export function loanBalanceAt(schedule: LoanSchedule, loan: Loan, at: string): number {
  date(at);
  if (at < loan.startDate) return 0;
  let opening = new Decimal(loan.principal);
  for (const period of schedule.periods) {
    if (period.end <= at) {
      opening = new Decimal(period.closing);
      continue;
    }
    if (period.start > at) break;
    let debt = new Decimal(period.opening).plus(period.interest);
    let unpaidInterest = new Decimal(period.interest);
    const events: { when: string; payment?: LoanPayment; anchor?: number }[] = period.payments
      .filter((payment) => payment.date <= at)
      .map((payment) => ({ when: payment.date, payment }));
    if (
      loan.anchor &&
      loan.anchor.date >= period.start &&
      loan.anchor.date < period.end &&
      loan.anchor.date <= at
    ) {
      events.push({ when: loan.anchor.date, anchor: loan.anchor.balance });
    }
    events.sort(
      (a, b) =>
        a.when.localeCompare(b.when) ||
        (a.anchor === undefined ? 0 : 1) - (b.anchor === undefined ? 0 : 1),
    );
    for (const event of events) {
      if (event.anchor !== undefined) {
        debt = new Decimal(event.anchor);
        unpaidInterest = new Decimal(0);
        continue;
      }
      const payment = event.payment!;
      const applied = new Decimal(payment.applied);
      if (payment.kind === 'regular')
        unpaidInterest = Decimal.max(0, unpaidInterest.minus(applied));
      else {
        const principalPaid = Decimal.min(applied, Decimal.max(0, debt.minus(unpaidInterest)));
        unpaidInterest = Decimal.max(0, unpaidInterest.minus(applied.minus(principalPaid)));
      }
      debt = Decimal.max(0, debt.minus(applied));
    }
    return Decimal.max(0, debt.minus(unpaidInterest)).toNumber();
  }
  return opening.toNumber();
}

/** Principal is already included in the invoice price and is never added twice. */
export function investmentCost(
  installations: Installation[],
  schedules: LoanSchedule[],
  loans: Loan[],
): number {
  if (schedules.length !== loans.length)
    throw new Error('A complete schedule is required for every loan.');
  return installations
    .reduce((sum, entry) => sum.plus(nonnegative(entry.cost, 'Installation cost')), new Decimal(0))
    .plus(
      schedules.reduce(
        (sum, entry) => sum.plus(nonnegative(entry.totalInterest, 'Loan interest')),
        new Decimal(0),
      ),
    )
    .plus(
      loans.reduce(
        (sum, entry) => sum.plus(nonnegative(entry.fees, 'Finance fees')),
        new Decimal(0),
      ),
    )
    .toNumber();
}

/** Unknown savings invalidate the cumulative total from that point onward. */
export function findPayback(
  months: { month: string; savings: number | null }[],
  target: number,
): { month: string | null; recoveryLost: boolean } {
  const investment = nonnegative(target, 'Investment target');
  let cumulative = new Decimal(0);
  let month: string | null = null;
  let recoveryLost = false;
  for (const entry of months) {
    if (entry.savings === null) break;
    if (!Number.isFinite(entry.savings)) throw new Error('Savings must be finite or unknown.');
    cumulative = cumulative.plus(entry.savings);
    if (month === null && cumulative.gte(investment)) month = entry.month;
    else if (month !== null && cumulative.lt(investment)) recoveryLost = true;
  }
  return { month, recoveryLost };
}
