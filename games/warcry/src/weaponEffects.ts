import * as THREE from 'three';

/** Short-lived light ribbons, independent of attack animation timing. */
export class WeaponEffects {
  private effects: { mesh: THREE.Mesh; t: number; duration: number }[] = [];
  constructor(private scene: THREE.Scene) {}
  slash(at: THREE.Vector3, yaw: number, range: number, arc: number, color: number, upgraded: boolean) {
    for (let layer = 0; layer < (upgraded ? 2 : 1); layer++) {
      const geometry = new THREE.RingGeometry(range * (layer ? 0.65 : 0.8), range * (layer ? 0.75 : 1), 48, 1,
        -THREE.MathUtils.degToRad(arc / 2), THREE.MathUtils.degToRad(arc));
      const positions = geometry.getAttribute('position');
      // Ring starts on +X; remap into the game's +Z-forward ground convention.
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i);
        positions.setXYZ(i, y, 0, x);
      }
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.copy(at); mesh.position.y = 0.13 + layer * 0.02;
      mesh.rotation.y = yaw;
      this.scene.add(mesh);
      this.effects.push({ mesh, t: 0, duration: 0.22 });
    }
  }
  update(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.t += dt;
      const f = e.t / e.duration;
      if (f >= 1) {
        e.mesh.removeFromParent(); e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose(); this.effects.splice(i, 1);
      } else {
        (e.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - f);
        e.mesh.scale.setScalar(0.92 + f * 0.12);
      }
    }
  }
}
