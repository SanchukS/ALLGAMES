/** Angles use the same screen convention as Input: atan2(right, down). */
export interface AttackGesture {
  yaw: number;
  heldSeconds: number;
  sweepCount: 0 | 1 | 2;
  sweepYaw: number;
  leap: boolean;
  distance: number;
  aimed: boolean;
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const SWORD_SWEEP = { angle: 145 * Math.PI / 180, windowMs: 350 };
const QUICK_MS = 650; // Hammer gesture remains independent of release.
const DEAD_ZONE = 10 / 46;
type Sample = { yaw: number; time: number };

/** Pure, timestamp-driven recognition; no timers or DOM. */
export class AttackGestureTracker {
  private start = 0;
  private yaw = 0;
  private distance = 0;
  private movementYaw: number | null = null;
  private backwardsAt: number | null = null;
  private leap = false;
  private samples: Sample[] = [];

  begin(now: number, movementYaw: number | null = null) {
    this.reset();
    this.start = now;
    this.movementYaw = movementYaw;
  }

  reset() {
    this.start = this.yaw = this.distance = 0;
    this.movementYaw = this.backwardsAt = null;
    this.leap = false;
    this.samples = [];
  }

  sample(yaw: number, distance: number, now: number) {
    this.distance = Math.max(0, Math.min(1, distance));
    if (this.distance < DEAD_ZONE) {
      this.samples = []; // A crossing through the centre is not a circular gesture.
      return;
    }
    this.yaw = yaw;
    if (this.movementYaw !== null && !this.leap) {
      const relative = Math.abs(wrap(yaw - this.movementYaw));
      if (relative > Math.PI * 0.75 && (this.backwardsAt === null || now - this.backwardsAt > QUICK_MS)) this.backwardsAt = now;
      if (this.backwardsAt !== null && now - this.backwardsAt <= QUICK_MS && relative < Math.PI / 4) this.leap = true;
    }
    const last = this.samples.at(-1);
    const delta = last ? wrap(yaw - last.yaw) : 0;
    // An undersampled jump across the stick cannot prove a continuous arc.
    if (Math.abs(delta) >= Math.PI * 0.75) this.samples = [];
    this.samples.push({ yaw: this.samples.length && last ? last.yaw + delta : yaw, time: now });
    // Keep enough history for two quick arcs, plus one interpolation anchor.
    while (this.samples.length > 2 && this.samples[1].time < now - SWORD_SWEEP.windowMs * 2) this.samples.shift();
  }

  /** Walk backwards from release (or a turn), stopping at the first reversal. */
  private endingArc(end: number, releasedAt: number) {
    const finish = this.samples[end];
    let direction = 0;
    let crossing: Sample | null = null;
    let boundary = end;
    for (let i = end - 1; i >= 0; i--) {
      const a = this.samples[i], b = this.samples[i + 1];
      const delta = b.yaw - a.yaw;
      if (Math.abs(delta) > 1e-6) {
        const sign = Math.sign(delta);
        if (direction && direction !== sign) break;
        direction = sign;
      }
      boundary = i;
      if (!crossing && Math.abs(finish.yaw - a.yaw) >= SWORD_SWEEP.angle - 1e-6) {
        const yaw = finish.yaw - direction * SWORD_SWEEP.angle;
        const t = Math.abs(delta) > 1e-6 ? Math.max(0, Math.min(1, (yaw - a.yaw) / delta)) : 0;
        crossing = { yaw, time: a.time + (b.time - a.time) * t };
      }
      if (releasedAt - a.time > SWORD_SWEEP.windowMs) break;
    }
    if (!crossing || releasedAt - crossing.time > SWORD_SWEEP.windowMs) return null;
    return { yaw: wrap((crossing.yaw + finish.yaw) / 2), direction, boundary };
  }

  snapshot(now: number): AttackGesture {
    let sweepCount: 0 | 1 | 2 = 0;
    let sweepYaw = this.yaw;
    if (this.distance >= DEAD_ZONE && this.samples.length > 1) {
      const last = this.endingArc(this.samples.length - 1, now);
      if (last) {
        sweepCount = 1;
        sweepYaw = last.yaw;
        if (last.boundary > 0) {
          const first = this.endingArc(last.boundary, this.samples[last.boundary].time);
          if (first && first.direction !== last.direction && Math.abs(wrap(first.yaw - last.yaw)) < Math.PI / 4) sweepCount = 2;
        }
      }
    }
    return { yaw: this.yaw, heldSeconds: Math.max(0, (now - this.start) / 1000), sweepCount, sweepYaw,
      leap: this.leap, distance: this.distance, aimed: this.distance >= DEAD_ZONE };
  }
}
