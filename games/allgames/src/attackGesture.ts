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
const MIN_ARC = Math.PI / 2;
const MAX_ARC = Math.PI + 0.12;
const QUICK_MS = 650;
const DEAD_ZONE = 10 / 46;

/** Pure, timestamp-driven recognition; no timers, DOM or weapon-specific rules. */
export class AttackGestureTracker {
  private start = 0;
  private yaw = 0;
  private distance = 0;
  private movementYaw: number | null = null;
  private backwardsAt: number | null = null;
  private leap = false;
  private lastYaw: number | null = null;
  private segmentStart = 0;
  private segmentTime = 0;
  private segmentEnd = 0;
  private direction = 0;
  private reversalDistance = 0;
  private firstArc: { yaw: number; direction: number } | null = null;
  private rejected = false;

  begin(now: number, movementYaw: number | null = null) {
    this.reset();
    this.start = now;
    this.segmentTime = now;
    this.movementYaw = movementYaw;
  }

  reset() {
    this.start = this.yaw = this.distance = this.segmentStart = this.segmentEnd = this.segmentTime = this.direction = 0;
    this.movementYaw = this.backwardsAt = this.lastYaw = null;
    this.firstArc = null;
    this.leap = this.rejected = false;
    this.reversalDistance = 0;
  }

  sample(yaw: number, distance: number, now: number) {
    this.distance = Math.max(0, Math.min(1, distance));
    if (this.distance < DEAD_ZONE) {
      // Passing through the centre must not be mistaken for a 180-degree arc.
      this.lastYaw = null;
      this.direction = 0;
      this.reversalDistance = 0;
      this.firstArc = null;
      return;
    }
    this.yaw = yaw;
    if (this.movementYaw !== null && !this.leap) {
      const relative = Math.abs(wrap(yaw - this.movementYaw));
      if (relative > Math.PI * 0.75 && (this.backwardsAt === null || now - this.backwardsAt > QUICK_MS)) this.backwardsAt = now;
      if (this.backwardsAt !== null && now - this.backwardsAt <= QUICK_MS && relative < Math.PI / 4) this.leap = true;
    }
    if (this.lastYaw === null) {
      this.segmentStart = this.segmentEnd = yaw;
      this.segmentTime = now;
      this.lastYaw = yaw;
      return;
    }
    const delta = wrap(yaw - this.lastYaw);
    this.lastYaw = yaw;
    if (this.rejected) return;
    if (now - this.segmentTime > QUICK_MS) {
      this.segmentStart = this.segmentEnd = yaw;
      this.segmentTime = now;
      this.direction = 0;
      this.reversalDistance = 0;
      this.firstArc = null;
      return;
    }
    // Accumulate reversal distance instead of depending on pointer event frequency.
    const direction = Math.sign(delta);
    if (this.direction && direction && direction !== this.direction) this.reversalDistance += Math.abs(delta);
    else if (direction === this.direction) this.reversalDistance = Math.max(0, this.reversalDistance - Math.abs(delta));
    if (this.direction !== 0 && this.reversalDistance > 0.07) {
      const turningPoint = this.segmentEnd + delta - direction * this.reversalDistance;
      const arc = Math.abs(turningPoint - this.segmentStart);
      if (!this.firstArc && arc >= MIN_ARC - 1e-6 && arc <= MAX_ARC) {
        this.firstArc = { yaw: (this.segmentStart + turningPoint) / 2, direction: this.direction };
      } else if (this.firstArc) {
        this.rejected = true; // More than one reversal is not a double slash.
      }
      this.segmentStart = turningPoint;
      this.segmentTime = now;
      this.direction = direction;
      this.reversalDistance = 0;
    }
    this.segmentEnd += delta;
    if (this.direction === 0 && Math.abs(this.segmentEnd - this.segmentStart) > 0.045) {
      this.direction = Math.sign(this.segmentEnd - this.segmentStart);
    }
    if (Math.abs(this.segmentEnd - this.segmentStart) > MAX_ARC) this.rejected = true;
  }

  snapshot(now: number): AttackGesture {
    let sweepCount: 0 | 1 | 2 = 0;
    let sweepYaw = this.yaw;
    if (!this.rejected && this.distance >= DEAD_ZONE && now - this.segmentTime <= QUICK_MS) {
      const arc = Math.abs(this.segmentEnd - this.segmentStart);
      const valid = arc >= MIN_ARC - 1e-6 && arc <= MAX_ARC;
      if (this.firstArc) {
        sweepYaw = wrap(this.firstArc.yaw);
        sweepCount = 1;
        const secondMid = (this.segmentStart + this.segmentEnd) / 2;
        if (valid && this.direction !== this.firstArc.direction && Math.abs(wrap(secondMid - sweepYaw)) < Math.PI / 4) sweepCount = 2;
      } else if (valid) {
        sweepCount = 1;
        sweepYaw = wrap((this.segmentStart + this.segmentEnd) / 2);
      }
    }
    return { yaw: this.yaw, heldSeconds: Math.max(0, (now - this.start) / 1000), sweepCount, sweepYaw,
      leap: this.leap, distance: this.distance, aimed: this.distance >= DEAD_ZONE };
  }
}
