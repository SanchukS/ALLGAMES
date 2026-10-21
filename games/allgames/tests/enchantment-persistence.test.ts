import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSave, newSave, writeSave } from '../src/save';
import { normalizeItem } from '../src/items';

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });

test('weapon enchantments survive save/load in either hand and in the bag independently', () => {
  const save = newSave('human');
  save.weapons[0]!.enchantments = [{ id: 'bleed' }, { id: 'critical', chance: 1 }];
  save.weapons[1]!.enchantments = [{ id: 'heal', chance: 0 }];
  save.bag[0].enchantments = [{ id: 'shield', chance: .37 }];
  writeSave(save);
  const loaded = loadSave()!;
  assert.ok(loaded);
  assert.deepEqual(loaded.weapons.map(it => it?.enchantments), save.weapons.map(it => it?.enchantments));
  assert.deepEqual(loaded.bag.find(it => it.uid === save.bag[0].uid)?.enchantments, save.bag[0].enchantments);
  assert.equal(loaded.weapons[0]!.uid, save.weapons[0]!.uid);
});

test('old items remain unenchanted, armour never acquires weapon enchantments', () => {
  assert.equal(normalizeItem({ def: 'sword' }).enchantments, undefined);
  assert.equal(normalizeItem({ kind: 'armor', def: 'ring_swift', enchantments: [{ id: 'critical' }] }).enchantments, undefined);
});
