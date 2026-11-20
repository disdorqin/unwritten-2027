import {
  BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { northRidgeNorthWall, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { northRidgeClimbFaceAt, northRidgeClimbPitchAt, northRidgeClimbSpec, northRidgeIceTongues, northRidgeRockShelves }
  from './north-ridge-climb';

function rockMesh() {
  const { west, east, south, north } = northRidgeNorthWall;
  const spacing = .5;
  const cols = 1 + (east - west) / spacing;
  const rows = 1 + (north - south) / spacing;
  const points: number[] = [], tint: number[] = [], index: number[] = [];
  const dark = new Color('#404956'), slate = new Color('#8c9ba3'), sample = new Color();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const e = west + i * spacing, n = south + j * spacing;
    const y = sampleNorthRidge350(e, n);
    points.push(e, y, -n);
    const stratum = .45 + .25 * Math.sin(y * .62 + e * .22) + .1 * Math.cos(n * 2.7 - e * 1.7);
    sample.copy(dark).lerp(slate, stratum);
    tint.push(sample.r, sample.g, sample.b);
    if (i < cols - 1 && j < rows - 1) {
      const k = i + j * cols;
      index.push(k, k + 1, k + cols, k + 1, k + cols + 1, k + cols);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(tint, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function iceRibbon(from: number, to: number) {
  const vertices: number[] = [], indices: number[] = [];
  const rows = 16;
  for (let i = 0; i <= rows; i++) {
    const height = from + (to - from) * i / rows;
    for (const lane of [-.84, .84]) {
      const { east, north, y } = northRidgeClimbFaceAt(height, lane);
      vertices.push(east, y, -north - .04);
    }
    const index = 2 * i;
    if (i < rows) indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A surveyed wall and cut-in standing shelves, independent of the C-01 world host. */
export function mountNorthRidgeClimb(owner: Group) {
  const group = new Group();
  group.name = 'north-ridge-350-actual-climb-face';
  const rock = rockMesh();
  const slab = new BoxGeometry(1, 1, 1);
  const ice = northRidgeIceTongues.map(tongue => iceRibbon(tongue.from, tongue.to));
  const wallColor = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, flatShading: true });
  const shelfColor = new MeshLambertMaterial({ color: '#77848d' });
  const shelfEdge = new MeshLambertMaterial({ color: '#505962' });
  const frozen = new MeshLambertMaterial({ color: '#8ed5e6', emissive: '#23475c', transparent: true, opacity: .74, side: DoubleSide });
  const pole = new MeshLambertMaterial({ color: '#453734' });
  const cloth = new MeshLambertMaterial({ color: '#b62f3b', emissive: '#35090d', emissiveIntensity: .5 });
  const face = new Mesh(rock, wallColor);
  face.name = 'native-north-ridge-face';
  group.add(face);

  function box(material: MeshLambertMaterial, name: string, e: number, y: number, n: number, w: number, h: number, d: number) {
    const mesh = new Mesh(slab, material);
    mesh.name = name;
    mesh.position.set(e, y, -n);
    mesh.scale.set(w, h, d);
    group.add(mesh);
    return mesh;
  }

  northRidgeRockShelves.forEach(shelf => shelf.pads.forEach(({ east, north, width, depth }, side) => {
    box(shelfColor, `rock-shelf-${shelf.id}-${side}`, east, shelf.face.y - .12, north, width, .24, depth);
    box(shelfEdge, 'shelf-stone-spur', east, shelf.face.y - .50, north - .60, width * .91, .56, depth + .50);
    box(shelfEdge, 'shelf-cut-anchor', east, shelf.face.y - .92, north - .72, width * .64, .72, depth * .96);
  }));
  ice.forEach((geometry, id) => {
    const seam = new Mesh(geometry, frozen);
    seam.name = `ice-tongue-${id}`;
    group.add(seam);
  });

  function placeFlag(height: number, tilted: boolean, sign = 1, finish = false) {
    const face = northRidgeClimbFaceAt(height, 1.16 * sign);
    const scale = finish ? 1.85 : 1;
    const n = face.north + .3;
    const stem = box(pole, 'red-route-flag-stem', face.east, face.y + .47 * scale, n, .08, 1.04 * scale, .08);
    const red = box(cloth, finish ? 'north-wall-finishing-flag' : 'red-route-flag', face.east + .27 * scale,
      face.y + .77 * scale, n, .47 * scale, .30 * scale, .048);
    if (tilted) { stem.rotation.z = .36; red.rotation.z = .36; }
  }
  let height: number = northRidgeClimbSpec.firstHeight;
  while (height < northRidgeClimbSpec.lastHeight - 2.5) {
    placeFlag(height, false);
    height += northRidgeClimbSpec.flagPitchMetres * Math.sin(northRidgeClimbPitchAt(height));
  }
  for (const tongue of northRidgeIceTongues) placeFlag(tongue.from, true, -1);
  placeFlag(northRidgeClimbSpec.lastHeight, false, -1, true);

  owner.add(group);
  let disposed = false;
  return { group, dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const geometry of [rock, slab, ...ice]) geometry.dispose();
    for (const material of [wallColor, shelfColor, shelfEdge, frozen, pole, cloth]) material.dispose();
  } };
}
