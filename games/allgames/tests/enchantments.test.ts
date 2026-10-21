import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BleedEffects, CHAOS_OUTCOMES, ENCHANTMENTS, normalizeEnchantments, rollEnchantments } from '../src/enchantments';

test('enchantment save normalization validates, deduplicates, copies and caps at three', () => {
  const input = ['bad', null, { id: 'bleed', chance: NaN }, { id: 'bleed', chance: Infinity },
    { id: 'bleed', chance: -.1 }, { id: 'bleed', chance: 1.1 }, { id: 'bleed', chance: '1' },
    { id: '__proto__' }, { id: 'toString' }, { id: 'bleed', chance: 0, extra: 'discard' },
    'bleed', 'heal', { id: 'shield', chance: 1 }, 'chaos'];
  assert.deepEqual(normalizeEnchantments(input), [{ id: 'bleed', chance: 0 }, { id: 'heal' }, { id: 'shield', chance: 1 }]);
  assert.deepEqual(normalizeEnchantments(undefined), []);
  assert.deepEqual(normalizeEnchantments({ id: 'bleed' }), []);
});

test('rolls respect zero, one, exact probability boundary and catalog defaults', () => {
  assert.deepEqual(rollEnchantments([{ id: 'bleed', chance: 0 }], () => 0), []);
  assert.deepEqual(rollEnchantments([{ id: 'bleed', chance: 1 }], () => .999999), ['bleed']);
  assert.deepEqual(rollEnchantments([{ id: 'heal' }], () => ENCHANTMENTS.heal.chance), []);
  assert.deepEqual(rollEnchantments([{ id: 'heal' }], () => ENCHANTMENTS.heal.chance - .00001), ['heal']);
});

test('chaos covers eleven uniformly partitioned outcomes without a second chance check', () => {
  assert.equal(CHAOS_OUTCOMES.length, 11);
  assert.equal(new Set(CHAOS_OUTCOMES).size, 11);
  CHAOS_OUTCOMES.forEach((outcome, index) => {
    const values = [0, (index + .5) / 11];
    assert.deepEqual(rollEnchantments([{ id: 'chaos', chance: 1 }], () => values.shift()!), [outcome]);
    assert.equal(values.length, 0);
  });
  const values = [0, 0, 0];
  assert.deepEqual(rollEnchantments([{ id: 'bleed', chance: 1 }, { id: 'chaos', chance: 1 }], () => values.shift()!), ['bleed', 'bleed']);
});

test('bleeding ticks exactly three times including expiry, with no recursive roll', () => {
  const bleeds = new BleedEffects<object>(), target = {}, hits: number[] = [];
  bleeds.apply(target, 100);
  bleeds.update(.5, () => true, (_, damage) => hits.push(damage));
  assert.deepEqual(hits, []);
  bleeds.update(5, () => true, (_, damage) => hits.push(damage));
  assert.deepEqual(hits, [25, 25, 25]);
  assert.equal(bleeds.count, 0);
});

test('bleeding refresh retains strongest damage and next tick, removes dead targets', () => {
  const bleeds = new BleedEffects<object>(), target = {}, hits: number[] = [];
  const hit = (_: object, damage: number) => hits.push(damage);
  bleeds.apply(target, 100);
  bleeds.update(.75, () => true, hit);
  bleeds.apply(target, 20);
  bleeds.update(.25, () => true, hit);
  assert.deepEqual(hits, [25]);
  bleeds.apply(target, 200);
  bleeds.update(1, () => true, hit);
  assert.deepEqual(hits, [25, 50]);
  bleeds.update(1, () => false, hit);
  assert.equal(bleeds.count, 0);
  bleeds.apply(target, 10); bleeds.clear(); assert.equal(bleeds.count, 0);
});
