import type { Project } from '../domain/types';
import { validateProject } from './backup';

export class RevisionConflictError extends Error {
  constructor() {
    super('Another tab saved newer changes. Reload before editing to avoid overwriting them.');
    this.name = 'RevisionConflictError';
  }
}
export interface LocalSnapshot {
  id: number;
  createdAt: string;
  reason: string;
  project: Project;
}
/** This database is app-namespaced, not origin-isolated from other Pages repositories. */
export class IndexedDbRepository {
  private db?: Promise<IDBDatabase>;
  constructor(
    private name = 'household-energy-payback-v1',
    private factory: IDBFactory = globalThis.indexedDB,
  ) {}
  private open(): Promise<IDBDatabase> {
    if (!this.factory)
      return Promise.reject(new Error('Browser storage is unavailable. Changes cannot be saved.'));
    if (!this.db)
      this.db = new Promise((resolve, reject) => {
        const req = this.factory.open(this.name, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('projects', { keyPath: 'mode' });
          const snapshots = db.createObjectStore('snapshots', {
            keyPath: 'id',
            autoIncrement: true,
          });
          snapshots.createIndex('mode', 'project.mode');
        };
        req.onerror = () => {
          this.db = undefined;
          reject(req.error);
        };
        req.onblocked = () => {
          this.db = undefined;
          reject(new Error('Close other tabs to allow browser storage to open.'));
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => {
            req.result.close();
            this.db = undefined;
          };
          resolve(req.result);
        };
      });
    return this.db;
  }
  async load(mode: Project['mode']): Promise<Project | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').get(mode);
      let result: Project | null = null;
      request.onsuccess = () => {
        try {
          result = request.result ? validateProject(request.result) : null;
        } catch (error) {
          reject(
            new Error(
              `Saved data failed validation. Use local recovery or a portable backup. ${String(error)}`,
            ),
          );
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Read aborted'));
    });
  }
  /** Recovery can inspect concurrency metadata even when the full saved schema is unusable.
   * This does not validate the project or authorise normal edits to corrupt data. */
  async currentRevision(mode: Project['mode']): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').get(mode);
      let revision = 0;
      request.onsuccess = () => {
        if (request.result === undefined) return;
        const value: unknown = request.result?.revision;
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
          reject(
            new Error(
              'Saved revision metadata is invalid. Recover using a portable backup after deliberate local-data clearing.',
            ),
          );
          return;
        }
        revision = value;
      };
      tx.oncomplete = () => resolve(revision);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Recovery metadata read aborted'));
    });
  }
  private async write(
    project: Project,
    expectedRevision: number,
    reason?: string,
  ): Promise<Project> {
    const valid = validateProject(project);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'snapshots'], 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.get(valid.mode);
      let result: Project;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const current = request.result as Project | undefined;
          if ((current?.revision ?? 0) !== expectedRevision) throw new RevisionConflictError();
          if (current && reason)
            tx.objectStore('snapshots').add({
              createdAt: new Date().toISOString(),
              reason,
              project: current,
            });
          result = { ...valid, revision: expectedRevision + 1 };
          store.put(result);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(failure ?? tx.error);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error('Save failed; changes have not been saved.'));
    });
  }
  save(project: Project, expectedRevision: number): Promise<Project> {
    return this.write(project, expectedRevision);
  }
  replace(project: Project, expectedRevision: number): Promise<Project> {
    return this.write(project, expectedRevision, 'Before backup import');
  }
  async snapshots(mode: Project['mode']): Promise<LocalSnapshot[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const req = tx.objectStore('snapshots').index('mode').getAll(mode);
      tx.oncomplete = () => resolve(req.result as LocalSnapshot[]);
      tx.onerror = () => reject(tx.error);
    });
  }
  async recover(snapshotId: number, expectedRevision: number): Promise<Project> {
    const db = await this.open();
    const snapshot = await new Promise<LocalSnapshot | undefined>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const req = tx.objectStore('snapshots').get(snapshotId);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
    if (!snapshot) throw new Error('Recovery snapshot not found.');
    return this.write(validateProject(snapshot.project), expectedRevision, 'Before local recovery');
  }
  async clear(mode: Project['mode'], expectedRevision?: number): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'snapshots'], 'readwrite');
      let failure: unknown;
      const store = tx.objectStore('projects');
      const read = store.get(mode);
      read.onsuccess = () => {
        if (expectedRevision !== undefined && (read.result?.revision ?? 0) !== expectedRevision) {
          failure = new RevisionConflictError();
          tx.abort();
          return;
        }
        store.delete(mode);
        const cursor = tx.objectStore('snapshots').index('mode').openCursor(mode);
        cursor.onsuccess = () => {
          if (cursor.result) {
            cursor.result.delete();
            cursor.result.continue();
          }
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(failure ?? tx.error);
      tx.onabort = () => reject(failure ?? tx.error);
    });
  }
  async close(): Promise<void> {
    if (this.db) (await this.db).close();
    this.db = undefined;
  }
}

export async function requestPersistentStorage(): Promise<{
  supported: boolean;
  persisted: boolean;
}> {
  if (!globalThis.navigator?.storage?.persist) return { supported: false, persisted: false };
  return { supported: true, persisted: await navigator.storage.persist() };
}
