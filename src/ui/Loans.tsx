import { useState } from 'react';
import type { Project, Projection, Loan } from '../domain/types';
import { Card, Notice, Empty, currency, number, monthLabel, LineChart } from './components';
import { LoanEditor, OverpaymentEditor, type Update } from './EntityEditors';
export function Loans({
  project: p,
  model: m,
  onChange,
}: {
  project: Project;
  model: Projection;
  onChange: Update;
}) {
  const [editor, setEditor] = useState<Loan | true | null>(null),
    [overpayment, setOverpayment] = useState<Loan | null>(null);
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">Financing & household cash</div>
          <h1>See the debt separately.</h1>
          <p>
            Track each fixed-rate loan, actual and planned overpayments, and the monthly
            approximation behind your investment result.
          </p>
        </div>
        <button className="button" onClick={() => setEditor(true)}>
          Add loan
        </button>
      </div>
      <Notice>
        Investment payback includes invoice prices, full modelled loan interest and fees. Borrowed
        principal is counted once. A planned overpayment changes interest, payoff and cash flow; it
        does not change energy savings.
      </Notice>
      <div className="metrics">
        <div className="card metric">
          <div className="metric-title">Original borrowing</div>
          <div className="metric-value">
            {p.loans.length ? currency(p.loans.reduce((s, x) => s + x.principal, 0)) : 'Unknown'}
          </div>
          <div className="metric-description">Actual entered drawdowns</div>
        </div>
        <div className="card metric">
          <div className="metric-title">Outstanding debt</div>
          <div className="metric-value">
            {p.loans.length ? currency(m.outstandingDebt) : 'Unknown'}
          </div>
          <div className="metric-description">At the current calendar date</div>
        </div>
        <div className="card metric">
          <div className="metric-title">Full-loan interest</div>
          <div className="metric-value">
            {p.loans.length
              ? currency(m.loans.reduce((s, x) => s + x.schedule.totalInterest, 0))
              : 'Unknown'}
          </div>
          <div className="metric-description">Actual/modelled entire schedules</div>
        </div>
        <div className="card metric">
          <div className="metric-title">Future interest</div>
          <div className="metric-value">
            {p.loans.length
              ? currency(m.loans.reduce((s, x) => s + x.remainingInterest, 0))
              : 'Unknown'}
          </div>
          <div className="metric-description">Reflects planned overpayments</div>
        </div>
      </div>
      <div className="stack">
        {!p.loans.length && (
          <Card>
            <Empty title="Your loan figures are still blank">
              Enter the solar/battery/charger loan and heat-pump loan separately. Approximate
              comments such as “half paid off” are not used as actual figures.
            </Empty>
          </Card>
        )}
        {p.loans.map((loan) => {
          const result = m.loans.find((x) => x.loan.id === loan.id);
          return (
            <Card
              key={loan.id}
              title={loan.name || 'Unnamed loan'}
              subtitle={`${number(loan.annualRate * 100, 3)}% ${loan.rateConvention} · ${currency(loan.monthlyPayment)} monthly · start ${loan.startDate}`}
              action={
                <div className="actions">
                  <button className="button secondary" onClick={() => setEditor(loan)}>
                    Edit loan
                  </button>
                  <button className="button secondary" onClick={() => setOverpayment(loan)}>
                    Add overpayment
                  </button>
                </div>
              }
            >
              {result ? (
                <>
                  {loan.paymentProvenance === 'estimated' && (
                    <Notice>
                      Monthly payment is a calculated estimate, not a confirmed contractual
                      repayment. Confirm it with your lender. Original term:{' '}
                      {loan.originalTermMonths} months.
                    </Notice>
                  )}
                  <div className="loan-stats">
                    <div>
                      <span>Original principal</span>
                      <strong>{currency(loan.principal)}</strong>
                    </div>
                    <div>
                      <span>Remaining principal</span>
                      <strong>{currency(result.remainingPrincipal)}</strong>
                    </div>
                    <div>
                      <span>Estimated future interest</span>
                      <strong>{currency(result.remainingInterest)}</strong>
                    </div>
                    <div>
                      <span>Estimated payoff</span>
                      <strong>{result.schedule.payoffDate ?? 'Not reached'}</strong>
                    </div>
                    <div>
                      <span>Total interest</span>
                      <strong>{currency(result.schedule.totalInterest)}</strong>
                    </div>
                    <div>
                      <span>Interest saved vs no planned payments</span>
                      <strong className="positive">
                        {currency(result.withoutPlannedInterest - result.schedule.totalInterest)}
                      </strong>
                    </div>
                  </div>
                  <p className="small muted">
                    Without planned overpayments: payoff{' '}
                    {result.withoutPlannedPayoff ?? 'not reached'}, interest{' '}
                    {currency(result.withoutPlannedInterest)}. Regular repayments remain{' '}
                    {currency(loan.monthlyPayment)}.
                  </p>
                  {loan.anchor && (
                    <Notice>
                      Statement anchor: {currency(loan.anchor.balance)} on {loan.anchor.date}.
                      Provenance: {loan.anchor.note || 'No note entered'}.
                    </Notice>
                  )}
                  {result.schedule.warnings.map((x, i) => (
                    <p className="small negative" key={i}>
                      {x}
                    </p>
                  ))}
                  <div className="divider" />
                  <h3>Actual & planned overpayments</h3>
                  {loan.overpayments.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Cash date</th>
                            <th>Status</th>
                            <th className="num">Requested</th>
                            <th className="num">Applied</th>
                            <th className="num">Excess</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loan.overpayments.map((x) => {
                            const payments = result.schedule.periods
                              .flatMap((y) => y.payments)
                              .filter(
                                (y) =>
                                  y.kind === 'overpayment' &&
                                  y.date === x.date &&
                                  y.requested === x.amount,
                              );
                            return (
                              <tr key={x.id}>
                                <td>{x.date}</td>
                                <td>{x.kind}</td>
                                <td className="num">{currency(x.amount)}</td>
                                <td className="num">{currency(payments[0]?.applied ?? 0)}</td>
                                <td className="num">{currency(payments[0]?.excess ?? x.amount)}</td>
                                <td>
                                  <button
                                    className="button secondary tiny"
                                    onClick={() =>
                                      onChange({
                                        ...p,
                                        loans: p.loans.map((l) =>
                                          l.id === loan.id
                                            ? {
                                                ...l,
                                                overpayments: l.overpayments.filter(
                                                  (y) => y.id !== x.id,
                                                ),
                                              }
                                            : l,
                                        ),
                                      })
                                    }
                                  >
                                    Remove overpayment
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="small muted">
                      No overpayments entered. Past payments must be entered with their actual date
                      and amount.
                    </p>
                  )}
                  <details className="details">
                    <summary>
                      View full monthly amortisation schedule ({result.schedule.periods.length}{' '}
                      periods)
                    </summary>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Anniversary period</th>
                            <th className="num">Opening principal</th>
                            <th className="num">Interest</th>
                            <th className="num">Applied payments</th>
                            <th className="num">Closing principal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.schedule.periods.map((x) => (
                            <tr key={x.start}>
                              <td>
                                {x.start} → {x.end}
                              </td>
                              <td className="num">{currency(x.opening)}</td>
                              <td className="num">{currency(x.interest)}</td>
                              <td className="num">
                                {currency(x.payments.reduce((s, y) => s + y.applied, 0))}
                              </td>
                              <td className="num">
                                {currency(x.closing)}
                                {x.adjustment !== undefined && (
                                  <div className="small muted">
                                    Anchor adjustment {currency(x.adjustment)}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : (
                <Notice error>
                  This loan cannot be modelled. Check that repayments cover monthly interest and
                  that all dates and amounts are valid.
                </Notice>
              )}
              <div className="divider" />
              <button
                className="button danger tiny"
                onClick={() => onChange({ ...p, loans: p.loans.filter((x) => x.id !== loan.id) })}
              >
                Remove loan
              </button>
            </Card>
          );
        })}
        <Card
          title="Cash benefit & remaining debt"
          subtitle="Keep the energy-investment target distinct from your bank-account cash position."
        >
          <LineChart
            points={m.months
              .filter((_, i) => i % 3 === 0)
              .map((x) => ({
                label: x.month.endsWith('-01') ? x.month.slice(0, 4) : monthLabel(x.month),
                cash: x.cumulativeCash,
                debt: x.debt,
                phase: x.historical ? 'historical' : 'forecast',
              }))}
            series={[
              { key: 'cash', label: 'Cumulative cash benefit', color: '#247c72' },
              { key: 'debt', label: 'Remaining loan principal', color: '#bd8731' },
            ]}
            label="Household cash benefit alongside remaining debt"
          />
        </Card>
      </div>
      {editor && (
        <LoanEditor
          project={p}
          record={editor === true ? undefined : editor}
          onSave={onChange}
          onClose={() => setEditor(null)}
        />
      )}{' '}
      {overpayment && (
        <OverpaymentEditor
          project={p}
          loan={overpayment}
          onSave={onChange}
          onClose={() => setOverpayment(null)}
        />
      )}
    </>
  );
}
