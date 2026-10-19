import * as THREE from 'three';

const steel = new THREE.MeshLambertMaterial({ color: 0xbbccd2 });
const gold = new THREE.MeshLambertMaterial({ color: 0xe0b64d });
const red = new THREE.MeshLambertMaterial({ color: 0x9d293d });
const shape = new THREE.Shape();
shape.moveTo(0, 27);
shape.bezierCurveTo(-8, 40, -2, 56, 17, 57);
shape.bezierCurveTo(34, 57, 40, 42, 33, 29);
shape.bezierCurveTo(32, 44, 20, 47, 12, 41);
shape.bezierCurveTo(7, 37, 6, 32, 6, 27);
shape.closePath();
const blade = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: true, bevelSize: .7, bevelThickness: .5, bevelSegments: 1, steps: 1, curveSegments: 9 });
blade.translate(0, 0, -1.2);
const grip = new THREE.CylinderGeometry(2.6, 3, 26, 8);
const gemGeometry = new THREE.OctahedronGeometry(3.5);
const collar = new THREE.CylinderGeometry(3.7, 3.7, 2.3, 8);
/** Centimetre geometry compatible with attachWeapon; immutable shared resources. */
export function createSickleModel() {
  const root = new THREE.Group();
  root.name = 'synergy_sickle';
  root.add(new THREE.Mesh(blade, steel));
  const handle = new THREE.Mesh(grip, red);
  handle.position.y = 13; root.add(handle);
  for (const y of [1, 7, 20, 26]) { const band = new THREE.Mesh(collar, gold); band.position.y = y; root.add(band); }
  const gem = new THREE.Mesh(gemGeometry, red);
  gem.position.set(3, 31, 2); root.add(gem);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return root;
}
