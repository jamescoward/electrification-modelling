import { useEffect, useState } from 'react';
import {
  combined,
  emptyInputs,
  heatPump,
  oilScenarios,
  solarEv,
  type Inputs,
  type Payback,
  type Scenario,
} from './payback';

const STORAGE_KEY = 'payback-inputs-v1';

interface Field {
  key: keyof Inputs;
  label: string;
  unit: string;
  hint: string;
}

const groups: { title: string; fields: Field[] }[] = [
  {
    title: 'Old oil heating',
    fields: [
      {
        key: 'oilLitresPerYear',
        label: 'Oil used per year',
        unit: 'litres',
        hint: 'Rough total from a year of delivery receipts.',
      },
      {
        key: 'oilPencePerLitre',
        label: 'Oil price',
        unit: 'p/litre',
        hint: 'Current quote including VAT and delivery. Low/high cases use ±20%.',
      },
    ],
  },
  {
    title: 'Old petrol driving',
    fields: [
      { key: 'milesPerYear', label: 'Miles per year', unit: 'miles', hint: 'All cars combined.' },
      {
        key: 'mpg',
        label: 'Petrol efficiency',
        unit: 'UK MPG',
        hint: 'What the petrol cars would have done.',
      },
      {
        key: 'petrolPencePerLitre',
        label: 'Petrol price',
        unit: 'p/litre',
        hint: 'Typical forecourt price.',
      },
    ],
  },
  {
    title: 'Electricity',
    fields: [
      {
        key: 'electricityBeforeGbp',
        label: 'Bill per year before solar/EV',
        unit: '£',
        hint: 'Old bills scaled to a year (e.g. 3 months × 4).',
      },
      {
        key: 'electricityNowGbp',
        label: 'Net bill per year with solar/EV',
        unit: '£',
        hint: 'Last 12 months imports minus export income, before the heat pump.',
      },
      {
        key: 'heatPumpKWhPerYear',
        label: 'Heat-pump electricity per year',
        unit: 'kWh',
        hint: 'Installer design estimate of electrical input (not heat output).',
      },
      {
        key: 'heatingPencePerKWh',
        label: 'Average price for heating',
        unit: 'p/kWh',
        hint: 'E.g. 25% cheap rate + 75% day rate if run evenly all day.',
      },
    ],
  },
  {
    title: 'Costs',
    fields: [
      {
        key: 'solarCostGbp',
        label: 'Solar, battery & charger cost',
        unit: '£',
        hint: 'Price paid after grants.',
      },
      {
        key: 'solarInterestGbp',
        label: 'Solar loan interest',
        unit: '£',
        hint: 'Total interest over the loan. Leave blank if paid in cash.',
      },
      {
        key: 'heatPumpCostGbp',
        label: 'Heat-pump cost',
        unit: '£',
        hint: 'Price paid after grants.',
      },
      {
        key: 'heatPumpInterestGbp',
        label: 'Heat-pump loan interest',
        unit: '£',
        hint: 'Total interest over the loan. Leave blank if paid in cash.',
      },
    ],
  },
];

function load(): Inputs {
  try {
    return { ...emptyInputs, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return emptyInputs;
  }
}

const gbp = (x: number | null) =>
  x === null
    ? '—'
    : x.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

function years(p: Payback) {
  if (p.years !== null) return `${p.years.toFixed(1)} yrs`;
  if (p.cost !== null && p.annualSaving !== null) return 'Never';
  return '—';
}

export function App() {
  const [inputs, setInputs] = useState<Inputs>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
    } catch {
      // Storage unavailable; inputs still work for this visit.
    }
  }, [inputs]);

  const set = (key: keyof Inputs, value: string) =>
    setInputs({
      ...inputs,
      [key]: value === '' || !Number.isFinite(Number(value)) ? null : Number(value),
    });

  const scenarios = Object.keys(oilScenarios) as Scenario[];
  const rows: { name: string; calc: (s: Scenario) => Payback }[] = [
    { name: 'Solar, battery & EVs', calc: () => solarEv(inputs) },
    { name: 'Heat pump', calc: (s) => heatPump(inputs, s) },
    { name: 'Combined', calc: (s) => combined(inputs, s) },
  ];

  return (
    <main>
      <h1>Electrification payback</h1>
      <p className="lead">
        Rough simple payback: (installation cost + loan interest) ÷ annual saving. No price changes,
        maintenance or discounting. Inputs are saved in this browser only.
      </p>

      <section className="results" aria-label="Results">
        <table>
          <thead>
            <tr>
              <th />
              <th>Cost incl. interest</th>
              <th>Saving per year (central oil)</th>
              {scenarios.map((s) => (
                <th key={s}>Payback, {s} oil</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, calc }) => {
              const central = calc('central');
              return (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{gbp(central.cost)}</td>
                  <td>{gbp(central.annualSaving)}</td>
                  {scenarios.map((s) => (
                    <td key={s}>{years(calc(s))}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="note">
          Solar/EV saving = petrol avoided + old electricity bill − current net bill. Heat-pump
          saving = oil avoided − heat-pump electricity. Low/central/high oil = 80%/100%/120% of the
          entered price.
        </p>
      </section>

      <form onSubmit={(e) => e.preventDefault()}>
        {groups.map((g) => (
          <fieldset key={g.title}>
            <legend>{g.title}</legend>
            {g.fields.map((f) => (
              <label key={f.key}>
                <span>
                  {f.label} <small>({f.unit})</small>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={inputs[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
                <small>{f.hint}</small>
              </label>
            ))}
          </fieldset>
        ))}
        <button type="button" onClick={() => setInputs(emptyInputs)}>
          Clear all
        </button>
      </form>
    </main>
  );
}
