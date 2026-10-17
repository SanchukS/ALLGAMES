import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttackGestureTracker } from '../src/attackGesture';
const rad = (d: number) => d * Math.PI / 180;
function arc(tracker: AttackGestureTracker, from: number, to: number, start: number, duration = 250) {
  for (let i = 0; i <= 10; i++) tracker.sample(rad(from + (to - from) * i / 10), 1, start + duration * i / 10);
}
test('fast sweep crosses angle wrap and uses arc midpoint, not release aim', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, 150, 295, 0);
  const shot = g.snapshot(250);
  assert.equal(shot.sweepCount, 1);
  assert.ok(Math.abs(shot.sweepYaw - rad(-137.5)) < 1e-6);
  assert.equal(shot.heldSeconds, .25);
});
test('reverse arc produces double slash in same region', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, -72.5, 72.5, 0); arc(g, 72.5, -72.5, 250);
  assert.equal(g.snapshot(500).sweepCount, 2);
  assert.ok(Math.abs(g.snapshot(500).sweepYaw) < 1e-6);
});
test('slow aim and arcs below 145 degrees do not count as sweeps', () => {
  for (const [angle, duration] of [[145, 1800], [45, 250], [144, 250]]) {
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
  for (let i = 0; i <= 145; i++) g.sample(rad(-72.5 + i), 1, i * 2);
  for (let i = 0; i <= 145; i++) g.sample(rad(72.5 - i), 1, 290 + i * 2);
  assert.equal(g.snapshot(580).sweepCount, 2);
});

test('expired leap attempt can rearm within the same held gesture', () => {
  const g = new AttackGestureTracker(); g.begin(0, 0);
  g.sample(Math.PI, 1, 0); g.sample(0, 1, 900);
  assert.equal(g.snapshot(900).leap, false);
  g.sample(Math.PI, 1, 1000); g.sample(0, 1, 1150);
  assert.equal(g.snapshot(1150).leap, true);
});

 test('old arc cannot fire after a pause or a short reverse adjustment', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, 0, 145, 0);
  assert.equal(g.snapshot(601).sweepCount, 0);
  g.sample(rad(140), 1, 270);
  assert.equal(g.snapshot(270).sweepCount, 0);
});

test('only the final 145 degrees matter, even after long aiming or a full turn', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, 0, -80, 0, 1500);
  arc(g, -80, 280, 2000, 500);
  const shot = g.snapshot(2500);
  assert.equal(shot.sweepCount, 1);
  assert.ok(Math.abs(shot.sweepYaw - rad(-152.5)) < 1e-6);
});

test('release window includes time spent holding still after the arc', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  arc(g, 0, 145, 0, 250);
  g.sample(rad(145), 1, 350);
  assert.equal(g.snapshot(350).sweepCount, 1);
  g.sample(rad(145), 1, 351);
  assert.equal(g.snapshot(351).sweepCount, 0);
});

test('a large discontinuous pointer jump is not a slash', () => {
  const g = new AttackGestureTracker(); g.begin(0);
  g.sample(0, 1, 0); g.sample(rad(145), 1, 100);
  assert.equal(g.snapshot(100).sweepCount, 0);
});

test('hammer leap remains armed while aiming after its gesture', () => {
  const g = new AttackGestureTracker(); g.begin(0, 0);
  g.sample(Math.PI, 1, 0); g.sample(0, 1, 200);
  g.sample(rad(45), .8, 3000);
  assert.equal(g.snapshot(4000).leap, true);
});
