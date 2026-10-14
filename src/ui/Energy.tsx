import { useState } from 'react';
import type { Project, Projection } from '../domain/types';
import { electricityCost } from '../domain/energy';
import { Card, Notice, Empty, Select, currency, number, monthLabel } from './components';
import { MonthlyTable } from './Dashboard';
import { BillEditor, type Update } from './EntityEditors';
export function Energy({
  project: p,
  model: m,
  onChange,
}: {
  project: Project;
  model: Projection;
  onChange: Update;
}) {
  const [bill, setBill] = useState(false),
    [filter, setFilter] = useState('all'),
    [limit, setLimit] = useState(24);
  const rows = m.months.filter(
    (x) => filter === 'all' || (filter === 'historic' ? x.historical : !x.historical),
  );
  const covered = m.months.filter((x) => x.historical && x.complete);
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">Coverage, costs & reconciliation</div>
          <h1>Every month, explained.</h1>
          <p>
            Inspect historical electricity against the estimated alternative, and distinguish future
            heating from measured household costs.
          </p>
        </div>
        <span className="pill">{covered.length} complete historic months</span>
      </div>
      <Notice>
        Historical savings are a counterfactual estimate. Missing readings or rates are visible
        gaps, never zero. Intelligent Go reconstructed charges remain provisional until reconciled
        to bills.
      </Notice>
      <div className="grid-two">
        <Card
          title="Electricity source status"
          subtitle="Import and export must cover the same included dates."
        >
          <div className="row">
            <span>Cached interval records</span>
            <strong>{number(p.cache.intervals.length)}</strong>
          </div>
          <div className="row">
            <span>Rate records</span>
            <strong>{number(p.cache.rates.length)}</strong>
          </div>
          <div className="row">
            <span>Last retrieval</span>
            <strong>
              {p.cache.retrievedAt
                ? new Date(p.cache.retrievedAt).toLocaleString('en-GB')
                : 'Not refreshed'}
            </strong>
          </div>
          <div className="row">
            <span>Refresh completeness</span>
            <strong>{p.cache.refreshStatus}</strong>
          </div>
          {p.cache.error && <p className="small negative">{p.cache.error}</p>}
          <p className="small muted">
            Fully covered months are included in savings; recent partial periods remain excluded.
            Forecast begins on {p.forecast.start ?? 'an unset date'}.
          </p>
        </Card>
        <Card
          title="Heating assumptions"
          subtitle="Incremental electricity applies to future periods only."
        >
          <div className="row">
            <span>Annual electrical design input</span>
            <strong>{number(p.heating.annualKWh)} kWh</strong>
          </div>
          <div className="row">
            <span>Effective forecast heating rate</span>
            <strong>{number(m.effectiveHeatingPence, 2)} p/kWh</strong>
          </div>
          <div className="row">
            <span>Standard cheap hours (local)</span>
            <strong>
              {p.forecast.cheapStartHour} → {p.forecast.cheapEndHour}
            </strong>
          </div>
          <p className="small muted">
            DST days use actual elapsed time. Reference exports remain unchanged. Household measured
            bills already include EV and heat-pump electricity; neither is charged twice.
          </p>
        </Card>
      </div>
      <Card
        title="Bill reconciliation"
        subtitle="Energy charge corrections replace the reconstructed component for an exact period."
        action={
          <button className="button secondary" onClick={() => setBill(true)}>
            Reconcile bill
          </button>
        }
      >
        {p.overrides.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period (end exclusive)</th>
                  <th>Component</th>
                  <th className="num">Bill override</th>
                  <th className="num">Reconstructed</th>
                  <th className="num">Difference</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {p.overrides.map((x) => {
                  const reconstructed = electricityCost(
                    p.cache.intervals,
                    p.cache.rates,
                    x.start,
                    x.end,
                    [],
                  );
                  const raw =
                    x.component === 'import'
                      ? reconstructed.importCost === null || reconstructed.standingCost === null
                        ? null
                        : reconstructed.importCost + reconstructed.standingCost
                      : reconstructed.exportCredit;
                  return (
                    <tr key={x.id}>
                      <td>
                        {x.start} → {x.end}
                        <div className="small muted">{x.note}</div>
                      </td>
                      <td>{x.component}</td>
                      <td className="num">{currency(x.amount)}</td>
                      <td className="num">{currency(raw)}</td>
                      <td className="num">{currency(raw === null ? null : x.amount - raw)}</td>
                      <td>
                        <button
                          className="button secondary tiny"
                          onClick={() =>
                            onChange({ ...p, overrides: p.overrides.filter((y) => y.id !== x.id) })
                          }
                        >
                          Remove correction
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No bill corrections entered">
            Use import energy charges including standing charges, and export credits separately.
            Direct debits and account balances are not energy costs.
          </Empty>
        )}
      </Card>
      <div style={{ height: 22 }} />
      <Card
        title="Monthly energy & cash-flow detail"
        subtitle="The latest fully covered dates underpin historical totals; gaps are excluded."
        action={
          <Select
            label="Months to show"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setLimit(24);
            }}
            options={[
              { value: 'all', label: 'All months' },
              { value: 'historic', label: 'Historical only' },
              { value: 'forecast', label: 'Forecast only' },
            ]}
          />
        }
      >
        {rows.length ? (
          <>
            <MonthlyTable months={rows.slice(0, limit)} />
            {rows.length > limit && (
              <button
                className="button secondary"
                style={{ marginTop: 16 }}
                onClick={() => setLimit(limit + 24)}
              >
                Show 24 more months
              </button>
            )}
          </>
        ) : (
          <Empty title="No comparison months yet">
            Add the installation dates and model inputs first.
          </Empty>
        )}
      </Card>
      {bill && <BillEditor project={p} onSave={onChange} onClose={() => setBill(false)} />}
    </>
  );
}
