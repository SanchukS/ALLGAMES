import * as THREE from 'three';
import { createSickleModel } from './sickleModel';

export interface HarvestTarget { position: THREE.Vector3; dead: boolean }
export interface HarvestHost<T extends HarvestTarget = HarvestTarget> {
  heroPosition: THREE.Vector3;
  characterDamage: number;
  enemies: readonly T[];
  /** Return false if no hit landed (immune, removed, etc.). */
  dealDamage(target: T, damage: number): boolean | void;
  blocked?(x: number, z: number): boolean;
}
interface Helper { root: THREE.Group; weapon: THREE.Group; age: number; cd: number; hits: number; sickle: boolean; phase: number; swing: number }
const skin = new THREE.MeshLambertMaterial({ color: 0x8bbca7 });
const cloth = new THREE.MeshLambertMaterial({ color: 0x425961 });
const metal = new THREE.MeshLambertMaterial({ color: 0xa5afb9 });
const wood = new THREE.MeshLambertMaterial({ color: 0x724c32 });
const torso = new THREE.CylinderGeometry(.12, .18, .28, 6);
const head = new THREE.IcosahedronGeometry(.14, 0);
const limb = new THREE.BoxGeometry(.07, .19, .08);
const shaft = new THREE.CylinderGeometry(.025, .025, .35, 6);
const hammerhead = new THREE.BoxGeometry(.28, .14, .14);
const splashRing = new THREE.RingGeometry(1.58, 1.8, 40).rotateX(-Math.PI / 2);
const distance = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

/** Temporary allies; uses no Game globals, assets, timers, or network resources. */
export class HarvestHelpers<T extends HarvestTarget = HarvestTarget> {
  private helpers: Helper[] = [];
  private splashes: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number }[] = [];
  constructor(private scene: THREE.Scene, private random: () => number = Math.random) {}
  get count() { return this.helpers.length; }

  summon(at: THREE.Vector3): boolean {
    if (this.helpers.length >= 6) return false;
    const root = new THREE.Group(); root.name = 'harvest_helper'; root.position.copy(at);
    const body = new THREE.Mesh(torso, cloth); body.position.y = .27; root.add(body);
    const face = new THREE.Mesh(head, skin); face.position.y = .51; root.add(face);
    for (const x of [-.09, .09]) { const leg = new THREE.Mesh(limb, cloth); leg.position.set(x, .1, 0); root.add(leg); }
    const arm = new THREE.Mesh(limb, skin); arm.position.set(.2, .31, 0); root.add(arm);
    const sickle = this.random() < .5;
    const weapon = new THREE.Group(); weapon.position.set(.22, .26, .04);
    if (sickle) { const model = createSickleModel(); model.scale.setScalar(.008); weapon.add(model); }
    else {
      const handle = new THREE.Mesh(shaft, wood); handle.position.y = .15;
      const tip = new THREE.Mesh(hammerhead, metal); tip.position.y = .33; weapon.add(handle, tip);
    }
    root.add(weapon); this.scene.add(root);
    this.helpers.push({ root, weapon, sickle, age: 0, cd: .15, hits: 0, phase: this.random() * Math.PI * 2, swing: 0 });
    return true;
  }

  update(dt: number, host: HarvestHost<T>) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const effect = this.splashes[i];
      effect.age += dt;
      if (effect.age >= .3) {
        effect.mesh.removeFromParent(); effect.mesh.material.dispose(); this.splashes.splice(i, 1);
      } else {
        const progress = effect.age / .3;
        effect.mesh.scale.setScalar(.65 + .35 * progress);
        effect.mesh.material.opacity = .85 * (1 - progress);
      }
    }
    // Snapshot prevents newborn helpers from attacking recursively this frame.
    for (const h of [...this.helpers]) {
      h.age += dt;
      if (h.age >= 15) { this.remove(h); continue; }
      const pos = h.root.position;
      const fromHero = distance(pos, host.heroPosition);
      if (fromHero > 14) pos.copy(host.heroPosition);
      h.cd -= dt; h.swing = Math.max(0, h.swing - dt);
      h.weapon.rotation.x = -Math.sin(h.swing / .25 * Math.PI) * 1.4;
      h.root.scale.setScalar(Math.min(1, h.age * 6, (15 - h.age) * 3));
      let target: T | undefined;
      let best = Infinity;
      if (fromHero <= 10) for (const enemy of host.enemies) {
        if (enemy.dead || distance(enemy.position, host.heroPosition) > 6) continue;
        const d = distance(enemy.position, pos);
        if (d < best) { target = enemy; best = d; }
      }
      if (target && best <= .95) {
        h.root.rotation.y = Math.atan2(target.position.x - pos.x, target.position.z - pos.z);
        if (h.cd > 0) continue;
        h.cd = h.sickle ? .9 : 1.2; h.swing = .25;
        const splash = (h.hits + 1) % 3 === 0;
        const victims = splash ? host.enemies.filter((e) => !e.dead && distance(e.position, pos) <= 1.8 && distance(e.position, host.heroPosition) <= 6) : [target];
        let landed = false;
        for (const victim of victims) {
          if (victim.dead) continue;
          const at = victim.position.clone();
          if (host.dealDamage(victim, Math.max(0, host.characterDamage) * .25) === false) continue;
          landed = true;
          if (splash && h.sickle && this.random() < .5) this.summon(at);
        }
        if (landed) {
          h.hits++;
          if (splash) {
            const mesh = new THREE.Mesh(splashRing, new THREE.MeshBasicMaterial({
              color: h.sickle ? 0xcffff0 : 0xffcc55, transparent: true, opacity: .85,
              depthWrite: false, side: THREE.DoubleSide,
            }));
            mesh.name = 'harvest_splash';
            mesh.position.set(pos.x, host.heroPosition.y + .045, pos.z);
            mesh.scale.setScalar(.65);
            this.scene.add(mesh); this.splashes.push({ mesh, age: 0 });
          }
        }
      } else {
        const dest = target?.position ?? host.heroPosition;
        const dx = dest.x - pos.x, dz = dest.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d > (target ? .75 : 1)) {
          const step = Math.min(d, dt * 3.4);
          const nx = pos.x + dx / d * step, nz = pos.z + dz / d * step;
          if (!host.blocked?.(nx, nz)) { pos.x = nx; pos.z = nz; }
          else if (!host.blocked(pos.x, nz)) pos.z = nz;
          else if (!host.blocked(nx, pos.z)) pos.x = nx;
          h.root.rotation.y = Math.atan2(dx, dz);
          pos.y = host.heroPosition.y + Math.abs(Math.sin(h.age * 12 + h.phase)) * .04;
        }
      }
    }
  }
  private remove(helper: Helper) {
    helper.root.removeFromParent();
    this.helpers.splice(this.helpers.indexOf(helper), 1);
    // Mesh geometries/materials are shared across helpers and must not be disposed here.
  }
  clear() {
    for (const h of [...this.helpers]) this.remove(h);
    for (const effect of this.splashes) { effect.mesh.removeFromParent(); effect.mesh.material.dispose(); }
    this.splashes = [];
  }
}
