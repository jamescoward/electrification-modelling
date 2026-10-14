import { Temporal } from '@js-temporal/polyfill';
import { emptyProject } from '../domain/project';
import type { MonthlyProfile, Project, Rate } from '../domain/types';

const ZONE = 'Europe/London';
const START = '2025-09-01';
const END = '2026-10-01';
const REFERENCE_END = '2026-09-01';
const CHEAP_FRACTION = 0.68;
// Every amount, date and reading is invented for this demonstration household.
const MONTHLY_IMPORT = [620, 560, 480, 360, 290, 230, 220, 260, 380, 490, 550, 610];
const MONTHLY_EXPORT = [30, 50, 100, 180, 240, 280, 270, 210, 140, 80, 40, 25];
const cheap = (hour: number) => hour >= 23.5 || hour < 5.5;
const midnight = (day: Temporal.PlainDate) =>
  day.toZonedDateTime({ timeZone: ZONE, plainTime: '00:00' }).toInstant();

/** A complete synthetic seasonal journey, isolated from household information.
 * Daily profiles conserve monthly energy and explicit zero export readings
 * establish coverage overnight. Half-hours follow instants, so the spring and
 * autumn clock changes generate 46 and 50 readings respectively.
 */
function buildDemoProject(): Project {
  const project = emptyProject('demo');
  project.id = 'synthetic-demo-v1';
  project.name = 'Synthetic demonstration household';
  project.occupancyDate = '2024-04-01';
  project.installations = [
    {
      id: 'demo-solar',
      type: 'solar-battery',
      date: START,
      cost: 8800,
      note: 'Invented solar/battery invoice; demonstration only.',
    },
    {
      id: 'demo-charger',
      type: 'charger',
      date: START,
      cost: 700,
      note: 'Invented charger invoice; demonstration only.',
    },
    {
      id: 'demo-ev',
      type: 'ev',
      date: START,
      cost: 0,
      note: 'Synthetic EV adoption date only. Vehicle purchase, ownership, depreciation, insurance and finance are outside this energy model.',
    },
    {
      id: 'demo-heat',
      type: 'heat-pump',
      date: END,
      cost: 6200,
      note: 'Invented net heat-pump invoice; demonstration only.',
    },
  ];
  project.loans = [
    {
      id: 'demo-solar-loan',
      name: 'Synthetic solar and charger finance',
      installationIds: ['demo-solar', 'demo-charger'],
      startDate: START,
      principal: 7200,
      annualRate: 0.059,
      rateConvention: 'nominal',
      monthlyPayment: 140,
      firstPaymentDate: '2025-09-20',
      paymentDay: 20,
      fees: 40,
      overpayments: [
        { id: 'demo-actual-overpayment', date: '2026-02-12', amount: 1200, kind: 'actual' },
        { id: 'demo-planned-overpayment', date: '2027-04-20', amount: 500, kind: 'planned' },
      ],
    },
    {
      id: 'demo-heat-loan',
      name: 'Synthetic heat-pump finance',
      installationIds: ['demo-heat'],
      startDate: END,
      principal: 5000,
      annualRate: 0.042,
      rateConvention: 'effective',
      monthlyPayment: 110,
      firstPaymentDate: '2026-10-18',
      paymentDay: 18,
      fees: 0,
      overpayments: [],
    },
  ];
  project.baseline = {
    annualKWh: 4200,
    provenance: 'estimated',
    referenceStart: '2024-09-01',
    referenceEnd: START,
    monthlyWeights: Array(12).fill(1 / 12),
    unitPence: 28.5,
    standingPence: 52,
    tariffNote:
      'Synthetic alternative-household continuation at a flat assumed rate. No real bills or account data.',
  };
  project.oil = {
    deliveries: [
      {
        id: 'demo-oil-1',
        date: '2024-09-12',
        litres: 650,
        total: 422.5,
        unitPence: 65,
        note: 'Invented delivery.',
      },
      {
        id: 'demo-oil-2',
        date: '2025-02-04',
        litres: 750,
        total: 525,
        unitPence: 70,
        note: 'Invented delivery.',
      },
    ],
    coverageStart: '2024-09-01',
    coverageEnd: START,
    openingLitres: 180,
    closingLitres: 100,
    annualLitresOverride: null,
    historicalPence: null,
    quotePence: 72,
    quoteDate: '2026-09-25',
    quoteIncludesVatDelivery: true,
    supplier: 'Fictional demo supplier',
    orderLitres: 1000,
    monthlyWeights: [...project.oil.monthlyWeights],
  };
  project.cars = { annualMiles: 9200, mpg: 42, petrolPence: 146, priceDate: '2026-09-25' };
  project.heating.annualKWh = 3800;
  const profile: MonthlyProfile[] = MONTHLY_IMPORT.map((importKWh, index) => ({
    month: index + 1,
    importKWh,
    exportKWh: MONTHLY_EXPORT[index],
    cheapFraction: CHEAP_FRACTION,
    provenance: 'estimated',
  }));
  project.forecast = {
    ...project.forecast,
    start: END,
    horizonYears: 20,
    importDayPence: 28,
    importCheapPence: 8,
    exportPence: 15,
    standingPence: 52,
    referenceStart: START,
    referenceEnd: REFERENCE_END,
    referenceConfirmed: true,
    profile,
  };

  const importRates: Rate[] = [];
  for (let day = Temporal.PlainDate.from(START); day.toString() < END; day = day.add({ days: 1 })) {
    const from = midnight(day),
      until = midnight(day.add({ days: 1 }));
    const slots: { start: string; end: string; cheap: boolean; solarWeight: number }[] = [];
    for (let at = from; Temporal.Instant.compare(at, until) < 0; at = at.add({ minutes: 30 })) {
      const local = at.toZonedDateTimeISO(ZONE);
      const hour = local.hour + local.minute / 60;
      // A smooth daytime-only export shape; monthly quantities drive seasonality.
      const solarWeight = hour >= 7 && hour < 19 ? Math.sin((Math.PI * (hour - 7 + 0.25)) / 12) : 0;
      slots.push({
        start: at.toString(),
        end: at.add({ minutes: 30 }).toString(),
        cheap: cheap(hour),
        solarWeight,
      });
    }
    const cheapSlots = slots.filter((slot) => slot.cheap).length;
    const daySlots = slots.length - cheapSlots;
    const solarWeight = slots.reduce((total, slot) => total + slot.solarWeight, 0);
    const dailyImport = MONTHLY_IMPORT[day.month - 1] / day.daysInMonth;
    const dailyExport = MONTHLY_EXPORT[day.month - 1] / day.daysInMonth;
    for (const slot of slots) {
      project.cache.intervals.push(
        {
          start: slot.start,
          end: slot.end,
          kWh:
            dailyImport *
            (slot.cheap ? CHEAP_FRACTION / cheapSlots : (1 - CHEAP_FRACTION) / daySlots),
          direction: 'import',
          meter: 'SYNTHETIC-IMPORT',
        },
        {
          start: slot.start,
          end: slot.end,
          kWh: (dailyExport * slot.solarWeight) / solarWeight,
          direction: 'export',
          meter: 'SYNTHETIC-EXPORT',
        },
      );
      const pence = slot.cheap ? 8 : 28;
      const previous = importRates.at(-1);
      if (previous && previous.pence === pence && previous.end === slot.start)
        previous.end = slot.end;
      else
        importRates.push({
          start: slot.start,
          end: slot.end,
          direction: 'import',
          pence,
          source: 'Synthetic demonstration tariff, not API data',
        });
    }
  }
  const from = midnight(Temporal.PlainDate.from(START)).toString();
  const until = midnight(Temporal.PlainDate.from(END)).toString();
  project.cache.rates = [
    ...importRates,
    {
      start: from,
      end: until,
      direction: 'export',
      pence: 15,
      source: 'Synthetic demonstration tariff, not API data',
    },
    {
      start: from,
      end: until,
      direction: 'standing',
      pence: 52,
      source: 'Synthetic demonstration tariff, not API data',
    },
  ];
  project.cache.retrievedAt = until;
  project.cache.requestPeriod = { start: from, end: until };
  project.cache.refreshStatus = 'complete';
  project.cache.endpoints = [];
  return project;
}

let template: Project | undefined;
/** Reuse the deterministic fixture construction, returning independent data
 * each time so scenario edits cannot contaminate another demonstration. */
export function demoProject(): Project {
  template ??= buildDemoProject();
  return structuredClone(template);
}
