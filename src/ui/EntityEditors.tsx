import { useState } from 'react';
import type {
  Project,
  Installation,
  OilDelivery,
  Loan,
  Overpayment,
  BillOverride,
} from '../domain/types';
import { validateProject } from '../adapters/backup';
import { estimatedMonthlyPayment, loanSchedule } from '../domain/finance';
import { Field, Select, Modal, id, Notice } from './components';
export const installationNames: Record<Installation['type'], string> = {
  'solar-battery': 'Solar, battery & shared charger invoice',
  'heat-pump': 'Heat pump',
  ev: 'Electric car use',
  charger: 'EV charger',
};
export type Update = (project: Project) => void;
export function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    return (error as { issues: { path: unknown[]; message: string }[] }).issues
      .map((x) => `${x.path.join(' › ')}: ${x.message}`)
      .slice(0, 8)
      .join('; ');
  }
  return error instanceof Error ? error.message : 'The action could not be completed.';
}
function useForm(project: Project, onSave: Update, onClose: () => void) {
  const [error, setError] = useState('');
  return {
    error,
    setError,
    submit: (next: Project) => {
      try {
        validateProject(next);
        onSave(next);
        onClose();
      } catch (e) {
        setError(errorText(e));
      }
    },
  };
}
export function InstallationEditor({
  project,
  record,
  onSave,
  onClose,
}: {
  project: Project;
  record?: Installation;
  onSave: Update;
  onClose: () => void;
}) {
  const [draft, set] = useState({
    type: record?.type ?? 'solar-battery',
    date: record?.date ?? '',
    cost: record ? String(record.cost) : '',
    note: record?.note ?? '',
  });
  const { error, submit, setError } = useForm(project, onSave, onClose);
  return (
    <Modal title={record ? 'Edit installation' : 'Add installation'} onClose={onClose}>
      <p className="small muted">
        Enter the price actually paid after grants. Use a combined invoice for solar, battery and
        charger; no guessed split is needed. An EV-use record establishes its adoption date only;
        vehicle purchase and finance costs are excluded, so its cost is £0.
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="field-grid two">
        <Select
          label="Installation type"
          value={draft.type}
          options={Object.entries(installationNames).map(([value, label]) => ({ value, label }))}
          onChange={(v) => set({ ...draft, type: v as Installation['type'] })}
        />
        <Field
          label="Commissioning date"
          type="date"
          value={draft.date}
          onChange={(v) => set({ ...draft, date: v })}
        />
        {draft.type === 'ev' ? (
          <div className="field">
            <span>Vehicle ownership and finance excluded</span>
            <p className="small muted">£0 · adoption-date record only</p>
          </div>
        ) : (
          <Field
            label="Price paid after grants (£)"
            value={draft.cost}
            min={0}
            onChange={(v) => set({ ...draft, cost: v })}
          />
        )}
        <Field
          label="Notes"
          type="text"
          value={draft.note}
          onChange={(v) => set({ ...draft, note: v })}
        />
      </div>
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() => {
            const next = {
              id: record?.id ?? id(),
              type: draft.type,
              date: draft.date,
              cost: draft.type === 'ev' ? 0 : draft.cost === '' ? NaN : Number(draft.cost),
              note: draft.note,
            };
            submit({
              ...project,
              installations: record
                ? project.installations.map((x) => (x.id === record.id ? next : x))
                : [...project.installations, next],
            });
          }}
        >
          Save installation
        </button>
      </div>
    </Modal>
  );
}
export function DeliveryEditor({
  project,
  record,
  onSave,
  onClose,
}: {
  project: Project;
  record?: OilDelivery;
  onSave: Update;
  onClose: () => void;
}) {
  const [draft, set] = useState({
    date: record?.date ?? '',
    litres: record ? String(record.litres) : '',
    total: record ? String(record.total) : '',
    unitPence: record?.unitPence == null ? '' : String(record.unitPence),
    note: record?.note ?? '',
  });
  const { error, submit, setError } = useForm(project, onSave, onClose);
  const discrepancy =
    draft.unitPence &&
    draft.litres &&
    draft.total &&
    Math.abs((Number(draft.unitPence) * Number(draft.litres)) / 100 - Number(draft.total)) > 0.02;
  return (
    <Modal title={record ? 'Edit oil delivery' : 'Add oil delivery'} onClose={onClose}>
      {error && <Notice error>{error}</Notice>}
      <div className="field-grid two">
        <Field
          label="Delivery date"
          type="date"
          value={draft.date}
          onChange={(v) => set({ ...draft, date: v })}
        />
        <Field
          label="Litres delivered"
          value={draft.litres}
          min={0}
          onChange={(v) => set({ ...draft, litres: v })}
        />
        <Field
          label="Total paid including VAT and delivery (£)"
          value={draft.total}
          min={0}
          onChange={(v) => set({ ...draft, total: v })}
        />
        <Field
          label="Optional unit price (p/litre)"
          value={draft.unitPence}
          min={0}
          onChange={(v) => set({ ...draft, unitPence: v })}
        />
        <Field
          label="Delivery note"
          type="text"
          value={draft.note}
          onChange={(v) => set({ ...draft, note: v })}
        />
      </div>
      {discrepancy && (
        <Notice>
          The entered unit price does not reconcile to the total paid. Check whether VAT or delivery
          is included. Calculations use the total paid.
        </Notice>
      )}
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() => {
            const next: OilDelivery = {
              id: record?.id ?? id(),
              date: draft.date,
              litres: draft.litres === '' ? NaN : Number(draft.litres),
              total: draft.total === '' ? NaN : Number(draft.total),
              note: draft.note,
              ...(draft.unitPence !== '' ? { unitPence: Number(draft.unitPence) } : {}),
            };
            submit({
              ...project,
              oil: {
                ...project.oil,
                deliveries: record
                  ? project.oil.deliveries.map((x) => (x.id === record.id ? next : x))
                  : [...project.oil.deliveries, next],
              },
            });
          }}
        >
          Save delivery
        </button>
      </div>
    </Modal>
  );
}
export function LoanEditor({
  project,
  record,
  onSave,
  onClose,
}: {
  project: Project;
  record?: Loan;
  onSave: Update;
  onClose: () => void;
}) {
  const [draft, set] = useState({
    name: record?.name ?? '',
    installationIds: record?.installationIds ?? [],
    startDate: record?.startDate ?? '',
    principal: record ? String(record.principal) : '',
    annualRate: record ? String(record.annualRate * 100) : '',
    rateConvention: record?.rateConvention ?? 'nominal',
    monthlyPayment: record ? String(record.monthlyPayment) : '',
    paymentProvenance: record?.paymentProvenance ?? 'entered',
    term: record?.originalTermMonths ? String(record.originalTermMonths) : '',
    firstPaymentDate: record?.firstPaymentDate ?? '',
    paymentDay: record ? String(record.paymentDay) : '',
    fees: record ? String(record.fees) : '0',
    anchorDate: record?.anchor?.date ?? '',
    anchorBalance: record?.anchor ? String(record.anchor.balance) : '',
    anchorNote: record?.anchor?.note ?? '',
  });
  const { error, submit, setError } = useForm(project, onSave, onClose);
  return (
    <Modal title={record ? 'Edit loan' : 'Add fixed-rate loan'} onClose={onClose}>
      <p className="small muted">
        Monthly interest on each opening balance is an approximation, not a lender-exact
        daily-interest quote. Overpayments shorten the term while contractual repayments stay
        unchanged.
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="field-grid two">
        <Field
          label="Loan name"
          type="text"
          value={draft.name}
          onChange={(v) => set({ ...draft, name: v })}
        />
        <Field
          label="Drawdown / start date"
          type="date"
          value={draft.startDate}
          onChange={(v) => set({ ...draft, startDate: v })}
        />
        <Field
          label="Original principal (£)"
          value={draft.principal}
          min={0}
          onChange={(v) => set({ ...draft, principal: v })}
        />
        <Field
          label="Fixed annual interest rate (%)"
          value={draft.annualRate}
          min={0}
          onChange={(v) => set({ ...draft, annualRate: v })}
        />
        <Select
          label="Rate convention"
          value={draft.rateConvention}
          options={[
            { value: 'nominal', label: 'Nominal annual interest' },
            { value: 'effective', label: 'Effective annual interest' },
            { value: 'apr-approximation', label: 'APR — labelled approximation' },
          ]}
          onChange={(v) => set({ ...draft, rateConvention: v as Loan['rateConvention'] })}
        />
        <Field
          label="Contractual monthly payment (£)"
          value={draft.monthlyPayment}
          min={0}
          onChange={(v) => set({ ...draft, monthlyPayment: v, paymentProvenance: 'entered' })}
        />
        <Field
          label="First repayment date"
          type="date"
          value={draft.firstPaymentDate}
          onChange={(v) => set({ ...draft, firstPaymentDate: v })}
        />
        <Field
          label="Payment day of month"
          value={draft.paymentDay}
          min={1}
          max={31}
          step="1"
          onChange={(v) => set({ ...draft, paymentDay: v })}
        />
        <Field
          label="Original loan term (months, optional)"
          value={draft.term}
          min={1}
          max={1200}
          step="1"
          onChange={(v) => set({ ...draft, term: v })}
        />
        <Field
          label="Separate finance fees (£)"
          value={draft.fees}
          min={0}
          onChange={(v) => set({ ...draft, fees: v })}
        />
      </div>
      <div style={{ marginTop: 15 }}>
        <button
          className="button secondary tiny"
          onClick={() => {
            try {
              if (!draft.principal || !draft.annualRate || !draft.term)
                throw new Error('Enter principal, annual rate and term to calculate an estimate.');
              const estimate = estimatedMonthlyPayment(
                Number(draft.principal),
                Number(draft.annualRate) / 100,
                draft.rateConvention,
                Number(draft.term),
              );
              set({
                ...draft,
                monthlyPayment: estimate.toFixed(2),
                paymentProvenance: 'estimated',
              });
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Calculate estimated monthly payment
        </button>
        <p className="small muted">
          Payment provenance: {draft.paymentProvenance}. A calculated estimate must be checked
          against your lender's contractual payment.
        </p>
      </div>
      <div className="divider" />
      <h3>Linked installation funding</h3>
      {project.installations
        .filter((x) => x.type !== 'ev')
        .map((x) => (
          <label className="checkbox" key={x.id}>
            <input
              type="checkbox"
              checked={draft.installationIds.includes(x.id)}
              onChange={(e) =>
                set({
                  ...draft,
                  installationIds: e.target.checked
                    ? [...draft.installationIds, x.id]
                    : draft.installationIds.filter((y) => y !== x.id),
                })
              }
            />
            {installationNames[x.type]} · {x.date}
          </label>
        ))}
      {!project.installations.length && (
        <p className="small muted">
          Add an installation first. Loans must link to at least one invoice.
        </p>
      )}
      <div className="divider" />
      <h3>Optional statement balance anchor</h3>
      <p className="small muted">
        Keep the original loan records and record why the statement adjustment is needed.
      </p>
      <div className="field-grid two">
        <Field
          label="Statement date"
          type="date"
          value={draft.anchorDate}
          onChange={(v) => set({ ...draft, anchorDate: v })}
        />
        <Field
          label="Statement principal balance (£)"
          value={draft.anchorBalance}
          min={0}
          onChange={(v) => set({ ...draft, anchorBalance: v })}
        />
        <Field
          label="Adjustment provenance / note"
          type="text"
          value={draft.anchorNote}
          onChange={(v) => set({ ...draft, anchorNote: v })}
        />
      </div>
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() => {
            const num = (s: string) => (s === '' ? NaN : Number(s));
            const next: Loan = {
              id: record?.id ?? id(),
              name: draft.name,
              installationIds: draft.installationIds,
              startDate: draft.startDate,
              principal: num(draft.principal),
              annualRate: num(draft.annualRate) / 100,
              rateConvention: draft.rateConvention,
              monthlyPayment: num(draft.monthlyPayment),
              paymentProvenance: draft.paymentProvenance as Loan['paymentProvenance'],
              ...(draft.term ? { originalTermMonths: num(draft.term) } : {}),
              firstPaymentDate: draft.firstPaymentDate,
              paymentDay: num(draft.paymentDay),
              fees: num(draft.fees),
              overpayments: record?.overpayments ?? [],
              ...(draft.anchorDate || draft.anchorBalance
                ? {
                    anchor: {
                      date: draft.anchorDate,
                      balance: num(draft.anchorBalance),
                      note: draft.anchorNote,
                    },
                  }
                : {}),
            };
            try {
              loanSchedule(next);
              submit({
                ...project,
                loans: record
                  ? project.loans.map((x) => (x.id === record.id ? next : x))
                  : [...project.loans, next],
              });
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Save loan
        </button>
      </div>
    </Modal>
  );
}
export function OverpaymentEditor({
  project,
  loan,
  onSave,
  onClose,
}: {
  project: Project;
  loan: Loan;
  onSave: Update;
  onClose: () => void;
}) {
  const [draft, set] = useState({ date: '', amount: '', kind: 'planned' as Overpayment['kind'] });
  const { error, submit, setError } = useForm(project, onSave, onClose);
  return (
    <Modal title="Add overpayment" onClose={onClose}>
      <p className="small muted">
        For {loan.name}. Actual and planned amounts are kept separate. Any requested amount above
        the remaining debt is capped and flagged by the schedule.
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="field-grid two">
        <Field
          label="Date"
          type="date"
          value={draft.date}
          onChange={(v) => set({ ...draft, date: v })}
        />
        <Field
          label="Amount (£)"
          value={draft.amount}
          min={0}
          onChange={(v) => set({ ...draft, amount: v })}
        />
        <Select
          label="Status"
          value={draft.kind}
          options={[
            { value: 'planned', label: 'Planned' },
            { value: 'actual', label: 'Actual' },
          ]}
          onChange={(v) => set({ ...draft, kind: v as Overpayment['kind'] })}
        />
      </div>
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() =>
            submit({
              ...project,
              loans: project.loans.map((x) =>
                x.id === loan.id
                  ? {
                      ...x,
                      overpayments: [
                        ...x.overpayments,
                        {
                          id: id(),
                          date: draft.date,
                          amount: draft.amount === '' ? NaN : Number(draft.amount),
                          kind: draft.kind,
                        },
                      ],
                    }
                  : x,
              ),
            })
          }
        >
          Save overpayment
        </button>
      </div>
    </Modal>
  );
}
export function BillEditor({
  project,
  onSave,
  onClose,
}: {
  project: Project;
  onSave: Update;
  onClose: () => void;
}) {
  const [draft, set] = useState({
    start: '',
    end: '',
    amount: '',
    component: 'import' as BillOverride['component'],
    note: '',
  });
  const { error, submit, setError } = useForm(project, onSave, onClose);
  return (
    <Modal title="Reconcile a bill period" onClose={onClose}>
      <p className="small muted">
        Use import energy charges including standing charges, or export credits, never direct-debit
        payments or account balances. The override replaces the matching reconstructed component for
        this exact period. Period end is exclusive.
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="field-grid two">
        <Field
          label="Bill period start"
          type="date"
          value={draft.start}
          onChange={(v) => set({ ...draft, start: v })}
        />
        <Field
          label="Bill period end (exclusive)"
          type="date"
          value={draft.end}
          onChange={(v) => set({ ...draft, end: v })}
        />
        <Select
          label="Component"
          value={draft.component}
          options={[
            { value: 'import', label: 'Import energy and standing charges' },
            { value: 'export', label: 'Export credit' },
          ]}
          onChange={(v) => set({ ...draft, component: v as BillOverride['component'] })}
        />
        <Field
          label="Bill component amount (£)"
          value={draft.amount}
          onChange={(v) => set({ ...draft, amount: v })}
        />
        <Field
          label="Bill source / note"
          type="text"
          value={draft.note}
          onChange={(v) => set({ ...draft, note: v })}
        />
      </div>
      <p className="small muted">
        Enter export credits as a positive credit. Overlapping corrections for the same component
        are rejected.
      </p>
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() =>
            submit({
              ...project,
              overrides: [
                ...project.overrides,
                {
                  id: id(),
                  start: draft.start,
                  end: draft.end,
                  amount: draft.amount === '' ? NaN : Number(draft.amount),
                  component: draft.component,
                  note: draft.note,
                },
              ],
            })
          }
        >
          Save bill reconciliation
        </button>
      </div>
    </Modal>
  );
}
