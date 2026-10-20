import * as THREE from 'three';

interface Target { pos: THREE.Vector3; hittable: boolean }
const ringGeometry = new THREE.RingGeometry(.37, .46, 24);
const markMaterial = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false });
const countMaterials = ['00100/01100/00100/00100/00100/00100/01110', '01110/10001/00001/00010/00100/01000/11111'].map(pattern => {
  // Shared bitmap badges need no canvas or font loading and always face the camera.
  const rows = pattern.split('/');
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const distance = Math.hypot(x - 31.5, y - 31.5);
    if (distance > 31) continue;
    const row = Math.floor((y - 11) / 6), col = Math.floor((x - 17) / 6);
    const digit = row >= 0 && row < 7 && col >= 0 && col < 5 && rows[row][col] === '1';
    const color = digit ? [255, 245, 248, 255] : distance > 27 ? [255, 65, 95, 255] : [60, 8, 22, 245];
    pixels.set(color, ((63 - y) * 64 + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
});

/** Two visible marks, refreshed by cuts and consumed once by a completed pull. */
export class BloodMarks<T extends Target> {
  private marks = new Map<T, { stacks: number; until: number; root: THREE.Group; counter: THREE.Sprite }>();
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
      const counter = new THREE.Sprite(countMaterials[0]);
      counter.name = 'blood-mark-count';
      counter.position.y = 3.2;
      counter.scale.set(.65, .65, 1);
      counter.renderOrder = 20;
      root.add(counter);
      this.scene.add(root);
      mark = { stacks: 0, until: now + 8, root, counter }; this.marks.set(target, mark);
    }
    mark.stacks = Math.min(2, mark.stacks + 1); mark.until = now + 8;
    mark.root.position.copy(target.pos); mark.root.children[1].visible = mark.stacks === 2;
    mark.counter.material = countMaterials[mark.stacks - 1];
    mark.counter.userData.count = mark.stacks;
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
