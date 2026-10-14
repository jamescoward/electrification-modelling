import { useEffect, useState } from 'react';
import type { Project, SourceCache, MeterSelection, MonthlyProfile } from '../domain/types';
import {
  IndexedDbRepository,
  requestPersistentStorage,
  type LocalSnapshot,
} from '../adapters/repository';
import { readApiKey, saveApiKey, forgetApiKey } from '../adapters/credentials';
import { OctopusClient, type DiscoveredAccount } from '../adapters/octopus';
import { parseBackup, exportBackup } from '../adapters/backup';
import { MODEL_VERSION } from '../application/result';
import { buildBaseline, buildReferenceProfile } from '../application/sourceProfile';
import { Card, Field, Modal, Notice, Empty, number, currency } from './components';
import { errorText, type Update } from './EntityEditors';
const client = new OctopusClient();
export function Data({
  project: p,
  onChange,
  onCache,
  repository,
  onReplace,
  onClear,
  onRecover,
  onBusy,
}: {
  project: Project;
  onChange: Update;
  onCache: (cache: SourceCache) => Promise<void>;
  repository: IndexedDbRepository;
  onReplace: (p: Project) => Promise<void>;
  onClear: () => Promise<void>;
  onRecover: (id: number) => Promise<void>;
  onBusy: (value: boolean) => void;
}) {
  const [key, setKey] = useState(''),
    [remember, setRemember] = useState(false),
    [keyPresent, setKeyPresent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [discovered, setDiscovered] = useState<DiscoveredAccount | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [file, setFile] = useState<File | null>(null),
    [restore, setRestore] = useState<Project | null>(null),
    [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]),
    [clear, setClear] = useState(false),
    [full, setFull] = useState(false),
    [persistent, setPersistent] = useState('Not requested'),
    [profilePreview, setProfilePreview] = useState<MonthlyProfile[] | null>(null),
    [baselinePreview, setBaselinePreview] = useState<ReturnType<typeof buildBaseline> | null>(null),
    [manual, setManual] = useState(false),
    [manualSources, setManualSources] = useState(false),
    [manualText, setManualText] = useState('');
  useEffect(() => {
    try {
      setKeyPresent(Boolean(readApiKey()));
    } catch (e) {
      setError(errorText(e));
    }
    repository
      .snapshots(p.mode)
      .then(setSnapshots)
      .catch((e) => setError(errorText(e)));
    if (navigator.storage?.persisted)
      navigator.storage
        .persisted()
        .then((v) => {
          if (v) setPersistent('Granted');
        })
        .catch(() => {});
  }, [p.mode, repository]);
  const action = async (work: () => Promise<void>) => {
    setError('');
    setMessage('');
    setBusy(true);
    onBusy(true);
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const saveCredentials = () => {
    try {
      saveApiKey(key, remember);
      setKey('');
      setKeyPresent(Boolean(readApiKey()));
      setMessage(
        remember ? 'API key remembered on this browser.' : 'API key is available for this session.',
      );
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  };
  const requireKey = () => {
    const stored = readApiKey();
    if (!stored)
      throw new Error('Enter and save your API key first. It is session-only by default.');
    return stored;
  };
  const discover = () =>
    action(async () => {
      if (!p.connection.accountNumber.trim())
        throw new Error('Enter your Octopus account number first.');
      const result = await client.discover(p.connection.accountNumber.trim(), requireKey());
      setDiscovered(result);
      const importCount = result.meters.filter((m) => m.direction === 'import').length,
        exportCount = result.meters.filter((m) => m.direction === 'export').length;
      setSelected(importCount <= 1 && exportCount <= 1 ? result.meters.map((_, i) => i) : []);
      if (!result.meters.length)
        throw new Error(
          'No electricity meters were returned. Check the account or enter details manually.',
        );
      setMessage(
        'Discovery complete. Review the property/meter history and confirm the agreements before fetching readings.',
      );
    });
  const refresh = (all = false) =>
    action(async () => {
      const result = await client.refresh(p, requireKey(), { full: all, onProgress: onCache });
      if (result.cache.refreshStatus === 'incomplete')
        setError(
          result.cache.error ??
            'Refresh is incomplete. Good saved readings remain available; retry safely.',
        );
      else
        setMessage(
          'Refresh completed. Saved manual facts and model assumptions have been preserved.',
        );
    });
  const download = (all: boolean) => {
    try {
      const backup = exportBackup(p, all);
      const blob = new Blob([backup], { type: 'application/json' }),
        url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `home-current-${p.mode}-${all ? 'full' : 'inputs'}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onChange({ ...p, lastBackupAt: new Date().toISOString() });
      setMessage(
        'Backup downloaded without API credentials. Keep it somewhere separate from this browser.',
      );
      setError('');
    } catch (e) {
      setError(errorText(e));
    }
  };
  const preview = () =>
    action(async () => {
      if (!file) throw new Error('Choose a backup file first.');
      if (file.size > 40_000_000) throw new Error('The backup exceeds the 40 MB import limit.');
      setRestore(parseBackup(await file.text()));
    });
  const manualSave = () => {
    try {
      const parsed: unknown = JSON.parse(manualText);
      const wrapped = parseBackup(JSON.stringify({ ...p, cache: parsed }));
      onCache(wrapped.cache)
        .then(() => {
          setManualSources(false);
          setManualText('');
          setMessage('Manually imported source cache saved. Facts and assumptions were preserved.');
        })
        .catch((e) => setError(errorText(e)));
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">Local by design</div>
          <h1>Your data stays with you.</h1>
          <p>
            Connect Octopus, inspect your sources and keep a portable backup. Your key is separate
            from every exported file.
          </p>
        </div>
        <span className="pill">No app account or cloud database</span>
      </div>
      <Notice>
        Live Octopus browser access and account-specific tariff history remain unverified. Automated
        import is implemented, but direct access may be blocked by CORS or network policy.
        Intelligent Go extra cheap periods are not supported; reconcile reconstructed costs to your
        bills.
      </Notice>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <div className="grid-two">
        <Card
          title="Connect to Octopus"
          subtitle="Use your Octopus dashboard API key and account number."
        >
          <div className="field-grid two">
            <Field
              label="Octopus account number"
              type="text"
              value={p.connection.accountNumber}
              onChange={(v) =>
                onChange({ ...p, connection: { ...p.connection, accountNumber: v } })
              }
            />
            <Field
              label="Octopus API key"
              type="password"
              value={key}
              onChange={setKey}
              help={
                keyPresent
                  ? 'A key is available. Enter a new key to replace it.'
                  : 'No key saved. Default: this browser session only.'
              }
            />
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember API key on this browser
          </label>
          {remember && (
            <p className="small negative">
              Browser storage is not an encrypted credential vault. Other apps on the same hosting
              origin may access it. Only enable this on a trusted personal browser.
            </p>
          )}
          <div className="actions">
            <button className="button secondary" onClick={saveCredentials} disabled={busy || !key}>
              Save connection credentials
            </button>
            <button
              className="button secondary"
              onClick={() => {
                try {
                  forgetApiKey();
                  setKey('');
                  setKeyPresent(false);
                  setMessage('API key forgotten.');
                  setError('');
                } catch (e) {
                  setError(errorText(e));
                }
              }}
              disabled={busy}
            >
              Forget API key
            </button>
          </div>
          <div className="divider" />
          <div className="actions">
            <button className="button" disabled={busy} onClick={discover}>
              {busy ? 'Working…' : 'Discover meters & tariffs'}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setManual(true)}>
              Enter meter details manually
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 15, marginBottom: 0 }}>
            Requests go directly to api.octopus.energy with an authentication header. No key is
            added to URLs, backups, telemetry or public assets.
          </p>
        </Card>
        <Card
          title="Refresh your sources"
          subtitle="Explicit refresh leaves entered facts and assumptions unchanged."
        >
          <div className="row">
            <span>Selected meters</span>
            <strong>{p.connection.meters.length}</strong>
          </div>
          <div className="row">
            <span>Cached readings</span>
            <strong>{number(p.cache.intervals.length)}</strong>
          </div>
          <div className="row">
            <span>Source refresh</span>
            <strong>{p.cache.refreshStatus}</strong>
          </div>
          <div className="actions" style={{ marginTop: 20 }}>
            <button
              className="button"
              disabled={busy || !p.connection.meters.length}
              onClick={() => refresh(false)}
            >
              Refresh Octopus data
            </button>
            <button
              className="button secondary"
              disabled={busy || !p.connection.meters.length}
              onClick={() => setFull(true)}
            >
              Full refetch…
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 15 }}>
            An incremental refresh revisits the latest 30 days for corrections. Failed pages retain
            good saved data and a visible incomplete status. A full refetch is deliberate.
          </p>
          <button
            className="button secondary tiny"
            disabled={busy}
            onClick={() => setManualSources(true)}
          >
            Import source cache manually
          </button>
          <p className="small muted">
            Reconstruction assumes Direct Debit tariff rates. Confirm your payment method against
            bills.
          </p>
          <details className="details">
            <summary>Source endpoints ({p.cache.endpoints.length})</summary>
            <ul>
              {p.cache.endpoints.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
        </Card>
      </div>
      {discovered && (
        <Card
          title="Review discovered meters & agreements"
          subtitle={`${discovered.propertyCount} properties discovered. Select the applicable import/export meter history and confirm exact agreements.`}
        >
          <div className="stack">
            {discovered.meters.map((meter, i) => (
              <div className="entity" key={i}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(i)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? [...selected, i] : selected.filter((x) => x !== i),
                      )
                    }
                  />
                  <strong>
                    {meter.direction === 'import' ? 'Import' : 'Export'} · MPAN {meter.mpan} · meter{' '}
                    {meter.serial}
                  </strong>
                </label>
                <AgreementTable meters={[meter]} />
              </div>
            ))}
          </div>
          <button
            className="button"
            disabled={!selected.length || busy}
            onClick={() => {
              onChange({
                ...p,
                connection: { ...p.connection, meters: selected.map((i) => discovered.meters[i]) },
              });
              setDiscovered(null);
              setMessage(
                'Selected factual agreements confirmed. Hypothetical comparison prices have not changed.',
              );
            }}
          >
            Confirm selected meters & agreements
          </button>
        </Card>
      )}
      {p.connection.meters.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Card
            title="Confirmed meter & tariff history"
            subtitle="These factual agreements are separate from comparison and forecast assumptions."
          >
            <AgreementTable meters={p.connection.meters} />
          </Card>
        </div>
      )}
      <Card
        title="Build reference inputs from saved readings"
        subtitle="Review source-derived values before they replace any selected assumptions."
      >
        <p className="small muted">
          Choose reference dates in Inputs first. A baseline uses complete occupied pre-upgrade
          days. The forecast profile requires one complete seasonal year after solar/EV adoption and
          before heat-pump commissioning.
        </p>
        <div className="actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              try {
                if (!p.baseline.referenceStart || !p.baseline.referenceEnd)
                  throw new Error('Select baseline reference start and end dates in Inputs.');
                if (!p.occupancyDate)
                  throw new Error(
                    'Enter your exact occupancy date before deriving an occupied baseline.',
                  );
                const first = p.installations.map((x) => x.date).sort()[0];
                if (p.baseline.referenceStart < p.occupancyDate)
                  throw new Error('Baseline must begin after occupancy.');
                if (!first)
                  throw new Error(
                    'Enter the first upgrade commissioning date before deriving a pre-upgrade baseline.',
                  );
                if (p.baseline.referenceEnd > first)
                  throw new Error('Baseline must end before the first upgrade.');
                setBaselinePreview(
                  buildBaseline(p.cache, p.baseline.referenceStart, p.baseline.referenceEnd),
                );
                setError('');
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Preview measured baseline
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              try {
                const start = p.forecast.referenceStart,
                  end = p.forecast.referenceEnd;
                if (!start || !end)
                  throw new Error('Select forecast reference start and end dates in Inputs.');
                const heat = p.installations.find((x) => x.type === 'heat-pump')?.date;
                const solar = p.installations.find((x) => x.type === 'solar-battery')?.date;
                const ev = p.installations.find((x) => x.type === 'ev')?.date;
                if (heat && end > heat)
                  throw new Error('Reference must end before heat-pump commissioning.');
                if ((solar && start < solar) || (ev && start < ev))
                  throw new Error('Reference must begin after solar and EV adoption.');
                setProfilePreview(buildReferenceProfile(p.cache, start, end, p.forecast));
                setError('');
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Preview measured reference year
          </button>
        </div>
      </Card>
      <div style={{ height: 22 }} />
      <div className="grid-two">
        <Card
          title="Portable backup"
          subtitle="An occasional recovery action, not something you need on every visit."
        >
          <p className="small muted">
            Inputs export includes facts, assumptions and reconnection details. Full backup also
            includes readings and rates for reproducible historical results. API keys are excluded
            by construction.
          </p>
          <div className="actions">
            <button className="button" disabled={busy} onClick={() => download(false)}>
              Export inputs
            </button>
            <button className="button secondary" disabled={busy} onClick={() => download(true)}>
              Export full backup
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 15 }}>
            Last export:{' '}
            {p.lastBackupAt
              ? new Date(p.lastBackupAt).toLocaleDateString('en-GB')
              : 'No backup exported yet'}
            . Store personal backups securely outside the public repository.
          </p>
          <div className="divider" />
          <label className="field">
            <span>Choose backup file</span>
            <input
              className="file-input"
              type="file"
              accept=".json,application/json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button secondary" disabled={busy || !file} onClick={preview}>
            Preview restore
          </button>
          <p className="small muted" style={{ marginTop: 15, marginBottom: 0 }}>
            Restore is validated before replacement. An inputs-only restore requires your API key
            again to refetch sources; API corrections may change results.
          </p>
        </Card>
        <Card
          title="Browser storage & recovery"
          subtitle="Persistence helps with eviction; it is never a substitute for an exported backup."
        >
          <div className="row">
            <span>Model / input schema</span>
            <strong>
              {MODEL_VERSION} / {p.schemaVersion}
            </strong>
          </div>
          <div className="row">
            <span>Persistent storage</span>
            <strong>{persistent}</strong>
          </div>
          <button
            className="button secondary"
            style={{ marginTop: 14 }}
            disabled={busy}
            onClick={() =>
              action(async () => {
                const result = await requestPersistentStorage();
                setPersistent(
                  !result.supported
                    ? 'Not supported'
                    : result.persisted
                      ? 'Granted'
                      : 'Not granted',
                );
              })
            }
          >
            Request persistent storage
          </button>
          <p className="small muted" style={{ marginTop: 15 }}>
            Data is tied to this browser profile and hosting origin. Clearing site data or changing
            origins requires a backup. GitHub Pages repository paths do not isolate apps sharing an
            origin.
          </p>
          <details className="details">
            <summary>Local snapshots ({snapshots.length})</summary>
            <p className="small muted">
              Snapshots share the same browser storage and are not disaster-recovery backups. A
              snapshot is created before replacement.
            </p>
            {snapshots.length ? (
              snapshots.map((s) => (
                <div className="row" key={s.id}>
                  <div>
                    {s.reason}
                    <small>{new Date(s.createdAt).toLocaleString('en-GB')}</small>
                  </div>
                  <button
                    className="button secondary tiny"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await onRecover(s.id);
                        setMessage('Local snapshot recovered.');
                        setSnapshots(await repository.snapshots(p.mode));
                      })
                    }
                  >
                    Recover snapshot
                  </button>
                </div>
              ))
            ) : (
              <p className="small muted">No local recovery snapshots yet.</p>
            )}
          </details>
          <div className="divider" />
          <button className="button danger" disabled={busy} onClick={() => setClear(true)}>
            Clear {p.mode === 'demo' ? 'demo' : 'household'} data…
          </button>
        </Card>
      </div>
      {restore && (
        <Modal title="Review backup replacement" onClose={() => setRestore(null)}>
          <p className="small muted">
            This replaces the current {p.mode === 'demo' ? 'synthetic demo' : 'household'} project
            after an atomic pre-import snapshot. No merging occurs.
          </p>
          <div className="row">
            <span>Backup name</span>
            <strong>{restore.name}</strong>
          </div>
          <div className="row">
            <span>Original mode</span>
            <strong>{restore.mode}</strong>
          </div>
          <div className="row">
            <span>Installations / loans / oil deliveries</span>
            <strong>
              {restore.installations.length} / {restore.loans.length} /{' '}
              {restore.oil.deliveries.length}
            </strong>
          </div>
          <div className="row">
            <span>Cached readings / rates</span>
            <strong>
              {number(restore.cache.intervals.length)} / {number(restore.cache.rates.length)}
            </strong>
          </div>
          <div className="row">
            <span>Schema version</span>
            <strong>{restore.schemaVersion}</strong>
          </div>
          {restore.mode !== p.mode && (
            <Notice>
              Backup mode differs. Replacement stays in the currently selected {p.mode} storage,
              keeping the other mode separate.
            </Notice>
          )}
          <div className="actions">
            <button className="button secondary" onClick={() => setRestore(null)}>
              Cancel
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await onReplace({ ...restore, mode: p.mode, id: p.id });
                  forgetApiKey();
                  setKeyPresent(false);
                  setRestore(null);
                  setSnapshots(await repository.snapshots(p.mode));
                  setMessage(
                    'Backup restored atomically. Credentials were not imported; derived results have rebuilt.',
                  );
                })
              }
            >
              Confirm replace
            </button>
          </div>
        </Modal>
      )}
      {clear && (
        <Modal title="Clear local project data?" onClose={() => setClear(false)}>
          <p>
            Delete the {p.mode} inputs, cached readings and local recovery snapshots on this
            browser. The separate {p.mode === 'demo' ? 'household' : 'demo'} remains untouched.
          </p>
          <p className="small muted">
            Export a portable backup first if you need to recover this project. Stored Octopus
            credentials will also be forgotten.
          </p>
          <div className="actions">
            <button className="button secondary" onClick={() => setClear(false)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await onClear();
                  forgetApiKey();
                  setKeyPresent(false);
                  setSnapshots([]);
                  setClear(false);
                  setMessage('Local project data cleared.');
                })
              }
            >
              Confirm clear data
            </button>
          </div>
        </Modal>
      )}
      {full && (
        <Modal title="Full Octopus refetch" onClose={() => setFull(false)}>
          <p>
            Refetch from your occupancy date, retaining existing good records and all manual
            corrections. This can make many requests; incremental refresh is normally enough.
          </p>
          <div className="actions">
            <button className="button secondary" onClick={() => setFull(false)}>
              Cancel
            </button>
            <button
              className="button"
              onClick={() => {
                setFull(false);
                void refresh(true);
              }}
            >
              Confirm full refetch
            </button>
          </div>
        </Modal>
      )}
      {baselinePreview && (
        <Modal title="Review measured baseline" onClose={() => setBaselinePreview(null)}>
          <div className="row">
            <span>Complete occupied days</span>
            <strong>{baselinePreview.completeDays}</strong>
          </div>
          <div className="row">
            <span>Annualised electricity</span>
            <strong>{number(baselinePreview.annualKWh, 1)} kWh</strong>
          </div>
          {baselinePreview.notes.map((x) => (
            <p className="small muted" key={x}>
              {x}
            </p>
          ))}
          <p className="small muted">
            Confirm replaces the baseline annual kWh only. Tariff assumptions remain unchanged; a
            short reference is not a measured winter profile.
          </p>
          <div className="actions">
            <button className="button secondary" onClick={() => setBaselinePreview(null)}>
              Cancel
            </button>
            <button
              className="button"
              disabled={baselinePreview.annualKWh === null}
              onClick={() => {
                onChange({
                  ...p,
                  baseline: {
                    ...p.baseline,
                    annualKWh: baselinePreview.annualKWh,
                    provenance: 'api-derived',
                  },
                });
                setBaselinePreview(null);
              }}
            >
              Confirm measured baseline
            </button>
          </div>
        </Modal>
      )}
      {profilePreview && (
        <Modal title="Review measured reference year" onClose={() => setProfilePreview(null)}>
          <p className="small muted">
            Confirm replaces the twelve-month reference with source-derived kWh. Future prices and
            manual facts remain unchanged.
          </p>
          <div className="row">
            <span>Reference import</span>
            <strong>
              {number(
                profilePreview.reduce((s, x) => s + x.importKWh, 0),
                1,
              )}{' '}
              kWh
            </strong>
          </div>
          <div className="row">
            <span>Reference export</span>
            <strong>
              {number(
                profilePreview.reduce((s, x) => s + x.exportKWh, 0),
                1,
              )}{' '}
              kWh
            </strong>
          </div>
          <div className="actions">
            <button className="button secondary" onClick={() => setProfilePreview(null)}>
              Cancel
            </button>
            <button
              className="button"
              onClick={() => {
                onChange({
                  ...p,
                  forecast: { ...p.forecast, profile: profilePreview, referenceConfirmed: true },
                });
                setProfilePreview(null);
              }}
            >
              Confirm measured reference
            </button>
          </div>
        </Modal>
      )}
      {manualSources && (
        <Modal title="Import source cache manually" onClose={() => setManualSources(false)}>
          <p className="small muted">
            Paste a validated SourceCache JSON object containing intervals, rates, retrievedAt,
            endpoints and refreshStatus. This reusable fallback preserves facts and assumptions, but
            does not satisfy the pending automatic Octopus integration requirement.
          </p>
          <label className="field">
            <span>Source cache JSON</span>
            <textarea
              rows={10}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
            />
          </label>
          <p className="small muted">
            For the documented format, export a full backup and use its cache object. Never include
            credentials.
          </p>
          <div className="actions">
            <button className="button secondary" onClick={() => setManualSources(false)}>
              Cancel
            </button>
            <button className="button" onClick={manualSave}>
              Validate & import source cache
            </button>
          </div>
        </Modal>
      )}
      {manual && (
        <ManualMeterModal project={p} onSave={onChange} onClose={() => setManual(false)} />
      )}
    </>
  );
}
function AgreementTable({ meters }: { meters: MeterSelection[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Direction / meter</th>
            <th>Tariff code</th>
            <th>From (offset timestamp)</th>
            <th>Until (exclusive)</th>
          </tr>
        </thead>
        <tbody>
          {meters.flatMap((m) =>
            m.agreements.length
              ? m.agreements.map((a, i) => (
                  <tr key={`${m.serial}-${i}`}>
                    <td>
                      {m.direction} · {m.serial}
                    </td>
                    <td>{a.tariffCode}</td>
                    <td>{a.start}</td>
                    <td>{a.end ?? 'Ongoing'}</td>
                  </tr>
                ))
              : [
                  <tr key={m.serial}>
                    <td>
                      {m.direction} · {m.serial}
                    </td>
                    <td colSpan={3}>No agreements discovered — confirm manually.</td>
                  </tr>,
                ],
          )}
        </tbody>
      </table>
    </div>
  );
}
function ManualMeterModal({
  project: p,
  onSave,
  onClose,
}: {
  project: Project;
  onSave: Update;
  onClose: () => void;
}) {
  const [value, setValue] = useState(JSON.stringify(p.connection.meters, null, 2)),
    [error, setError] = useState('');
  return (
    <Modal title="Manual meter details" onClose={onClose}>
      <p className="small muted">
        Enter a JSON array of confirmed meter details. Each item needs mpan, serial, direction
        (import/export) and agreements with tariffCode, start and end (ISO offset timestamps; end
        may be null). This fallback does not establish live API access.
      </p>
      <label className="field">
        <span>Meter selection JSON</span>
        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={9} />
      </label>
      {error && <Notice error>{error}</Notice>}
      <div className="actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() => {
            try {
              const next = parseBackup(
                JSON.stringify({
                  ...p,
                  connection: { ...p.connection, meters: JSON.parse(value) },
                }),
              );
              onSave(next);
              onClose();
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Confirm manual meter details
        </button>
      </div>
    </Modal>
  );
}
