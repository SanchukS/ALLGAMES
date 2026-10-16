import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateStorage } from '../src/storageMigration';

test('renaming preserves progress, prologue and newer saves without resurrecting old data', () => {
  const data = new Map([
    ['warcry-save-v1', '{"hp":263}'], ['warcry-prologue', '{"power":2}'],
    ['warcry-balance-log', 'old'], ['allgames-balance-log', 'new'], ['other-app', 'keep'],
  ]);
  const storage = {
    get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  } as Storage;
  migrateStorage(storage);
  assert.equal(data.get('allgames-save-v1'), '{"hp":263}');
  assert.equal(data.get('allgames-prologue'), '{"power":2}');
  assert.equal(data.get('allgames-balance-log'), 'new');
  assert.equal(data.get('other-app'), 'keep');
  assert.ok([...data.keys()].every(key => !key.startsWith('warcry-')));
  data.delete('allgames-save-v1');
  migrateStorage(storage);
  assert.equal(data.has('allgames-save-v1'), false);
});
