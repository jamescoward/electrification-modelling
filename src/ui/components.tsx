import { useEffect, useRef, useState, type ReactNode } from 'react';
export const currency = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 2,
      }).format(value);
export const compactCurrency = (value: number | null | undefined) =>
  value == null
    ? 'Needs inputs'
    : new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        maximumFractionDigits: 0,
      }).format(value);
export const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(value);
export const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const monthLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(value.slice(0, 7) + '-01T12:00:00Z'),
      )
    : 'Not reached';
export const id = () => crypto.randomUUID();
export function Icon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    inputs: 'M4 5h16 M4 12h16 M4 19h16 M8 2v6 M16 9v6 M10 16v6',
    energy: 'M13 2L4 14h7l-1 8 10-13h-7z',
    loans: 'M3 7h18v14H3z M3 7l9-5 9 5 M7 10v7 M12 10v7 M17 10v7',
    data: 'M4 5c0-4 16-4 16 0s-16 4-16 0 M4 5v14c0 4 16 4 16 0V5 M4 12c0 4 16 4 16 0',
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d={paths[kind] || paths.dashboard} />
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <svg viewBox="0 0 38 38" fill="none" aria-hidden="true">
        <rect width="38" height="38" rx="11" fill="currentColor" />
        <path
          d="M9 24l9-14v10h11l-9 10V20H9"
          stroke="#fffef9"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        Home Current<small>Energy & investment</small>
      </div>
    </div>
  );
}
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'card ' + className}>
      {title && (
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Field({
  label,
  value,
  onChange,
  type = 'number',
  help,
  min,
  max,
  step = 'any',
  required = false,
}: {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  type?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: string;
  required?: boolean;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => setDraft(value == null ? '' : String(value)), [value]);
  return (
    <label className="field">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={draft}
        min={min}
        max={max}
        step={step}
        placeholder={type === 'date' ? undefined : 'Not entered'}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
      />
      {help && <small>{help}</small>}
    </label>
  );
}
export function Numeric({
  label,
  value,
  onChange,
  help,
  min,
  max,
  scale = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  help?: string;
  min?: number;
  max?: number;
  scale?: number;
}) {
  return (
    <Field
      label={label}
      value={value == null ? null : value * scale}
      min={min}
      max={max}
      help={help}
      onChange={(s) => onChange(s === '' ? null : Number(s) / scale)}
    />
  );
}
export function DateField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  help?: string;
}) {
  return (
    <Field
      type="date"
      label={label}
      value={value}
      onChange={(s) => onChange(s || null)}
      help={help}
    />
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  help?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>
      {help && <small>{help}</small>}
    </label>
  );
}
export function Weights({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [draft, setDraft] = useState(value.map((x) => String(Number((x * 100).toFixed(8)))));
  useEffect(() => setDraft(value.map((x) => String(Number((x * 100).toFixed(8))))), [value]);
  const parsed = draft.map((x) => (x === '' ? NaN : Number(x) / 100)),
    sum = parsed.reduce((a, b) => a + b, 0);
  const valid = parsed.every((x) => Number.isFinite(x) && x >= 0) && Math.abs(sum - 1) < 1e-8;
  const dirty = draft.some((x, i) => Math.abs(Number(x) / 100 - value[i]) > 1e-10 || x === '');
  return (
    <div>
      <h3>{label}</h3>
      <div className="weights">
        {months.map((m, i) => (
          <Field
            key={m}
            label={m + ' %'}
            value={draft[i]}
            min={0}
            max={100}
            onChange={(v) => {
              const next = [...draft];
              next[i] = v;
              setDraft(next);
            }}
          />
        ))}
      </div>
      <p className={'weights-note ' + (!valid ? 'negative' : '')}>
        Total {number(sum * 100, 2)}%. Must equal 100%.{' '}
        {dirty ? 'Draft allocation has not been applied.' : 'Applied allocation.'}
      </p>
      <button
        className="button secondary tiny"
        disabled={!valid || !dirty}
        onClick={() => onChange(parsed)}
      >
        Apply allocation
      </button>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={'notice ' + (error ? 'error' : '')} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,a[href],[tabindex="0"]',
          ) || [],
        ).filter((el) => !el.hasAttribute('disabled'));
        if (!nodes.length) {
          e.preventDefault();
          return;
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="dialog-overlay">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog"
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
export function LineChart({
  points,
  series,
  label,
}: {
  points: { label: string; [key: string]: string | number | null }[];
  series: { key: string; label: string; color: string; dash?: boolean }[];
  label: string;
}) {
  const width = 680,
    height = 255,
    pad = { l: 58, r: 15, t: 13, b: 35 };
  const all = points.flatMap((p) =>
    series.map((s) => p[s.key]).filter((v): v is number => typeof v === 'number'),
  );
  if (!all.length)
    return (
      <Empty title="Your projection will appear here">
        Complete the required inputs to calculate this chart.
      </Empty>
    );
  let min = Math.min(0, ...all),
    max = Math.max(0, ...all);
  if (min === max) max = min + 1;
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (width - pad.l - pad.r),
    y = (n: number) => pad.t + ((max - n) / (max - min)) * (height - pad.t - pad.b);
  const transition = points.findIndex((p) => p.phase === 'forecast');
  const path = (key: string) => {
    let nextMove = true;
    return points
      .map((p, i) => {
        const v = p[key];
        if (typeof v !== 'number') {
          nextMove = true;
          return '';
        }
        const command = nextMove ? 'M' : 'L';
        nextMove = false;
        return `${command}${x(i)},${y(v)}`;
      })
      .join(' ');
  };
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        {Array.from({ length: 5 }, (_, i) => {
          const v = min + (i / 4) * (max - min);
          return (
            <g key={i}>
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="#e8ece3" />
              <text x={pad.l - 10} y={y(v) + 4} textAnchor="end">
                {new Intl.NumberFormat('en-GB', {
                  style: 'currency',
                  currency: 'GBP',
                  notation: 'compact',
                  maximumFractionDigits: 0,
                }).format(v)}
              </text>
            </g>
          );
        })}
        {points.map(
          (p, i) =>
            (i === 0 ||
              i === points.length - 1 ||
              i % Math.max(1, Math.ceil(points.length / 5)) === 0) && (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle">
                {p.label}
              </text>
            ),
        )}
        {transition > 0 && (
          <g>
            <line
              x1={x(transition)}
              x2={x(transition)}
              y1={pad.t}
              y2={height - pad.b}
              stroke="#9da992"
              strokeDasharray="3 5"
            />
            <text x={x(transition) + 5} y={pad.t + 11}>
              Forecast →
            </text>
          </g>
        )}
        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.key)}
            stroke={s.color}
            strokeWidth="2.5"
            fill="none"
            strokeDasharray={s.dash ? '5 5' : undefined}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.key}>
            <i className="legend-line" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <details className="details">
        <summary>Chart data table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Phase</th>
                {series.map((s) => (
                  <th className="num" key={s.key}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{p.label}</td>
                  <td>
                    {p.phase === 'forecast'
                      ? 'Forecast'
                      : p.phase === 'historical'
                        ? 'Historical'
                        : 'Schedule'}
                  </td>
                  {series.map((s) => (
                    <td className="num" key={s.key}>
                      {typeof p[s.key] === 'number' ? currency(p[s.key] as number) : 'Incomplete'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
