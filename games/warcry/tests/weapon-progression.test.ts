import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newSave, loadSave, writeSave } from '../src/save';
import { weaponDamage, normalizeItem, makeItem, itemLines } from '../src/items';
import { weaponLevel } from '../src/weaponProgression';

const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });

test('new game gives all three test weapons at level one', () => {
  for (const faction of ['human', 'orc'] as const) {
    const save = newSave(faction);
    const items = [save.weapons[0]!, ...save.bag];
    assert.deepEqual(items.map((it) => it.def), ['sword', 'hammer', 'dagger']);
    assert.ok(items.every((it) => it.lvl === 1));
  }
});

test('weapon damage is a percentage of character damage, independent of rarity, level and sharpening', () => {
  for (const [def, expected] of [['sword', 60], ['dagger', 36], ['hammer', 108]] as const) {
    for (const rarity of [0, 5]) for (const level of [1, 5]) {
      const item = makeItem('weapon', def, rarity, level);
      item.sharpen = 10;
      assert.equal(weaponDamage(item, 10, 2), expected);
      assert.ok(itemLines(item).some(([label, value]) => label === 'Урон' && value.includes('% урона персонажа')));
      assert.ok(!itemLines(item).some(([label]) => label === 'Тип'));
    }
  }
});

test('levels clamp to 1–5; only a level-five awakening survives normalization', () => {
  assert.equal(weaponLevel({ lvl: -2 }), 1);
  assert.equal(weaponLevel({ lvl: NaN }), 1);
  assert.equal(weaponLevel({ lvl: 100 }), 5);
  assert.equal(weaponLevel({ lvl: 3.9 }), 3);
  const item = makeItem('weapon', 'sword', 0, 100);
  assert.equal(item.lvl, 5);
  assert.equal(normalizeItem({ ...item, awakened: true }).awakened, true);
  assert.equal(normalizeItem({ ...item, lvl: 4, awakened: true }).awakened, undefined);
});

test('legacy weapon save migrates without resetting progress and restores missing test weapons', () => {
  const save = newSave('human');
  save.weapons[0]!.def = 'axe';
  save.weapons[0]!.lvl = 100;
  save.kills = 42;
  save.bag = [];
  writeSave(save);
  const loaded = loadSave()!;
  assert.equal(loaded.weapons[0]!.def, 'hammer');
  assert.equal(loaded.weapons[0]!.lvl, 5);
  assert.equal(loaded.kills, 42);
  assert.ok(loaded.bag.some((it) => it.def === 'sword'));
  assert.ok(loaded.bag.some((it) => it.def === 'dagger'));
  writeSave(loaded);
  assert.equal(loadSave()!.bag.length, loaded.bag.length, 'reloading must not duplicate starter weapons');
});

test('legacy mage returns to warrior while preserving its separate equipment', () => {
  const save = newSave('human');
  save.cls = 'mage'; save.kit = 'mage'; save.classes = ['mage'];
  save.weapons = [makeItem('weapon', 'staff_fire', 0, 1), null];
  writeSave(save);
  const loaded = loadSave()!;
  assert.equal(loaded.cls, 'warrior');
  assert.equal(loaded.weapons[0]!.def, 'sword');
  assert.equal(loaded.kits!.mage![0]!.def, 'staff_fire');
});

test('awakened weapon round-trips through the persisted save', () => {
  const save = newSave('human');
  save.weapons[0]!.lvl = 5;
  save.weapons[0]!.awakened = true;
  writeSave(save);
  assert.equal(loadSave()!.weapons[0]!.awakened, true);
});
