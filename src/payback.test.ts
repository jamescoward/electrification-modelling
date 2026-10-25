import { describe, expect, it } from 'vitest';
import { combined, emptyInputs, heatPump, petrolCost, solarEv, type Inputs } from './payback';

const example: Inputs = {
  oilLitresPerYear: 2000,
  oilPencePerLitre: 70,
  milesPerYear: 10000,
  mpg: 40,
  petrolPencePerLitre: 150,
  electricityBeforeGbp: 1500,
  electricityNowGbp: 500,
  heatPumpKWhPerYear: 4000,
  heatingPencePerKWh: 20,
  solarCostGbp: 15000,
  solarInterestGbp: 2000,
  heatPumpCostGbp: 6000,
  heatPumpInterestGbp: 1000,
};

describe('payback', () => {
  it('converts miles and UK MPG to petrol cost', () => {
    expect(petrolCost(example)).toBeCloseTo(1704.78, 2);
  });

  it('estimates solar/EV payback from bills and avoided petrol', () => {
    const r = solarEv(example);
    expect(r.cost).toBe(17000);
    expect(r.annualSaving).toBeCloseTo(2704.78, 2);
    expect(r.years).toBeCloseTo(6.29, 2);
  });

  it('estimates heat-pump payback with oil price scenarios', () => {
    expect(heatPump(example).annualSaving).toBeCloseTo(600);
    expect(heatPump(example).years).toBeCloseTo(11.67, 2);
    expect(heatPump(example, 'low').annualSaving).toBeCloseTo(320);
    expect(heatPump(example, 'high').annualSaving).toBeCloseTo(880);
  });

  it('combines costs and savings', () => {
    const r = combined(example);
    expect(r.cost).toBe(24000);
    expect(r.annualSaving).toBeCloseTo(3304.78, 2);
  });

  it('treats blank interest as cash purchase', () => {
    expect(solarEv({ ...example, solarInterestGbp: null }).cost).toBe(15000);
  });

  it('returns no payback for missing inputs or non-positive savings', () => {
    expect(solarEv(emptyInputs).years).toBeNull();
    expect(heatPump({ ...example, oilPencePerLitre: 30 }).years).toBeNull();
    expect(combined({ ...example, mpg: null }).years).toBeNull();
  });
});
