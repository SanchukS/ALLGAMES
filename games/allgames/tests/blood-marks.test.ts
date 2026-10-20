import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BloodMarks } from '../src/bloodMarks';

test('blood marks cap at two, refresh for eight seconds, follow and consume once', () => {
  const scene = new THREE.Scene(), marks = new BloodMarks(scene);
  const target = { pos: new THREE.Vector3(), hittable: true };
  marks.add(target, 0);
  const counter = scene.getObjectByName('blood-mark-count') as THREE.Sprite;
  const firstMaterial = counter.material;
  assert.equal(counter.userData.count, 1);
  marks.add(target, 7); marks.add(target, 8);
  assert.equal(counter.userData.count, 2);
  assert.notEqual(counter.material, firstMaterial);
  target.pos.x = 3; marks.update(15);
  assert.equal(scene.children[0].position.x, 3);
  assert.equal(marks.consume(target, 15), 2);
  assert.equal(marks.consume(target, 15), 0); assert.equal(scene.children.length, 0);
  marks.add(target, 20); assert.equal(marks.consume(target, 28), 0);
  marks.add(target, 30); marks.add(target, 38);
  assert.equal(marks.consume(target, 38), 1);
});
test('dead and expired marks disappear; clear removes all visuals', () => {
  const scene = new THREE.Scene(), marks = new BloodMarks(scene);
  const a = { pos: new THREE.Vector3(), hittable: true }, b = { ...a };
  marks.add(a, 0); marks.add(b, 1); a.hittable = false;
  marks.update(2); assert.equal(scene.children.length, 1);
  marks.update(9); assert.equal(scene.children.length, 0);
  marks.add(b, 10); marks.clear(); assert.equal(scene.children.length, 0);
});
