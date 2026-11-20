import {
  BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, IcosahedronGeometry,
  InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Object3D, Shape, SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type FloorPoint = readonly [x: number, y: number, z: number];
type Solid = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Batch = { material: MeshLambertMaterial; geometry: BufferGeometry; matrices: Matrix4[] };

const standingHeight = 1.8;
const palette = {
  ashlar: '#e6dfca', chalk: '#f5eddb', voussoir: '#f7f0db', shade: '#b1a994',
  dome: '#f2e7d0', ribs: '#c4af82', lead: '#556868', glass: '#a6c6b8',
  oak: '#674f3e', honey: '#9d7754', black: '#353e37', metal: '#7b7550',
  linen: '#ebe3c9', quilt: '#697c68', page: '#f1dbad', ink: '#786450',
  clay: '#ae7859', twig: '#536844', leaves: '#67925b', shadeLeaf: '#45694b',
  spring: '#a3bc75', petal: '#e6be86',
} as const;
type Finish = keyof typeof palette;

export function buildSkyCityBuildings() {
  const group = new Group();
  group.name = 'Sky City west observatory and cloister';
  const masonry = new Group();
  masonry.name = 'White stone dormitory and rotunda';
  const furniture = new Group();
  furniture.name = 'Dormitory sleeping bays and occupied desks';
  const cloister = new Group();
  cloister.name = 'Arched cloister and west bridge';
  const growth = new Group();
  growth.name = 'Spring ivy and planter growth';
  group.add(masonry, furniture, cloister, growth);

  const solids: Solid[] = [];
  const material = Object.fromEntries(Object.entries(palette).map(([finish, color]) => [
    finish, new MeshLambertMaterial({ color }),
  ])) as Record<Finish, MeshLambertMaterial>;
  const box = new BoxGeometry();
  const leaf = new IcosahedronGeometry(1, 0);
  const dowel = new CylinderGeometry(1, 1, 1, 12, 1);
  const transform = new Object3D();
  const batches = new Map<Group, Map<string, Batch>>();
  const archStones: BufferGeometry[] = [];

  function solid(x: number, y: number, z: number, w: number, h: number, d: number) {
    solids.push({ minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2,
      maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  function piece(owner: Group, finish: Finish, x: number, y: number, z: number,
    w: number, h: number, d: number, yaw = 0, primitive: BufferGeometry = box) {
    let parts = batches.get(owner);
    if (!parts) batches.set(owner, parts = new Map());
    const key = finish + primitive.type;
    let batch = parts.get(key);
    if (!batch) parts.set(key, batch = { material: material[finish], geometry: primitive, matrices: [] });
    transform.position.set(x, y, z);
    transform.rotation.set(0, yaw, 0);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  }

  function stone(owner: Group, finish: Finish, x: number, y: number, z: number,
    w: number, h: number, d: number) {
    piece(owner, finish, x, y, z, w, h, d);
    solid(x, y, z, w, h, d);
  }

  function arch(x: number, spring: number, z: number, width: number, yaw = 0) {
    const inner = width / 2, outer = inner + .32, stones = 11;
    for (let index = 0; index < stones; index++) {
      const a = Math.PI * index / stones + .009;
      const b = Math.PI * (index + 1) / stones - .009;
      const shape = new Shape();
      shape.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      shape.absarc(0, 0, inner, a, b, false);
      shape.lineTo(Math.cos(b) * outer, Math.sin(b) * outer);
      shape.absarc(0, 0, outer, b, a, true);
      shape.closePath();
      const geometry = new ExtrudeGeometry(shape, { depth: .31, bevelEnabled: false, curveSegments: 3 });
      geometry.translate(0, 0, -.155).rotateY(yaw).translate(x, spring, z);
      archStones.push(geometry);
    }
  }

  function column(owner: Group, x: number, z: number, height: number, size: number) {
    stone(owner, 'shade', x, .15, z, size + .28, .30, size + .28);
    stone(owner, 'ashlar', x, height / 2, z, size, height, size);
    stone(owner, 'chalk', x, height - .10, z, size + .26, .32, size + .26);
    for (let y = .70; y < height - .29; y += .58) {
      piece(owner, 'shade', x, y, z, size + .016, .025, size + .016);
    }
  }

  const dormX = -28, dormZ = 12;
  const west = -37, east = -19, north = 6, south = 20;
  piece(masonry, 'ashlar', dormX, -.09, (north + south) / 2, east - west, .18, south - north);
  for (let x = west + .6; x < east; x += 1.25) {
    for (let z = north + .5; z < south; z += 1) {
      piece(masonry, ((Math.round(x * 4) + Math.round(z)) % 6) ? 'chalk' : 'ashlar',
        x, -.017, z, 1.224, .05, .976);
    }
  }
  for (const z of [north, south]) {
    for (const x of [-34.7, -30.3, -25.7, -21.3]) {
      stone(masonry, 'ashlar', x, .68, z, 4.5, 1.36, .57);
      stone(masonry, 'chalk', x, 4.67, z, 4.52, 1.77, .57);
      stone(masonry, 'chalk', x - 1.67, 2.81, z, 1.18, 2.90, .57);
      stone(masonry, 'chalk', x + 1.67, 2.81, z, 1.18, 2.90, .57);
      arch(x, 2.51, z + Math.sign(z - dormZ) * .32, 2.19);
      piece(masonry, 'shade', x, 1.39, z, 2.57, .16, .83);
      piece(masonry, 'lead', x, 2.22, z, .055, 1.53, .06);
      piece(masonry, 'glass', x, 2, z, 2.10, .08, .08);
    }
  }
  stone(masonry, 'ashlar', west, 2.74, 13, .59, 5.48, 14.04);
  stone(masonry, 'ashlar', east, 2.74, 8.24, .59, 5.48, 4.50);
  stone(masonry, 'ashlar', east, 2.74, 16.77, .59, 5.48, 6.54);
  stone(masonry, 'chalk', east, 4.56, 12, .68, 1.89, 3.06);
  arch(east + .33, 1.92, dormZ, 3.12, Math.PI / 2);
  piece(masonry, 'shade', east, 5.48, 13, .94, .18, 14.4);
  for (const x of [west, east]) {
    for (const z of [north, south]) {
      column(masonry, x, z, 5.48, .67);
    }
  }
  piece(masonry, 'shade', dormX, 5.56, 13, 18.76, .25, 14.68);
  piece(masonry, 'chalk', dormX, 5.83, 13, 18.51, .31, 14.37);
  piece(masonry, 'ashlar', dormX, 6.17, 13, 6.05, .53, 6.05, 0, dowel);
  piece(masonry, 'ribs', dormX, 6.40, 13, 6.28, .18, 6.28, 0, dowel);

  const dome = new Mesh(new SphereGeometry(6.14, 26, 13, 0, Math.PI * 2, 0, Math.PI / 2), material.dome);
  dome.position.set(dormX, 6.42, 13);
  dome.scale.y = .62;
  dome.name = 'White stone observatory dome';
  masonry.add(dome);
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    for (let tier = 1; tier <= 9; tier++) {
      const latitude = tier * .15;
      const radial = 6.16 * Math.cos(latitude);
      piece(masonry, 'ribs', dormX + radial * Math.cos(angle), 6.42 + 3.81 * Math.sin(latitude),
        13 + radial * Math.sin(angle), .15, .17, .15, angle);
    }
  }
  piece(masonry, 'shade', dormX, 10.28, 13, 1.04, .22, 1.04, 0, dowel);
  piece(masonry, 'chalk', dormX, 10.70, 13, .84, .65, .84, 0, dowel);
  piece(masonry, 'ribs', dormX, 11.14, 13, .31, .33, .31, 0, dowel);

  // Bed bays and chart desks flank a straight passage from the eastern arch.
  for (const x of [-33.9, -29.1, -24.4]) {
    const z = 7.72;
    stone(furniture, 'oak', x, .40, z, 2, .54, 2.58);
    piece(furniture, 'linen', x, .75, z, 1.88, .20, 2.36);
    piece(furniture, 'quilt', x, .91, z + .27, 1.83, .14, 1.77);
    piece(furniture, 'linen', x, .93, z - .75, 1.4, .25, .58);
    piece(furniture, 'honey', x, .81, z - 1.16, 2.08, .81, .14);
  }
  for (const [index, x] of [-34.6, -29.7, -24.8].entries()) {
    const z = 18.36;
    solid(x, .54, z, 2.5, 1.08, 1.21);
    for (const dx of [-1.05, 1.05]) {
      for (const dz of [-.46, .46]) piece(furniture, 'oak', x + dx, .51, z + dz, .15, .99, .15);
    }
    piece(furniture, 'honey', x, 1.03, z, 2.5, .14, 1.21);
    piece(furniture, 'oak', x, 1.13, z + .09, .98, .10, .61, -.06);
    piece(furniture, 'page', x - .24, 1.19, z + .09, .47, .035, .57, -.07);
    piece(furniture, 'page', x + .24, 1.19, z + .097, .47, .035, .57, -.05);
    for (let line = 0; line < 4; line++) {
      const lineZ = z - .09 + line * .10;
      piece(furniture, 'ink', x - .234, 1.214, lineZ, .29, .007, .012, -.07);
      piece(furniture, 'ink', x + .248, 1.214, lineZ, line % 2 ? .30 : .22, .007, .012, -.05);
    }
    const cupX = x + (index === 1 ? -.8 : .82);
    piece(furniture, 'linen', cupX, 1.245, z - .29, .15, .26, .15, 0, dowel);
    piece(furniture, 'ink', cupX, 1.38, z - .29, .121, .017, .121, 0, dowel);
    piece(furniture, 'linen', cupX + .148, 1.25, z - .29, .085, .082, .058);
    stone(furniture, 'oak', x + .10, .27, z - 1.25, .67, .54, .65);
  }
  stone(furniture, 'oak', -36.34, 1.1, 13.75, .74, 2.20, 3.7);
  for (const y of [.41, 1.01, 1.63, 2.15]) {
    piece(furniture, 'honey', -35.94, y, 13.75, .14, .10, 3.62);
  }
  for (const [i, finish] of (['quilt', 'clay', 'metal', 'ashlar'] as const).entries()) {
    piece(furniture, finish, -35.85, .72, 12.7 + i * .26, .25, .53, .20);
  }

  // Raised stone parapets flank an open bridge deck; the arcade overhead leaves the full walk clear.
  for (const x of [-30.4, -25.6]) {
    stone(cloister, 'shade', x, .34, -3.5, .37, .68, 14.2);
    stone(cloister, 'chalk', x, .73, -3.5, .56, .14, 14.4);
    for (const z of [-10.3, -6.0, -1.7, 2.6]) column(cloister, x, z, 2.83, .46);
    for (const z of [-8.15, -3.85, .45]) arch(x, 2.66, z, 3.68, Math.PI / 2);
  }
  for (const z of [-10.3, -6.0, -1.7, 2.6]) arch(-28, 2.66, z, 4.18);
  piece(cloister, 'ashlar', -28, -.07, -3.3, 4.8, .16, 14.9);
  for (let z = -10.2; z < 4; z += .74) {
    piece(cloister, (Math.round(z * 8) % 4) ? 'chalk' : 'ashlar', -28, .010, z, 4.35, .028, .716);
  }

  // Ivy follows the exterior joints and never obscures the doorway or its arch.
  for (const [x, z, spread, turns] of [[-36.92, 19.96, .57, 9], [-34.64, 20.34, .64, 7],
    [-22.04, 20.34, .47, 6], [-36.72, 5.62, .53, 8], [-26.0, 5.68, .46, 6],
    [-30.55, -6.0, .32, 5], [-25.54, 2.6, .27, 5]]) {
    for (let i = 0; i < turns; i++) {
      const y = .40 + .47 * i;
      const dx = Math.sin(i * 1.13 + x) * spread;
      piece(growth, 'twig', x + dx * .4, y, z, .074, .51, .08, .24, dowel);
      for (const side of [-1, 1]) {
        const finish = i % 3 === 2 ? 'spring' : side > 0 ? 'leaves' : 'shadeLeaf';
        piece(growth, finish, x + dx + side * .25, y + side * .10, z + side * .09, .41, .27, .29,
          i * .67, leaf);
      }
      if (i % 4 === 1) piece(growth, 'petal', x + dx, y + .11, z + .14, .095, .08, .095, 0, leaf);
    }
  }
  for (const [x0, x1, z] of [[-36.60, -32.85, 20.40], [-23.9, -19.74, 20.40],
    [-36.2, -33.2, 5.62]]) {
    for (let x = x0; x <= x1; x += .32) {
      const y = 5.55 + .11 * Math.sin(x * 2.2);
      const length = 1 + Math.floor(3 * Math.abs(Math.sin(x * 1.3)));
      for (let i = 0; i < length; i++) {
        const finish = i === 0 ? 'spring' : i % 2 ? 'leaves' : 'shadeLeaf';
        piece(growth, finish, x + .13 * Math.sin(i + x), y - i * .29,
          z + .13 * Math.cos(x * 1.3), .31, .38, .27, i + x, leaf);
      }
    }
  }
  for (const [x, z] of [[-32.05, -9.7], [-24.0, -2.1], [-37.65, 13.0], [-21.9, 21.05]]) {
    piece(growth, 'clay', x, .32, z, .52, .64, .52, 0, dowel);
    solid(x, .32, z, 1.04, .64, 1.04);
    for (let i = 0; i < 6; i++) {
      const dir = i * Math.PI / 3;
      piece(growth, i % 3 === 0 ? 'spring' : 'leaves', x + .32 * Math.cos(dir), .69 + .06 * (i % 3),
        z + .32 * Math.sin(dir), .28, .28, .28, dir, leaf);
    }
  }

  const archGeometry = mergeGeometries(archStones);
  archStones.forEach(geometry => geometry.dispose());
  if (archGeometry) {
    const arches = new Mesh(archGeometry, material.voussoir);
    arches.name = 'Cut voussoir arches';
    cloister.add(arches);
  }
  for (const [owner, parts] of batches) {
    for (const [name, { geometry, material: finish, matrices }] of parts) {
      const mesh = new InstancedMesh(geometry, finish, matrices.length);
      mesh.name = name;
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      owner.add(mesh);
    }
  }

  const dormRoute: readonly FloorPoint[] = [
    [-13, 0, 12], [-18, 0, 12], [-20, 0, 12], [-26, 0, 12],
    [-31.4, 0, 12], [-31.4, 0, 15.5], [-27.8, 0, 15.5],
  ];
  function blocked(x: number, z: number, feet: number, radius: number) {
    return solids.some(volume => {
      if (feet + standingHeight <= volume.minY || feet + .02 >= volume.maxY) return false;
      const dx = Math.max(volume.minX - x, x - volume.maxX, 0);
      const dz = Math.max(volume.minZ - z, z - volume.maxZ, 0);
      return Math.hypot(dx, dz) < radius;
    });
  }
  return { group, blocked, dormRoute };
}
