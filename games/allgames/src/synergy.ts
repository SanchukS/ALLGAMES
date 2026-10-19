import type { Item } from './items';

/** Both equipped weapons must be awakened at level five; the circle order does not matter. */
export function isHarvestSynergy(weapons: readonly (Item | null | undefined)[]): boolean {
  if (weapons.length !== 2) return false;
  const [a, b] = weapons;
  if (!a || !b || a.kind !== 'weapon' || b.kind !== 'weapon' || a.lvl !== 5 || b.lvl !== 5 || !a.awakened || !b.awakened) return false;
  return (a.def === 'sword' && b.def === 'hammer') || (a.def === 'hammer' && b.def === 'sword');
}
