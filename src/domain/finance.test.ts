import { describe, expect, it } from 'vitest';
import {
  estimatedMonthlyPayment,
  findPayback,
  investmentCost,
  loanBalanceAt,
  loanSchedule,
} from './finance';
import type { Loan } from './types';

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'loan',
  name: 'Example',
  installationIds: ['solar'],
  startDate: '2025-01-01',
  principal: 1200,
  annualRate: 0,
  rateConvention: 'nominal',
  monthlyPayment: 100,
  firstPaymentDate: '2025-01-20',
  paymentDay: 20,
  fees: 0,
  overpayments: [],
  ...overrides,
});

describe('loan amortisation', () => {
  it('A13: repays a zero-interest loan in 12 payments', () => {
    const schedule = loanSchedule(loan());
    expect(schedule.periods.flatMap((period) => period.payments)).toHaveLength(12);
    expect(schedule.totalInterest).toBe(0);
    expect(schedule.payoffDate).toBe('2025-12-20');
    expect(schedule.periods.at(-1)?.closing).toBe(0);
  });

  it('A14: charges opening-balance interest and leaves regular payments unchanged', () => {
    const schedule = loanSchedule(
      loan({
        principal: 1000,
        annualRate: 0.12,
        overpayments: [{ id: 'extra', date: '2025-01-20', amount: 500, kind: 'actual' }],
      }),
    );
    expect(schedule.periods[0].interest).toBe(10);
    expect(schedule.periods[0].closing).toBe(410);
    expect(schedule.periods[1].interest).toBe(4.1);
    expect(schedule.periods[0].payments.map((payment) => payment.kind)).toEqual([
      'regular',
      'overpayment',
    ]);
    expect(schedule.periods[1].payments[0].requested).toBe(100);
  });

  it('A15: caps final requested amounts and retains excess without negative debt', () => {
    const schedule = loanSchedule(
      loan({
        principal: 150,
        annualRate: 0.12,
        overpayments: [{ id: 'extra', date: '2025-01-20', amount: 100, kind: 'planned' }],
      }),
    );
    const payment = schedule.periods[0].payments[1];
    expect(payment).toMatchObject({
      requested: 100,
      applied: 51.5,
      excess: 48.5,
      overpaymentKind: 'planned',
    });
    expect(schedule.payoffDate).toBe('2025-01-20');
    expect(schedule.totalInterest).toBe(1.5);
    expect(schedule.periods.at(-1)?.closing).toBe(0);
    expect(schedule.warnings.some((warning) => warning.includes('48.50'))).toBe(true);
  });

  it('retains an overpayment request dated after payoff with zero applied and interest', () => {
    const schedule = loanSchedule(
      loan({
        principal: 50,
        overpayments: [{ id: 'later', date: '2025-03-15', amount: 300, kind: 'planned' }],
      }),
    );
    expect(schedule.payoffDate).toBe('2025-01-20');
    expect(schedule.periods.at(-1)?.payments[0]).toMatchObject({
      date: '2025-03-15',
      requested: 300,
      applied: 0,
      excess: 300,
    });
    expect(schedule.totalInterest).toBe(0);
  });

  it('uses original start anniversaries and preserves irregular payment dates', () => {
    const schedule = loanSchedule(
      loan({
        startDate: '2025-01-31',
        firstPaymentDate: '2025-02-15',
        paymentDay: 31,
        principal: 1000,
        annualRate: 0.12,
      }),
    );
    expect(schedule.periods.slice(0, 3).map((period) => [period.start, period.end])).toEqual([
      ['2025-01-31', '2025-02-28'],
      ['2025-02-28', '2025-03-31'],
      ['2025-03-31', '2025-04-30'],
    ]);
    expect(schedule.periods[0].payments[0].date).toBe('2025-02-15');
    expect(schedule.periods[1].payments).toHaveLength(0);
    expect(schedule.periods[2].payments[0].date).toBe('2025-03-31');
    expect(schedule.periods[2].interest).toBeCloseTo(9.191);
  });

  it('uses effective annual rates and labels APR approximations', () => {
    const effective = loanSchedule(
      loan({ principal: 1000, annualRate: 1.01 ** 12 - 1, rateConvention: 'effective' }),
    );
    expect(effective.periods[0].interest).toBeCloseTo(10, 10);
    const apr = loanSchedule(loan({ annualRate: 0.12, rateConvention: 'apr-approximation' }));
    expect(apr.warnings.some((warning) => warning.includes('APR'))).toBe(true);
  });

  it('preserves historical payments and adds an explicit noncash statement adjustment', () => {
    const schedule = loanSchedule(
      loan({
        principal: 1000,
        anchor: { date: '2025-02-21', balance: 700, note: 'Lender statement' },
      }),
    );
    expect(schedule.periods[0].payments[0].applied).toBe(100);
    expect(schedule.periods[1].payments[0].applied).toBe(100);
    expect(schedule.periods[1].adjustment).toBe(-100);
    expect(schedule.periods[1].closing).toBe(700);
    expect(schedule.warnings.some((warning) => warning.includes('Lender statement'))).toBe(true);
    expect(
      schedule.periods
        .flatMap((period) => period.payments)
        .reduce((sum, payment) => sum + payment.applied, 0),
    ).toBe(900);
  });

  it('A18: planned overpayment reduces full-term interest without changing historical requests', () => {
    const original = loan({ principal: 10000, annualRate: 0.06, monthlyPayment: 120 });
    const base = loanSchedule(original);
    const changed = loanSchedule({
      ...original,
      overpayments: [{ id: 'future', date: '2026-06-10', amount: 2000, kind: 'planned' }],
    });
    expect(changed.totalInterest).toBeLessThan(base.totalInterest);
    expect(changed.payoffDate! < base.payoffDate!).toBe(true);
    expect(
      changed.periods
        .flatMap((period) => period.payments)
        .find((payment) => payment.overpaymentKind === 'planned')?.applied,
    ).toBe(2000);
    expect(original.overpayments).toEqual([]);
    // A chart horizon of one year must not truncate the finance estimate.
    expect(base.periods.length).toBeGreaterThan(12);
    expect(base.totalInterest).toBeGreaterThan(
      base.periods.slice(0, 12).reduce((sum, period) => sum + period.interest, 0),
    );
  });

  it('rejects negative inputs and non-amortising schedules, permitting a scheduled rescue', () => {
    expect(() => loanSchedule(loan({ principal: -1 }))).toThrow(/nonnegative/);
    expect(() =>
      loanSchedule(loan({ principal: 1000, annualRate: 0.12, monthlyPayment: 10 })),
    ).toThrow(/does not amortise/);
    expect(() => loanSchedule(loan({ monthlyPayment: 0 }))).toThrow(/does not amortise/);
    expect(() =>
      loanSchedule(
        loan({
          principal: 1000,
          annualRate: 0.12,
          monthlyPayment: 10,
          overpayments: [{ id: 'rescue', date: '2025-02-20', amount: 500, kind: 'planned' }],
        }),
      ),
    ).not.toThrow();
  });
});

describe('investment and monthly payback', () => {
  it('A16: counts invoice prices, complete interest and separate fees exactly once', () => {
    const installation = {
      id: 'solar',
      type: 'solar-battery' as const,
      date: '2025-01-01',
      cost: 10000,
    };
    const schedule = { periods: [], totalInterest: 1000, payoffDate: '2035-01-20', warnings: [] };
    expect(investmentCost([installation], [schedule], [loan({ principal: 8000 })])).toBe(11000);
    expect(investmentCost([installation], [schedule], [loan({ principal: 8000, fees: 50 })])).toBe(
      11050,
    );
  });

  it('A17: recovers at month 110, with zero and negative savings having no payback', () => {
    const savings = Array.from({ length: 120 }, (_, i) => ({
      month: `month-${i + 1}`,
      savings: 100,
    }));
    expect(findPayback(savings, 11000)).toEqual({ month: 'month-110', recoveryLost: false });
    expect(
      findPayback(
        savings.map((month) => ({ ...month, savings: 0 })),
        11000,
      ).month,
    ).toBeNull();
    expect(
      findPayback(
        savings.map((month) => ({ ...month, savings: -10 })),
        11000,
      ).month,
    ).toBeNull();
  });

  it('flags subsequent loss of recovery and avoids claiming payback across missing months', () => {
    expect(
      findPayback(
        [
          { month: '2025-01', savings: 100 },
          { month: '2025-02', savings: -20 },
          { month: '2025-03', savings: 30 },
        ],
        100,
      ),
    ).toEqual({ month: '2025-01', recoveryLost: true });
    expect(
      findPayback(
        [
          { month: '2025-01', savings: null },
          { month: '2025-02', savings: 500 },
        ],
        100,
      ),
    ).toEqual({ month: null, recoveryLost: false });
  });
});

describe('real-date principal balance', () => {
  it('applies repayments on their cash date, paying interest before principal', () => {
    const input = loan({
      principal: 1000,
      annualRate: 0.12,
      startDate: '2025-01-10',
      firstPaymentDate: '2025-01-15',
      paymentDay: 15,
    });
    const schedule = loanSchedule(input);
    expect(loanBalanceAt(schedule, input, '2025-01-09')).toBe(0);
    expect(loanBalanceAt(schedule, input, '2025-01-14')).toBe(1000);
    expect(loanBalanceAt(schedule, input, '2025-01-15')).toBe(910);
    expect(loanBalanceAt(schedule, input, '2025-01-31')).toBe(910);
    expect(loanBalanceAt(schedule, input, '2025-02-15')).toBe(819.1);
  });

  it('overpayments reduce principal before later regular interest repayment', () => {
    const input = loan({
      principal: 1000,
      annualRate: 0.12,
      overpayments: [{ id: 'earlier', date: '2025-01-10', amount: 500, kind: 'actual' }],
    });
    const schedule = loanSchedule(input);
    expect(loanBalanceAt(schedule, input, '2025-01-10')).toBe(500);
    expect(loanBalanceAt(schedule, input, '2025-01-20')).toBe(410);
    expect(loanBalanceAt(schedule, input, '2030-01-01')).toBe(0);
  });

  it('uses the statement anchor on its date, following same-day repayments', () => {
    const input = loan({
      principal: 1000,
      annualRate: 0.12,
      anchor: { date: '2025-02-20', balance: 750, note: 'Statement' },
    });
    const schedule = loanSchedule(input);
    expect(loanBalanceAt(schedule, input, '2025-02-19')).toBe(910);
    expect(loanBalanceAt(schedule, input, '2025-02-20')).toBe(750);
    expect(loanBalanceAt(schedule, input, '2025-03-20')).toBe(657.5);
  });
});

describe('optional term-based payment estimate', () => {
  it('handles zero interest directly and rejects unusable terms and amounts', () => {
    expect(estimatedMonthlyPayment(1200, 0, 'nominal', 12)).toBe(100);
    expect(() => estimatedMonthlyPayment(1200, 0, 'nominal', 0)).toThrow(/positive whole/);
    expect(() => estimatedMonthlyPayment(1200, 0, 'nominal', 12.5)).toThrow(/positive whole/);
    expect(() => estimatedMonthlyPayment(-1, 0, 'nominal', 12)).toThrow(/nonnegative/);
  });

  it('estimates a contractual monthly amount that amortises nominal/effective/APR-approximation loans', () => {
    const nominal = estimatedMonthlyPayment(1000, 0.12, 'nominal', 12);
    const effective = estimatedMonthlyPayment(1000, 1.01 ** 12 - 1, 'effective', 12);
    expect(nominal).toBeCloseTo(88.8487886783, 9);
    expect(effective).toBeCloseTo(nominal, 9);
    expect(estimatedMonthlyPayment(1000, 0.12, 'apr-approximation', 12)).toBe(nominal);
    // Round the proposed display payment upward by a penny so the last
    // contractual repayment covers any display-rounding residue.
    const schedule = loanSchedule(
      loan({ principal: 1000, annualRate: 0.12, monthlyPayment: Math.ceil(nominal * 100) / 100 }),
    );
    expect(schedule.periods.flatMap((period) => period.payments)).toHaveLength(12);
    expect(schedule.periods.at(-1)?.closing).toBe(0);
  });
});
