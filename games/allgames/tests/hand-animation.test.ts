import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Swinger, type SwingKind } from '../src/swing';

test('left and right melee swings rotate only the selected arm bone', () => {
  for (const kind of ['slashRL', 'slashLR', 'overhead'] as SwingKind[]) {
    for (const hand of [0, 1] as const) {
      const model = new THREE.Group();
      const arms = [new THREE.Bone(), new THREE.Bone()];
      arms[0].name = 'upperarm_r'; arms[1].name = 'upperarm_l';
      model.add(...arms);
      const swinger = new Swinger(model);
      swinger.start(kind, hand, .6, .25);
      swinger.apply(.25);
      assert.ok(arms[hand].quaternion.angleTo(new THREE.Quaternion()) > .1);
      assert.equal(arms[1 - hand].quaternion.angleTo(new THREE.Quaternion()), 0);
      assert.equal(swinger.active(hand), true);
      assert.equal(swinger.active((1 - hand) as 0 | 1), false);
    }
  }
});
