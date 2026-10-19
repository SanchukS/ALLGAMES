/** Angles use the same screen convention as Input: atan2(right, down). */
export interface AttackGesture {
  yaw: number;
  heldSeconds: number;
  sweepCount: 0 | 1 | 2;
  sweepYaw: number;
  leap: boolean;
  distance: number;
  aimed: boolean;
  /** Final continuous 300-degree turn; optional for older input producers. */
  reaperTurn?: boolean;
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const SWORD_SWEEP = { angle: 90 * Math.PI / 180, windowMs: 1000, releaseGraceMs: 160, jitter: 4 * Math.PI / 180 };
export const REAPER_TURN = { angle: 300 * Math.PI / 180, windowMs: 1500, releaseGraceMs: 160, jitter: 4 * Math.PI / 180 };
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
    const wasCentred = this.distance < DEAD_ZONE;
    this.distance = Math.max(0, Math.min(1, distance));
    if (this.distance < DEAD_ZONE) {
      this.samples = [];
      this.backwardsAt = null;
      this.leap = false;
      this.start = now; // Centre cancels pending gestures and charge, never ability cooldowns.
      return;
    }
    if (wasCentred) this.start = now;
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
    while (this.samples.length > 2 && this.samples[1].time < now - Math.max(SWORD_SWEEP.windowMs * 2, REAPER_TURN.windowMs + REAPER_TURN.releaseGraceMs)) this.samples.shift();
  }

  /** Reverse scan with angular hysteresis: tiny tremors are not deliberate turns. */
  private endingArc(end: number, releasedAt: number, config = SWORD_SWEEP) {
    const finish = this.samples[end];
    let direction = 0;
    let crossing: Sample | null = null;
    let boundary = end;
    let turned = false;
    let extreme = finish.yaw;
    let extremeIndex = end;
    let movedAt: number | null = null;
    for (let i = end - 1; i >= 0; i--) {
      const a = this.samples[i], b = this.samples[i + 1];
      const delta = b.yaw - a.yaw;
      if (movedAt === null && Math.abs(finish.yaw - a.yaw) > config.jitter) movedAt = b.time;
      if (!direction && Math.abs(finish.yaw - a.yaw) > config.jitter) {
        direction = Math.sign(finish.yaw - a.yaw);
      }
      if (direction) {
        if ((a.yaw - extreme) * direction > config.jitter + 1e-6) {
          boundary = extremeIndex;
          turned = true;
          break;
        }
        if ((a.yaw - extreme) * direction < 0) {
          extreme = a.yaw;
          extremeIndex = i;
        }
      }
      boundary = i;
      if (!crossing && direction && (finish.yaw - a.yaw) * direction >= config.angle - 1e-6) {
        const yaw = finish.yaw - direction * config.angle;
        const t = Math.abs(delta) > 1e-6 ? Math.max(0, Math.min(1, (yaw - a.yaw) / delta)) : 0;
        crossing = { yaw, time: a.time + (b.time - a.time) * t };
      }
      // A qualifying suffix can start after the actual turn. Keep looking for that
      // turn briefly instead of inventing a boundary at the release-window edge.
      if (releasedAt - a.time > config.windowMs + config.releaseGraceMs
        || (!crossing && releasedAt - a.time > config.windowMs)) break;
    }
    if (!crossing || releasedAt - crossing.time > config.windowMs
      || movedAt === null || releasedAt - movedAt > config.releaseGraceMs) return null;
    return { yaw: wrap((crossing.yaw + finish.yaw) / 2), direction, boundary, turned };
  }

  snapshot(now: number): AttackGesture {
    let sweepCount: 0 | 1 | 2 = 0;
    let sweepYaw = this.yaw;
    if (this.distance >= DEAD_ZONE && this.samples.length > 1) {
      const last = this.endingArc(this.samples.length - 1, now);
      if (last) {
        sweepCount = 1;
        sweepYaw = last.yaw;
        if (last.turned && last.boundary > 0) {
          const first = this.endingArc(last.boundary, this.samples[last.boundary].time);
          if (first && first.direction !== last.direction && Math.abs(wrap(first.yaw - last.yaw)) < Math.PI / 2) sweepCount = 2;
        }
      }
    }
    return { yaw: this.yaw, heldSeconds: this.distance >= DEAD_ZONE ? Math.max(0, (now - this.start) / 1000) : 0, sweepCount, sweepYaw,
      reaperTurn: this.distance >= DEAD_ZONE && this.samples.length > 1 && !!this.endingArc(this.samples.length - 1, now, REAPER_TURN),
      leap: this.leap, distance: this.distance, aimed: this.distance >= DEAD_ZONE };
  }
}
