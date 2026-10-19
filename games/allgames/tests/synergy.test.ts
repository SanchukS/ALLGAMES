import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHarvestSynergy, isBloodSynergy } from '../src/synergy';
import { makeItem } from '../src/items';

const awakened = (def: string) => ({ ...makeItem('weapon', def, 0, 5), awakened: true });

test('harvest synergy requires two equipped awakened level-five weapons, in either order', () => {
  const sword = awakened('sword'), hammer = awakened('hammer');
  assert.equal(isHarvestSynergy([sword, hammer]), true);
  assert.equal(isHarvestSynergy([hammer, sword]), true);
  for (const pair of [[sword, null], [null, hammer], [sword, sword], [hammer, hammer],
    [sword, awakened('dagger')], [awakened('reaper'), hammer],
    [{ ...sword, awakened: false }, hammer], [sword, { ...hammer, awakened: false }],
    [{ ...sword, lvl: 4 }, hammer], [sword, { ...hammer, lvl: 4 }],
    [{ ...sword, lvl: NaN }, hammer], [sword, { ...hammer, lvl: 6 }],
  ]) assert.equal(isHarvestSynergy(pair), false);
  assert.equal(isHarvestSynergy([sword, hammer, null]), false);
  assert.equal(isHarvestSynergy([]), false);
});

test('harvest synergy does not mutate equipment or remain active after changing one weapon', () => {
  const weapons = [awakened('sword'), awakened('hammer')];
  const before = structuredClone(weapons);
  assert.equal(isHarvestSynergy(weapons), true);
  assert.deepEqual(weapons, before);
  weapons[1] = awakened('dagger');
  assert.equal(isHarvestSynergy(weapons), false);
});


test('blood synergy requires awakened level-five sword and reaper in either equipped slot', () => {
  const sword = awakened('sword'), reaper = awakened('reaper');
  assert.equal(isBloodSynergy([sword, reaper]), true);
  assert.equal(isBloodSynergy([reaper, sword]), true);
  for (const pair of [[sword, null], [undefined, reaper], [sword, sword], [reaper, reaper],
    [sword, awakened('hammer')], [awakened('dagger'), reaper],
    [{ ...sword, awakened: false }, reaper], [sword, { ...reaper, awakened: false }],
    [{ ...sword, lvl: 4 }, reaper], [sword, { ...reaper, lvl: 4 }],
    [{ ...sword, lvl: NaN }, reaper], [sword, { ...reaper, lvl: 6 }],
  ]) assert.equal(isBloodSynergy(pair), false);
  assert.equal(isBloodSynergy([sword, reaper, null]), false);
  assert.equal(isBloodSynergy([]), false);
});

test('blood and harvest synergies are mutually exclusive and follow current equipment without mutation', () => {
  const weapons = [awakened('sword'), awakened('reaper')];
  const before = structuredClone(weapons);
  assert.equal(isBloodSynergy(weapons), true);
  assert.equal(isHarvestSynergy(weapons), false);
  assert.deepEqual(weapons, before);
  weapons[1] = awakened('hammer');
  assert.equal(isBloodSynergy(weapons), false);
  assert.equal(isHarvestSynergy(weapons), true);
  weapons[1] = awakened('dagger');
  assert.equal(isBloodSynergy(weapons), false);
  assert.equal(isHarvestSynergy(weapons), false);
});
