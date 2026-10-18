import { AttackGestureTracker, type AttackGesture } from './attackGesture';
type AttackSlot = 0 | 1;
type AttackControl = {
  pointerId: number | null;
  button: HTMLButtonElement;
  marker: HTMLSpanElement;
  caption: HTMLSpanElement;
  status: HTMLSpanElement;
  origin: [number, number];
  range: number;
  moved: boolean;
  label: string | null;
  pending: AttackGesture | null;
  tracker: AttackGestureTracker;
  aiming: boolean;
  yaw: number;
};

/** Left-side movement and two independent weapon aiming disks. */
export class Input {
  x = 0;
  y = 0;
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private keys = new Set<string>();
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private radius = 60;
  private active = true;
  private attacks: AttackControl[] = [];
  private radiusSetting = 90;
  private actualRadius = 90;
  private area: HTMLElement;
  private lastMovementYaw: number | null = null;

  get holdingAttack() { return this.attackState(0).holdingAttack; }
  get attackGesture() { return this.attackState(0).gesture; }
  get aiming() { return this.attacks[0].aiming; }
  get aimYaw() { return this.attacks[0].yaw; }

  attackState(slot: AttackSlot) {
    const a = this.attacks[slot];
    return {
      aiming: a.aiming,
      aimYaw: a.yaw,
      holdingAttack: a.pointerId !== null,
      gesture: a.pointerId !== null ? a.tracker.snapshot(performance.now()) : null,
    };
  }

  setAttackWeapon(slot: AttackSlot, label: string | null) {
    const a = this.attacks[slot];
    if (a.label === label) return;
    a.label = label;
    a.pending = null;
    this.cancelAim(a);
    a.caption.textContent = label ? `${slot + 1} · ${label}` : '';
    a.button.setAttribute('aria-label', label ? `${label}, оружие ${slot + 1}: веди пальцем для прицеливания, отпусти для удара; центр отменяет атаку` : 'Пустой слот оружия');
    a.button.hidden = !this.active || label === null;
    this.fitAttackArea();
  }

  setAttackStatus(slot: AttackSlot, status: string) {
    const el = this.attacks[slot].status;
    if (el.textContent !== status) el.textContent = status;
  }

  get enabled() { return this.active; }
  set enabled(value: boolean) {
    this.active = value;
    for (const a of this.attacks) a.button.hidden = !value || a.label === null;
    if (!value) this.reset();
  }

  consumeAttack(): number | null {
    const gesture = this.consumeAttackGesture();
    return gesture?.aimed ? gesture.yaw : null;
  }

  consumeAttackGesture(slot: AttackSlot = 0): AttackGesture | null {
    const a = this.attacks[slot];
    const result = this.enabled && a.label !== null ? a.pending : null;
    a.pending = null;
    return result;
  }

  private cancelAim(a: AttackControl) {
    a.tracker.reset();
    a.pointerId = null;
    a.aiming = false;
    a.marker.style.transform = 'translate(-50%, -50%)';
    a.button.classList.remove('aiming');
  }

  get attackRadius() { return this.actualRadius; }
  get attackRadiusSetting() { return this.radiusSetting; }

  setAttackRadius(radius: number) {
    if (!Number.isFinite(radius)) return;
    this.radiusSetting = Math.max(56, Math.min(160, Math.round(radius)));
    this.reset();
    this.fitAttackArea();
    try { localStorage.setItem('allgames-attack-radius', String(this.radiusSetting)); } catch { /* optional preference */ }
  }

  private fitAttackArea() {
    const r = this.area.getBoundingClientRect();
    const count = Math.max(1, this.attacks.filter(a => a.label !== null).length);
    // Reserve the bottom equipment row and top HUD; both disks fit in the right half.
    const widthLimit = (r.width / 2 - 36 - (count - 1) * 12) / (count * 2);
    const heightLimit = (r.height - 160) / 2;
    this.actualRadius = Math.min(this.radiusSetting, Math.max(24, Math.min(widthLimit, heightLimit)));
    for (const a of this.attacks) {
      a.button.style.width = a.button.style.height = `${this.actualRadius * 2}px`;
      a.button.style.setProperty?.('--attack-diameter', `${this.actualRadius * 2}px`);
    }
  }

  private createAttackControl(slot: AttackSlot): AttackControl {
    const button = document.createElement('button');
    button.className = `attack-stick attack-area attack-slot-${slot} ui-block`;
    button.innerHTML = '<span class="attack-center"></span><span class="attack-marker"></span><span class="attack-caption"></span><span class="attack-status"></span>';
    const a: AttackControl = {
      pointerId: null, button,
      marker: button.querySelector('.attack-marker')!,
      caption: button.querySelector('.attack-caption')!,
      status: button.querySelector('.attack-status')!,
      origin: [0, 0], range: 90, moved: false, label: slot === 0 ? 'АТАКА' : null,
      pending: null, tracker: new AttackGestureTracker(), aiming: false, yaw: 0,
    };
    a.caption.textContent = slot === 0 ? '1 · АТАКА' : '';
    button.hidden = slot !== 0;
    button.setAttribute('aria-label', `Оружие ${slot + 1}: веди пальцем для прицеливания, отпусти для удара; центр отменяет атаку`);
    this.area.appendChild(button);
    const aim = (e: PointerEvent) => {
      const dx = e.clientX - a.origin[0], dy = e.clientY - a.origin[1];
      const len = Math.hypot(dx, dy), scale = Math.min(1, a.range / Math.max(1, len));
      a.aiming = len >= a.range * (10 / 46);
      if (a.aiming) a.yaw = Math.atan2(dx, dy);
      a.tracker.sample(a.yaw, len / a.range, performance.now());
      button.classList.toggle('aiming', a.aiming);
      a.marker.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    };
    button.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (!this.enabled || a.label === null || a.pointerId !== null || e.button !== 0) return;
      if (this.attacks.some(other => other.pointerId === e.pointerId) || this.pointerId === e.pointerId) return;
      const r = button.getBoundingClientRect();
      a.range = Math.min(r.width, r.height) / 2;
      a.origin = [r.left + r.width / 2, r.top + r.height / 2];
      if (Math.hypot(e.clientX - a.origin[0], e.clientY - a.origin[1]) > a.range) return;
      a.pointerId = e.pointerId;
      a.moved = false;
      const movement = this.vector;
      if (Math.hypot(...movement) > 0.1) this.lastMovementYaw = Math.atan2(movement[0], movement[1]);
      a.tracker.begin(performance.now(), this.lastMovementYaw);
      button.setPointerCapture(e.pointerId);
      a.aiming = false;
      e.preventDefault();
    });
    button.addEventListener('pointermove', e => {
      if (e.pointerId === a.pointerId) { a.moved = true; aim(e); }
    });
    button.addEventListener('pointerup', e => {
      if (e.pointerId !== a.pointerId) return;
      if (a.moved) aim(e);
      if (this.enabled && a.label !== null && a.moved && a.aiming) a.pending = a.tracker.snapshot(performance.now());
      this.cancelAim(a);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, e => {
        if ((e as PointerEvent).pointerId !== a.pointerId) return;
        a.pending = null;
        this.cancelAim(a);
      });
    }
    return a;
  }

  constructor(area: HTMLElement) {
    this.area = area;
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    area.appendChild(this.base);
    this.attacks = [this.createAttackControl(0), this.createAttackControl(1)];
    try {
      const saved = Number(localStorage.getItem('allgames-attack-radius'));
      if (saved >= 56 && saved <= 160) this.radiusSetting = saved;
    } catch { /* optional preference */ }
    this.fitAttackArea();
    addEventListener('resize', () => { this.reset(); this.fitAttackArea(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });

    area.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.pointerId !== null) return;
      if ((e.target as HTMLElement).closest('.ui-block, #modal, button')) return;
      const r = area.getBoundingClientRect();
      if (e.clientX - r.left >= r.width / 2) return;
      this.pointerId = e.pointerId;
      this.ox = e.clientX - r.left;
      this.oy = e.clientY - r.top;
      this.radius = Math.max(56, Math.min(r.width, r.height) * 0.16);
      this.base.style.width = this.base.style.height = `${this.radius * 2}px`;
      this.base.style.left = `${this.ox}px`;
      this.base.style.top = `${this.oy}px`;
      this.base.classList.add('on');
      this.knob.style.transform = 'translate(-50%,-50%)';
      area.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      const r = area.getBoundingClientRect();
      let dx = e.clientX - r.left - this.ox;
      let dy = e.clientY - r.top - this.oy;
      const len = Math.hypot(dx, dy);
      // The base stays where the touch started; the knob is clamped to the rim.
      if (len > this.radius) {
        dx *= this.radius / len;
        dy *= this.radius / len;
      }
      const dead = this.radius * 0.12;
      const l2 = Math.hypot(dx, dy);
      if (l2 < dead) { this.x = this.y = 0; } else {
        const m = Math.min(1, (l2 - dead) / (this.radius * 0.5));
        this.x = (dx / l2) * m;
        this.y = (dy / l2) * m;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.x = this.y = 0;
      this.base.classList.remove('on');
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);

    addEventListener('keydown', (e) => this.keys.add(e.code));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
  }

  /** Movement vector in screen space, length 0..1. */
  get vector(): [number, number] {
    if (!this.enabled) return [0, 0];
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      this.lastMovementYaw = Math.atan2(kx, ky);
      return [kx / l, ky / l];
    }
    if (Math.hypot(this.x, this.y) > 0.1) this.lastMovementYaw = Math.atan2(this.x, this.y);
    return [this.x, this.y];
  }

  pressed(code: string) {
    if (this.keys.has(code)) { this.keys.delete(code); return true; }
    return false;
  }

  reset() {
    this.pointerId = null;
    this.lastMovementYaw = null;
    for (const a of this.attacks) { a.pending = null; this.cancelAim(a); }
    this.x = this.y = 0;
    this.keys.clear();
    this.base.classList.remove('on');
  }
}
