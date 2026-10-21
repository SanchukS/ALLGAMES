import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BleedEffects } from '../src/enchantments';
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0,
  getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
}) } });
const { Game } = await import('../src/game');
const noop = () => {};
function enemy(x = 0, z = 1) {
  return { pos: new THREE.Vector3(x, 0, z), hp: 10000, radius: .1,
    hittable: true, passive: false, alive: true, immune: false };
}
function setup(entries: unknown[] = []) {
  const g: any = Object.create(Game.prototype);
  const item: any = { def: 'sword', uid: 1, lvl: 5, enchantments: entries };
  const calls: { target: any; damage: number; fx: string }[] = [];
  const saves: number[] = [];
  Object.assign(g, {
    save: { weapons: [item, null] }, hero: { position: new THREE.Vector3(), facing: 0, hit: noop },
    scene: new THREE.Scene(), mobs: [], time: 10, hp: 900, dead: false, cut: false,
    enchantBleeds: new BleedEffects(), enchantBuffs: new Map(), enchantBolts: [],
    enchantShieldUntil: 0, enchantStunUntil: 0, enchantShield: null, parries: new WeakMap(),
    waves: { add: noop }, particles: { burst: noop }, fx: { spawn: noop },
    ui: { hurtFlash: noop }, heroBar: { el: { offsetHeight: 0 } }, heroScale: 1,
    itemDamage: () => 100, guardMul: () => 1, lightningVisual: noop,
    persist: () => saves.push(1), refreshHud: noop,
    damageMob: (target: any, damage: number, _tier: string, _knock: number, fx = '') => {
      if (target.immune || fx === 'miss' || damage <= 0) return;
      target.hp -= damage; calls.push({ target, damage, fx });
    },
  });
  Object.defineProperty(g, 'stats', { value: { maxHp: 1000, dodge: 0, defense: 0 } });
  return { g, item, calls, saves };
}
function withRandom(values: number[], run: () => void) {
  const original = Math.random; let index = 0;
  Math.random = () => values[index++] ?? .5;
  try { run(); } finally { Math.random = original; }
  return index;
}

test('each weapon-damaged target independently rolls its enchantment', () => {
  const { g, item, calls } = setup([{ id: 'lightning', chance: .5 }]);
  const a = enemy(), b = enemy(1); g.mobs = [a, b];
  const rolls = withRandom([.1, .9], () => {
    g.weaponHit(item, a, 100, 'normal', 0, '');
    g.weaponHit(item, b, 100, 'normal', 0, '');
  });
  assert.equal(rolls, 2);
  assert.deepEqual(calls.map(c => [c.target === a ? 'a' : 'b', c.damage]), [['a', 100], ['a', 120], ['b', 100]]);
});

test('misses, zero damage, immune, passive and unhittable targets do not apply effects', () => {
  for (const mode of ['miss', 'zero', 'immune', 'passive', 'unhittable']) {
    const { g, item } = setup([{ id: 'heal', chance: 1 }, { id: 'bleed', chance: 1 }]);
    const target = enemy();
    target.immune = mode === 'immune'; target.passive = mode === 'passive'; target.hittable = mode !== 'unhittable';
    g.weaponHit(item, target, mode === 'zero' ? 0 : 100, 'normal', 0, mode === 'miss' ? 'miss' : '');
    assert.equal(g.hp, 900, mode);
    assert.equal(g.enchantBleeds.count, 0, mode);
  }
});

test('explosions, lightning and bleed ticks bypass enchantment rolls', () => {
  const { g, item, calls } = setup([{ id: 'explosion', chance: 1 }, { id: 'bleed', chance: 1 }]);
  const a = enemy(), b = enemy(1), outside = enemy(10), passive = enemy(.5); passive.passive = true;
  g.mobs = [a, b, outside, passive];
  const rolls = withRandom([0, 0], () => {
    g.weaponHit(item, a, 100, 'normal', 0, '');
    g.updateEnchantments(3);
  });
  assert.equal(rolls, 2);
  assert.deepEqual(calls.map(c => c.damage), [100, 75, 75, 25, 25, 25]);
  assert.equal(calls.filter(c => c.target === b).length, 1);
  assert.equal(outside.hp, 10000); assert.equal(passive.hp, 10000);
});

test('critical upgrades only the original noncritical damage, including duplicate chaos critical', () => {
  const { g, item, calls } = setup([{ id: 'critical', chance: 1 }, { id: 'chaos', chance: 1 }]);
  const target = enemy();
  withRandom([0, 0, 4.5 / 11], () => g.weaponHit(item, target, 100, 'normal', 0, ''));
  assert.equal(calls[0].damage, 200); assert.equal(calls[0].fx, 'crit');
  withRandom([0, 0, 4.5 / 11], () => g.weaponHit(item, target, 200, 'normal', 0, 'crit'));
  assert.equal(calls[1].damage, 200);
});

test('healing is capped at max HP and a shield blocks one direct hit before expiring', () => {
  const { g, item } = setup([{ id: 'heal', chance: 1 }, { id: 'shield', chance: 1 }]);
  const target = enemy();
  g.hp = 990; g.weaponHit(item, target, 100, 'normal', 0, '');
  assert.equal(g.hp, 1000); assert.equal(g.enchantShieldUntil, 18);
  withRandom([], () => {
    g.hurtHero(100, target.pos);
    assert.equal(g.hp, 1000); assert.equal(g.enchantShieldUntil, 0);
    g.hurtHero(100, target.pos);
    assert.equal(g.hp, 900);
    g.applyEnchantment('shield', target, 100, 0);
    g.time = 18; g.hurtHero(100, target.pos);
    assert.equal(g.hp, 800);
  });
});

test('chain lightning visits at most four unique hostile targets within each jump range', () => {
  const { g, item, calls } = setup([{ id: 'chainLightning', chance: 1 }]);
  const chain = [enemy(0), enemy(3), enemy(6), enemy(9), enemy(12)];
  const passive = enemy(1), dead = enemy(2); passive.passive = true; dead.hittable = false;
  g.mobs = [...chain, passive, dead];
  g.weaponHit(item, chain[0], 100, 'normal', 0, '');
  assert.deepEqual(calls.map(c => c.damage), [100, 80, 80, 80, 80]);
  assert.equal(new Set(calls.slice(1).map(c => c.target)).size, 4);
  assert.equal(chain[4].hp, 10000); assert.equal(passive.hp, 10000); assert.equal(dead.hp, 10000);
  const second = setup([{ id: 'chainLightning', chance: 1 }]);
  const far = enemy(5); second.g.mobs = [chain[0], far];
  second.g.weaponHit(second.item, chain[0], 100, 'normal', 0, '');
  assert.equal(far.hp, 10000); assert.equal(second.calls.length, 2);
});

test('console setter rejects the whole edit atomically, accepts valid entries and can clear', () => {
  const { g, item, saves } = setup([{ id: 'heal' }]);
  const original = item.enchantments;
  for (const entries of [null, ['missing'], ['heal', 'heal'], ['heal', 'bleed', 'shield', 'critical'], [{ id: 'heal', chance: NaN }], [{ id: 'heal', chance: 2 }]]) {
    assert.throws(() => g.setWeaponEnchantments(0, entries));
    assert.equal(item.enchantments, original); assert.equal(saves.length, 0);
  }
  assert.throws(() => g.setWeaponEnchantments(1, ['heal']));
  assert.throws(() => g.setWeaponEnchantments(2, ['heal']));
  g.setWeaponEnchantments(0, ['bleed', { id: 'chaos', chance: 1 }]);
  assert.deepEqual(item.enchantments, [{ id: 'bleed' }, { id: 'chaos', chance: 1 }]);
  g.setWeaponEnchantments(0, []); assert.deepEqual(item.enchantments, []); assert.equal(saves.length, 2);
});

test('chaos enemy buffs refresh without stacking, affect movement/damage and expire', () => {
  const { g } = setup();
  const target: any = enemy(0, 0);
  Object.assign(target, { ch: { facing: 0, stride: 1 }, def: { crit: 0, critDmg: 0 }, stun: 0, slow: 0 });
  g.shieldAnswer = noop; g.fightOf = () => ({ taken: 0 });
  g.applyEnchantment('empowerEnemy', target, 100, 0);
  g.applyEnchantment('hasteEnemy', target, 100, 0);
  assert.deepEqual(g.enchantBuffs.get(target), { power: 15, speed: 15 });
  g.time = 12;
  g.applyEnchantment('empowerEnemy', target, 100, 0);
  g.applyEnchantment('hasteEnemy', target, 100, 0);
  assert.deepEqual(g.enchantBuffs.get(target), { power: 17, speed: 17 });
  g.stepTo(target, new THREE.Vector3(10, 0, 0), 2, 1);
  assert.equal(target.pos.x, 3); assert.equal(target.ch.walkRate, 3);
  withRandom([], () => g.hurtHero(100, target.pos, target));
  assert.equal(g.hp, 750);
  g.time = 17;
  g.stepTo(target, new THREE.Vector3(10, 0, 0), 2, 1);
  assert.equal(target.pos.x, 5); assert.equal(target.ch.walkRate, 2);
  withRandom([], () => g.hurtHero(100, target.pos, target));
  assert.equal(g.hp, 650);
  g.updateEnchantments(0); assert.equal(g.enchantBuffs.size, 0);
});

test('chaos self-stun cancels input, previews and both hands queued attacks for one second', () => {
  const { g } = setup(); let resets = 0, hides = 0;
  g.input = { reset: () => resets++ };
  g.attackPreviews = [0, 1].map(() => ({ hide: () => hides++ }));
  g.hands = [0, 1].map(() => ({ impact: .1, second: .5, launch: .2 }));
  g.leap = { active: true }; g.enchantLeap = { active: true }; g.hero.position.y = 2;
  g.applyEnchantment('selfStun', enemy(), 100, 0);
  assert.equal(g.enchantStunUntil, 11); assert.equal(resets, 1); assert.equal(hides, 2);
  for (const hand of g.hands) assert.deepEqual(hand, { impact: -1, second: -1, launch: -1 });
  assert.equal(g.leap, null); assert.equal(g.enchantLeap, null); assert.equal(g.hero.position.y, 0);
});

test('chaos leap uses attack direction and collision-aware target; existing leaps are preserved', () => {
  const { g } = setup(); const requests: number[][] = [];
  const destination = new THREE.Vector3(2, 0, 2);
  g.leapTarget = (...args: number[]) => { requests.push(args); return destination; };
  g.hero.position.set(1, 1, 1);
  g.applyEnchantment('leap', enemy(), 100, 1.2);
  assert.deepEqual(requests, [[1.2, 3 / 7, 5]]);
  assert.equal(g.enchantLeap.to, destination); assert.deepEqual(g.enchantLeap.from.toArray(), [1, 0, 1]);
  const first = g.enchantLeap;
  g.applyEnchantment('leap', enemy(), 100, -1);
  assert.equal(g.enchantLeap, first); assert.equal(requests.length, 1);
  g.enchantLeap = null;
  const hammerLeap = { active: true }; g.leap = hammerLeap;
  g.applyEnchantment('leap', enemy(), 100, -1);
  assert.equal(g.enchantLeap, null); assert.equal(g.leap, hammerLeap); assert.equal(requests.length, 1);
});
