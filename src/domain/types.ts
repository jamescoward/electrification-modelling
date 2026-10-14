/** Money is GBP, rates are VAT-inclusive pence/kWh; calculations use Decimal internally.
 * Dates are ISO Europe/London calendar dates, interval timestamps are offset ISO instants.
 * Null means unknown. No credentials belong in Project. */
export type DateOnly = string;
export type Provenance = 'entered' | 'api-derived' | 'estimated' | 'overridden';
export interface Installation {
  id: string;
  type: 'solar-battery' | 'heat-pump' | 'ev' | 'charger';
  date: DateOnly;
  cost: number;
  note?: string;
}
export interface Overpayment {
  id: string;
  date: DateOnly;
  amount: number;
  kind: 'actual' | 'planned';
}
export interface BalanceAnchor {
  date: DateOnly;
  balance: number;
  note: string;
}
export interface Loan {
  id: string;
  name: string;
  installationIds: string[];
  startDate: DateOnly;
  principal: number;
  annualRate: number;
  rateConvention: 'nominal' | 'effective' | 'apr-approximation';
  monthlyPayment: number;
  paymentProvenance?: 'entered' | 'estimated';
  originalTermMonths?: number;
  firstPaymentDate: DateOnly;
  paymentDay: number;
  fees: number;
  overpayments: Overpayment[];
  anchor?: BalanceAnchor;
}
export interface LoanPayment {
  date: DateOnly;
  kind: 'regular' | 'overpayment';
  requested: number;
  applied: number;
  excess: number;
  overpaymentKind?: 'actual' | 'planned';
}
export interface LoanPeriod {
  start: DateOnly;
  end: DateOnly;
  opening: number;
  interest: number;
  closing: number;
  payments: LoanPayment[];
  adjustment?: number;
}
export interface LoanSchedule {
  periods: LoanPeriod[];
  totalInterest: number;
  payoffDate: DateOnly | null;
  warnings: string[];
}
export interface Interval {
  start: string;
  end: string;
  kWh: number;
  direction: 'import' | 'export';
  meter: string;
}
export interface Rate {
  start: string;
  end: string | null;
  pence: number;
  direction: 'import' | 'export' | 'standing';
  source?: string;
}
export interface BillOverride {
  id: string;
  start: DateOnly;
  end: DateOnly;
  component: 'import' | 'export';
  amount: number;
  note: string;
}
export interface OilDelivery {
  id: string;
  date: DateOnly;
  litres: number;
  total: number;
  unitPence?: number;
  note?: string;
}
export interface MonthlyProfile {
  month: number;
  importKWh: number | null;
  exportKWh: number | null;
  cheapFraction: number | null;
  provenance: Provenance;
  importProvenance?: Provenance;
  exportProvenance?: Provenance;
  notes?: string[];
}
export interface MeterSelection {
  mpan: string;
  serial: string;
  direction: 'import' | 'export';
  agreements: { tariffCode: string; start: string; end: string | null }[];
}
export interface SourceCache {
  intervals: Interval[];
  rates: Rate[];
  retrievedAt: string | null;
  requestPeriod?: { start: string; end: string };
  endpoints: string[];
  refreshStatus: 'idle' | 'complete' | 'incomplete';
  error?: string;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  mode: 'household' | 'demo';
  revision: number;
  migrationHistory: string[];
  occupancyDate: DateOnly | null;
  installations: Installation[];
  loans: Loan[];
  baseline: {
    annualKWh: number | null;
    provenance: Provenance;
    referenceStart: DateOnly | null;
    referenceEnd: DateOnly | null;
    monthlyWeights: number[];
    unitPence: number | null;
    standingPence: number | null;
    tariffNote: string;
  };
  oil: {
    deliveries: OilDelivery[];
    coverageStart: DateOnly | null;
    coverageEnd: DateOnly | null;
    openingLitres: number | null;
    closingLitres: number | null;
    annualLitresOverride: number | null;
    historicalPence: number | null;
    quotePence: number | null;
    quoteDate: DateOnly | null;
    quoteIncludesVatDelivery: boolean;
    supplier: string;
    orderLitres: number | null;
    monthlyWeights: number[];
  };
  cars: {
    annualMiles: number | null;
    mpg: number | null;
    petrolPence: number | null;
    priceDate: DateOnly | null;
  };
  heating: { annualKWh: number | null; monthlyWeights: number[] };
  forecast: {
    start: DateOnly | null;
    horizonYears: number;
    oilScenario: 'low' | 'central' | 'high';
    oilFactors: { low: number; central: number; high: number };
    importDayPence: number | null;
    importCheapPence: number | null;
    cheapStartHour: number;
    cheapEndHour: number;
    exportPence: number | null;
    standingPence: number | null;
    referenceStart: DateOnly | null;
    referenceEnd: DateOnly | null;
    referenceConfirmed: boolean;
    exportRepresentativeFrom?: DateOnly | null;
    profile: MonthlyProfile[];
  };
  overrides: BillOverride[];
  connection: { accountNumber: string; meters: MeterSelection[] };
  cache: SourceCache;
  lastBackupAt: string | null;
}
export interface MonthResult {
  month: string;
  historical: boolean;
  complete: boolean;
  actualElectricity: number | null;
  baselineElectricity: number;
  avoidedOil: number;
  avoidedPetrol: number;
  heatingKWh: number;
  heatingCost: number;
  savings: number | null;
  cumulativeSavings: number;
  cashFlow: number;
  cumulativeCash: number;
  debt: number;
  notes: string[];
}
export interface Projection {
  nextYearCosts: {
    baselineElectricity: number;
    avoidedOil: number;
    avoidedPetrol: number;
    netElectricity: number;
  } | null;
  months: MonthResult[];
  historicalSavings: number | null;
  nextYearSavings: number | null;
  investment: number | null;
  paybackMonth: string | null;
  recoveryLost: boolean;
  outstandingDebt: number;
  loans: {
    loan: Loan;
    schedule: LoanSchedule;
    remainingPrincipal: number;
    remainingInterest: number;
    withoutPlannedInterest: number;
    withoutPlannedPayoff: string | null;
  }[];
  missing: string[];
  warnings: string[];
  effectiveHeatingPence: number | null;
}
