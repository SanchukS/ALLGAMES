import { AttackGestureTracker, type AttackGesture } from './attackGesture';
/**
 * Left-side floating movement stick plus an independent circular aiming area.
 * Drag the attack stick to aim; release outside its dead zone to strike. WASD/arrows move on desktop.
 */
export class Input {
  x = 0; // -1..1, screen right
  y = 0; // -1..1, screen down
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private keys = new Set<string>();
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private radius = 60;
  private active = true;
  private attackId: number | null = null;
  private attackButton: HTMLButtonElement;
  private attackKnob: HTMLSpanElement;
  private attackOrigin = [0, 0];
  private attackRange = 90;
  private radiusSetting = 90;
  private actualRadius = 90;
  private attackMoved = false;
  private area: HTMLElement;
  private pendingGesture: AttackGesture | null = null;
  private gesture = new AttackGestureTracker();
  private lastMovementYaw: number | null = null;

  get holdingAttack() { return this.attackId !== null; }
  get attackGesture(): AttackGesture | null {
    return this.holdingAttack ? this.gesture.snapshot(performance.now()) : null;
  }
  aiming = false;
  aimYaw = 0;

  get enabled() { return this.active; }
  set enabled(value: boolean) {
    this.active = value;
    this.attackButton.hidden = !value;
    if (!value) this.reset();
  }

  /** Each release is consumed once; returning to the centre cancels the shot. */
  consumeAttack(): number | null {
    const gesture = this.consumeAttackGesture();
    return gesture?.aimed ? gesture.yaw : null;
  }

  consumeAttackGesture(): AttackGesture | null {
    const result = this.enabled ? this.pendingGesture : null;
    this.pendingGesture = null;
    return result;
  }

  private cancelAim() {
    this.gesture.reset();
    this.attackId = null;
    this.aiming = false;
    this.attackKnob.style.transform = 'translate(-50%, -50%)';
    this.attackButton.classList.remove('aiming');
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
    this.actualRadius = Math.min(this.radiusSetting, Math.max(40, Math.min(r.height * .34, r.width * .22)));
    this.attackButton.style.width = this.attackButton.style.height = `${this.actualRadius * 2}px`;
  }

  constructor(area: HTMLElement) {
    this.area = area;
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    area.appendChild(this.base);
    this.attackButton = document.createElement('button');
    this.attackButton.className = 'attack-stick attack-area ui-block';
    this.attackButton.setAttribute('aria-label', 'Область атаки: веди пальцем для прицеливания, отпусти для удара; центр отменяет атаку');
    this.attackButton.innerHTML = '<span class="attack-center"></span><span class="attack-marker"></span><span class="attack-caption">АТАКА</span>';
    this.attackKnob = this.attackButton.querySelector('.attack-marker')!;
    area.appendChild(this.attackButton);
    try {
      const saved = Number(localStorage.getItem('allgames-attack-radius'));
      if (saved >= 56 && saved <= 160) this.radiusSetting = saved;
    } catch { /* optional preference */ }
    this.fitAttackArea();
    addEventListener('resize', () => { this.reset(); this.fitAttackArea(); });
    const aim = (e: PointerEvent) => {
      const dx = e.clientX - this.attackOrigin[0], dy = e.clientY - this.attackOrigin[1];
      const len = Math.hypot(dx, dy), scale = Math.min(1, this.attackRange / Math.max(1, len));
      this.aiming = len >= this.attackRange * (10 / 46);
      if (this.aiming) this.aimYaw = Math.atan2(dx, dy);
      this.gesture.sample(this.aimYaw, len / this.attackRange, performance.now());
      this.attackButton.classList.toggle('aiming', this.aiming);
      this.attackKnob.style.transform = `translate(calc(-50% + ${dx * scale}px), calc(-50% + ${dy * scale}px))`;
    };
    this.attackButton.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (!this.enabled || this.attackId !== null || e.button !== 0) return;
      const r = this.attackButton.getBoundingClientRect();
      this.attackRange = Math.min(r.width, r.height) / 2;
      this.attackOrigin = [r.left + r.width / 2, r.top + r.height / 2];
      if (Math.hypot(e.clientX - this.attackOrigin[0], e.clientY - this.attackOrigin[1]) > this.attackRange) return;
      this.attackId = e.pointerId;
      this.attackMoved = false;
      const movement = this.vector;
      if (Math.hypot(...movement) > 0.1) this.lastMovementYaw = Math.atan2(movement[0], movement[1]);
      this.gesture.begin(performance.now(), this.lastMovementYaw);
      this.attackButton.setPointerCapture(e.pointerId);
      this.aiming = false; // Touch-down position is not deliberate joystick motion.
      e.preventDefault();
    });
    this.attackButton.addEventListener('pointermove', e => {
      if (e.pointerId === this.attackId) { this.attackMoved = true; aim(e); }
    });
    this.attackButton.addEventListener('pointerup', e => {
      if (e.pointerId !== this.attackId) return;
      if (this.attackMoved) aim(e);
      if (this.enabled && this.attackMoved && this.aiming) this.pendingGesture = this.gesture.snapshot(performance.now());
      this.cancelAim();
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      this.attackButton.addEventListener(type, e => {
        // Normal release loses capture after queuing its shot: preserve that shot.
        if ((e as PointerEvent).pointerId !== this.attackId) return;
        this.pendingGesture = null;
        this.cancelAim();
      });
    }
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
    this.pendingGesture = null;
    this.lastMovementYaw = null;
    this.cancelAim();
    this.x = this.y = 0;
    this.keys.clear();
    this.base.classList.remove('on');
  }
}
