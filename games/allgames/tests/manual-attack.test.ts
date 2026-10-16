import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Input } from '../src/input';
import { AttackPreview } from '../src/attackPreview';

// Minimal DOM doubles: test pointer state without requiring a browser installation.
class Element extends EventTarget {
  style: Record<string, string> = {};
  children: Element[] = [];
  className = '';
  innerHTML = '';
  hidden = false;
  classList = { add() {}, remove() {}, toggle() {} };
  appendChild(el: Element) { this.children.push(el); }
  setAttribute() {}
  setPointerCapture() {}
  closest() { return null; }
  querySelector() { return new Element(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}
const win = new EventTarget();
const doc = Object.assign(new EventTarget(), { createElement: () => new Element(), hidden: false });
Object.assign(globalThis, { document: doc, addEventListener: win.addEventListener.bind(win) });
function setup() {
  const area = new Element();
  const input = new Input(area as unknown as HTMLElement);
  return { area, input, attack: area.children[1] };
}
function pointer(el: Element, type: string, id: number, x: number, y: number) {
  const event = new Event(type);
  Object.assign(event, { pointerId: id, clientX: x, clientY: y, button: 0 });
  el.dispatchEvent(event);
}

test('movement and aiming are independent; hold never fires; release fires exactly once', () => {
  const { area, input, attack } = setup();
  pointer(area, 'pointerdown', 1, 20, 20);
  pointer(area, 'pointermove', 1, 70, 20);
  pointer(attack, 'pointerdown', 2, 50, 50);
  pointer(attack, 'pointermove', 2, 100, 50);
  assert.deepEqual(input.vector, [1, 0]);
  assert.equal(input.aiming, true);
  assert.equal(input.consumeAttack(), null);
  pointer(attack, 'pointerup', 2, 100, 50);
  assert.equal(input.consumeAttack(), Math.PI / 2);
  assert.equal(input.consumeAttack(), null);
  assert.equal(input.aiming, false);
  assert.deepEqual(input.vector, [1, 0]);
  pointer(area, 'pointerup', 1, 70, 20);
  assert.deepEqual(input.vector, [0, 0]);
});

test('tap and returning to the centre cancel instead of auto-aiming', () => {
  const { input, attack } = setup();
  pointer(attack, 'pointerdown', 1, 50, 50);
  pointer(attack, 'pointerup', 1, 50, 50);
  assert.equal(input.consumeAttack(), null);
  pointer(attack, 'pointerdown', 2, 50, 50);
  pointer(attack, 'pointermove', 2, 0, 50);
  pointer(attack, 'pointerup', 2, 50, 50);
  assert.equal(input.consumeAttack(), null);
});

test('cancel, blur, disable and reset cannot leave a queued attack', () => {
  for (const action of ['pointercancel', 'lostpointercapture', 'blur', 'disable', 'reset']) {
    const { input, attack } = setup();
    pointer(attack, 'pointerdown', 1, 50, 50);
    pointer(attack, 'pointermove', 1, 50, 0);
    if (action === 'blur') win.dispatchEvent(new Event('blur'));
    else if (action === 'disable') input.enabled = false;
    else if (action === 'reset') input.reset();
    else pointer(attack, action, 1, 50, 0);
    pointer(attack, 'pointerup', 1, 50, 0);
    assert.equal(input.aiming, false, action);
    assert.equal(input.consumeAttack(), null, action);
  }
});

test('sector matches weapon range and facing and hides when aiming ends', () => {
  const scene = new THREE.Scene();
  const preview = new AttackPreview(scene);
  preview.update(new THREE.Vector3(2, 0, 3), Math.PI / 2, 2.65, 140, true);
  assert.equal(preview.root.visible, true);
  assert.equal(preview.root.rotation.y, Math.PI / 2);
  const mesh = preview.root.children[0] as THREE.Mesh;
  const positions = mesh.geometry.getAttribute('position');
  let furthest = 0;
  for (let i = 0; i < positions.count; i++) furthest = Math.max(furthest, Math.hypot(positions.getX(i), positions.getZ(i)));
  assert.ok(Math.abs(furthest - 2.65) < 1e-6);
  preview.update(new THREE.Vector3(), 0, 2.65, 140, false);
  assert.equal(preview.root.visible, false);
  preview.dispose();
  assert.equal(scene.children.length, 0);
});
