import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, SourceCache } from '../domain/types';
import { emptyProject } from '../domain/project';
import { demoProject } from '../application/demo';
import { projectModel } from '../application/model';
import { validateProject } from '../adapters/backup';
import { IndexedDbRepository, RevisionConflictError } from '../adapters/repository';
import { Dashboard } from './Dashboard';
import { Inputs } from './Inputs';
import { Energy } from './Energy';
import { Loans } from './Loans';
import { Data } from './Data';
import { Brand, Icon, Notice, Modal } from './components';
import { errorText } from './EntityEditors';
const pages = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'inputs', label: 'Inputs', icon: 'inputs' },
  { id: 'energy', label: 'Energy', icon: 'energy' },
  { id: 'loans', label: 'Loans', icon: 'loans' },
  { id: 'data', label: 'Data & backup', icon: 'data' },
];
const pageFromHash = () => {
  const value = location.hash.slice(1);
  return pages.some((p) => p.id === value) ? value : 'overview';
};
const repo = new IndexedDbRepository();
const readMode = (): Project['mode'] => {
  try {
    return localStorage.getItem('home-current:mode') === 'demo' ? 'demo' : 'household';
  } catch {
    return 'household';
  }
};
export function App() {
  const [page, setPageState] = useState(pageFromHash),
    [mode, setMode] = useState<Project['mode']>(readMode),
    [project, setProject] = useState<Project>(() => emptyProject()),
    [loaded, setLoaded] = useState(false),
    [status, setStatus] = useState('Loading saved inputs…'),
    [error, setError] = useState(''),
    [changeCount, setChangeCount] = useState(0),
    [externalBusy, setExternalBusy] = useState(false),
    [unsavedMode, setUnsavedMode] = useState<Project['mode'] | null>(null);
  const projectRef = useRef(project),
    revision = useRef(0),
    generation = useRef(0),
    savedGeneration = useRef(0),
    writer = useRef<Promise<unknown>>(Promise.resolve()),
    conflict = useRef(false),
    activeMode = useRef(mode),
    loadingError = useRef(false),
    recoveryRevision = useRef<number | null>(null);
  useEffect(() => {
    const onHash = () => setPageState(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setPage = useCallback((p: string) => {
    location.hash = p;
    setPageState(p);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const installState = useCallback((p: Project) => {
    revision.current = p.revision;
    projectRef.current = p;
    setProject(p);
    generation.current++;
    savedGeneration.current = generation.current;
    setChangeCount(generation.current);
    setStatus('Saved on this browser');
    setError('');
    conflict.current = false;
    loadingError.current = false;
    recoveryRevision.current = p.revision;
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setStatus('Loading saved inputs…');
    activeMode.current = mode;
    try {
      localStorage.setItem('home-current:mode', mode);
    } catch {}
    void writer.current
      .catch(() => {})
      .then(async () => {
        try {
          const saved = await repo.load(mode);
          if (cancelled) return;
          let next = saved ?? (mode === 'demo' ? demoProject() : emptyProject());
          if (!saved && mode === 'demo') next = await repo.save(next, 0);
          if (cancelled) return;
          installState(next);
          if (!saved)
            setStatus(mode === 'demo' ? 'Synthetic demo · ready' : 'No household inputs entered');
          setLoaded(true);
        } catch (e) {
          if (cancelled) return;
          const next = emptyProject(mode);
          let knownRevision: number | null = null;
          let message = errorText(e);
          try {
            knownRevision = await repo.currentRevision(mode);
            next.revision = knownRevision;
          } catch (metadataError) {
            message += ' Recovery revision is unavailable: ' + errorText(metadataError);
          }
          if (cancelled) return;
          installState(next);
          loadingError.current = true;
          recoveryRevision.current = knownRevision;
          conflict.current = true;
          setError(message);
          setStatus('Saved data could not be opened');
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, installState]);
  const update = useCallback((next: Project) => {
    if (next.mode !== activeMode.current) return;
    projectRef.current = { ...next, revision: revision.current };
    setProject(projectRef.current);
    generation.current++;
    setChangeCount(generation.current);
    setStatus('Unsaved edits');
  }, []);
  const persist = useCallback((next: Project, gen: number) => {
    const requestedMode = next.mode;
    const task = async () => {
      if (activeMode.current !== requestedMode || savedGeneration.current >= gen) return;
      if (conflict.current) throw new RevisionConflictError();
      const valid = validateProject(next);
      setStatus('Saving…');
      const saved = await repo.save({ ...valid, revision: revision.current }, revision.current);
      revision.current = saved.revision;
      projectRef.current = { ...projectRef.current, revision: saved.revision };
      setProject((current) => ({ ...current, revision: saved.revision }));
      savedGeneration.current = Math.max(savedGeneration.current, gen);
      if (gen === generation.current) {
        setStatus('Saved on this browser');
        setError('');
      }
    };
    const operation = writer.current.catch(() => {}).then(task);
    writer.current = operation;
    return operation.catch((e) => {
      if (e instanceof RevisionConflictError) conflict.current = true;
      setStatus('Changes not saved');
      setError(errorText(e));
      throw e;
    });
  }, []);
  useEffect(() => {
    if (!loaded || generation.current === savedGeneration.current || conflict.current) return;
    const gen = generation.current,
      snapshot = projectRef.current;
    try {
      validateProject(snapshot);
    } catch (e) {
      setStatus('Changes not saved');
      setError(errorText(e));
      return;
    }
    setStatus('Saving…');
    const timer = setTimeout(() => {
      void persist(snapshot, gen).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [changeCount, loaded, persist]);
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (generation.current !== savedGeneration.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);
  const onCache = useCallback(
    async (cache: SourceCache) => {
      const next = { ...projectRef.current, cache };
      update(next);
      await persist(next, generation.current);
    },
    [update, persist],
  );
  const replace = useCallback(
    (next: Project) => {
      const operation = writer.current
        .catch(() => {})
        .then(async () => {
          if (conflict.current && !(loadingError.current && recoveryRevision.current !== null))
            throw new RevisionConflictError();
          const saved = await repo.replace(
            { ...next, revision: revision.current },
            revision.current,
          );
          installState(saved);
        });
      writer.current = operation;
      return operation;
    },
    [installState],
  );
  const clear = useCallback(() => {
    const operation = writer.current
      .catch(() => {})
      .then(async () => {
        if (loadingError.current && recoveryRevision.current === null)
          throw new Error(
            'Cannot safely clear data without valid stored revision metadata. Original data has been preserved.',
          );
        await repo.clear(activeMode.current, revision.current);
        installState(emptyProject(activeMode.current));
        setStatus('Local project cleared');
      });
    writer.current = operation;
    return operation;
  }, [installState]);
  const recover = useCallback(
    (id: number) => {
      const operation = writer.current
        .catch(() => {})
        .then(async () => {
          const expectedRevision = loadingError.current
            ? recoveryRevision.current
            : revision.current;
          if (expectedRevision === null)
            throw new Error(
              'Cannot recover this snapshot without valid stored revision metadata. Original data has been preserved.',
            );
          const saved = await repo.recover(id, expectedRevision);
          installState(saved);
        });
      writer.current = operation;
      return operation;
    },
    [installState],
  );
  const reload = () => {
    void repo
      .load(mode)
      .then((p) => {
        installState(p ?? emptyProject(mode));
        setLoaded(true);
      })
      .catch((e) => setError(errorText(e)));
  };
  const switchMode = async (next: Project['mode']) => {
    if (next === mode) return;
    if (generation.current !== savedGeneration.current) {
      try {
        validateProject(projectRef.current);
      } catch {
        setUnsavedMode(next);
        return;
      }
      setExternalBusy(true);
      try {
        while (generation.current !== savedGeneration.current) {
          const snapshot = projectRef.current,
            gen = generation.current;
          validateProject(snapshot);
          await persist(snapshot, gen);
        }
        setMode(next);
      } catch {
        setUnsavedMode(next);
      } finally {
        setExternalBusy(false);
      }
    } else setMode(next);
  };
  const model = useMemo(() => {
    try {
      validateProject(project);
      return projectModel(project);
    } catch {
      return {
        ...projectModel(emptyProject(mode)),
        missing: ['Correct the unsaved validation errors to calculate your model.'],
        warnings: [],
      };
    }
  }, [
    project.occupancyDate,
    project.installations,
    project.loans,
    project.baseline,
    project.oil,
    project.cars,
    project.heating,
    project.forecast,
    project.overrides,
    project.cache,
    mode,
  ]);
  const busy = externalBusy || !loaded;
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? 'active' : ''}
              aria-current={page === p.id ? 'page' : undefined}
              onClick={() => setPage(p.id)}
            >
              <Icon kind={p.icon} />
              {p.label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <p>
            <span className="dot" />
            Private by design
            <br />
            Saved on your browser.
            <br />
            No account. No cloud database.
          </p>
          <div className="mode-label">Explore with your own inputs</div>
          <div className="mode-switch" aria-label="Project mode">
            <button
              className={mode === 'household' ? 'active' : ''}
              disabled={busy}
              onClick={() => switchMode('household')}
            >
              My household
            </button>
            <button
              className={mode === 'demo' ? 'active' : ''}
              disabled={busy}
              onClick={() => switchMode('demo')}
            >
              Synthetic demo
            </button>
          </div>
          <p className="small" style={{ marginTop: 14 }}>
            Household and demo data are saved separately.
          </p>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <span>
            {project.name}{' '}
            <span className="muted">/ {pages.find((p) => p.id === page)?.label}</span>
          </span>
          <div className="topbar-right">
            <span role="status" aria-live="polite">
              <span
                className="dot"
                style={{ background: status.includes('not saved') ? '#a25742' : undefined }}
              />
              {status}
            </span>
            <span>GBP · Europe/London</span>
          </div>
        </div>
        {error && (
          <Notice error>
            {error}
            <div className="actions" style={{ marginTop: 10 }}>
              {conflict.current ? (
                <button className="button secondary tiny" onClick={reload}>
                  Reload saved inputs
                </button>
              ) : (
                <button
                  className="button secondary tiny"
                  onClick={() =>
                    void persist(projectRef.current, generation.current).catch(() => {})
                  }
                >
                  Retry save
                </button>
              )}
              <button className="button secondary tiny" onClick={() => setPage('data')}>
                Backup & recovery
              </button>
            </div>
          </Notice>
        )}
        {mode === 'demo' && (
          <div className="demo-banner">
            <span>
              <strong>Synthetic demo.</strong> Every reading, bill and loan shown here is invented
              for testing. Your household stays separate.
            </span>
            <button
              className="button secondary tiny"
              disabled={busy}
              onClick={() => switchMode('household')}
            >
              Use my own household
            </button>
          </div>
        )}
        {loaded ? (
          <>
            {page === 'overview' && (
              <Dashboard project={project} model={model} onChange={update} setPage={setPage} />
            )}{' '}
            {page === 'inputs' && <Inputs project={project} onChange={update} setPage={setPage} />}{' '}
            {page === 'energy' && <Energy project={project} model={model} onChange={update} />}{' '}
            {page === 'loans' && <Loans project={project} model={model} onChange={update} />}{' '}
            {page === 'data' && (
              <Data
                project={project}
                onChange={update}
                onCache={onCache}
                repository={repo}
                onReplace={replace}
                onClear={clear}
                onRecover={recover}
                onBusy={setExternalBusy}
              />
            )}
          </>
        ) : (
          <div className="empty">Opening your local project…</div>
        )}
        <footer className="footer">
          <span>Home Current · Energy savings & simple payback · Explicit assumptions</span>
          <span>Local data · Backup before clearing site storage</span>
        </footer>
        {unsavedMode && (
          <Modal title="Unsaved changes" onClose={() => setUnsavedMode(null)}>
            <p>
              The current project has edits that have not been saved. You can remain here to correct
              them, or deliberately discard them before switching modes.
            </p>
            <div className="actions">
              <button className="button secondary" onClick={() => setUnsavedMode(null)}>
                Keep editing
              </button>
              <button
                className="button danger"
                onClick={() => {
                  const target = unsavedMode;
                  setUnsavedMode(null);
                  generation.current = savedGeneration.current;
                  setMode(target);
                }}
              >
                Discard unsaved edits & switch
              </button>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}
