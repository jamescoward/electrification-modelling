import { indexedDB, IDBObjectStore } from 'fake-indexeddb';
import { describe, it, expect, vi } from 'vitest';
import { IndexedDbRepository, RevisionConflictError } from './repository';
import { emptyProject } from '../domain/project';
const repository = () => new IndexedDbRepository(`synthetic-${crypto.randomUUID()}`, indexedDB);
describe('transactional persistence', () => {
  it('persists across reopening and keeps demo separate', async () => {
    const repo = repository();
    const p = await repo.save(emptyProject(), 0);
    await repo.save(emptyProject('demo'), 0);
    await repo.close();
    expect(await repo.load('household')).toEqual(p);
    await repo.clear('demo');
    expect(await repo.load('household')).toEqual(p);
    expect(await repo.load('demo')).toBeNull();
  });
  it('rejects multi-tab stale writes and atomically snapshots backup replacement', async () => {
    const repo = repository();
    const first = await repo.save(emptyProject(), 0);
    const renamed = { ...first, name: 'Restored synthetic' };
    const results = await Promise.allSettled([
      repo.save({ ...first, name: 'First tab' }, first.revision),
      repo.save({ ...first, name: 'Second tab' }, first.revision),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason,
    ).toBeInstanceOf(RevisionConflictError);
    const before = (await repo.load('household'))!;
    const restored = await repo.replace(renamed, before.revision);
    expect(restored.revision).toBe(before.revision + 1);
    const snapshots = await repo.snapshots('household');
    expect(snapshots[0].project).toEqual(before);
    const recovered = await repo.recover(snapshots[0].id, restored.revision);
    expect(recovered.name).toEqual(before.name);
  });
  it('leaves usable data intact after invalid imports and failed writes', async () => {
    const repo = repository();
    const original = await repo.save(emptyProject(), 0);
    await expect(
      repo.replace({ ...original, cars: { ...original.cars, mpg: 0 } }, 1),
    ).rejects.toThrow();
    expect(await repo.load('household')).toEqual(original);
    expect(await repo.snapshots('household')).toEqual([]);
  });
  it('rolls back the project and its snapshot when a quota error aborts replacement', async () => {
    const repo = repository();
    const original = await repo.save(emptyProject(), 0);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    });
    await expect(repo.replace({ ...original, name: 'Must not persist' }, 1)).rejects.toThrow(
      /quota/,
    );
    put.mockRestore();
    expect(await repo.load('household')).toEqual(original);
    expect(await repo.snapshots('household')).toEqual([]);
  });
  it('rejects stale destructive clearing from another tab', async () => {
    const repo = repository();
    const initial = await repo.save(emptyProject(), 0);
    const updated = await repo.save({ ...initial, name: 'Newer tab' }, initial.revision);
    await expect(repo.clear('household', initial.revision)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    expect(await repo.load('household')).toEqual(updated);
    await repo.clear('household', updated.revision);
    expect(await repo.load('household')).toBeNull();
  });
  it('recovers a valid local snapshot when current data fails schema validation', async () => {
    const name = `synthetic-corruption-${crypto.randomUUID()}`,
      repo = new IndexedDbRepository(name, indexedDB);
    const original = await repo.save(emptyProject(), 0);
    const updated = await repo.replace({ ...original, name: 'Later inputs' }, original.revision);
    const originalSnapshot = (await repo.snapshots('household'))[0];
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({ ...updated, schemaVersion: 999, revision: 5 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(repo.load('household')).rejects.toThrow(/validation/);
    expect(await repo.currentRevision('household')).toBe(5);
    await expect(repo.recover(originalSnapshot.id, 0)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    const recovered = await repo.recover(
      originalSnapshot.id,
      await repo.currentRevision('household'),
    );
    expect(recovered.revision).toBe(6);
    expect(recovered.name).toBe(original.name);
    expect(await repo.load('household')).toEqual(recovered);
    const snapshots = await repo.snapshots('household');
    expect(snapshots.find((s) => s.id === originalSnapshot.id)).toEqual(originalSnapshot);
    const corruptSnapshot = snapshots.find((s) => s.project.schemaVersion !== 1)!;
    await expect(repo.recover(corruptSnapshot.id, recovered.revision)).rejects.toThrow();
    expect(await repo.load('household')).toEqual(recovered);
  });
});
