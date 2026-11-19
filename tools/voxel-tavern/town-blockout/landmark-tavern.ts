import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
  NearestFilter, NearestMipmapNearestFilter, RepeatWrapping, SRGBColorSpace, type Vector3,
} from 'three';
import { gunzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';
import type { TownPlot } from './landmark-kit';
import { addTownWindow, type TownWindow } from './town-window';
import source from './tavern-voxel-source';
import { relocateTavernFurniture, tavernFurnitureColliders, tavernModelToPlot } from './tavern-seats';

export { tavernModelToPlot };

type Vec3 = [number, number, number];
export type TavernRoosterSill = { window: TownWindow; sill: Vec3; approach: Vec3 };
type Box = [number, number, number, number, number, number];
type Part = { m: string; b: Box };
type TavernSource = {
  palette: Record<string, string>;
  catalogue: Part[][];
  voxels: [number, number, number, number][];
};

const panels: Record<string, string> = {
  cladding: '#773328', claddingLight: '#8e3f31', redLantern: '#b52a22',
  lanternShade: '#e54729', lanternFlame: '#ffc162', amberGlass: '#ed963e',
  blueRoof: '#3c4054', blueRoofDark: '#30344a', blueRoofLight: '#47495f',
  cedar: '#71442c', timberTrim: '#be7a47', snowyWhite: '#d6e0ed',
};
const sides: { normal: Vec3; points: Vec3[] }[] = [
  { normal: [1, 0, 0], points: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { normal: [-1, 0, 0], points: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], points: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { normal: [0, -1, 0], points: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], points: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], points: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

function makeMaterial(name: string, hex: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!;
  const rgb = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
  const wood = /(?:wood|plank|dark|cladding|Trim|cedar)/.test(name);
  const stone = /(?:stone|cobble|brick)/.test(name);
  const roof = /(?:Roof|roof)/.test(name);
  for (let v = 0; v < 16; v++) {
    for (let u = 0; u < 16; u++) {
      let value = ((u * 41 + v * 79 + u * v * 17) % 33) - 16;
      if (wood) value += u % 4 === 0 ? -25 : u % 4 === 1 ? 10 : 0;
      if (stone && (v % 5 === 0 || (u + Math.floor(v / 5) * 4) % 8 === 0)) value -= 28;
      if (roof) value += v % 4 === 0 ? -16 : v % 4 === 1 ? 11 : 0;
      if (/^(snow|frost)/.test(name)) value *= .25;
      context.fillStyle = `rgb(${rgb.map(c => Math.max(0, Math.min(255, c + value))).join(',')})`;
      context.fillRect(u, v, 1, 1);
    }
  }
  if (/^sign[0-3]$/.test(name)) {
    context.fillStyle = '#402b24';
    context.fillRect(0, 0, 16, 16);
    context.fillStyle = '#edc68a';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '13px "Microsoft YaHei", sans-serif';
    context.fillText('未写酒馆'[Number(name.at(-1))], 8, 8);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapNearestFilter;
  const bright = /^(glow|amberGlass|lanternFlame)$/.test(name);
  return new MeshLambertMaterial({
    map: texture, vertexColors: true, flatShading: true,
    emissive: bright ? hex : '#211309', emissiveIntensity: bright ? .8 : .12,
  });
}

const boxFaces = [0, 1, 2, 0, 2, 3];
const lightSources: { position: Vec3; radius: number; strength: number }[] = [
  { position: [4, 3.5, -3.2], radius: 8, strength: .9 }, // Fireplace
  { position: [-3.5, 5, -2.4], radius: 7, strength: 1 }, // Bar
  { position: [-1, 6, 2.2], radius: 8, strength: .7 },
  { position: [-3, 10.75, -.5], radius: 7.5, strength: 1.14 }, // Reading floor
  { position: [3.8, 10.75, 2.5], radius: 8.5, strength: .9 },
  { position: [0, 6.25, 7.5], radius: 9, strength: 1.35 }, // Porch
];

function lantern(parts: Part[], cx: number, cy: number, cz: number, size: number) {
  const add = (m: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    parts.push({ m, b: [x, y, z, x + w, y + h, z + d] });
  };
  add('dark', cx - .028, cy + size * .9, cz - .028, .056, size * .55, .056);
  for (const [height, width] of [[.08, .51], [.28, .76], [.48, .88], [.70, .71]]) {
    add(height === .48 ? 'lanternShade' : 'redLantern', cx - size * width / 2, cy + size * height, cz - size * width / 2,
      size * width, size * .2, size * width);
  }
  add('lanternFlame', cx - size * .28, cy + size * .32, cz + size * .432, size * .56, size * .29, size * .022);
  for (const height of [.035, .9]) {
    add('gold', cx - size * .23, cy + size * height, cz - size * .23, size * .46, size * .09, size * .46);
  }
  add('gold', cx - .04, cy - size * .17, cz - .04, .08, size * .26, .08);
}

const tavernWindows = [4, 9].flatMap(floor => [
  ...[-4, 4].flatMap(x => [
    { at: [x, floor + 1, 5.59] as Vec3, yaw: 0, axis: 0, ground: floor - 1 },
    { at: [x, floor + 1, -5.39] as Vec3, yaw: Math.PI, axis: 0, ground: floor - 1 },
  ]),
  ...[-2, 2].flatMap(z => [
    { at: [6.46, floor + 1, z] as Vec3, yaw: Math.PI / 2, axis: 2, ground: floor - 1 },
    { at: [-6.46, floor + 1, z] as Vec3, yaw: -Math.PI / 2, axis: 2, ground: floor - 1 },
  ]),
]).filter(({ at }) => !(at[0] === 4 && at[2] < -5)); // The fireplace flue backs these two decorative bays.

function bakedSash(m: string, b: Box) {
  if (m !== 'wood' && m !== 'dark' && m !== 'shutter' && m !== 'gold') return false;
  return tavernWindows.some(({ at, axis }) => {
    const cross = 2 - axis;
    return b[axis] >= at[axis] - 1.008 && b[axis + 3] <= at[axis] + 1.008
      && b[1] >= at[1] - 1.008 && b[4] <= at[1] + 1.008
      && b[cross + 3] - b[cross] <= .34 && b[cross] >= at[cross] - .36 && b[cross + 3] <= at[cross] + .36;
  });
}

function buildParts() {
  const zipped = Uint8Array.from(atob(source), char => char.charCodeAt(0));
  const data: TavernSource = JSON.parse(strFromU8(gunzipSync(zipped)));
  const parts: Part[] = [];
  const colors: Record<string, string> = { ...data.palette, ...panels, snow: '#c3d2e1' };
  for (const [x, y, z, id] of data.voxels) {
    for (const { m, b } of data.catalogue[id - 2]) {
      const bounds = relocateTavernFurniture(m, [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
      if (bakedSash(m, bounds)) continue;
      const roof = m === 'roof' ? 'blueRoof' : m === 'roofShadow' ? 'blueRoofDark' : m === 'roofGlaze' ? 'blueRoofLight' : m;
      parts.push({ m: roof, b: bounds });
      // B09 calls for red siding. Keep the original interior plaster and exposed timber.
      if (m === 'plaster' && y < 12) {
        const [x0, y0, z0, x1, y1, z1] = bounds;
        for (let h = y0; h < y1; h += .25) {
          const t = Math.min(y1, h + .231);
          const cladding = (Math.round(h * 4) + x + z) % 5 === 0 ? 'claddingLight' : 'cladding';
          if (z === 5) parts.push({ m: cladding, b: [x0, h, z1, x1, t, z1 + .05] });
          if (z === -6) parts.push({ m: cladding, b: [x0, h, z0 - .05, x1, t, z0] });
          if (x === -7) parts.push({ m: cladding, b: [x0 - .05, h, z0, x0, t, z1] });
          if (x === 6 && z > -6 && z < 5) parts.push({ m: cladding, b: [x1, h, z0, x1 + .05, t, z1] });
        }
      }
    }
  }
  const add = (m: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    parts.push({ m, b: [x, y, z, x + w, y + h, z + d] });
  };
  // Preserve light behind the two decorative openings that back onto the fireplace.
  for (const floor of [4, 9]) for (const pane of [0, 1]) {
    add('amberGlass', 3 + pane + .06, floor + .075, -5.44, .87, 1.84, .037);
  }
  for (const side of [-1, 1]) for (let column = 0; column < 16; column++) {
    const x = side === -1 ? -8 + column * .5 : 7.5 - column * .5;
    const y = 12.34 + column * .25;
    for (let z = -7; z < 9; z += .5) {
      if ((Math.round(z * 2) + column * 9 + side) % 11 === 0 && column > 3) continue;
      const thickness = .09 + ((Math.round(z * 2) + column + 32) % 3) * .032;
      add('snowyWhite', x + .023, y, z + .011, .461, thickness, .496);
    }
  }
  for (const x of [-5.6, -2.7, 2.7, 5.6]) lantern(parts, x, 5.3, 7.52, .77);
  for (const x of [-3.4, 2.7]) {
    lantern(parts, x, 5.14, -1.25, .67);
    lantern(parts, x, 10.27, 2.85, .71);
  }
  add('runner', -1.28, 3.035, 2.64, 2.56, .027, 2.38);
  for (const x of [-1.3, 1.226]) add('runnerEdge', x, 3.041, 2.59, .072, .027, 2.48);
  for (const z of [2.57, 4.99]) add('runnerEdge', -1.3, 3.04, z, 2.6, .027, .07);
  add('cloth', .375, 3.625, 1.875, .75, .0625, .625);
  add('gold', .4375, 3.625, 1.8125, .625, .0625, .0625);
  // The upper east sash above the stairwell is operated from the gallery.
  add('gold', 3.3125, 9.5, 1.96875, .0625, 2.25, .0625);
  add('timberTrim', 3.25, 9.375, 1.90625, .1875, .1875, .1875);
  for (let step = 0; step < 17; step++) {
    const y = 3.25 + step * .25;
    const z = 3.5 - step * .375;
    if (step % 2 === 0) add('wood', 5.6875, y, z, .125, 1, .125);
    add('wood', 5.6875, y + .875, z, .125, .125, .375);
  }
  return { parts, colors };
}

function isInside(x: number, y: number, z: number) {
  return Math.abs(x) < 6.125 && z > -5.1 && z < 5.18 && y > 2.99 && y < 12.1;
}

const interiorMin: Vec3 = [-6, 3, -5];
const interiorMax: Vec3 = [6, 12, 5];
const tavernLayers = new WeakMap<Group, { near: Group; distant: Group; min: Vec3; max: Vec3 }>();

function isInteriorPart([x0, y0, z0, x1, y1, z1]: Box) {
  // Keep any voxel touching an exterior wall or opening in the shell.
  return x0 > interiorMin[0] && x1 < interiorMax[0] && z0 > interiorMin[2] && z1 < interiorMax[2]
    && y0 >= interiorMin[1] && y1 <= interiorMax[1];
}

export function tavernInteriorContains(group: Group, east: number, north: number, feet: number) {
  const layer = tavernLayers.get(group);
  if (!layer) return false;
  const { min, max } = layer;
  const { x, y, z } = group.position;
  return east >= x + min[0] && east <= x + max[0] && -north >= z + min[2] && -north <= z + max[2]
    && feet >= y + min[1] && feet <= y + max[1];
}

export function updateTavernInteriorVisibility(group: Group, eye: Vector3, playerInside = false) {
  const layer = tavernLayers.get(group);
  if (!layer) return;
  // Borrow the museum's 48 metre scale and keep four metres of hysteresis.
  const radius = layer.near.visible ? 52 : 48;
  const visible = playerInside || eye.distanceToSquared(group.position) <= radius ** 2;
  layer.near.visible = visible;
  layer.distant.visible = !visible;
}

export function buildTavernLandmark(plot: TownPlot) {
  const { parts, colors } = buildParts();
  const group = new Group();
  group.name = '未写酒馆';
  const transform = tavernModelToPlot(plot);
  const near = new Group();
  near.name = '未写酒馆 · 近处内饰';
  const distant = new Group();
  distant.name = '未写酒馆 · 远处外壳';
  distant.visible = false;
  group.add(near, distant);
  tavernLayers.set(group, { near, distant, min: transform(...interiorMin), max: transform(...interiorMax) });
  const stairs: Box[] = Array.from({ length: 20 }, (_, step) => {
    const y = 3 + step * .25;
    const z = 3.5 - step * .375;
    return [4.25, y, z, 5.75, y + .25, z + .375];
  });
  const porchSteps: Box[] = Array.from({ length: 4 }, (_, step) => {
    const y = 2.5 - step * .25;
    const z = 8 + step * .5;
    return [-2, y, z, 2, y + .25, z + .5];
  });
  for (const { at, yaw, axis, ground } of tavernWindows) {
    const [x, y, z] = transform(...at);
    const eastWall = at[0] === 6.46;
    const galleryPull = eastWall && ground === 8 && at[2] === 2;
    let inwardX = galleryPull ? 3.35 : at[0] - Math.sin(yaw) * 1.33;
    let inwardZ = at[2] - Math.cos(yaw) * 1.54;
    // Keep the stand on the aisle beside the chairs and the upper gallery rail.
    const pianoWindow = yaw === 0 && ground === 3 && at[0] < 0;
    if (yaw === 0 && ground === 3) [inwardX, inwardZ] = pianoWindow ? [-3.52, 4.65] : [3.95, 4.24];
    if (yaw === 0 && ground === 8 && at[0] > 0) inwardX = 3.52;
    if (yaw === -Math.PI / 2 && ground === 3 && at[2] === -2) inwardX = -5.32;
    // The footprint meets the uphill tread before its centre crosses the riser.
    const stairProbeZ = inwardZ - .25;
    const tread = eastWall && !galleryPull && (ground === 8 || at[2] === 2)
      ? stairs.find(([, , near, , , far]) => stairProbeZ >= near && stairProbeZ <= far) : undefined;
    const [approachX, walkHeight, approachZ] = transform(inwardX, tread?.[4] ?? (pianoWindow ? 3.25 : ground), inwardZ);
    const [edgeX, , edgeZ] = transform(at[0] + (axis === 0 ? 1.90 : 0), at[1], at[2] + (axis === 2 ? 1.90 : 0));
    const window = addTownWindow(group, { x, y, z, yaw, width: Math.hypot(edgeX - x, edgeZ - z),
      height: 1.725, ground: walkHeight, approach: [approachX, approachZ], style: 'tavern' });
    if (ground === 8 && yaw === 0 && at[0] === -4) {
      // The original sill begins at z 6.0625, just in front of its flower box.
      group.userData.roosterSill = {
        window, sill: transform(-4, 9, 6.095), approach: transform(-4, 8, 4.56),
      } satisfies TavernRoosterSill;
    }
  }
  const materialBuffers = new Map<string, {
    positions: number[]; normals: number[]; uv: number[]; lighting: number[]; shellIndices: number[];
  }>();
  for (const { m, b } of parts) {
    let buffers = materialBuffers.get(m);
    if (!buffers) {
      buffers = { positions: [], normals: [], uv: [], lighting: [], shellIndices: [] };
      materialBuffers.set(m, buffers);
    }
    const firstVertex = buffers.positions.length / 3;
    if (!isInteriorPart(b)) {
      for (let i = 0; i < sides.length * boxFaces.length; i++) buffers.shellIndices.push(firstVertex + i);
    }
    const center = b.slice(0, 3).map((value, i) => (value + b[3 + i]) / 2);
    let brightness = isInside(center[0], center[1], center[2]) ? .19 : 1;
    for (const { position, radius, strength } of lightSources) {
      const distance = Math.hypot(center[0] - position[0], (center[1] - position[1]) * 1.28, center[2] - position[2]);
      brightness += Math.max(0, 1 - distance / radius) ** 2 * strength;
    }
    const color = new Color(
      brightness * (brightness > 1 ? 1 : 1.52),
      brightness,
      brightness * (brightness > 1 ? .91 : .6),
    );
    for (const { normal, points } of sides) {
      for (const index of boxFaces) {
        const point = points[index];
        const [x, y, z] = point.map((v, axis) => b[axis + v * 3]);
        buffers.positions.push(...transform(x, y, z));
        buffers.normals.push(...normal);
        buffers.uv.push(normal[0] ? z : x, normal[1] ? z : y);
        buffers.lighting.push(color.r, color.g, color.b);
      }
    }
  }
  for (const [name, { positions, normals, uv, lighting, shellIndices }] of materialBuffers) {
    const geometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setAttribute('normal', new Float32BufferAttribute(normals, 3))
      .setAttribute('uv', new Float32BufferAttribute(uv, 2))
      .setAttribute('color', new Float32BufferAttribute(lighting, 3));
    const material = makeMaterial(name, colors[name]);
    const mesh = new Mesh(geometry, material);
    mesh.name = `酒馆 · ${name}`;
    if (shellIndices.length === geometry.getAttribute('position').count) {
      group.add(mesh);
      continue;
    }
    near.add(mesh);
    if (shellIndices.length === 0) continue;

    // Preserve the original near geometry and share its vertex buffers with the shell-only draw.
    const shellGeometry = new BufferGeometry().setIndex(shellIndices);
    for (const [key, value] of Object.entries(geometry.attributes)) shellGeometry.setAttribute(key, value);
    const shell = new Mesh(shellGeometry, material);
    shell.name = mesh.name;
    distant.add(shell);
  }
  const toBox = ([x0, y0, z0, x1, y1, z1]: Box) => ({ min: transform(x0, y0, z0), max: transform(x1, y1, z1) });
  const wallBoxes: Box[] = [
    [-7, 3, -6, -6, 12, 6], [6, 3, -6, 7, 12, 6], [-6, 3, -6, 6, 12, -5],
    [-6, 3, 5, -1, 7, 6], [1, 3, 5, 6, 7, 6], [-1, 6, 5, 1, 7, 6],
    [-6, 8, 5, -1, 12, 6], [1, 8, 5, 6, 12, 6], [-1, 11, 5, 1, 12, 6],
    [-7, 8, 7.87, 7, 9.2, 8], [-7, 8, 6, -6.87, 9.2, 8], [6.87, 8, 6, 7, 9.2, 8],
    [-5, 3, -3.07, 2.9, 4.18, -1.78], [2, 3, -5, 3, 4.18, -2],
    [3, 3, -5, 5, 12, -3.65], [-5.875, 3.25, 2.9375, -3.875, 4.875, 3.9375],
    [-.5, 3, .5, 1.25, 4.02, 1.625],
    [-5.875, 8, -.25, -4.75, 9.375, 1.75],
    [3.875, 8, -2, 4, 9.125, 5],
    [-5.88, 8, -4.8, -.88, 11, -4.22],
    [-4.75, 8, -2.5, -3, 9, -1.375], [-.25, 8, 1.5, 1.5, 9, 2.625],
    ...tavernFurnitureColliders,
  ];
  const floorBoxes: Box[] = [
    [-7, 2, -6, 7, 3, 8], [-7, 7, -6, 4, 8, 6], [4, 7, -6, 7, 8, -3],
    [4, 7, 5, 7, 8, 6], [-7, 7.75, 6, 7, 8, 8], [-6, 3, 2.5, -3.5, 3.25, 5],
  ];
  const stairRails = stairs.slice(0, 17).flatMap(([, , z, , tread, back]): Box[] => [
    [4.0625, tread, z, 4.1875, tread + 1, back],
    [5.6875, tread, z, 5.8125, tread + 1, back],
  ]);
  group.userData.colliders = [...wallBoxes, ...stairRails].map(toBox);
  group.userData.floors = [...floorBoxes, ...porchSteps, ...stairs].map(toBox);
  return group;
}
