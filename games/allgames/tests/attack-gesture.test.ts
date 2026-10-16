import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttackGestureTracker } from '../src/attackGesture';
const rad = (d: number) => d * Math.PI / 180;
function arc(tracker: AttackGestureTracker, from: number, to: number, start: number, duration = 250) {
  for (let i = 0; i <= 10; i++) tracker.sample(rad(from + (to - from) * i / 10), 1, start + duration * i / 10);
}
test('fast sweep crosses angle wrap and uses arc midpoint, not release aim', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, 150, 270, 0);
  const shot = g.snapshot(250);
  assert.equal(shot.sweepCount, 1);
  assert.ok(Math.abs(shot.sweepYaw - rad(-150)) < 1e-6);
  assert.equal(shot.heldSeconds, .25);
});
test('reverse arc produces double slash in same region', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, -60, 60, 0); arc(g, 60, -60, 250);
  assert.equal(g.snapshot(500).sweepCount, 2);
  assert.ok(Math.abs(g.snapshot(500).sweepYaw) < 1e-6);
});
test('slow aim, small adjustment and full rotation do not count as sweeps', () => {
  for (const [angle, duration] of [[120, 1800], [45, 250], [360, 500]]) {
    const g = new AttackGestureTracker(); g.begin(0); arc(g, 0, angle, 0, duration);
    assert.equal(g.snapshot(duration).sweepCount, 0);
  }
});
test('crossing centre cancels slash but backward-forward gesture permits leap', () => {
  const g = new AttackGestureTracker(); g.begin(0, 0);
  g.sample(Math.PI, 1, 10); g.sample(Math.PI, 0, 100); g.sample(0, 1, 200);
  assert.equal(g.snapshot(200).leap, true);
  assert.equal(g.snapshot(200).sweepCount, 0);
});
test('leap requires known movement and quick reversal', () => {
  for (const [movement, end] of [[null, 200], [0, 900]] as const) {
    const g = new AttackGestureTracker(); g.begin(0, movement);
    g.sample(Math.PI, 1, 0); g.sample(0, 1, end);
    assert.equal(g.snapshot(end).leap, false);
  }
});
test('stationary hold exposes charge time, reset clears history', () => {
  const g = new AttackGestureTracker(); g.begin(100); g.sample(0, 0, 100);
  assert.equal(g.snapshot(2100).heldSeconds, 2);
  assert.equal(g.snapshot(2100).aimed, false);
  g.reset(); g.begin(3000);
  assert.equal(g.snapshot(3000).sweepCount, 0);
  assert.equal(g.snapshot(3000).leap, false);
});

test('double sweep recognition is independent of high pointer sample frequency', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  for (let i = 0; i <= 120; i++) g.sample(rad(-60 + i), 1, i * 2);
  for (let i = 0; i <= 120; i++) g.sample(rad(60 - i), 1, 240 + i * 2);
  assert.equal(g.snapshot(480).sweepCount, 2);
});

test('expired leap attempt can rearm within the same held gesture', () => {
  const g = new AttackGestureTracker(); g.begin(0, 0);
  g.sample(Math.PI, 1, 0); g.sample(0, 1, 900);
  assert.equal(g.snapshot(900).leap, false);
  g.sample(Math.PI, 1, 1000); g.sample(0, 1, 1150);
  assert.equal(g.snapshot(1150).leap, true);
});
