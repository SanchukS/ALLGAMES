import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setMaxListeners } from 'node:events';
import * as THREE from 'three';
import { Input } from '../src/input';
import { AttackPreview } from '../src/attackPreview';
import { planWeaponAttack } from '../src/weaponAbilities';

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
setMaxListeners(0, win, doc);
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


test('off-centre touch-down cannot prime a hammer leap or an attack direction', () => {
  const { area, input, attack } = setup();
  pointer(area, 'pointerdown', 1, 20, 20);
  pointer(area, 'pointermove', 1, 20, 70); // Moving down.
  pointer(attack, 'pointerdown', 2, 50, 15); // Accidental touch above attack centre.
  assert.equal(input.aiming, false);
  assert.equal(input.attackGesture?.aimed, false);
  pointer(attack, 'pointermove', 2, 50, 95);
  pointer(attack, 'pointerup', 2, 50, 95);
  const shot = input.consumeAttackGesture()!;
  assert.equal(shot.leap, false);
  assert.equal(shot.sweepCount, 0);
  assert.equal(shot.aimed, true);
});


test('real joystick input queues single and double sweeps at 30/60/120 Hz', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  for (const hz of [30, 60, 120]) {
    for (const double of [false, true]) {
      const { input, attack } = setup();
      now = 0;
      pointer(attack, 'pointerdown', 1, 50, 50);
      let x = 50, y = 50;
      const leg = (from: number, to: number, start: number) => {
        const count = hz / 2;
        for (let i = 0; i <= count; i++) {
          now = start + 500 * i / count;
          const angle = (from + (to - from) * i / count + (i % 2 ? 1 : -1)) * Math.PI / 180;
          x = 50 + Math.sin(angle) * 46; y = 50 + Math.cos(angle) * 46;
          pointer(attack, 'pointermove', 1, x, y);
          assert.equal(input.consumeAttackGesture(), null);
        }
      };
      leg(-80, 80, 0);
      if (double) leg(80, -80, 500);
      now += 80;
      pointer(attack, 'pointerup', 1, x, y);
      const gesture = input.consumeAttackGesture()!;
      assert.equal(gesture.sweepCount, double ? 2 : 1, `${hz} Hz, double=${double}`);
      assert.equal(planWeaponAttack('sword', 3, gesture, true, true)?.kind, double ? 'doubleSweep' : 'sweep');
      assert.equal(input.consumeAttackGesture(), null);
    }
  }
});


test('attack disk rejects square corners and movement ignores the right half', () => {
  const { input, area, attack } = setup();
  pointer(attack, 'pointerdown', 1, 1, 1);
  assert.equal(input.holdingAttack, false);
  pointer(area, 'pointerdown', 2, 70, 20);
  pointer(area, 'pointermove', 2, 90, 80);
  assert.deepEqual(input.vector, [0, 0]);
});

test('centre resets charge while holding, and radius/resize cancel pending shots', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { input, attack } = setup();
  pointer(attack, 'pointerdown', 1, 50, 50);
  pointer(attack, 'pointermove', 1, 95, 50);
  now = 2200;
  assert.equal(planWeaponAttack('hammer', 2, input.attackGesture!, true, true)?.kind, 'charge');
  pointer(attack, 'pointermove', 1, 50, 50);
  assert.equal(planWeaponAttack('hammer', 2, input.attackGesture!, true, true), null);
  pointer(attack, 'pointermove', 1, 95, 50);
  assert.equal(input.attackGesture?.heldSeconds, 0);
  assert.equal(planWeaponAttack('hammer', 2, input.attackGesture!, true, true)?.kind, 'normal');
  pointer(attack, 'pointerup', 1, 95, 50);
  input.setAttackRadius(1000);
  assert.equal(input.attackRadiusSetting, 160);
  assert.equal(input.consumeAttackGesture(), null);
  input.setAttackRadius(1);
  assert.equal(input.attackRadiusSetting, 56);
  pointer(attack, 'pointerdown', 2, 50, 50);
  pointer(attack, 'pointermove', 2, 95, 50);
  win.dispatchEvent(new Event('resize'));
  pointer(attack, 'pointerup', 2, 95, 50);
  assert.equal(input.consumeAttackGesture(), null);
});

test('empty weapon circle cannot aim or queue attacks', () => {
  const { input, area } = setup();
  const second = area.children[2];
  assert.equal(second.hidden, true);
  pointer(second, 'pointerdown', 2, 50, 50);
  pointer(second, 'pointermove', 2, 95, 50);
  pointer(second, 'pointerup', 2, 95, 50);
  assert.equal(input.attackState(1).holdingAttack, false);
  assert.equal(input.consumeAttackGesture(1), null);
});

test('two weapon circles hold and release independently without crossfire', () => {
  const { input, area, attack } = setup();
  const second = area.children[2];
  input.setAttackWeapon(1, 'Молот');
  assert.equal(second.hidden, false);
  pointer(attack, 'pointerdown', 1, 50, 50);
  pointer(second, 'pointerdown', 2, 50, 50);
  pointer(attack, 'pointermove', 1, 95, 50);
  pointer(second, 'pointermove', 2, 50, 5);
  assert.equal(input.attackState(0).aimYaw, Math.PI / 2);
  assert.equal(input.attackState(1).aimYaw, Math.PI);
  pointer(attack, 'pointerup', 1, 95, 50);
  assert.equal(input.consumeAttackGesture(0)?.yaw, Math.PI / 2);
  assert.equal(input.consumeAttackGesture(1), null);
  assert.equal(input.attackState(1).holdingAttack, true);
  pointer(second, 'pointerup', 2, 50, 5);
  assert.equal(input.consumeAttackGesture(1)?.yaw, Math.PI);
  assert.equal(input.consumeAttackGesture(0), null);
});

test('centring or disabling one weapon preserves the other pending attack', () => {
  for (const cancel of ['centre', 'empty', 'pointercancel']) {
    const { input, area, attack } = setup();
    const second = area.children[2];
    input.setAttackWeapon(1, 'Молот');
    pointer(attack, 'pointerdown', 1, 50, 50);
    pointer(second, 'pointerdown', 2, 50, 50);
    pointer(attack, 'pointermove', 1, 95, 50);
    pointer(second, 'pointermove', 2, 50, 5);
    pointer(attack, 'pointerup', 1, 95, 50);
    if (cancel === 'empty') input.setAttackWeapon(1, null);
    else if (cancel === 'pointercancel') pointer(second, 'pointercancel', 2, 50, 5);
    else pointer(second, 'pointermove', 2, 50, 50);
    pointer(second, 'pointerup', 2, 50, 50);
    assert.equal(input.consumeAttackGesture(1), null, cancel);
    assert.equal(input.consumeAttackGesture(0)?.yaw, Math.PI / 2, cancel);
  }
});

test('repeated weapon refresh preserves gesture; global reset clears both circles', () => {
  const { input, area, attack } = setup();
  const second = area.children[2];
  input.setAttackWeapon(1, 'Молот');
  pointer(second, 'pointerdown', 2, 50, 50);
  pointer(second, 'pointermove', 2, 50, 5);
  input.setAttackWeapon(1, 'Молот');
  input.setAttackStatus(1, 'I: 3 · II: ✓');
  assert.equal(input.attackState(1).aiming, true);
  pointer(attack, 'pointerdown', 1, 50, 50);
  pointer(attack, 'pointermove', 1, 95, 50);
  pointer(attack, 'pointerup', 1, 95, 50);
  input.reset();
  pointer(second, 'pointerup', 2, 50, 5);
  assert.equal(input.consumeAttackGesture(0), null);
  assert.equal(input.consumeAttackGesture(1), null);
});

test('one pointer cannot capture both weapon circles', () => {
  const { input, area, attack } = setup();
  input.setAttackWeapon(1, 'Кинжал');
  pointer(attack, 'pointerdown', 7, 50, 50);
  pointer(area.children[2], 'pointerdown', 7, 50, 50);
  assert.equal(input.attackState(0).holdingAttack, true);
  assert.equal(input.attackState(1).holdingAttack, false);
});
