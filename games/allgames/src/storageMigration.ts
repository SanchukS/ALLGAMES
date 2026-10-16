/** Preserve progress from the previous prototype name. Never overwrite newer saves. */
export function migrateStorage(storage: Storage) {
  const oldPrefix = 'warcry-';
  for (let i = storage.length - 1; i >= 0; i--) {
    const oldKey = storage.key(i);
    if (!oldKey?.startsWith(oldPrefix)) continue;
    const newKey = 'allgames-' + oldKey.slice(oldPrefix.length);
    const value = storage.getItem(oldKey);
    if (value !== null && storage.getItem(newKey) === null) storage.setItem(newKey, value);
    storage.removeItem(oldKey);
  }
}

try { migrateStorage(localStorage); } catch { /* unavailable or full storage: retry on the next load */ }
