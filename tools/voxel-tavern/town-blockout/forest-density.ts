import {
  BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry,
  InstancedMesh, MeshLambertMaterial, Object3D, Quaternion, Vector3, type Group,
} from 'three';
import { isWater, layout, riverX, type createTerrainGrid } from './terrain';

type Terrain = ReturnType<typeof createTerrainGrid>;
type KeepClear = (x: number, north: number, radius: number) => boolean;
type Point = [x: number, y: number, z: number];
type Instance = { at: Point; scale: Point; color: string; turn?: number; tilt?: Quaternion };
type Patch = { x: number; north: number; rx: number; rn: number; density: number; birch: number };

const stands: Patch[] = [
  { x: 54, north: 329, rx: 62, rn: 65, density: .91, birch: .10 },
  { x: 139, north: 346, rx: 79, rn: 55, density: .93, birch: .06 },
  { x: 221, north: 346, rx: 53, rn: 52, density: .73, birch: .25 },
  { x: 316, north: 354, rx: 73, rn: 53, density: .84, birch: .19 },
  { x: 416, north: 338, rx: 56, rn: 78, density: .94, birch: .08 },
  { x: 418, north: 206, rx: 43, rn: 91, density: .91, birch: .14 },
  { x: 351, north: 192, rx: 48, rn: 51, density: .64, birch: .22 },
  { x: 120, north: 178, rx: 60, rn: 60, density: .71, birch: .37 },
  { x: 50, north: 218, rx: 52, rn: 88, density: .88, birch: .19 },
  { x: 39, north: 100, rx: 53, rn: 69, density: .87, birch: .29 },
  { x: 99, north: 41, rx: 78, rn: 42, density: .91, birch: .12 },
  { x: 196, north: 33, rx: 73, rn: 44, density: .78, birch: .24 },
  { x: 213, north: 133, rx: 64, rn: 43, density: .66, birch: .38 },
  { x: 185, north: 271, rx: 63, rn: 32, density: .69, birch: .23 },
  { x: 416, north: 56, rx: 42, rn: 49, density: .84, birch: .20 },
  { x: 351, north: 18, rx: 68, rn: 23, density: .65, birch: .28 },
];

const pines = ['#223e37', '#274638', '#2a4944', '#2e5049', '#435854', '#28464b'];
const needles = ['#d0e2f2', '#bfd2e5', '#aebfd5', '#dce9f4', '#c0d6e5'];
const barks = ['#5d504a', '#695346', '#4e4544', '#715b4e'];
const birch = ['#d3cac3', '#bbb5ae', '#ded7cd', '#a6a6a6'];
const granites = ['#596575', '#647085', '#727c8b', '#536272', '#76828f'];
const up = new Vector3(0, 1, 0);

function shape(rings: [height: number, radius: number, variation: number][], sides: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  rings.forEach(([y, r, variation], level) => {
    for (let i = 0; i < sides; i++) {
      const angle = 2 * Math.PI * i / sides;
      const radius = r * (1 + Math.cos(i * 2.3) * .13);
      vertices.push(Math.cos(angle) * radius, y + Math.sin(i * 2.2) * variation, Math.sin(angle) * radius);
      if (level === 0) continue;
      const a = (level - 1) * sides + i;
      const b = (level - 1) * sides + (i + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function batch(parent: Group, geometry: BufferGeometry, material: MeshLambertMaterial, items: Instance[], name: string) {
  if (items.length === 0) return;
  const mesh = new InstancedMesh(geometry, material, items.length);
  const dummy = new Object3D();
  const color = new Color();
  for (let i = 0; i < items.length; i++) {
    const { at, scale, color: tint, turn, tilt } = items[i];
    dummy.position.set(...at);
    dummy.scale.set(...scale);
    if (tilt) dummy.quaternion.copy(tilt);
    else dummy.rotation.set(0, turn ?? 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.set(tint));
  }
  mesh.name = name;
  mesh.computeBoundingSphere();
  parent.add(mesh);
}

export function addForestDensity(parent: Group, grid: Terrain, keepClear: KeepClear) {
  let seed = 47831;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const pick = (values: string[]) => values[Math.floor(random() * values.length)];
  const trunks: Instance[] = [];
  const crowns: Instance[] = [];
  const snowCaps: Instance[] = [];
  const rocks: Instance[] = [];
  const rockSnow: Instance[] = [];
  const buds: Instance[] = [];
  const occupied = new Map<number, { x: number; north: number; radius: number; collision: number }[]>();
  const cellWidth = 9;
  let count = 0;

  function nearby(x: number, north: number, radius: number, visitor: (distance: number, spacing: number, collision: number) => boolean) {
    const ix = Math.floor(x / cellWidth);
    const jn = Math.floor(north / cellWidth);
    const reach = Math.ceil(radius / cellWidth);
    for (let i = ix - reach; i <= ix + reach; i++) {
      for (let j = jn - reach; j <= jn + reach; j++) {
        const bucket = occupied.get(j * 100 + i);
        if (bucket?.some(item => visitor(Math.hypot(item.x - x, item.north - north), item.radius, item.collision))) return true;
      }
    }
    return false;
  }
  function occupy(x: number, north: number, radius: number, collision: number) {
    const index = Math.floor(north / cellWidth) * 100 + Math.floor(x / cellWidth);
    const bucket = occupied.get(index) ?? [];
    bucket.push({ x, north, radius, collision });
    occupied.set(index, bucket);
  }
  function isClear(x: number, north: number, radius: number) {
    const margin = Math.max(2, radius + .6);
    if (x < margin || north < margin || x > layout.width - margin || north > layout.depth - margin) return false;
    const i = Math.round(x);
    const j = Math.round(north);
    const cell = j * grid.gridWidth + i;
    if (grid.surfaces[cell] !== 0 || isWater(x, north) || grid.elevation[cell] < 5.7) return false;
    const [x0, n0, x1, n1] = layout.plaza.bounds;
    const plazaDistance = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(n0 - north, 0, north - n1));
    if (plazaDistance < radius + 5 || Math.abs(x - riverX(north)) < 8.8 + radius) return false;
    const edge = Math.max(1, Math.floor(radius));
    if ([[i - edge, j], [i + edge, j], [i, j - edge], [i, j + edge]].some(([a, b]) => grid.surfaces[b * grid.gridWidth + a] !== 0)) return false;
    return !keepClear(x, north, radius);
  }
  function branch(from: Point, to: Point, width: number, color: string) {
    const direction = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const height = direction.length();
    trunks.push({
      at: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
      scale: [width, height, width], color,
      tilt: new Quaternion().setFromUnitVectors(up, direction.divideScalar(height)),
    });
  }
  function placePine(x: number, y: number, z: number, h: number, radius: number) {
    const turn = random() * 6.283;
    const trunk = h * (.067 + random() * .025);
    branch([x, y - .3, z], [x, y + .87 * h, z], trunk, pick(barks));
    const tiers = h >= 7.2 ? 4 : 3;
    const body = pick(pines);
    const crownSnow = pick(needles);
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const width = radius * (.93 - t * .70 + random() * .14);
      const tip = h * (.37 + t * .63);
      const base = h * (.15 + t * .64);
      const layerHeight = (tip - base) * 1.39;
      const lean = h * t * .036;
      const position: Point = [x + Math.cos(turn) * lean, y + base + layerHeight * .29, z + Math.sin(turn) * lean];
      crowns.push({ at: position, scale: [width, layerHeight, width * (.83 + random() * .25)], color: body, turn: turn + i * .83 });
      snowCaps.push({ ...crowns.at(-1)!, color: crownSnow });
    }
  }
  function placeBirch(x: number, y: number, z: number, h: number, blooming: boolean) {
    const turn = random() * 6.283;
    const dx = Math.cos(turn) * h * .11;
    const dz = Math.sin(turn) * h * .11;
    const white = pick(birch);
    const bark = '#55525a';
    const skin = blooming ? pick(barks) : white;
    const trunk = h * .057;
    branch([x, y - .2, z], [x + dx, y + h, z + dz], trunk, skin);
    for (let i = 0; i < 5; i++) {
      const angle = turn + i * 2.399;
      const t = .31 + i * .108;
      const base: Point = [x + dx * t, y + h * t, z + dz * t];
      const tip: Point = [base[0] + Math.cos(angle) * h * (.23 + random() * .13), base[1] + h * (.22 + random() * .10), base[2] + Math.sin(angle) * h * (.23 + random() * .13)];
      const fork: Point = [(base[0] + tip[0]) * .5, (base[1] + tip[1]) * .5, (base[2] + tip[2]) * .5];
      branch(base, tip, trunk * .49, skin);
      branch(fork, [fork[0] + Math.cos(angle + .7) * h * .18, fork[1] + h * .22, fork[2] + Math.sin(angle + .7) * h * .18], trunk * .29, skin);
      if (blooming) {
        buds.push({ at: tip, scale: [h * .27, h * .15, h * .23], color: pick(['#a74b59', '#b65e68', '#cc7883', '#954e67']), turn: angle });
      } else {
        const notch = Math.PI * random() * 2;
        const ex = Math.cos(notch) * trunk * .39;
        const ez = Math.sin(notch) * trunk * .39;
        branch([base[0] + ex, base[1] - h * .08, base[2] + ez], [base[0] + ex, base[1] - h * .053, base[2] + ez], trunk * .79, bark);
      }
    }
  }

  // A jittered lattice keeps enough room between trunks while overlapping stand edges hide the cells.
  for (let north = 4; north < layout.depth - 3; north += 6.1) {
    for (let east = 4; east < layout.width - 3; east += 6.1) {
      const x = east + (random() - .5) * 5.1;
      const n = north + (random() - .5) * 5.1;
      let density = .14;
      let birchChance = .15;
      for (const stand of stands) {
        const distance = Math.hypot((x - stand.x) / stand.rx, (n - stand.north) / stand.rn);
        const weight = stand.density * Math.max(0, 1 - distance ** 3);
        if (weight > density) {
          density = weight;
          birchChance = stand.birch;
        }
      }
      const cellNoise = .1 * Math.sin(x * .062 + n * .095) * Math.cos(n * .108 - x * .036);
      if (random() >= density + cellNoise) continue;
      const tall = density > .52 && random() > .38;
      const h = tall ? 8.8 + random() * 5.6 : 3.6 + random() * 5.1;
      const radius = h * (.20 + random() * .074);
      if (!isClear(x, n, radius) || nearby(x, n, 8, (distance, spacing) => distance < (radius + spacing) * .79)) continue;
      const y = grid.heightAt(x, n);
      if (random() < birchChance) placeBirch(x, y, -n, h * .79, density < .55 && random() < .23);
      else placePine(x, y, -n, h, radius);
      occupy(x, n, radius, h * .040);
      count++;
    }
  }

  for (let n = 6; n < layout.depth - 5; n += 8.6) {
    for (let x = 6; x < layout.width - 5; x += 8.6) {
      const east = x + (random() - .5) * 6.0;
      const north = n + (random() - .5) * 6.0;
      const y = grid.heightAt(east, north);
      const grade = Math.hypot(grid.heightAt(east + 2, north) - grid.heightAt(east - 2, north), grid.heightAt(east, north + 2) - grid.heightAt(east, north - 2)) / 4;
      const byRiver = Math.abs(east - riverX(north)) < 22;
      if (random() >= .13 + grade * .68 + (byRiver ? .21 : 0)) continue;
      const r = (.62 + random() * 2.25) * (grade > .37 ? 1.32 : 1);
      if (!isClear(east, north, r) || nearby(east, north, 8, (distance, spacing) => distance < (r + spacing) * .74)) continue;
      const h = r * (.65 + random() * .52);
      const yaw = random() * Math.PI * 2;
      rocks.push({ at: [east, y + h * .19, -north], scale: [r, h, r * .83], color: pick(granites), turn: yaw });
      rockSnow.push({ at: [east, y + h * .62, -north], scale: [r * .94, h * .43, r * .81], color: pick(needles), turn: yaw });
      if (r > 1.15) occupy(east, north, r, r * .64);
    }
  }

  const material = new MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  batch(parent, new CylinderGeometry(.28, .60, 1, 5), material, trunks, 'Forest trunks and branches');
  batch(parent, shape([[-.32, .14, .025], [-.27, .96, .065], [-.05, .80, .044], [.38, .15, .014], [.50, 0, 0]], 7), material, crowns, 'Snow forest pine crowns');
  batch(parent, shape([[-.17, .86, .067], [-.082, .86, .055], [.38, .173, .013], [.522, 0, 0]], 7), material, snowCaps, 'Pine bough snow');
  const angularStone = new IcosahedronGeometry(1, 0);
  batch(parent, angularStone, material, rocks, 'Granite in the snow');
  batch(parent, angularStone, material, rockSnow, 'Snow on granite');
  batch(parent, angularStone, material, buds, 'Flowering winter branches');
  return {
    count,
    blocked: (x: number, north: number) => nearby(x, north, 4, (distance, _spacing, collision) => distance < collision + .24),
  };
}
