import type { Project, Projection } from '../domain/types';
import {
  Card,
  LineChart,
  Notice,
  Empty,
  compactCurrency,
  currency,
  number,
  monthLabel,
} from './components';
import type { Update } from './EntityEditors';
export function Dashboard({
  project: p,
  model: m,
  onChange,
  setPage,
}: {
  project: Project;
  model: Projection;
  onChange: Update;
  setPage: (page: string) => void;
}) {
  const first = p.installations.map((x) => x.date).sort()[0];
  const historical = m.months.filter((x) => x.historical && x.complete);
  const chart = m.months.filter(
    (_, i) => i % Math.max(1, Math.floor(m.months.length / 100)) === 0 || i === m.months.length - 1,
  );
  const hasForecast = m.nextYearSavings !== null;
  const points = chart.map((x) => ({
    label: x.month.endsWith('-01') ? x.month.slice(0, 4) : monthLabel(x.month),
    savings: x.savings === null ? null : x.cumulativeSavings,
    investment: m.investment,
    cash: x.cumulativeCash,
    debt: x.debt,
    phase: x.historical ? 'historical' : 'forecast',
  }));
  const costs = m.nextYearCosts;
  const incompleteHistory = m.months.some((x) => x.historical && !x.complete);
  const recent = m.months.filter((x) => x.savings !== null).slice(0, 6);
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">The whole-house view</div>
          <h1>Your energy, working together.</h1>
          <p>
            A combined view of solar, battery, electric driving and heating — from everyday savings
            to the bigger investment.
          </p>
        </div>
        <span className="pill">
          {p.forecast.oilScenario[0].toUpperCase() + p.forecast.oilScenario.slice(1)} oil-price case
        </span>
      </div>
      {m.missing.length > 0 && (
        <Notice>
          <strong>
            Your estimate needs {m.missing.length} more input{m.missing.length === 1 ? '' : 's'}.
          </strong>{' '}
          Unknown household values have been left blank.{' '}
          <button className="icon-button" onClick={() => setPage('inputs')}>
            Continue setup →
          </button>
          <details className="details">
            <summary>Show what is missing</summary>
            <ul>
              {m.missing.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
        </Notice>
      )}
      <div className="metrics">
        <section className="card metric">
          <div className="metric-title">
            Historical energy savings <span>↗</span>
          </div>
          <div className="metric-value accent">{compactCurrency(m.historicalSavings)}</div>
          <div className="metric-description">
            Estimated alternative vs actual electricity
            <br />
            {historical.length
              ? `${monthLabel(historical[0].month)}–${monthLabel(historical.at(-1)!.month)} · ${historical.length} complete months`
              : 'Complete readings needed'}
          </div>
        </section>
        <section className="card metric">
          <div className="metric-title">
            Next-year savings <span>◷</span>
          </div>
          <div className="metric-value">{compactCurrency(m.nextYearSavings)}</div>
          <div className="metric-description">
            Estimated · {p.forecast.oilScenario} oil prices
            <br />
            {hasForecast && p.forecast.start
              ? `12 months from ${p.forecast.start}`
              : 'Reference profile & assumptions needed'}
          </div>
        </section>
        <section className="card metric">
          <div className="metric-title">
            Combined investment payback <span>◎</span>
          </div>
          <div className="metric-value">
            {m.missing.length
              ? 'Needs inputs'
              : incompleteHistory
                ? 'Incomplete history'
                : m.paybackMonth
                  ? monthLabel(m.paybackMonth)
                  : 'Not reached'}
          </div>
          <div className="metric-description">
            Including full loan interest and fees
            <br />
            {m.investment !== null
              ? `${compactCurrency(m.investment)} commitment · ${p.forecast.horizonYears}-year horizon`
              : 'Invoice and finance inputs needed'}
          </div>
        </section>
        <section className="card metric">
          <div className="metric-title">
            Outstanding loan debt <span>↘</span>
          </div>
          <div className="metric-value">
            {p.loans.length ? compactCurrency(m.outstandingDebt) : 'No loans entered'}
          </div>
          <div className="metric-description">
            Separate from investment payback
            <br />
            Monthly schedule approximation
          </div>
        </section>
      </div>
      <div className="grid-main">
        <Card
          title="Savings & investment"
          subtitle="Cumulative operating savings compared with the full committed investment."
          action={
            <div className="scenario" aria-label="Oil price scenario">
              {(['low', 'central', 'high'] as const).map((s) => (
                <button
                  key={s}
                  className={s === p.forecast.oilScenario ? 'active' : ''}
                  onClick={() => onChange({ ...p, forecast: { ...p.forecast, oilScenario: s } })}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          }
        >
          <LineChart
            points={points}
            series={[
              { key: 'savings', label: 'Cumulative operating savings', color: '#247c72' },
              {
                key: 'investment',
                label: 'Investment including finance',
                color: '#bd8731',
                dash: true,
              },
            ]}
            label="Cumulative energy savings and full investment over the projection horizon"
          />
          <p className="small muted" style={{ marginTop: 18, marginBottom: 0 }}>
            {m.paybackMonth
              ? `First recovery: ${monthLabel(m.paybackMonth)}. `
              : `Payback ${m.missing.length || incompleteHistory ? 'cannot be established until inputs and historical coverage are complete' : `is not reached within ${p.forecast.horizonYears} years`}. `}
            Cumulative savings include complete months only; missing history prevents a reliable
            payback date. The dashed boundary separates historical estimates from forecast.
            Full-loan interest is included from the outset; principal is not counted twice.
            {m.recoveryLost ? ' Savings later fall below the recovery target.' : ''}
          </p>
        </Card>
        <Card
          title="Next-year cost picture"
          subtitle="The selected reference profile repriced at your future assumptions."
        >
          {hasForecast ? (
            <>
              <div className="row">
                <div>
                  Alternative grid electricity<small>Ordinary household baseline</small>
                </div>
                <strong>{currency(costs?.baselineElectricity)}</strong>
              </div>
              <div className="row">
                <div>
                  Avoided oil
                  <small>
                    {p.forecast.oilScenario} case ·{' '}
                    {number(
                      (p.oil.quotePence ?? 0) * p.forecast.oilFactors[p.forecast.oilScenario],
                      1,
                    )}
                    p/litre
                  </small>
                </div>
                <strong>{currency(costs?.avoidedOil)}</strong>
              </div>
              <div className="row">
                <div>
                  Avoided petrol<small>Equivalent mileage, UK MPG</small>
                </div>
                <strong>{currency(costs?.avoidedPetrol)}</strong>
              </div>
              <div className="row">
                <div>
                  Upgraded net electricity<small>Reference electricity + estimated heating</small>
                </div>
                <strong>{currency(costs?.netElectricity)}</strong>
              </div>
              <div className="row">
                <div>
                  <strong>Estimated energy savings</strong>
                </div>
                <strong className="positive">{currency(m.nextYearSavings)}</strong>
              </div>
            </>
          ) : (
            <Empty title="Build your cost picture">
              Complete your reference year and future prices in Inputs.
              <br />
              <button
                className="button secondary"
                style={{ marginTop: 16 }}
                onClick={() => setPage('inputs')}
              >
                Set up forecast
              </button>
            </Empty>
          )}
          <p className="small muted" style={{ marginTop: 15, marginBottom: 0 }}>
            Low and high cases change future oil prices only. They are sensitivities, not confidence
            intervals.
          </p>
        </Card>
      </div>
      <div className="grid-two">
        <Card
          title="Household cash flow"
          subtitle="Savings less cash contributions, repayments and overpayments; plus loan drawdowns."
        >
          <LineChart
            points={points}
            series={[
              { key: 'cash', label: 'Cumulative cash benefit', color: '#247c72' },
              { key: 'debt', label: 'Outstanding loan balance', color: '#8c9d86', dash: true },
            ]}
            label="Cumulative household cash benefit and outstanding debt"
          />
          <p className="small muted" style={{ marginTop: 17, marginBottom: 0 }}>
            Cumulative savings include known complete months only; the dashed boundary marks the
            forecast. A positive cash position is separate from investment payback and being
            debt-free. Incomplete energy months exclude savings but retain known finance movements.
          </p>
        </Card>
        <Card
          title="Individual loans"
          subtitle="Separate repayment schedules, combined technology benefits."
          action={
            <button className="icon-button" onClick={() => setPage('loans')}>
              View loans →
            </button>
          }
        >
          {m.loans.length ? (
            m.loans.map((x) => (
              <div key={x.loan.id} style={{ marginBottom: 14 }}>
                <div className="row">
                  <div>
                    {x.loan.name}
                    <small>Estimated payoff {x.schedule.payoffDate ?? 'not reached'}</small>
                  </div>
                  <strong>{currency(x.remainingPrincipal)}</strong>
                </div>
                <div className="progress">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(2, (1 - x.remainingPrincipal / Math.max(1, x.loan.principal)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  Original {currency(x.loan.principal)} · full interest{' '}
                  {currency(x.schedule.totalInterest)} · future interest{' '}
                  {currency(x.remainingInterest)}
                </p>
              </div>
            ))
          ) : (
            <Empty title="Finance remains unknown">
              Add each fixed-rate loan with its actual dates, principal and repayments.
            </Empty>
          )}
          <p className="small muted">
            Loans are approximated monthly; statement balances can anchor the schedule.
          </p>
        </Card>
      </div>
      <Card
        title="Where your estimate comes from"
        subtitle="Measured inputs, explicit estimates, and the limits of this model."
      >
        <div className="assumptions">
          <div>
            <strong>Historical electricity</strong>
            <br />
            {number(p.cache.intervals.length)} cached intervals. Costs are reconstructed from rates
            and bill corrections. Intelligent Go extra cheap slots remain unsupported.
          </div>
          <div>
            <strong>Alternative household</strong>
            <br />
            Baseline grid use, seasonal oil and equivalent petrol driving are estimated. Upgrade
            dates control when fuel savings start.{first && ` First upgrade: ${first}.`}
          </div>
          <div>
            <strong>Future energy</strong>
            <br />
            Your reference kWh profile is repriced. Estimated heating is added only to future
            periods; exports and driving conditions stay unchanged.
          </div>
        </div>
        <details className="details">
          <summary>Read all assumptions & warnings ({m.warnings.length})</summary>
          <ul>
            {Array.from(new Set(m.warnings)).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      </Card>
      {recent.length > 0 && (
        <Card
          title="Monthly comparison"
          subtitle="Incomplete periods are excluded from reported savings; all components use matching dates."
          className="monthly-preview"
        >
          <MonthlyTable months={recent} />
          <button
            className="icon-button"
            style={{ marginTop: 15 }}
            onClick={() => setPage('energy')}
          >
            Explore all energy months →
          </button>
        </Card>
      )}
    </>
  );
}
export function MonthlyTable({ months: rows }: { months: Projection['months'] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Source</th>
            <th className="num">Alternative grid</th>
            <th className="num">Avoided oil</th>
            <th className="num">Avoided petrol</th>
            <th className="num">Net electricity</th>
            <th className="num">Savings</th>
            <th className="num">Cash flow</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.month}>
              <td>{monthLabel(x.month)}</td>
              <td>
                {x.historical ? 'Historical estimate' : 'Forecast'}
                {!x.complete && <div className="negative small">Incomplete · excluded</div>}
                <details className="details">
                  <summary>Details</summary>
                  <ul>
                    {Array.from(new Set(x.notes)).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                    {x.heatingKWh > 0 && (
                      <li>
                        {number(x.heatingKWh, 2)} kWh estimated heating; {currency(x.heatingCost)}{' '}
                        heating grid cost.
                      </li>
                    )}
                  </ul>
                </details>
              </td>
              <td className="num">{currency(x.baselineElectricity)}</td>
              <td className="num">{currency(x.avoidedOil)}</td>
              <td className="num">{currency(x.avoidedPetrol)}</td>
              <td className="num">{currency(x.actualElectricity)}</td>
              <td
                className={'num ' + (x.savings !== null && x.savings < 0 ? 'negative' : 'positive')}
              >
                {currency(x.savings)}
              </td>
              <td className="num">{currency(x.cashFlow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
