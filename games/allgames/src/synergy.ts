import type { Item } from './items';

/** Both equipped weapons must be awakened at level five; the circle order does not matter. */
function awakenedPair(weapons: readonly (Item | null | undefined)[], partner: string): boolean {
  if (weapons.length !== 2) return false;
  const [a, b] = weapons;
  if (!a || !b || a.kind !== 'weapon' || b.kind !== 'weapon' || a.lvl !== 5 || b.lvl !== 5 || !a.awakened || !b.awakened) return false;
  return (a.def === 'sword' && b.def === partner) || (a.def === partner && b.def === 'sword');
}

export const isHarvestSynergy = (weapons: readonly (Item | null | undefined)[]) => awakenedPair(weapons, 'hammer');
export const isBloodSynergy = (weapons: readonly (Item | null | undefined)[]) => awakenedPair(weapons, 'reaper');
