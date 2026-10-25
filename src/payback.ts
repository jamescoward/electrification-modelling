/** Rough simple-payback estimates from annual totals. Money is GBP; blank inputs are null. */
export interface Inputs {
  oilLitresPerYear: number | null;
  oilPencePerLitre: number | null;
  milesPerYear: number | null;
  mpg: number | null;
  petrolPencePerLitre: number | null;
  electricityBeforeGbp: number | null;
  electricityNowGbp: number | null;
  heatPumpKWhPerYear: number | null;
  heatingPencePerKWh: number | null;
  solarCostGbp: number | null;
  solarInterestGbp: number | null;
  heatPumpCostGbp: number | null;
  heatPumpInterestGbp: number | null;
}

export const emptyInputs: Inputs = {
  oilLitresPerYear: null,
  oilPencePerLitre: null,
  milesPerYear: null,
  mpg: null,
  petrolPencePerLitre: null,
  electricityBeforeGbp: null,
  electricityNowGbp: null,
  heatPumpKWhPerYear: null,
  heatingPencePerKWh: null,
  solarCostGbp: null,
  solarInterestGbp: null,
  heatPumpCostGbp: null,
  heatPumpInterestGbp: null,
};

export const LITRES_PER_UK_GALLON = 4.54609;
export const oilScenarios = { low: 0.8, central: 1, high: 1.2 } as const;
export type Scenario = keyof typeof oilScenarios;

export interface Payback {
  /** Installation cost plus loan interest. */
  cost: number | null;
  annualSaving: number | null;
  /** Years to recover cost; null when inputs are missing or the saving is not positive. */
  years: number | null;
}

const known = (...xs: (number | null)[]) => xs.every((x) => x !== null);

function payback(cost: number | null, annualSaving: number | null): Payback {
  const years =
    cost !== null && annualSaving !== null && annualSaving > 0 ? cost / annualSaving : null;
  return { cost, annualSaving, years };
}

export function petrolCost(i: Inputs): number | null {
  if (!known(i.milesPerYear, i.mpg, i.petrolPencePerLitre) || i.mpg! <= 0) return null;
  return ((i.milesPerYear! / i.mpg!) * LITRES_PER_UK_GALLON * i.petrolPencePerLitre!) / 100;
}

export function solarEv(i: Inputs): Payback {
  const petrol = petrolCost(i);
  const saving = known(petrol, i.electricityBeforeGbp, i.electricityNowGbp)
    ? petrol! + i.electricityBeforeGbp! - i.electricityNowGbp!
    : null;
  const cost = i.solarCostGbp === null ? null : i.solarCostGbp + (i.solarInterestGbp ?? 0);
  return payback(cost, saving);
}

export function heatPump(i: Inputs, scenario: Scenario = 'central'): Payback {
  const saving = known(
    i.oilLitresPerYear,
    i.oilPencePerLitre,
    i.heatPumpKWhPerYear,
    i.heatingPencePerKWh,
  )
    ? (i.oilLitresPerYear! * i.oilPencePerLitre! * oilScenarios[scenario] -
        i.heatPumpKWhPerYear! * i.heatingPencePerKWh!) /
      100
    : null;
  const cost = i.heatPumpCostGbp === null ? null : i.heatPumpCostGbp + (i.heatPumpInterestGbp ?? 0);
  return payback(cost, saving);
}

export function combined(i: Inputs, scenario: Scenario = 'central'): Payback {
  const a = solarEv(i),
    b = heatPump(i, scenario);
  return payback(
    known(a.cost, b.cost) ? a.cost! + b.cost! : null,
    known(a.annualSaving, b.annualSaving) ? a.annualSaving! + b.annualSaving! : null,
  );
}
