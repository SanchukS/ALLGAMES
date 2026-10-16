import * as THREE from 'three';

/** Ground-sector preview, using the same range, yaw and arc as hit detection. */
export class AttackPreview {
  readonly root = new THREE.Group();
  private material = new THREE.MeshBasicMaterial({ color: 0xa7efff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  private outlineMaterial = new THREE.LineBasicMaterial({ color: 0xd6faff, transparent: true, opacity: 0.95, depthWrite: false });
  private mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
  private outline = new THREE.Line(new THREE.BufferGeometry(), this.outlineMaterial);
  private key = '';

  constructor(scene: THREE.Scene) {
    this.root.add(this.mesh, this.outline);
    this.root.visible = false;
    scene.add(this.root);
  }

  update(position: THREE.Vector3, yaw: number, range: number, arc: number, visible: boolean, ready = true) {
    this.root.visible = visible;
    if (!visible) return;
    const key = `${range}:${arc}`;
    if (key !== this.key) {
      this.key = key;
      const points = [new THREE.Vector3(0, 0, 0)];
      const vertices: number[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = THREE.MathUtils.degToRad(-arc / 2 + arc * i / 64);
        points.push(new THREE.Vector3(Math.sin(a) * range, 0, Math.cos(a) * range));
        if (i) vertices.push(0, 0, 0, ...points[i].toArray(), ...points[i + 1].toArray());
      }
      points.push(new THREE.Vector3());
      this.mesh.geometry.dispose();
      this.outline.geometry.dispose();
      this.mesh.geometry = new THREE.BufferGeometry();
      this.mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      this.outline.geometry = new THREE.BufferGeometry().setFromPoints(points);
    }
    this.root.position.copy(position);
    this.root.position.y += 0.08;
    this.root.rotation.y = yaw;
    this.material.color.setHex(ready ? 0xa7efff : 0xffad71);
    this.outlineMaterial.color.setHex(ready ? 0xd6faff : 0xffad71);
  }

  hide() { this.root.visible = false; }
  dispose() {
    this.root.removeFromParent();
    this.mesh.geometry.dispose(); this.outline.geometry.dispose();
    this.material.dispose(); this.outlineMaterial.dispose();
  }
}
