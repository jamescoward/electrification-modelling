const KEY = 'household-energy-payback:octopus-api-key';
/** Keys are separate from Project and every backup path. Remembering is explicit, not encryption. */
export function readApiKey(): string | null {
  return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
}
export function saveApiKey(key: string, remember = false): void {
  if (!key.trim()) {
    forgetApiKey();
    return;
  }
  // Commit the selected storage before removing the previous binding so failure is visible.
  if (remember) {
    localStorage.setItem(KEY, key.trim());
    sessionStorage.removeItem(KEY);
  } else {
    sessionStorage.setItem(KEY, key.trim());
    localStorage.removeItem(KEY);
  }
}
export function forgetApiKey(): void {
  sessionStorage.removeItem(KEY);
  localStorage.removeItem(KEY);
}
