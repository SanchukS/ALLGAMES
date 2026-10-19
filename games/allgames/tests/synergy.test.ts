import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHarvestSynergy } from '../src/synergy';
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
