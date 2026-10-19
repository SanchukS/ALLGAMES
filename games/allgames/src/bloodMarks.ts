import * as THREE from 'three';

interface Target { pos: THREE.Vector3; hittable: boolean }
const ringGeometry = new THREE.RingGeometry(.37, .46, 24);
const markMaterial = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false });

/** Two visible marks, refreshed by cuts and consumed once by a completed pull. */
export class BloodMarks<T extends Target> {
  private marks = new Map<T, { stacks: number; until: number; root: THREE.Group }>();
  constructor(private scene: THREE.Scene) {}
  add(target: T, now: number) {
    if (!target.hittable) return;
    let mark = this.marks.get(target);
    if (mark && mark.until <= now) { this.remove(target); mark = undefined; }
    if (!mark) {
      const root = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const ring = new THREE.Mesh(ringGeometry, markMaterial);
        ring.rotation.x = -Math.PI / 2; ring.position.y = 2.1 + i * .2;
        ring.scale.setScalar(1 - i * .2); root.add(ring);
      }
      this.scene.add(root);
      mark = { stacks: 0, until: now + 8, root }; this.marks.set(target, mark);
    }
    mark.stacks = Math.min(2, mark.stacks + 1); mark.until = now + 8;
    mark.root.position.copy(target.pos); mark.root.children[1].visible = mark.stacks === 2;
  }
  consume(target: T, now: number) {
    const mark = this.marks.get(target);
    const stacks = mark && mark.until > now && target.hittable ? mark.stacks : 0;
    this.remove(target); return stacks;
  }
  update(now: number) {
    for (const [target, mark] of this.marks) {
      if (!target.hittable || mark.until <= now) this.remove(target);
      else mark.root.position.copy(target.pos);
    }
  }
  clear() { for (const target of this.marks.keys()) this.remove(target); }
  private remove(target: T) { this.marks.get(target)?.root.removeFromParent(); this.marks.delete(target); }
}
