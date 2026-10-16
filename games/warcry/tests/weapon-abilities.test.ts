import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AttackGesture } from '../src/attackGesture';
import { AbilityCharges, daggerHit, planWeaponAttack } from '../src/weaponAbilities';

const gesture = (patch: Partial<AttackGesture> = {}): AttackGesture => ({
  yaw: 0.4, heldSeconds: 0.1, sweepCount: 0, sweepYaw: 1.2, leap: false, distance: 0.5, aimed: true, ...patch,
});

test('sword unlocks a centered sweep at level 2 and double sweep at level 3', () => {
  const g = gesture({ sweepCount: 2 });
  assert.equal(planWeaponAttack('sword', 1, g, true, true)?.kind, 'normal');
  assert.equal(planWeaponAttack('sword', 2, g, true, true)?.kind, 'sweep');
  const double = planWeaponAttack('sword', 3, g, true, true)!;
  assert.equal(double.kind, 'doubleSweep');
  assert.equal(double.yaw, g.sweepYaw);
  assert.equal(double.damageScale, 1);
  assert.equal(planWeaponAttack('sword', 5, g, false, true)?.kind, 'normal');
  assert.equal(planWeaponAttack('sword', 5, gesture({ aimed: false, sweepCount: 2 }), true, true), null);
});

test('hammer partial charging, upgrade speed and cap use area rather than radius', () => {
  const g = gesture({ heldSeconds: 1, aimed: false });
  assert.equal(planWeaponAttack('hammer', 1, g, true, true), null);
  assert.equal(planWeaponAttack('hammer', 2, gesture({ heldSeconds: 0.34, aimed: false }), true, true), null);
  const charge = planWeaponAttack('hammer', 2, g, true, true)!;
  assert.equal(charge.kind, 'charge');
  assert.equal(charge.damageScale, 1.5);
  assert.equal(charge.areaScale, 1.5);
  assert.equal(planWeaponAttack('hammer', 3, gesture({ heldSeconds: 1.5 }), true, true)?.areaScale, 2);
  assert.equal(planWeaponAttack('hammer', 2, gesture({ heldSeconds: 100 }), true, true)?.damageScale, 2);
  assert.equal(planWeaponAttack('hammer', 5, g, false, true), null);
});

test('hammer leap has priority, level gating and bounded target distance', () => {
  const g = gesture({ leap: true, heldSeconds: 2, distance: 0.5 });
  assert.equal(planWeaponAttack('hammer', 3, g, true, true)?.kind, 'charge');
  const leap = planWeaponAttack('hammer', 4, g, true, true)!;
  assert.equal(leap.kind, 'leap');
  assert.equal(leap.areaScale, 1.5);
  assert.equal(leap.damageScale, 1.5);
  assert.equal(leap.distance, 0.5);
  assert.equal(planWeaponAttack('hammer', 5, g, true, false)?.kind, 'charge');
  assert.equal(planWeaponAttack('hammer', 5, gesture({ leap: true, distance: 20 }), true, true)?.damageScale, 2);
  assert.equal(planWeaponAttack('hammer', 5, gesture({ leap: true, distance: -2 }), true, true)?.distance, 0);
});

test('ability cooldowns require exactly three explicitly reported normal hits', () => {
  const charges = new AbilityCharges();
  charges.use(0);
  charges.normalHit();
  charges.use(1);
  assert.deepEqual(charges.remaining, [2, 3]);
  planWeaponAttack('sword', 5, gesture({ sweepCount: 1 }), false, false);
  assert.deepEqual(charges.remaining, [2, 3]);
  charges.normalHit(); charges.normalHit();
  assert.deepEqual(charges.remaining, [0, 1]);
  charges.normalHit(); charges.normalHit();
  assert.deepEqual(charges.remaining, [0, 0]);
  charges.use(0); charges.reset();
  assert.deepEqual(charges.remaining, [0, 0]);
});

test('dagger unlocks per-target stacking and triggers exactly each tenth stack', () => {
  assert.deepEqual(daggerHit(9, 1), { stacks: 0, damageMultiplier: 1, finisherMultiplier: 0 });
  assert.deepEqual(daggerHit(0, 2), { stacks: 1, damageMultiplier: 1, finisherMultiplier: 0 });
  assert.equal(daggerHit(10, 2).damageMultiplier, 1.5);
  assert.equal(daggerHit(10, 3).damageMultiplier, 1.8);
  assert.equal(daggerHit(9, 3).finisherMultiplier, 0);
  assert.equal(daggerHit(9, 4).finisherMultiplier, 1);
  assert.equal(daggerHit(19, 4).finisherMultiplier, 2);
  assert.equal(daggerHit(9, 5).finisherMultiplier, 1.5);
  assert.equal(daggerHit(19, 5).finisherMultiplier, 3);
  assert.equal(daggerHit(10, 5).finisherMultiplier, 0);
});
