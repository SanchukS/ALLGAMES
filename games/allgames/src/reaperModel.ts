import * as THREE from 'three';

/** Authored in centimetres, like the imported character rigs. Shared immutable
 * geometry keeps each equipped chain cheap; link transforms belong to each copy. */
const steel = new THREE.MeshLambertMaterial({ color: 0xa8bcc5 });
const dark = new THREE.MeshLambertMaterial({ color: 0x343c49 });
const leather = new THREE.MeshLambertMaterial({ color: 0x422a31 });
const gold = new THREE.MeshLambertMaterial({ color: 0xcba668 });
const edge = new THREE.MeshLambertMaterial({ color: 0xe2f6ed, emissive: 0x143b30 });
const linkGeometry = new THREE.TorusGeometry(2.6, 0.75, 5, 10);
const bladeShape = new THREE.Shape();
bladeShape.moveTo(0, 0);
bladeShape.bezierCurveTo(14, 14, 34, 18, 43, -8);
bladeShape.bezierCurveTo(30, 5, 17, 1, 8, -10);
bladeShape.lineTo(3, -7);
bladeShape.closePath();
const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, { depth: 2.6, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.9, bevelThickness: 0.6, curveSegments: 10 });
bladeGeometry.translate(0, 0, -1.3);
const handleGeometry = new THREE.CylinderGeometry(2.1, 2.6, 22, 8);
const collarGeometry = new THREE.TorusGeometry(2.7, 0.8, 5, 10);
const LINK_COUNT = 28;
const states = new WeakMap<THREE.Object3D, { time: number; elapsed: number; duration: number; aiming: boolean; ready: boolean; links: THREE.InstancedMesh; blade: THREE.Group }>();
const dummy = new THREE.Object3D();
const axis = new THREE.Vector3(0, 1, 0);
const tangent = new THREE.Vector3();
const start = new THREE.Vector3();
const end = new THREE.Vector3();

export function createReaperModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'reaper_chain_model';
  const handle = new THREE.Mesh(handleGeometry, leather);
  handle.position.y = 11;
  root.add(handle);
  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(collarGeometry, i === 0 || i === 5 ? gold : dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1 + i * 4;
    root.add(ring);
  }
  const links = new THREE.InstancedMesh(linkGeometry, steel, LINK_COUNT);
  links.name = 'reaper_metal_links';
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // The chain grows outside its initial coil, so cached instance bounds are invalid.
  links.frustumCulled = false;
  root.add(links);
  const blade = new THREE.Group();
  blade.name = 'reaper_curved_blade';
  blade.add(new THREE.Mesh(bladeGeometry, steel));
  const cuttingEdge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
    new THREE.CubicBezierCurve3(new THREE.Vector3(43, -8, 1.8), new THREE.Vector3(30, 5, 1.8), new THREE.Vector3(17, 1, 1.8), new THREE.Vector3(8, -10, 1.8)).getPoints(16)), new THREE.LineBasicMaterial({ color: 0xc5ffee }));
  blade.add(cuttingEdge);
  const rivet = new THREE.Mesh(new THREE.OctahedronGeometry(3), edge);
  rivet.position.set(4, 0, 2);
  blade.add(rivet);
  root.add(blade);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  states.set(root, { time: 0, elapsed: 1, duration: 0, aiming: false, ready: false, links, blade });
  updateReaperModel(root, 0);
  return root;
}

function findModel(holder: THREE.Object3D | null) {
  return holder?.getObjectByName('reaper_chain_model');
}

/** Starts a visual cast; hit timing and gameplay remain owned by the combat code. */
export function castReaperModel(holder: THREE.Object3D | null, duration: number) {
  const model = findModel(holder);
  const state = model && states.get(model);
  if (state) { state.elapsed = 0; state.duration = Math.max(0.15, duration); }
}

export function aimReaperModel(holder: THREE.Object3D | null, active: boolean, ready: boolean) {
  const model = findModel(holder);
  const state = model && states.get(model);
  if (state) { state.aiming = active; state.ready = ready; }
}

export function updateReaperModel(holder: THREE.Object3D | null, dt: number) {
  const model = findModel(holder);
  const s = model && states.get(model);
  if (!s) return;
  s.time += dt;
  s.elapsed += dt;
  const progress = s.duration > 0 ? Math.min(1, s.elapsed / s.duration) : 1;
  const extension = Math.sin(progress * Math.PI);
  const orbit = s.time * (s.aiming ? (s.ready ? 9 : 5) : 1.5);
  // Idle: slack coil. Attack: uncoils to a long, taut, sweeping chain and recoils.
  const point = (t: number, out: THREE.Vector3) => {
    const coil = t * Math.PI * 3.6 + orbit;
    const radius = (1 - extension) * 11 * Math.sin(t * Math.PI * .8);
    return out.set(
      Math.sin(coil) * radius + Math.sin(progress * Math.PI * 1.5) * extension * t * 58,
      23 + t * (49 + extension * 90),
      Math.cos(coil) * radius + Math.sin(t * Math.PI) * extension * 14,
    );
  };
  for (let i = 0; i < LINK_COUNT; i++) {
    const t = i / (LINK_COUNT - 1);
    point(t, start); point(Math.min(1, t + 0.015), end);
    if (i === LINK_COUNT - 1) { point(t - 0.015, start); point(t, end); }
    tangent.subVectors(end, start).normalize();
    point(t, dummy.position);
    dummy.quaternion.setFromUnitVectors(axis, tangent);
    dummy.rotateY(i % 2 ? Math.PI / 2 : 0);
    dummy.scale.set(1, 1.4, 1);
    dummy.updateMatrix();
    s.links.setMatrixAt(i, dummy.matrix);
  }
  s.links.instanceMatrix.needsUpdate = true;
  point(1, s.blade.position);
  s.blade.quaternion.setFromUnitVectors(axis, tangent);
  s.blade.rotateY(-0.4 + extension * 1.5);
}
