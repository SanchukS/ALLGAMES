import type { AttackGesture } from './attackGesture';

export interface AttackPlan {
  kind: 'normal' | 'sweep' | 'doubleSweep' | 'charge' | 'leap' | 'pull';
  yaw: number;
  damageScale: number;
  /** Area multiplier, not radius multiplier: radius grows by sqrt(areaScale). */
  areaScale: number;
  /** Normalized leap targeting distance. */
  distance: number;
}

/** Interpret a gesture without consuming charges; commit only when the swing starts. */
export function planWeaponAttack(def: string, level: number, gesture: AttackGesture, firstReady: boolean, secondReady: boolean): AttackPlan | null {
  if (!gesture.aimed) return null; // Releasing in the centre never casts, including hammer charge.
  const normal: AttackPlan = { kind: 'normal', yaw: gesture.yaw, damageScale: 1, areaScale: 1, distance: 0 };
  if (def === 'reaper' && level >= 2 && firstReady && gesture.reaperTurn) {
    return { ...normal, kind: 'pull', damageScale: 0 };
  }
  if (def === 'hammer') {
    if (level >= 4 && secondReady && gesture.leap && gesture.aimed) {
      const distance = Math.max(0, Math.min(1, gesture.distance));
      return { ...normal, kind: 'leap', distance, damageScale: 1 + distance, areaScale: 1 + distance };
    }
    // Charge starts on aiming; returning to centre cancels it.
    if (level >= 2 && firstReady && gesture.heldSeconds >= 0.35) {
      const charge = Math.min(1, gesture.heldSeconds / (level >= 3 ? 1.5 : 2));
      return { ...normal, kind: 'charge', damageScale: 1 + charge, areaScale: 1 + charge };
    }
  }
  if (!gesture.aimed) return null;
  if (def === 'sword' && level >= 2 && firstReady && gesture.sweepCount > 0) {
    return { ...normal, kind: level >= 3 && gesture.sweepCount === 2 ? 'doubleSweep' : 'sweep', yaw: gesture.sweepYaw };
  }
  return normal;
}

/** Cooldowns measured in successful ordinary enemy hits, never elapsed time. */
export class AbilityCharges {
  readonly remaining: [number, number] = [0, 0];
  use(slot: 0 | 1) { this.remaining[slot] = 3; }
  normalHit() {
    this.remaining[0] = Math.max(0, this.remaining[0] - 1);
    this.remaining[1] = Math.max(0, this.remaining[1] - 1);
  }
  reset() { this.remaining[0] = this.remaining[1] = 0; }
}

/** Each target has its own stacks. Every tenth stack replaces normal stacking damage with the finisher. */
export function daggerHit(stacks: number, level: number) {
  if (level < 2) return { stacks: 0, damageMultiplier: 1, finisherMultiplier: 0 };
  const previous = Math.max(0, Math.floor(stacks));
  const next = previous + 1;
  const finisherMultiplier = level >= 4 && next % 10 === 0 ? (next / 10) * (level >= 5 ? 1.5 : 1) : 0;
  return {
    stacks: next,
    damageMultiplier: finisherMultiplier || 1 + previous * (level >= 3 ? 0.08 : 0.05),
    finisherMultiplier,
  };
}
