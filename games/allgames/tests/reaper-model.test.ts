import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createReaperModel, castReaperModel, aimReaperModel, updateReaperModel } from '../src/reaperModel';

test('reaper has real metal link geometry and a separate curved blade', () => {
  const model = createReaperModel();
  const links = model.getObjectByName('reaper_metal_links') as THREE.InstancedMesh;
  const blade = model.getObjectByName('reaper_curved_blade')!;
  assert.equal(links.count, 28);
  assert.ok(links.geometry.getAttribute('position').count > 20);
  assert.ok(blade.children.some((o) => (o as THREE.Mesh).isMesh));
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < links.count; i++) {
    links.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
  }
});

test('casting uncoils the chain, returns it, and never mutates another equipped copy', () => {
  const a = createReaperModel(), b = createReaperModel();
  const bladeA = a.getObjectByName('reaper_curved_blade')!;
  const bladeB = b.getObjectByName('reaper_curved_blade')!;
  const idleY = bladeA.position.y;
  const bOriginal = bladeB.position.clone();
  castReaperModel(a, 1);
  updateReaperModel(a, 0.5);
  assert.ok(bladeA.position.y > idleY + 80);
  assert.deepEqual(bladeB.position.toArray(), bOriginal.toArray());
  updateReaperModel(a, 0.5);
  assert.ok(Math.abs(bladeA.position.y - idleY) < 0.001);
});

test('aiming animates links and missing weapons safely ignore animation hooks', () => {
  const model = createReaperModel();
  const links = model.getObjectByName('reaper_metal_links') as THREE.InstancedMesh;
  const before = Array.from(links.instanceMatrix.array);
  aimReaperModel(model, true, true);
  updateReaperModel(model, 0.1);
  assert.notDeepEqual(Array.from(links.instanceMatrix.array), before);
  assert.doesNotThrow(() => {
    castReaperModel(null, 0); aimReaperModel(null, true, true); updateReaperModel(null, 0.1);
    updateReaperModel(new THREE.Group(), 0.1);
  });
});
