/** Weapon-only on-hit effects. Secondary damage must never roll these again. */
export const ENCHANTMENTS = {
  bleed: { name: 'Рваная рана', chance: .25, description: '25% шанс кровотечения: 25% урона оружия в секунду в течение 3 секунд. Повторное попадание обновляет длительность.' },
  explosion: { name: 'Пороховой след', chance: .15, description: '15% шанс взрыва: 75% урона оружия всем врагам в радиусе 2,5 м.' },
  lightning: { name: 'Громовой клык', chance: .20, description: '20% шанс удара молнией: 120% урона оружия задетому врагу.' },
  chainLightning: { name: 'Грозовая цепь', chance: .15, description: '15% шанс цепной молнии: 80% урона оружия каждой из максимум 4 целей, переходы до 4 м.' },
  critical: { name: 'Верный приговор', chance: .15, description: '15% шанс критического удара с удвоенным уроном. Не умножает уже критический удар повторно.' },
  heal: { name: 'Живая сталь', chance: .15, description: '15% шанс восстановить 3% максимального здоровья.' },
  shield: { name: 'Оберег', chance: .10, description: '10% шанс получить щит на один удар на 8 секунд. Повторное срабатывание обновляет длительность.' },
  chaos: { name: 'Каприз бездны', chance: .20, description: '20% шанс случайного эффекта: одно из 7 зачарований, усиление или ускорение врага, оглушение героя на 1 секунду или прыжок в сторону удара.' },
} as const;
export type EnchantmentId = keyof typeof ENCHANTMENTS;
export interface Enchantment { id: EnchantmentId; chance?: number }
export type EnchantmentProc = Exclude<EnchantmentId, 'chaos'> | 'empowerEnemy' | 'hasteEnemy' | 'selfStun' | 'leap';
export const MAX_ENCHANTMENTS = 3;
export const CHAOS_OUTCOMES: readonly EnchantmentProc[] = [
  'bleed', 'explosion', 'lightning', 'chainLightning', 'critical', 'heal', 'shield',
  'empowerEnemy', 'hasteEnemy', 'selfStun', 'leap',
];
export const ENCHANTMENT_BALANCE = {
  bleedDamage: .25, bleedDuration: 3,
  explosionDamage: .75, explosionRadius: 2.5,
  lightningDamage: 1.2, chainDamage: .8, chainTargets: 4, chainRange: 4,
  criticalMultiplier: 2, healFraction: .03, shieldDuration: 8,
  empowerMultiplier: 1.5, hasteMultiplier: 1.5, enemyBuffDuration: 5,
  selfStunDuration: 1, leapDistance: 3,
} as const;

/** Untrusted save/console data: do not preserve references or unknown fields. */
export function normalizeEnchantments(input: unknown): Enchantment[] {
  if (!Array.isArray(input)) return [];
  const result: Enchantment[] = [];
  const seen = new Set<EnchantmentId>();
  for (const raw of input) {
    const entry = typeof raw === 'string' ? { id: raw } : raw;
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' ||
        !Object.prototype.hasOwnProperty.call(ENCHANTMENTS, entry.id)) continue;
    const id = entry.id as EnchantmentId;
    if (seen.has(id)) continue;
    const chance = entry.chance;
    if (chance !== undefined && (typeof chance !== 'number' || !Number.isFinite(chance) || chance < 0 || chance > 1)) continue;
    result.push(chance === undefined ? { id } : { id, chance });
    seen.add(id);
    if (result.length === MAX_ENCHANTMENTS) break;
  }
  return result;
}

/** One roll per enchantment per weapon-damaged target. Chaos does not roll the selected effect again. */
export function rollEnchantments(entries: readonly Enchantment[], rng: () => number = Math.random): EnchantmentProc[] {
  const procs: EnchantmentProc[] = [];
  for (const entry of entries) {
    const chance = entry.chance ?? ENCHANTMENTS[entry.id].chance;
    if (chance <= 0 || rng() >= chance) continue;
    procs.push(entry.id === 'chaos'
      ? CHAOS_OUTCOMES[Math.min(CHAOS_OUTCOMES.length - 1, Math.floor(rng() * CHAOS_OUTCOMES.length))]
      : entry.id);
  }
  return procs;
}

/** One refreshed, strongest bleed per target. Reapplication preserves the next tick. */
export class BleedEffects<T extends object> {
  private effects = new Map<T, { remaining: number; untilTick: number; damage: number }>();
  get count() { return this.effects.size; }
  apply(target: T, weaponDamage: number) {
    if (!Number.isFinite(weaponDamage) || weaponDamage <= 0) return;
    const active = this.effects.get(target);
    this.effects.set(target, {
      remaining: ENCHANTMENT_BALANCE.bleedDuration,
      untilTick: active?.untilTick ?? 1,
      damage: Math.max(active?.damage ?? 0, weaponDamage * ENCHANTMENT_BALANCE.bleedDamage),
    });
  }
  update(dt: number, isAlive: (target: T) => boolean, dealDamage: (target: T, damage: number) => void) {
    if (!Number.isFinite(dt) || dt < 0) return;
    for (const [target, effect] of this.effects) {
      if (!isAlive(target)) { this.effects.delete(target); continue; }
      const elapsed = Math.min(dt, effect.remaining);
      effect.remaining -= elapsed;
      effect.untilTick -= elapsed;
      while (effect.untilTick <= 1e-9 && isAlive(target)) {
        dealDamage(target, effect.damage);
        effect.untilTick += 1;
      }
      if (effect.remaining <= 1e-9 || !isAlive(target)) this.effects.delete(target);
    }
  }
  clear() { this.effects.clear(); }
}
