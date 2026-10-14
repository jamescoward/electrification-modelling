import { useEffect, useState } from 'react';
import type { Project, Installation, OilDelivery, MonthlyProfile } from '../domain/types';
import { HEATING_WEIGHTS } from '../domain/project';
import {
  Card,
  Field,
  Numeric,
  DateField,
  Weights,
  Select,
  Notice,
  Empty,
  currency,
  number,
  months,
} from './components';
import {
  InstallationEditor,
  DeliveryEditor,
  installationNames,
  type Update,
} from './EntityEditors';
export function Inputs({
  project: p,
  onChange,
  setPage,
}: {
  project: Project;
  onChange: Update;
  setPage: (page: string) => void;
}) {
  const [tab, setTab] = useState('Home & installations');
  const [installation, setInstallation] = useState<Installation | true | null>(null);
  const [delivery, setDelivery] = useState<OilDelivery | true | null>(null);
  const change = <K extends keyof Project>(key: K, value: Project[K]) =>
    onChange({ ...p, [key]: value });
  const b = (value: Partial<Project['baseline']>) =>
    change('baseline', { ...p.baseline, ...value });
  const o = (value: Partial<Project['oil']>) => change('oil', { ...p.oil, ...value });
  const c = (value: Partial<Project['cars']>) => change('cars', { ...p.cars, ...value });
  const h = (value: Partial<Project['heating']>) => change('heating', { ...p.heating, ...value });
  const f = (value: Partial<Project['forecast']>) =>
    change('forecast', { ...p.forecast, ...value });
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">Your model, your assumptions</div>
          <h1>Make it your household.</h1>
          <p>
            Work through the sections at your own pace. Valid edits save automatically; unknown
            facts stay blank.
          </p>
        </div>
        <span className="pill">
          {p.mode === 'demo' ? 'Synthetic inputs' : 'Private on this browser'}
        </span>
      </div>
      <div className="section-tabs" aria-label="Input sections">
        {['Home & installations', 'Baseline', 'Oil', 'Cars', 'Heating', 'Forecast'].map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Home & installations' && (
        <div className="stack">
          <Card title="Household details" subtitle="Dates use the Europe/London calendar.">
            <div className="field-grid two">
              <Field
                label="Household name"
                type="text"
                value={p.name}
                onChange={(v) => change('name', v)}
              />
              <DateField
                label="Occupancy / comparison start date"
                value={p.occupancyDate}
                onChange={(v) => change('occupancyDate', v)}
                help="Enter the exact date; July 2025 is only approximate context."
              />
            </div>
          </Card>
          <Card
            title="Installations & invoices"
            subtitle="Commissioning dates determine when oil and petrol become avoided costs."
            action={
              <button className="button secondary" onClick={() => setInstallation(true)}>
                Add installation
              </button>
            }
          >
            {!p.installations.length ? (
              <Empty title="No household figures have been assumed">
                Add the actual date and net invoice cost for each installation.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Installation</th>
                      <th>Commissioning</th>
                      <th className="num">Price paid</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.installations.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {installationNames[x.type]}
                          <div className="small muted">{x.note}</div>
                        </td>
                        <td>{x.date}</td>
                        <td className="num">{currency(x.cost)}</td>
                        <td>
                          <div className="actions">
                            <button
                              className="button secondary tiny"
                              onClick={() => setInstallation(x)}
                            >
                              Edit
                            </button>
                            <button
                              className="button secondary tiny"
                              disabled={p.loans.some((l) => l.installationIds.includes(x.id))}
                              onClick={() =>
                                change(
                                  'installations',
                                  p.installations.filter((y) => y.id !== x.id),
                                )
                              }
                            >
                              Remove
                            </button>
                          </div>
                          {p.loans.some((l) => l.installationIds.includes(x.id)) && (
                            <span className="small muted">
                              Linked loan: unlink before removing.
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="divider" />
            <div className="actions">
              <button className="button secondary" onClick={() => setPage('loans')}>
                Manage loans & funding
              </button>
            </div>
            <p className="small muted" style={{ marginTop: 15, marginBottom: 0 }}>
              Solar ≈11 kWp, 7 kW FoxESS inverter, 9.6 kWh battery and 10 kW Vaillant heat pump are
              unconfirmed context only. Rated heat-pump capacity is not annual electrical
              consumption.
            </p>
          </Card>
        </div>
      )}
      {tab === 'Baseline' && (
        <Card
          title="The alternative household"
          subtitle="Ordinary household electricity without solar, battery, EVs or heat pump."
        >
          <p className="section-intro">
            Use complete days from your occupied pre-upgrade period, or enter an explicit annual
            estimate. A short summer period does not establish a measured winter profile.
          </p>
          <div className="field-grid">
            <Numeric
              label="Baseline annual electricity (kWh)"
              value={p.baseline.annualKWh}
              min={0}
              onChange={(v) => b({ annualKWh: v, provenance: 'overridden' })}
            />
            <DateField
              label="Baseline reference start"
              value={p.baseline.referenceStart}
              onChange={(v) => b({ referenceStart: v })}
            />
            <DateField
              label="Baseline reference end (exclusive)"
              value={p.baseline.referenceEnd}
              onChange={(v) => b({ referenceEnd: v })}
            />
            <Numeric
              label="Comparison import price (p/kWh)"
              value={p.baseline.unitPence}
              onChange={(v) => b({ unitPence: v })}
            />
            <Numeric
              label="Comparison standing charge (p/day)"
              value={p.baseline.standingPence}
              onChange={(v) => b({ standingPence: v })}
            />
            <Select
              label="Baseline provenance"
              value={p.baseline.provenance}
              options={['entered', 'api-derived', 'estimated', 'overridden'].map((value) => ({
                value,
                label: value,
              }))}
              onChange={(v) => b({ provenance: v as Project['baseline']['provenance'] })}
            />
          </div>
          <div className="divider" />
          <Field
            label="Explicit historical tariff / continuation assumption"
            type="text"
            value={p.baseline.tariffNote}
            onChange={(v) => b({ tariffNote: v })}
            help="Confirm historic agreements separately in Data. Today's deal must never be applied retrospectively."
          />
          <div className="divider" />
          <Weights
            label="Baseline monthly allocation"
            value={p.baseline.monthlyWeights}
            onChange={(v) => b({ monthlyWeights: v })}
          />
          <p className="small muted">
            A flat allocation is the initial assumption. Source intervals and coverage can be
            inspected in Energy.
          </p>
        </Card>
      )}
      {tab === 'Oil' && (
        <div className="stack">
          <Card
            title="Oil purchases"
            subtitle="Deliveries are allocated seasonally, rather than consumed on their delivery date."
            action={
              <button className="button secondary" onClick={() => setDelivery(true)}>
                Add oil delivery
              </button>
            }
          >
            {!p.oil.deliveries.length ? (
              <Empty title="Start with your oil records">
                Enter deliveries and the period they cover, or supply an explicit annual-use
                override.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num">Litres</th>
                      <th className="num">Total paid</th>
                      <th className="num">Implied p/litre</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.oil.deliveries.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {x.date}
                          <div className="small muted">{x.note}</div>
                        </td>
                        <td className="num">{number(x.litres, 1)}</td>
                        <td className="num">{currency(x.total)}</td>
                        <td className="num">
                          {number((x.total / x.litres) * 100, 2)}
                          {x.unitPence !== undefined &&
                            Math.abs((x.unitPence * x.litres) / 100 - x.total) > 0.02 && (
                              <div className="negative small">Unit price differs</div>
                            )}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="button secondary tiny"
                              onClick={() => setDelivery(x)}
                            >
                              Edit
                            </button>
                            <button
                              className="button secondary tiny"
                              onClick={() =>
                                o({ deliveries: p.oil.deliveries.filter((y) => y.id !== x.id) })
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="divider" />
            <div className="field-grid">
              <DateField
                label="Oil coverage start"
                value={p.oil.coverageStart}
                onChange={(v) => o({ coverageStart: v })}
              />
              <DateField
                label="Oil coverage end (exclusive)"
                value={p.oil.coverageEnd}
                onChange={(v) => o({ coverageEnd: v })}
              />
              <Numeric
                label="Annual oil-use override (litres)"
                value={p.oil.annualLitresOverride}
                min={0}
                onChange={(v) => o({ annualLitresOverride: v })}
              />
              <Numeric
                label="Opening tank contents (litres)"
                value={p.oil.openingLitres}
                min={0}
                onChange={(v) => o({ openingLitres: v })}
              />
              <Numeric
                label="Closing tank contents (litres)"
                value={p.oil.closingLitres}
                min={0}
                onChange={(v) => o({ closingLitres: v })}
              />
              <Numeric
                label="Historical oil assumption (p/litre)"
                value={p.oil.historicalPence}
                min={0}
                onChange={(v) => o({ historicalPence: v })}
                help="Blank uses the volume-weighted purchase price as a labelled approximation."
              />
            </div>
            {(p.oil.openingLitres === null || p.oil.closingLitres === null) && (
              <p className="small muted" style={{ marginTop: 15 }}>
                Unknown tank stocks make purchases a consumption proxy, not measured consumption.
              </p>
            )}
          </Card>
          <Card
            title="Future oil-price sensitivity"
            subtitle="Illustrative low/central/high cases; these are not market forecasts."
          >
            <div className="field-grid">
              <Numeric
                label="Current oil quote (p/litre)"
                value={p.oil.quotePence}
                min={0}
                onChange={(v) => o({ quotePence: v })}
              />
              <DateField
                label="Oil quote date"
                value={p.oil.quoteDate}
                onChange={(v) => o({ quoteDate: v })}
              />
              <Field
                label="Supplier (optional)"
                type="text"
                value={p.oil.supplier}
                onChange={(v) => o({ supplier: v })}
              />
              <Numeric
                label="Quote order size (litres)"
                value={p.oil.orderLitres}
                min={0}
                onChange={(v) => o({ orderLitres: v })}
              />
              {(['low', 'central', 'high'] as const).map((s) => (
                <Numeric
                  key={s}
                  label={s[0].toUpperCase() + s.slice(1) + ' oil multiplier (%)'}
                  value={p.forecast.oilFactors[s]}
                  scale={100}
                  min={0}
                  onChange={(v) => f({ oilFactors: { ...p.forecast.oilFactors, [s]: v ?? 0 } })}
                />
              ))}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.oil.quoteIncludesVatDelivery}
                onChange={(e) => o({ quoteIncludesVatDelivery: e.target.checked })}
              />
              Quote includes all VAT and delivery costs. Normalise to the total household cost
              before forecasting.
            </label>
            <p className="small muted">
              Future oil quotes never rewrite saved historical price assumptions.
            </p>
            <div className="divider" />
            <Weights
              label="Oil seasonal allocation"
              value={p.oil.monthlyWeights}
              onChange={(v) => o({ monthlyWeights: v })}
            />
          </Card>
        </div>
      )}
      {tab === 'Cars' && (
        <Card
          title="Equivalent petrol driving"
          subtitle="UK imperial MPG; home charging is already included in actual household electricity."
        >
          <div className="field-grid">
            <Numeric
              label="Combined annual mileage (miles)"
              value={p.cars.annualMiles}
              min={0}
              onChange={(v) => c({ annualMiles: v })}
            />
            <Numeric
              label="Petrol efficiency (UK MPG)"
              value={p.cars.mpg}
              min={0}
              onChange={(v) => c({ mpg: v })}
              help="For example, 40 MPG is an illustration, not a measured national average."
            />
            <Numeric
              label="Petrol price (p/litre)"
              value={p.cars.petrolPence}
              min={0}
              onChange={(v) => c({ petrolPence: v })}
            />
            <DateField
              label="Petrol price date"
              value={p.cars.priceDate}
              onChange={(v) => c({ priceDate: v })}
            />
          </div>
          <div className="divider" />
          <Notice>
            Public charging is excluded and savings are slightly overstated as a result. Mileage is
            assumed unchanged from the electricity reference year; editing it corrects that
            assumption, rather than modelling a separate driving change.
          </Notice>
          {p.cars.annualMiles !== null && p.cars.mpg !== null && p.cars.mpg > 0 && (
            <p className="small muted">
              Equivalent annual petrol: {number((p.cars.annualMiles / p.cars.mpg) * 4.54609, 2)}{' '}
              litres (4.54609 litres per imperial gallon).
            </p>
          )}
        </Card>
      )}
      {tab === 'Heating' && (
        <Card
          title="Design-estimated heating input"
          subtitle="An explicit estimate for space heating plus hot water."
        >
          <div className="field-grid two">
            <Numeric
              label="Heat-pump annual electrical input (kWh)"
              value={p.heating.annualKWh}
              min={0}
              onChange={(v) => h({ annualKWh: v })}
              help="Electrical consumption from your design estimate. Do not enter thermal output or the heat pump's 10 kW rated capacity."
            />
          </div>
          <div className="divider" />
          <Weights
            label="Heating monthly allocation"
            value={p.heating.monthlyWeights}
            onChange={(v) => h({ monthlyWeights: v })}
          />
          <button
            className="button secondary tiny"
            onClick={() => h({ monthlyWeights: [...HEATING_WEIGHTS] })}
          >
            Use illustrative seasonal weights
          </button>
          <p className="small muted" style={{ marginTop: 15 }}>
            The default weights retain summer hot-water use and are a rough assumption. Forecast
            heat is distributed uniformly across each local day and repriced using standard cheap
            hours, including daylight-saving time.
          </p>
          <Notice>
            Incremental heating is assumed to come from the grid; solar self-consumption, battery
            interactions and extra Intelligent Go slots are not modelled. Actual post-installation
            bills already include heating, so it is not added again.
          </Notice>
        </Card>
      )}
      {tab === 'Forecast' && (
        <div className="stack">
          <Card
            title="Future tariff & horizon"
            subtitle="Explicit assumptions in nominal GBP; prices remain flat within each scenario."
          >
            <div className="field-grid">
              <DateField
                label="Forecast start date"
                value={p.forecast.start}
                onChange={(v) => f({ start: v })}
                help="Choose the date after the included historical cutoff."
              />
              <Numeric
                label="Projection horizon (years)"
                value={p.forecast.horizonYears}
                min={1}
                max={100}
                onChange={(v) => f({ horizonYears: v ?? 0 })}
              />
              <Numeric
                label="Future daytime import (p/kWh)"
                value={p.forecast.importDayPence}
                onChange={(v) => f({ importDayPence: v })}
              />
              <Numeric
                label="Future cheap import (p/kWh)"
                value={p.forecast.importCheapPence}
                onChange={(v) => f({ importCheapPence: v })}
              />
              <Numeric
                label="Future export credit (p/kWh)"
                value={p.forecast.exportPence}
                onChange={(v) => f({ exportPence: v })}
              />
              <Numeric
                label="Future standing charge (p/day)"
                value={p.forecast.standingPence}
                onChange={(v) => f({ standingPence: v })}
              />
              <Numeric
                label="Cheap window start hour"
                value={p.forecast.cheapStartHour}
                min={0}
                max={23.99}
                onChange={(v) => f({ cheapStartHour: v ?? 0 })}
                help="Local clock hour; 23.5 means 23:30."
              />
              <Numeric
                label="Cheap window end hour"
                value={p.forecast.cheapEndHour}
                min={0}
                max={23.99}
                onChange={(v) => f({ cheapEndHour: v ?? 0 })}
              />
              <Select
                label="Selected oil-price case"
                value={p.forecast.oilScenario}
                onChange={(v) => f({ oilScenario: v as Project['forecast']['oilScenario'] })}
                options={['low', 'central', 'high'].map((value) => ({
                  value,
                  label: value[0].toUpperCase() + value.slice(1),
                }))}
              />
            </div>
            <p className="small muted" style={{ marginTop: 18 }}>
              Horizon runs from the first upgrade. No inflation, annual escalation, degradation,
              maintenance, replacements, residual values or discounting are assumed.
            </p>
          </Card>
          <Card
            title="Pre-heat-pump electricity reference"
            subtitle="One seasonal year after solar and EV adoption, before heat-pump commissioning."
          >
            <div className="field-grid two">
              <DateField
                label="Electricity reference start"
                value={p.forecast.referenceStart}
                onChange={(v) => f({ referenceStart: v, referenceConfirmed: false })}
              />
              <DateField
                label="Electricity reference end (exclusive)"
                value={p.forecast.referenceEnd}
                onChange={(v) => f({ referenceEnd: v, referenceConfirmed: false })}
              />
            </div>
            <p className="small muted" style={{ marginTop: 16 }}>
              Enter the imported/exported kWh profile, not historic pound totals. Missing months
              remain missing until you enter them. These reference values already contain solar,
              battery and EV operation.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Imported kWh</th>
                    <th>Exported kWh</th>
                    <th>Cheap import %</th>
                    <th>Provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => (
                    <ProfileRow
                      key={p.mode + '-' + m}
                      month={i + 1}
                      record={p.forecast.profile.find((x) => x.month === i + 1)}
                      onApply={(next) =>
                        f({
                          profile: [
                            ...p.forecast.profile.filter((x) => x.month !== next.month),
                            next,
                          ].sort((a, b) => a.month - b.month),
                          referenceConfirmed: false,
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={p.forecast.referenceConfirmed}
                onChange={(e) => f({ referenceConfirmed: e.target.checked })}
              />
              I confirm all twelve months form a complete pre-heat-pump seasonal profile; any
              estimates are explicitly labelled.
            </label>
            {p.forecast.profile.length < 12 && (
              <p className="small negative">
                {12 - p.forecast.profile.length} reference months still need values.
              </p>
            )}
          </Card>
        </div>
      )}
      {installation && (
        <InstallationEditor
          project={p}
          record={installation === true ? undefined : installation}
          onSave={onChange}
          onClose={() => setInstallation(null)}
        />
      )}
      {delivery && (
        <DeliveryEditor
          project={p}
          record={delivery === true ? undefined : delivery}
          onSave={onChange}
          onClose={() => setDelivery(null)}
        />
      )}
    </>
  );
}

function ProfileRow({
  month,
  record,
  onApply,
}: {
  month: number;
  record?: MonthlyProfile;
  onApply: (row: MonthlyProfile) => void;
}) {
  const [draft, setDraft] = useState({
    importKWh: record ? String(record.importKWh) : '',
    exportKWh: record ? String(record.exportKWh) : '',
    cheap: record ? String(record.cheapFraction * 100) : '',
    provenance: record?.provenance ?? 'entered',
  });
  useEffect(
    () =>
      setDraft({
        importKWh: record ? String(record.importKWh) : '',
        exportKWh: record ? String(record.exportKWh) : '',
        cheap: record ? String(record.cheapFraction * 100) : '',
        provenance: record?.provenance ?? 'entered',
      }),
    [record],
  );
  const m = months[month - 1],
    valid =
      draft.importKWh !== '' &&
      draft.exportKWh !== '' &&
      draft.cheap !== '' &&
      Number(draft.importKWh) >= 0 &&
      Number(draft.exportKWh) >= 0 &&
      Number(draft.cheap) >= 0 &&
      Number(draft.cheap) <= 100;
  const dirty =
    !record ||
    Number(draft.importKWh) !== record.importKWh ||
    Number(draft.exportKWh) !== record.exportKWh ||
    Number(draft.cheap) / 100 !== record.cheapFraction ||
    draft.provenance !== record.provenance;
  return (
    <tr>
      <td>
        {m}
        <div className="small muted">{record ? 'Applied' : 'Missing'}</div>
      </td>
      <td>
        <Field
          label={m + ' imported kWh'}
          value={draft.importKWh}
          min={0}
          onChange={(v) => setDraft({ ...draft, importKWh: v })}
        />
      </td>
      <td>
        <Field
          label={m + ' exported kWh'}
          value={draft.exportKWh}
          min={0}
          onChange={(v) => setDraft({ ...draft, exportKWh: v })}
        />
      </td>
      <td>
        <Field
          label={m + ' cheap import %'}
          value={draft.cheap}
          min={0}
          max={100}
          onChange={(v) => setDraft({ ...draft, cheap: v })}
        />
      </td>
      <td>
        <Select
          label={m + ' provenance'}
          value={draft.provenance}
          options={['entered', 'estimated', 'api-derived', 'overridden'].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(v) => setDraft({ ...draft, provenance: v as MonthlyProfile['provenance'] })}
        />
        <button
          className="button secondary tiny"
          style={{ marginTop: 7 }}
          disabled={!valid || !dirty}
          onClick={() =>
            onApply({
              month,
              importKWh: Number(draft.importKWh),
              exportKWh: Number(draft.exportKWh),
              cheapFraction: Number(draft.cheap) / 100,
              provenance: draft.provenance,
            })
          }
        >
          Apply {m} values
        </button>
      </td>
    </tr>
  );
}
