import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0,
  getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
}) } });
const { ObstacleGrid, rng, World } = await import('../src/world');
type Obstacle = { x: number; z: number; r: number };
function linear(p: THREE.Vector3, radius: number, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    const dx = p.x - o.x, dz = p.z - o.z, rr = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = o.x + dx / d * rr;
      p.z = o.z + dz / d * rr;
    }
  }
}
test('indexed collision exactly matches ordered linear pushes across cells and overlapping circles', () => {
  const r = rng(721);
  const obstacles = Array.from({ length: 1500 }, () => ({ x: r() * 300 - 150, z: r() * 300 - 150, r: r() * 12 + .2 }));
  const grid = new ObstacleGrid(obstacles);
  for (let i = 0; i < 1200; i++) {
    const a = new THREE.Vector3(r() * 300 - 150, 0, r() * 300 - 150);
    const b = a.clone();
    const radius = r() * 4;
    linear(a, radius, obstacles); grid.resolve(b, radius);
    assert.ok(a.distanceTo(b) < 1e-10, `case ${i}`);
  }
});
test('grid handles negative boundaries, large obstacles, exact centres and sparse queries', () => {
  const obstacles = [{ x: 0, z: 0, r: 24 }, { x: -8, z: -8, r: .5 },
    ...Array.from({ length: 2000 }, (_, i) => ({ x: 100 + i * 10, z: 100, r: 1 }))];
  const grid = new ObstacleGrid(obstacles);
  assert.deepEqual(grid.candidates(-23, 0, 1), [0]);
  for (const start of [[0, 0], [-8.1, -8.1], [-24.1, 0], [24, 0]]) {
    const a = new THREE.Vector3(start[0], 0, start[1]), b = a.clone();
    linear(a, .6, obstacles); grid.resolve(b, .6);
    assert.ok(a.distanceTo(b) < 1e-10);
  }
  assert.ok(grid.candidates(100, 100, 1).length < 4);
});
test('opening gates takes effect without rebuilding static collision index', () => {
  const world: any = Object.create(World.prototype);
  const p = new THREE.Vector3(0, 0, 0);
  const base: any = Object.create(World.prototype);
  Object.assign(base, { obstacles: [], obstacleGrid: new ObstacleGrid([]), gates: [] });
  base.collide(p, .5);
  const gate = { open: false, obstacles: [{ x: p.x + .2, z: p.z, r: 1 }] };
  Object.assign(world, { obstacles: [], obstacleGrid: new ObstacleGrid([]), gates: [gate] });
  const closed = p.clone(); world.collide(closed, .5);
  gate.open = true;
  const opened = p.clone(); world.collide(opened, .5);
  const expected = p.clone(); base.collide(expected, .5);
  assert.ok(opened.distanceTo(expected) < 1e-10);
  assert.ok(closed.distanceTo(opened) > .1);
});
