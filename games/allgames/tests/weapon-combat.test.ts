import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
// Character's shared shadow texture is initialized on import; no real canvas is needed.
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0,
  getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
}) } });
const { Game } = await import('../src/game');
const { Mob } = await import('../src/mobs/mob');

// Real Game methods with rendering, audio and numerical damage rolls isolated.
// No Game constructor (WebGL/assets/world), and no browser or invented combat model.
const noop = () => {};
function enemy(x = 0, z = 1, passive = false) {
  return Object.assign(Object.create(Mob.prototype), {
    ch: { position: new THREE.Vector3(x, 0, z), root: { visible: true } },
    state: 'chase', hp: 10000, radius: .1, awake: true, rise: 0, ritual: 0,
    impact: -1, casting: 0, animDelay: -1, stun: 0, knock: new THREE.Vector3(),
    behavior: { disposition: passive ? 'passive' : 'aggressive' },
    def: { crit: 0, critDmg: 0, resist: {}, dodge: 0 },
  });
}
function setup(def = 'sword', lvl = 5) {
  const g: any = Object.create(Game.prototype);
  const item = { def, uid: 42, lvl };
  const calls: { target: any; damage: number }[] = [];
  Object.assign(g, {
    save: { weapons: [item, null] },
    hero: { position: new THREE.Vector3(), facing: 0, hit: noop, swing: noop, attack: noop },
    units: [], abilityCharges: new Map(), daggerStacks: new WeakMap(), parries: new WeakMap(),
    weaponEffects: { slash: noop }, waves: { add: noop }, particles: { burst: noop }, fx: { spawn: noop },
    ui: { hurtFlash: noop }, heroBar: { el: { offsetHeight: 0 } }, heroScale: 1,
    time: 10, shake: 0, dead: false, cut: false, hp: 1000, leap: null,
    damageFor: (_item: any, _def: any, mult: number) => ({ dmg: 10 * mult, tier: 'normal', fx: '' }),
    damageMob: (target: any, damage: number) => { target.hp -= damage; calls.push({ target, damage }); },
    fightOf: () => ({ hits: 0, taken: 0 }),
  });
  Object.defineProperty(g, 'stats', { value: { power: 0, powerMul: 1, dodge: 0, defense: 0 } });
  const h = { i: 0, plan: { kind: 'normal', yaw: 0, damageScale: 1, areaScale: 1, distance: 0 },
    level: lvl, yaw: 0, second: -1, atkCd: 0, impact: -1, impactAt: .3, combo: 0,
    lastSwing: -99, launch: -1, flight: 0, bolt: null, aim: null };
  return { g, h, calls, item };
}

test('real normal strike selects nearest living enemy inside sector at impact', () => {
  const { g, h, calls } = setup();
  const near = enemy(0, 1), far = enemy(0, 2), behind = enemy(0, -1), dead = enemy(0, .2);
  dead.state = 'dead'; g.units = [far, behind, dead, near];
  assert.equal(g.prototypeStrike(h), 1);
  assert.deepEqual(calls.map(c => c.target), [near]);
});

test('real area strike hits all in sector; charge only recharges from positive normal enemy hits', () => {
  const { g, h, item } = setup();
  const a = enemy(), b = enemy(.5, 1); g.units = [a, b];
  const charges = g.chargesFor(item); charges.use(0);
  h.plan.kind = 'sweep'; assert.equal(g.prototypeStrike(h), 2);
  assert.equal(charges.remaining[0], 3);
  h.plan.kind = 'normal'; g.prototypeStrike(h); assert.equal(charges.remaining[0], 2);
  const damage = g.damageMob; g.damageMob = noop; g.prototypeStrike(h); assert.equal(charges.remaining[0], 2);
  g.damageMob = damage; g.units = [enemy(0, 1, true)]; g.prototypeStrike(h); assert.equal(charges.remaining[0], 2);
  g.units = []; g.prototypeStrike(h); assert.equal(charges.remaining[0], 2);
});

test('real dagger finishers replace damage only on each target’s tenth stack', () => {
  for (const level of [4, 5]) {
    const { g, h, calls, item } = setup('dagger', level);
    const a = enemy(), b = enemy(); g.units = [a];
    for (let i = 1; i <= 31; i++) {
      g.prototypeStrike(h);
      const expected = i % 10 === 0 ? (i / 10) * (level === 5 ? 1.5 : 1) : 1 + (i - 1) * .08;
      assert.ok(Math.abs(calls[i - 1].damage - 10 * expected) < 1e-6, `level ${level}, stack ${i}`);
    }
    assert.equal(g.daggerStacks.get(a).get(item.uid), 31);
    g.units = [b]; g.prototypeStrike(h);
    assert.equal(calls[31].damage, 10);
    assert.equal(g.daggerStacks.get(b).get(item.uid), 1);
    g.units = [a]; g.prototypeStrike(h);
    assert.equal(g.daggerStacks.get(a).get(item.uid), 32);
    assert.ok(Math.abs(calls[32].damage - 34.8) < 1e-6);
  }
});

test('real level-five parry shares one damage budget across enemies', () => {
  const { g, h } = setup('sword', 5);
  const a = enemy(), b = enemy(.4, 1); a.impact = b.impact = .3;
  g.units = [a, b]; h.plan.kind = 'sweep'; g.prototypeStrike(h);
  assert.equal(g.parries.get(a).pool, g.parries.get(b).pool);
  assert.equal(g.parries.get(a).pool.left, 40);
  const originalRandom = Math.random;
  Math.random = () => .5;
  try {
    g.hurtHero(30, a.pos, a); // Block 30, budget 10 remains.
    assert.equal(g.hp, 1000);
    g.hurtHero(30, b.pos, b); // Block remaining 10, take 20.
    assert.equal(g.hp, 980);
    g.hurtHero(30, a.pos, a); // No second block on the same attack source.
    assert.equal(g.hp, 950);
  } finally { Math.random = originalRandom; }
});

test('real level-four parry protects only nearest attacking enemy', () => {
  const { g, h } = setup('sword', 4);
  const a = enemy(), b = enemy(.5, 1); a.impact = b.impact = .3;
  g.units = [b, a]; h.plan.kind = 'sweep'; g.prototypeStrike(h);
  assert.ok(g.parries.has(a)); assert.equal(g.parries.has(b), false);
});

test('real updateHand schedules two area hits for double sweep, neither recharges it', () => {
  const { g, h, calls, item } = setup('sword', 3);
  g.units = [enemy()];
  const gesture = { yaw: 0, heldSeconds: .5, sweepCount: 2, sweepYaw: 0, leap: false, distance: 1, aimed: true };
  g.updateHand(h, .01, gesture);
  assert.equal(h.plan.kind, 'doubleSweep');
  assert.equal(calls.length, 0);
  g.updateHand(h, .4, null);
  assert.equal(calls.length, 1);
  g.updateHand(h, .51, null);
  assert.equal(calls.length, 2);
  assert.equal(g.chargesFor(item).remaining[0], 3);
  g.updateHand(h, .2, null); assert.equal(calls.length, 2);
});

test('real charged hammer hits expanded circle, knocks back and stuns each enemy', () => {
  const { g, h, calls, item } = setup('hammer', 2);
  const a = enemy(0, 1), b = enemy(0, 4); a.impact = b.impact = .2;
  g.units = [a, b];
  const gesture = { yaw: 0, heldSeconds: 2, sweepCount: 0, sweepYaw: 0, leap: false, distance: 1, aimed: true };
  g.updateHand(h, .01, gesture);
  assert.equal(h.plan.kind, 'charge');
  g.updateHand(h, .42, null);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.damage === 20));
  assert.equal(a.stun, 1); assert.equal(b.stun, 1);
  assert.equal(a.impact, -1); assert.equal(b.impact, -1);
  assert.ok(a.knock.z < 0 && b.knock.z > 0);
  assert.equal(g.chargesFor(item).remaining[0], 3);
});

test('double sweep can parry newly attacking enemy on second cut without replenishing shared budget', () => {
  const { g, h } = setup('sword', 5);
  const a = enemy(), b = enemy(.5, 1);
  a.impact = .3; g.units = [a, b];
  const gesture = { yaw: 0, heldSeconds: .5, sweepCount: 2, sweepYaw: 0, leap: false, distance: 1, aimed: true };
  g.updateHand(h, .01, gesture); g.updateHand(h, .4, null);
  const originalPool = g.parries.get(a).pool;
  assert.equal(g.parries.has(b), false);
  const originalRandom = Math.random; Math.random = () => .5;
  try {
    g.hurtHero(30, a.pos, a);
    assert.equal(originalPool.left, 10);
    a.impact = -1; b.impact = .3;
    g.updateHand(h, .51, null);
    assert.equal(g.parries.get(b).pool, originalPool);
    assert.equal(g.parries.get(b).pool.left, 10);
    g.hurtHero(30, b.pos, b);
    assert.equal(g.hp, 980); // Exactly40 blocked across both cuts, never a second40 budget.
    assert.equal(originalPool.left, 0);
  } finally { Math.random = originalRandom; }
});

test('stunned enemy cannot land pending direct damage, while existing damage-over-time still ticks', () => {
  const { g } = setup(); const source = enemy(); source.stun = 1;
  const originalRandom = Math.random; Math.random = () => .5;
  try {
    g.hurtHero(30, source.pos, source);
    assert.equal(g.hp, 1000);
    g.hurtHero(30, source.pos, source, true);
    assert.equal(g.hp, 970);
    source.stun = 0;
    g.hurtHero(30, source.pos, source);
    assert.equal(g.hp, 940);
  } finally { Math.random = originalRandom; }
});

test('real leap path clamps landing at blockers and scales damage and area by actual distance', () => {
  for (const blocked of [false, true]) {
    const { g, h, calls } = setup('hammer', 4);
    g.world = { collide(p: THREE.Vector3) { if (blocked && p.z > 1.05) p.z = 1; } };
    g.collideBlockers = noop;
    const expectedDistance = blocked ? 1 : 5;
    const target = enemy(0, expectedDistance); g.units = [target];
    const gesture = { yaw: 0, heldSeconds: .3, sweepCount: 0, sweepYaw: 0, leap: true, distance: 1, aimed: true };
    g.updateHand(h, .01, gesture);
    assert.equal(h.plan.kind, 'leap');
    assert.ok(Math.abs(g.leap.to.z - expectedDistance) < 1e-6);
    assert.ok(Math.abs(h.plan.distance - expectedDistance / 5) < 1e-6);
    assert.ok(Math.abs(h.plan.damageScale - (1 + expectedDistance / 5)) < 1e-6);
    assert.equal(h.plan.areaScale, h.plan.damageScale);
    g.updateHand(h, .42, null);
    assert.equal(g.leap, null);
    assert.ok(Math.abs(g.hero.position.z - expectedDistance) < 1e-6);
    assert.equal(calls.length, 1);
    assert.ok(Math.abs(calls[0].damage - (blocked ? 12 : 20)) < 1e-6);
  }
});


test('hammer ordinary and charged circles rotate in front of hero and exclude enemies behind', () => {
  for (const kind of ['normal', 'charge']) {
    const { g, h, calls } = setup('hammer', 2);
    h.plan = { kind, yaw: Math.PI / 2, damageScale: 1, areaScale: kind === 'charge' ? 2 : 1, distance: 0 };
    const front = enemy(2, 0), behind = enemy(-1, 0);
    const initialHp = behind.hp;
    g.units = [behind, front];
    g.prototypeStrike(h);
    assert.equal(calls.length, 1);
    assert.equal(behind.hp, initialHp);
    assert.ok(front.hp < initialHp);
    const center = g.weaponAttackCenter(new THREE.Vector3(), 'hammer', kind, Math.PI / 2, 2);
    assert.ok(Math.abs(center.x - 2) < 1e-6);
    assert.ok(Math.abs(center.z) < 1e-6);
  }
  const { g } = setup('hammer', 4);
  const landing = new THREE.Vector3(3, 0, 4);
  assert.deepEqual(g.weaponAttackCenter(landing, 'hammer', 'leap', 0, 2), landing);
});

test('each attack-circle release reaches only its corresponding hand', () => {
  const { g } = setup();
  const a = { aimed: true, yaw: .4 }, b = { aimed: true, yaw: -.7 };
  g.hands = [{ i: 0 }, { i: 1 }];
  const routed: any[] = [];
  g.updateHand = (hand: any, _dt: number, attack: any) => routed.push([hand.i, attack]);
  g.updateWeaponHands(.01, [null, b]);
  assert.deepEqual(routed, [[0, null], [1, b]]);
  routed.length = 0;
  g.updateWeaponHands(.01, [a, b]);
  assert.deepEqual(routed, [[0, a], [1, b]]);
  g.cut = true; routed.length = 0;
  g.updateWeaponHands(.01, [a, b]);
  assert.deepEqual(routed, [[0, null], [1, null]]);
});

test('two equipped weapons keep independent hit-based ability cooldowns', () => {
  const { g, item } = setup();
  const other = { ...item, uid: 43 };
  const first = g.chargesFor(item), second = g.chargesFor(other);
  first.use(0); second.use(1);
  first.normalHit();
  assert.deepEqual(first.remaining, [2, 0]);
  assert.deepEqual(second.remaining, [0, 3]);
});

test('secondary weapon performs a real hit without starting the primary weapon', () => {
  const { g, h, calls, item } = setup('sword', 1);
  g.save.weapons[1] = { ...item, def: 'dagger', uid: 43 };
  const off = { ...h, i: 1 };
  g.hands = [h, off]; g.units = [enemy()];
  const gesture = { yaw: 0, heldSeconds: .1, sweepCount: 0, sweepYaw: 0, leap: false, distance: 1, aimed: true };
  g.updateWeaponHands(.01, [null, gesture]);
  assert.equal(h.impact, -1);
  assert.equal(h.combo, 0);
  assert.equal(off.combo, 1);
  g.updateWeaponHands(.25, [null, null]);
  assert.equal(calls.length, 1);
  assert.equal(h.combo, 0);
});


test('all prototype weapons animate the attacking hand instead of a right-handed clip', () => {
  for (const def of ['sword', 'dagger', 'hammer']) {
    for (const hand of [0, 1]) {
      const { g, h, item } = setup(def, 1);
      g.save.weapons[hand] = item;
      h.i = hand;
      const swings: any[] = [];
      g.hero.swing = (...args: any[]) => swings.push(args);
      g.hero.attack = () => assert.fail('Right-handed clip must not play for prototype weapons');
      g.updateHand(h, .01, { yaw: 0, heldSeconds: .1, sweepCount: 0, sweepYaw: 0, leap: false, distance: 1, aimed: true });
      assert.equal(swings.length, 1, def);
      assert.equal(swings[0][1], hand, def);
      assert.equal(swings[0][3], h.impactAt, 'animation and damage share the impact time');
    }
  }
});

test('reaper ordinary strike splashes but recharges only once per successful attack', () => {
  const { g, h, calls, item } = setup('reaper', 2);
  g.units = [enemy(-.3, 1), enemy(.3, 1), enemy(0, 2)];
  g.chargesFor(item).use(0);
  assert.equal(g.prototypeStrike(h), 3);
  assert.equal(calls.length, 3);
  assert.equal(g.chargesFor(item).remaining[0], 2);
});

function reaperSetup(level: number) {
  const { g } = setup('reaper', level);
  const killed: any[] = [];
  Object.assign(g, { reaperPulls: [], scene: new THREE.Scene(), world: { collide: noop }, collideBlockers: noop,
    killMob: (m: any) => { killed.push(m); m.state = 'dead'; },
  });
  return { g, killed };
}

test('reaper pulls six nearest enemies forward, excludes bosses, executes lowest HP excess per cast', () => {
  for (const level of [2, 4, 5]) {
    const { g, killed } = reaperSetup(level);
    const mobs = Array.from({ length: 7 }, (_, i) => enemy((i - 3) * .3, 3));
    mobs.forEach((m, i) => m.hp = 100 + i);
    const boss = enemy(0, .5); boss.def.boss = {};
    g.mobs = [...mobs, boss];
    g.startReaperPull(Math.PI / 2, level);
    const chosen = g.reaperPulls[0].targets.map((t: any) => t.mob);
    assert.equal(chosen.length, 6); assert.equal(chosen.includes(boss), false);
    g.updateReaperPulls(.45);
    assert.equal(killed.length, level === 2 ? 0 : level === 4 ? 3 : 4);
    assert.ok(chosen.every((m: any) => m.pos.x > 1.5 && Math.abs(m.pos.z) < .5));
    assert.equal(boss.pos.z, .5);
    assert.deepEqual(killed, [...chosen].sort((a: any,b: any) => (100 + mobs.indexOf(a)) - (100 + mobs.indexOf(b))).slice(0, killed.length));
    assert.equal(g.reaperPulls.length, 0);
    assert.equal(g.scene.children.length, 0);
  }
});

test('blocked pull does not pass a wall and never contributes to execution count', () => {
  const { g, killed } = reaperSetup(5);
  g.mobs = Array.from({ length: 6 }, (_, i) => enemy(i * .05, 4));
  g.world.collide = (p: THREE.Vector3) => { if (p.z < 3 && p.z > 2.5) p.z = 3; };
  g.startReaperPull(0, 5);
  g.updateReaperPulls(.45);
  assert.equal(killed.length, 0);
  assert.ok(g.mobs.every((m: any) => m.pos.z >= 3));
});

test('reaper execution counts each cast separately and never includes minibosses', () => {
  const { g, killed } = reaperSetup(4);
  const mini = enemy(0, 1); mini.def.rank = 'mini';
  g.mobs = [enemy(-.2, 3), enemy(.2, 3), mini];
  g.startReaperPull(0, 4); g.updateReaperPulls(.45);
  assert.equal(killed.length, 0); assert.equal(mini.pos.z, 1);
  // Previous survivors are out of range: they do not count towards this cast.
  g.mobs[0].pos.set(20, 0, 20); g.mobs[1].pos.set(21, 0, 20);
  g.mobs.push(enemy(-.2, 3), enemy(.2, 3));
  g.startReaperPull(0, 4); g.updateReaperPulls(.45);
  assert.equal(killed.length, 0);
});


test('reaper cannot pull enemies into the protected camp or execute blocked arrivals', () => {
  const { g, killed } = reaperSetup(5);
  g.hero.position.set(0, 0, -36);
  g.mobs = Array.from({ length: 6 }, (_, i) => enemy(i * .1, -33));
  g.startReaperPull(Math.PI, 5); g.updateReaperPulls(.45);
  assert.equal(killed.length, 0);
  assert.ok(g.mobs.every((m: any) => Math.hypot(m.pos.x, m.pos.z + 52) >= 16.5 + m.radius));
});

test('reaper full-turn release consumes pull cooldown and starts pull at cast impact without strike damage', () => {
  const { g, h, calls, item } = setup('reaper', 4);
  const casts: any[] = [];
  g.startReaperPull = (...args: any[]) => casts.push(args);
  g.updateHand(h, .01, { yaw: .8, heldSeconds: 1, sweepCount: 1, sweepYaw: 0, leap: false, distance: 1, aimed: true, reaperTurn: true });
  assert.equal(h.plan.kind, 'pull');
  assert.equal(g.chargesFor(item).remaining[0], 3);
  assert.equal(casts.length, 0);
  g.updateHand(h, .3, null);
  assert.deepEqual(casts, [[.8, 4]]);
  assert.equal(calls.length, 0);
});

function awakenPair(g: any, item: any) {
  Object.assign(item, { kind: 'weapon', awakened: true });
  g.save.weapons[1] = { kind: 'weapon', def: item.def === 'hammer' ? 'sword' : 'hammer', uid: 43, lvl: 5, awakened: true };
}
test('harvest sickle rolls once per victim per cut and never parries', () => {
  const { g, h, item } = setup(); awakenPair(g, item);
  let summoned = 0; g.harvestHelpers = { summon: () => summoned++ };
  const a = enemy(), b = enemy(.4, 1); a.impact = b.impact = .3; g.units = [a,b];
  h.plan.kind = 'doubleSweep';
  const random = Math.random; Math.random = () => .19;
  try { g.prototypeStrike(h); g.prototypeStrike(h, true); }
  finally { Math.random = random; }
  assert.equal(summoned, 4); assert.equal(g.parries.has(a), false);
  h.plan.kind = 'normal'; g.prototypeStrike(h); assert.equal(summoned, 4);
});
test('harvest hammer charges in one normal hit and does not knock back', () => {
  const { g, h, item } = setup('hammer'); awakenPair(g, item);
  const m = enemy(0, 2); g.units = [m];
  const knocks: number[] = [];
  g.damageMob = (target: any, damage: number, _tier: string, knock: number) => { target.hp -= damage; knocks.push(knock); };
  g.updateHand(h, .01, { aimed: true, heldSeconds: 2, yaw: 0, sweepCount: 0, leap: false });
  assert.equal(g.chargesFor(item).remaining[0], 1);
  g.updateHand(h, .42, null);
  assert.deepEqual(knocks, [0]); assert.equal(m.knock.length(), 0); assert.equal(m.stun, 1);
  h.plan.kind = 'normal'; g.prototypeStrike(h);
  assert.equal(g.chargesFor(item).remaining[0], 0); assert.deepEqual(knocks, [0, 0]);
});
test('double cut waits half a second and animates its return before impact', () => {
  const { g, h, calls } = setup(); g.units = [enemy()];
  const swings: unknown[] = []; g.hero.swing = (...args: unknown[]) => swings.push(args);
  g.updateHand(h, .01, { aimed: true, heldSeconds: 0, yaw: 0, sweepYaw: 0, sweepCount: 2 });
  g.updateHand(h, .4, null); assert.equal(calls.length, 1);
  g.updateHand(h, .31, null); assert.equal(calls.length, 1); assert.equal(swings.length, 2);
  g.updateHand(h, .18, null); assert.equal(calls.length, 1);
  g.updateHand(h, .02, null); assert.equal(calls.length, 2);
});


test('sword cuts start on weapon side and return, in either hand after any normal combo', () => {
  for (const hand of [0, 1]) for (const combo of [0, 1, 2, 3]) {
    const { g, h, item } = setup();
    g.save.weapons = hand === 0 ? [item, null] : [null, item];
    h.i = hand; h.combo = combo;
    const swings: unknown[][] = [];
    g.hero.swing = (...args: unknown[]) => swings.push(args);
    g.updateHand(h, .01, { aimed: true, heldSeconds: 0, yaw: 0, sweepYaw: 0, sweepCount: 2 });
    g.updateHand(h, .4, null);
    g.updateHand(h, .31, null);
    assert.deepEqual(swings.map(s => s.slice(0, 2)), [['slashRL', hand], ['slashLR', hand]]);
  }
});
