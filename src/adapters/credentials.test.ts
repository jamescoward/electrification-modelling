import { describe, it, expect, vi, afterEach } from 'vitest';
import { readApiKey, saveApiKey, forgetApiKey } from './credentials';
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('separate credential lifetime', () => {
  it('defaults to session storage and remembers only when explicitly requested', () => {
    const session = storage(),
      local = storage();
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('localStorage', local);
    saveApiKey('synthetic-key');
    expect(readApiKey()).toBe('synthetic-key');
    vi.stubGlobal('sessionStorage', storage());
    expect(readApiKey()).toBeNull();
    saveApiKey('synthetic-remembered', true);
    vi.stubGlobal('sessionStorage', storage());
    expect(readApiKey()).toBe('synthetic-remembered');
    saveApiKey('synthetic-session');
    vi.stubGlobal('sessionStorage', storage());
    expect(readApiKey()).toBeNull();
    forgetApiKey();
    expect(readApiKey()).toBeNull();
  });
});
