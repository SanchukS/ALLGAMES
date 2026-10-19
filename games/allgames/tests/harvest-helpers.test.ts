import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HarvestHelpers, type HarvestHost } from '../src/harvestHelpers';

function setup(random = () => .8) {
  const scene = new THREE.Scene();
  const helpers = new HarvestHelpers(scene, random);
  const hits: number[] = [];
  const host: HarvestHost = { heroPosition: new THREE.Vector3(), characterDamage: 100, enemies: [], dealDamage: (_, dmg) => { hits.push(dmg); } };
  return { scene, helpers, hits, host };
}
test('cap six, expire at fifteen seconds, clear removes helper visuals', () => {
  const { helpers, scene, host } = setup();
  for (let i = 0; i < 6; i++) assert.equal(helpers.summon(new THREE.Vector3()), true);
  assert.equal(helpers.summon(new THREE.Vector3()), false);
  helpers.update(15, host); assert.equal(helpers.count, 0); assert.equal(scene.children.length, 0);
  helpers.summon(new THREE.Vector3()); helpers.clear(); assert.equal(scene.children.length, 0);
});
test('third successful hammer strike splashes; ordinary hit has quarter character damage', () => {
  const { helpers, host, hits } = setup();
  helpers.summon(new THREE.Vector3());
  host.enemies = [{ position: new THREE.Vector3(.4, 0, 0), dead: false }, { position: new THREE.Vector3(1.2, 0, 0), dead: false }];
  helpers.update(.2, host); assert.deepEqual(hits, [25]);
  helpers.update(.9, host); assert.equal(hits.length, 1);
  helpers.update(.31, host); assert.equal(hits.length, 2);
  helpers.update(1.21, host); assert.equal(hits.length, 4);
});
test('sickle splash can summon helpers without same-frame recursive attacks', () => {
  const { helpers, host, hits } = setup(() => 0);
  helpers.summon(new THREE.Vector3());
  host.enemies = [{ position: new THREE.Vector3(.3, 0, 0), dead: false }, { position: new THREE.Vector3(.5, 0, 0), dead: false }];
  helpers.update(.2, host); helpers.update(.91, host); helpers.update(.91, host);
  assert.equal(hits.length, 4); assert.equal(helpers.count, 3);
});
test('ignores dead or distant enemies and teleports when leash is badly exceeded', () => {
  const { helpers, host, hits, scene } = setup();
  helpers.summon(new THREE.Vector3(20, 0, 0));
  host.enemies = [{ position: new THREE.Vector3(20, 0, .2), dead: false }, { position: new THREE.Vector3(.1, 0, 0), dead: true }];
  helpers.update(.2, host);
  assert.equal(hits.length, 0); assert.ok(scene.children[0].position.distanceTo(host.heroPosition) < 1);
});
test('failed hits do not advance the third-hit splash', () => {
  const { helpers, host, hits } = setup(); helpers.summon(new THREE.Vector3());
  host.enemies = [{ position: new THREE.Vector3(.3, 0, 0), dead: false }, { position: new THREE.Vector3(1.1, 0, 0), dead: false }];
  host.dealDamage = () => false; helpers.update(.2, host); helpers.update(1.21, host);
  host.dealDamage = (_, damage) => { hits.push(damage); };
  helpers.update(1.21, host); assert.equal(hits.length, 1);
});
test('obstacle callback blocks helper movement', () => {
  const { helpers, host, scene } = setup(); helpers.summon(new THREE.Vector3(3, 0, 0));
  host.blocked = () => true; helpers.update(.2, host);
  assert.equal(scene.children[0].position.x, 3);
});
