import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, DodecahedronGeometry,
  Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const landLayers = [
  [54, 0, '#5a6d6b'],
  [46, -8, '#596b78'],
  [36, -19, '#4b5d70'],
  [22, -33, '#46566a'],
  [9, -44, '#3e5063'],
] as const;
const rimVariation = [1, .98, .94, 1, .97, .93, .96, 1, .93, .97, .94, .98];
const sunward = new Vector3(-.45, .82, .35).normalize();
const stone = '#aab9bf';
const roof = '#bac8cc';
const bough = '#5c6b68';

/** One opaque draw for the mountain view. The full city shares this island's local frame. */
export function buildSkyCitySilhouette() {
  const parts: BufferGeometry[] = [];

  function add(primitive: BufferGeometry, tint: string) {
    const geometry = primitive.index ? primitive.toNonIndexed() : primitive;
    if (geometry !== primitive) primitive.dispose();
    geometry.deleteAttribute('uv');
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal');
    const colors: number[] = [];
    const base = new Color(tint);
    const normal = new Vector3();
    for (let vertex = 0; vertex < normals.count; vertex++) {
      normal.fromBufferAttribute(normals, vertex);
      const light = .82 + Math.max(0, normal.dot(sunward)) * .18;
      colors.push(base.r * light, base.g * light, base.b * light);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    parts.push(geometry);
  }

  function contour(layer: number, vertex: number) {
    const [radius, y] = landLayers[layer];
    const angle = vertex / rimVariation.length * Math.PI * 2;
    const edge = radius * rimVariation[(vertex + 2 * layer) % rimVariation.length];
    return [Math.cos(angle) * edge, y, Math.sin(angle) * edge];
  }

  for (const [layer, [, , tint]] of landLayers.entries()) {
    const vertices: number[] = [];
    for (let i = 0; i < rimVariation.length; i++) {
      const next = (i + 1) % rimVariation.length;
      const a = contour(layer, i), b = contour(layer, next);
      if (layer === 0) vertices.push(0, 0, 0, ...b, ...a);
      if (layer + 1 === landLayers.length) vertices.push(...a, ...b, 2, -52, -1);
      else {
        const c = contour(layer + 1, i), d = contour(layer + 1, next);
        vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    }
    const terrain = new BufferGeometry();
    terrain.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    add(terrain, tint);
  }

  function box(x: number, y: number, z: number, w: number, h: number, d: number, tint = stone) {
    add(new BoxGeometry(w, h, d).translate(x, y, z), tint);
  }

  function dome(x: number, z: number, radius: number, base: number) {
    const drum = new CylinderGeometry(radius, radius, base, 10);
    add(drum.translate(x, base / 2, z), stone);
    const cap = new SphereGeometry(radius, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    add(cap.scale(1, .69, 1).translate(x, base, z), roof);
  }

  function limb(from: Vector3, to: Vector3, start: number, end: number) {
    const direction = to.clone().sub(from);
    const mid = from.clone().addScaledVector(direction, .5);
    const geometry = new CylinderGeometry(end, start, direction.length(), 6);
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    add(geometry.applyQuaternion(rotation).translate(mid.x, mid.y, mid.z), bough);
  }

  dome(-21, -10, 9, 7);
  dome(20, -9, 7, 6);
  dome(-28, 8, 5, 5);
  dome(25, 8, 4.6, 5);
  for (const center of [-17, -7, 3, 13]) {
    box(center - 4.8, 2.1, -19, 1.6, 4.2, 2.3);
    const arch = new TorusGeometry(4.8, .8, 4, 8, Math.PI);
    add(arch.translate(center, 3.6, -19), stone);
  }
  box(17.8, 2.1, -19, 1.6, 4.2, 2.3);
  box(0, 9, -35, 7, 18, 7);
  box(0, 18, -35, 10.5, 2.2, 10.5, roof);
  box(-3.3, 21, -35, 1.4, 5, 1.6);
  box(3.3, 21, -35, 1.4, 5, 1.6);
  add(new TorusGeometry(3.3, .7, 4, 8, Math.PI).translate(0, 22.7, -35), roof);

  const trunk = new Vector3(1, .2, 2);
  const fork = new Vector3(0, 10, 2);
  limb(trunk, fork, 3.5, 2.2);
  limb(fork, new Vector3(-7, 17, 0), 2.2, .8);
  limb(fork, new Vector3(6, 19, 3), 2.2, .9);
  limb(fork, new Vector3(-1, 22, 8), 1.8, .7);
  for (const [x, y, z, scale, tint] of [
    [-10, 17, 1, 6, '#617a77'], [-3, 20, 9, 7, '#617d76'],
    [6, 21, 3, 7, '#6a8179'], [1, 24, 1, 5.6, '#718780'],
  ] as const) {
    const crown = new DodecahedronGeometry(scale);
    add(crown.scale(1.32, .72, 1.08).translate(x, y, z), tint);
  }

  // The rim cuts leave a pale spring-fed ribbon on the south and west faces.
  for (const [x, z, angle, width] of [[4, 51, 0, 4.5], [-49, 8, -Math.PI / 2, 3]] as const) {
    const water = new BufferGeometry();
    water.setAttribute('position', new Float32BufferAttribute([
      -width / 2, 0, 0, 0, -24, 2, width / 2, 0, 0,
      width / 2, 0, 0, 0, -24, 2, width * .16, -19, 1.4,
    ], 3));
    add(water.rotateY(angle).translate(x, .03, z), '#9bb7c5');
  }

  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Sky city silhouette geometry must share position, normal and color attributes.');
  const group = new Group();
  group.name = 'sky-city-summit-silhouette';
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true }));
  mesh.name = 'sky-city-low-detail';
  group.add(mesh);
  return group;
}
