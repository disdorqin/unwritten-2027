import {
  BoxGeometry, CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace, type BufferGeometry, type Material,
} from 'three';
import type { mountMainSummitAssembly } from './main-summit-assembly';

type Assembly = ReturnType<typeof mountMainSummitAssembly>;

/**
 * D-6 item 4 (总控裁定批60, 2026-11-22): cloud-terrace platform-edge
 * staging. The transfer code is live and untouched; this is staging
 * only, in the summit domain's arrival plaza (local frame, 60 wide x
 * 40 deep, floor = arrivalHeight ~347-350):
 *
 * - a low stone parapet along the plaza's south edge (the edge that
 *   looks out over the cloud sea), with a gap at the arrival gate
 *   (|x| < 5.5) so the wake-in path stays open;
 * - day-visible cloud puffs just beyond the edge (local north -4..-14,
 *   heights arrivalHeight - 3..+1), the render seam between the terrace
 *   and the cloud sea: without them the terrace ends in a hard void;
 * - the line-2 station approach sign at the summit cable's cloud-deck
 *   dock approach point (P-7's station body already stands there;
 *   this sign only marks its approach, it does not build a second
 *   station). Sign text is the station name only -- no timetable is
 *   invented here (timetables belong to B / 总控).
 */
export function mountMainSummitTerraceEdge(assembly: Assembly) {
  const { arrivalHeight } = assembly;
  const group = new Group();
  group.name = 'main-summit-terrace-edge';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<CanvasTexture>();
  const batches = new Set<InstancedMesh>();
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const timber = new MeshLambertMaterial({ color: '#5d4630' });
  const cloud = new MeshLambertMaterial({ color: '#eef3f6' });
  materials.add(stone);
  materials.add(timber);
  materials.add(cloud);

  // A shared unit cube plus instance matrices preserves every original box
  // extent and position while collapsing each material family to one draw.
  const boxGeometry = new BoxGeometry(1, 1, 1);
  geometries.add(boxGeometry);
  const transform = new Object3D();
  function boxBatch(name: string, material: Material, transforms: readonly Matrix4[]) {
    const mesh = new InstancedMesh(boxGeometry, material, transforms.length);
    mesh.name = name;
    transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
    batches.add(mesh);
    return mesh;
  }
  function boxMatrix(east: number, north: number, base: number, w: number, h: number, d: number) {
    transform.position.set(east, base + h / 2, -north);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    return transform.matrix.clone();
  }

  // Parapet: 2.4 m runs along the south edge (north = -0.6), gate gap |x| < 5.5.
  const parapetTransforms: Matrix4[] = [];
  let parapetCount = 0;
  for (let x = -30; x <= 30; x += 2.4) {
    if (Math.abs(x + 1.2) < 5.5) continue;
    parapetTransforms.push(boxMatrix(x + 1.2, -0.6, arrivalHeight, 2.4, 0.9, 0.5));
    parapetCount++;
  }
  boxBatch('terrace-edge-parapet', stone, parapetTransforms);

  // Cloud puffs beyond the edge: deterministic sizes/positions (no RNG,
  // so the build is reproducible). 14 puffs, local north -4..-14.
  const puffCount = 14;
  const cloudTransforms: Matrix4[] = [];
  for (let i = 0; i < puffCount; i++) {
    const t = i / (puffCount - 1);
    const east = -34 + 68 * t + ((i * 37) % 5 - 2);
    const north = -4 - ((i * 53) % 10);
    const w = 3 + ((i * 29) % 3);
    const h = 1 + ((i * 17) % 2) * 0.5;
    const base = arrivalHeight - 3 + ((i * 11) % 4);
    cloudTransforms.push(boxMatrix(east, north, base, w, h, 2.5));
  }
  boxBatch('terrace-edge-cloud', cloud, cloudTransforms);

  // Line-2 station approach sign at the cable dock's approach point.
  const approach = assembly.cable.ropes[0]!.dock('cloud-deck').approach;
  const signEast = approach.east;
  const signNorth = approach.north - 1.5;
  boxBatch('terrace-edge-sign-frame', timber,
    [boxMatrix(signEast, signNorth, arrivalHeight, 0.12, 1.1, 0.9)]);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#5d4630';
      ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#f2e8d5';
      ctx.textAlign = 'center';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('云海台', 256, 104);
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.fillText('缆车二线', 256, 188);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      textures.add(texture);
      const face = new Mesh(
        new PlaneGeometry(0.85, 0.42),
        new MeshBasicMaterial({ map: texture }),
      );
      face.name = 'terrace-edge-sign-face';
      face.position.set(signEast, arrivalHeight + 0.62, -signNorth + 0.07);
      face.rotation.y = Math.PI;
      group.add(face);
      geometries.add(face.geometry);
      materials.add(face.material);
    }
  }

  let disposed = false;
  return {
    group, parapetCount, puffCount,
    sign: { east: signEast, north: signNorth, height: arrivalHeight },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      batches.forEach(batch => batch.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}
