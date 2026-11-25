import {
  BoxGeometry, Color, DataTexture, Euler, FrontSide, Group, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, NearestFilter, Quaternion, SRGBColorSpace, StaticDrawUsage, Vector3,
} from 'three';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

type Family = 'timber' | 'iron' | 'rust';
type Rotation = readonly [number, number, number];
type Placement = Readonly<{ name: string; pose: Matrix4 }>;

export type C2SecondMineTimberingVisualBox = Readonly<{
  name: string;
  family: Family;
  box: C2SecondMineBox;
}>;

export type C2SecondMineTimberingStats = Readonly<{
  coordinateFrame: 'east-up-north';
  supportCount: number;
  postCount: number;
  postBlockCount: number;
  beamCount: number;
  braceCount: number;
  shoeCount: number;
  capCount: number;
  nailCount: number;
  pieceCount: number;
  guardedEntityCount: number;
  materialFamilies: number;
  materialFamilyNames: readonly string[];
  textureSize: 16;
  drawCalls: number;
  triangles: number;
  bounds: Readonly<{
    minEast: number; maxEast: number; minNorth: number; maxNorth: number;
    minHeight: number; maxHeight: number;
  }>;
  interactive: false;
}>;

export type C2SecondMineTimberingScene = Readonly<{
  group: Group;
  visualBoxes: readonly C2SecondMineTimberingVisualBox[];
  stats: C2SecondMineTimberingStats;
  dispose(): void;
}>;

const palette: Readonly<Record<Family, readonly [number, number, number]>> = Object.freeze({
  timber: Object.freeze([0x7a5b3e, 0xb08759, 0x403127] as const),
  iron: Object.freeze([0x657177, 0xa2aaa8, 0x354147] as const),
  rust: Object.freeze([0x8d5c3e, 0xc08352, 0x4b3228] as const),
});

function mixTone(a: number, b: number, amount: number) {
  const mix = (start: number, end: number) => Math.round(start + (end - start) * amount);
  return (mix(a >>> 16, b >>> 16) << 16) |
    (mix((a >>> 8) & 255, (b >>> 8) & 255) << 8) | mix(a & 255, b & 255);
}

function pixelTexture(family: Family) {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  const [base, light, dark] = palette[family];
  const middle = mixTone(base, light, .52);
  const deep = mixTone(base, dark, .62);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (Math.imul(x + 3, 15731) ^ Math.imul(y + 7, 4817)) >>> 0;
    const fleck = grain % 31;
    let tone = base;
    if (family === 'timber') {
      const grainLine = (x + Math.floor(y / 4) * 3) % 8;
      if (grainLine === 0) tone = deep;
      else if (grainLine === 1 && y % 3 !== 0) tone = dark;
      else if (fleck < 4) tone = light;
      else if (fleck < 10) tone = middle;
      else if (fleck > 27) tone = deep;
      if ((x * 7 + y * 11) % 47 === 0) tone = light;
    } else if (family === 'iron') {
      if (fleck < 3) tone = dark;
      else if (fleck < 7) tone = deep;
      else if (fleck > 26) tone = light;
      else if (fleck > 22) tone = middle;
      if ((x + y * 3) % 19 === 0) tone = middle;
      if ((x * 5 + y * 3) % 43 === 0) tone = light;
    } else {
      if (fleck < 5) tone = dark;
      else if (fleck < 11) tone = deep;
      else if (fleck > 24) tone = light;
      else if (fleck > 19) tone = middle;
      if ((x * 3 + y * 7) % 41 === 0) tone = light;
    }
    pixels.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size);
  texture.name = `c2-second-mine-timbering/${family}-worn-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const wearProfiles: Readonly<Record<Family, readonly [number, number, number]>> = {
  timber: [1.04, .97, .88],
  iron: [.94, .99, 1.04],
  rust: [1.07, .94, .81],
};

function applyInstanceWear(mesh: InstancedMesh, family: Family, placements: readonly Placement[]) {
  const tint = new Color();
  const [red, green, blue] = wearProfiles[family];
  placements.forEach(({ name, pose }, index) => {
    const seed = Math.imul(index + 11, 1597334677) ^ Math.round((pose.elements[12]! + 80) * 8191) ^
      Math.round((pose.elements[14]! + 120) * 4093);
    const shade = .86 + ((seed >>> 0) % 11) * .016;
    const hardware = /nail|cap|foot/.test(name) ? .06 : 0;
    tint.setRGB((shade + hardware) * red, (shade + hardware) * green, (shade + hardware) * blue);
    mesh.setColorAt(index, tint);
  });
  mesh.instanceColor!.setUsage(StaticDrawUsage);
  mesh.instanceColor!.needsUpdate = true;
}

function triangleCount(group: Group) {
  let triangles = 0, drawCalls = 0;
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    drawCalls++;
    const geometryTriangles = (object.geometry.index?.count ??
      object.geometry.getAttribute('position').count) / 3;
    triangles += geometryTriangles * (object instanceof InstancedMesh ? object.count : 1);
  });
  return { triangles, drawCalls };
}

/**
 * Authority-free timber infill for the -140 m candidate. Every visible box,
 * including the AABB of an angled brace, is checked against the shared C2 guard.
 * The group stays at the mine origin and uses east / height / north internally.
 */
export function buildTownC2SecondMineTimbering(parent?: Group): C2SecondMineTimberingScene {
  const group = new Group();
  group.name = 'town-c2-second-mine-timbering';
  group.userData.coordinateFrame = 'east-up-north';
  group.userData.interactive = false;
  const geometry = new BoxGeometry(1, 1, 1);
  const textures = new Map<Family, DataTexture>();
  const materials = new Map<Family, MeshLambertMaterial>();
  const batches = new Map<Family, Placement[]>();
  const visualBoxes: C2SecondMineTimberingVisualBox[] = [];
  const meshes: InstancedMesh[] = [];
  const counts = { support: 0, post: 0, postBlock: 0, beam: 0, brace: 0,
    shoe: 0, cap: 0, nail: 0 };

  for (const family of Object.keys(palette) as Family[]) {
    const map = pixelTexture(family);
    const material = new MeshLambertMaterial({
      map,
      side: FrontSide,
      flatShading: true,
    });
    textures.set(family, map);
    materials.set(family, material);
    batches.set(family, []);
  }

  function add(name: string, family: Family, east: number, north: number, height: number,
    width: number, tall: number, depth: number, rotation: Rotation = [0, 0, 0]) {
    const quaternion = new Quaternion().setFromEuler(new Euler(...rotation));
    const pose = new Matrix4().compose(new Vector3(east, height, -north), quaternion,
      new Vector3(width, tall, depth));
    const axes = new Matrix4().makeRotationFromQuaternion(quaternion).elements;
    const halfEast = (Math.abs(axes[0]!) * width + Math.abs(axes[4]!) * tall +
      Math.abs(axes[8]!) * depth) / 2;
    const halfHeight = (Math.abs(axes[1]!) * width + Math.abs(axes[5]!) * tall +
      Math.abs(axes[9]!) * depth) / 2;
    const halfNorth = (Math.abs(axes[2]!) * width + Math.abs(axes[6]!) * tall +
      Math.abs(axes[10]!) * depth) / 2;
    const box: C2SecondMineBox = Object.freeze({
      x: east, y: height - halfHeight, n: north,
      w: halfEast * 2, h: halfHeight * 2, d: halfNorth * 2,
    });
    if (!c2SecondMineBoxAllowed(box)) {
      throw new RangeError(`C2 timbering placement rejected: ${name}`);
    }
    batches.get(family)!.push({ name, pose });
    visualBoxes.push(Object.freeze({ name, family, box }));
  }

  function post(id: string, east: number, north: number, height: number, outward: number) {
    counts.post++;
    const blockHeight = height / 8;
    for (let index = 0; index < 8; index++) {
      const offset = index % 3 === 0 ? .012 : index % 3 === 1 ? -.008 : 0;
      add(`${id}/timber-course-${index}`, 'timber', east + offset, north,
        blockHeight * (index + .5), index % 2 ? .29 : .32,
        blockHeight - .014, index % 2 ? .35 : .32);
      counts.postBlock++;
    }
    add(`${id}/iron-foot`, 'iron', east, north, .11, .57, .22, .64);
    add(`${id}/rust-foot-plate`, 'rust', east + outward * .18, north, .225, .18, .045, .43);
    add(`${id}/iron-cap`, 'iron', east, north, height + .035, .43, .17, .43);
    counts.shoe++;
    counts.cap++;
    for (const level of [.68, 1.62, 2.58]) {
      if (level >= height - .2) continue;
      add(`${id}/rust-nail-east-${level}`, 'rust', east + outward * .165, north,
        level, .055, .075, .09);
      add(`${id}/rust-nail-north-${level}`, 'rust', east, north + .178,
        level, .09, .075, .055);
      counts.nail += 2;
    }
  }

  function brace(id: string, east: number, n0: number, y0: number,
    n1: number, y1: number) {
    const deltaNorth = n1 - n0, deltaHeight = y1 - y0;
    const length = Math.hypot(deltaNorth, deltaHeight);
    add(id, 'timber', east, (n0 + n1) / 2, (y0 + y1) / 2,
      .18, length, .19, [Math.atan2(-deltaNorth, deltaHeight), 0, 0]);
    counts.brace++;
  }

  function galleryFrame(id: string, north: number) {
    counts.support++;
    for (const side of [-1, 1]) {
      const east = side * 2.65;
      post(`${id}/post-${side}`, east, north, 3.75, side);
      add(`${id}/longitudinal-beam-${side}`, 'timber', east, north, 3.73,
        .32, .28, 2.9);
      brace(`${id}/north-brace-${side}`, east, north - .57, .64, north - .04, 2.34);
      brace(`${id}/south-brace-${side}`, east, north + .57, .64, north + .04, 2.34);
      counts.beam++;
    }
  }

  function workfaceFrame(id: string, west: boolean, north: number) {
    counts.support++;
    const inner = west ? -6.2 : 6.2;
    const outer = west ? -8 : 8;
    for (const [index, east] of [inner, outer].entries()) {
      post(`${id}/post-${index}`, east, north, 4.1, west ? -1 : 1);
      brace(`${id}/north-brace-${index}`, east, north - .55, .68, north - .04, 2.55);
      brace(`${id}/south-brace-${index}`, east, north + .55, .68, north + .04, 2.55);
    }
    add(`${id}/cross-beam`, 'timber', (inner + outer) / 2, north, 4.08,
      Math.abs(outer - inner) + .34, .28, .36);
    counts.beam++;
  }

  // Entry and main drift: the centre line, camp fire and both wing doors stay open.
  for (const [index, north] of [6, 17.5, 27, 35.5, 61, 69, 77, 85, 92].entries()) {
    galleryFrame(`mainline-${index}`, north);
  }
  // Dry workface edges only; no frame crosses either measured encounter centre.
  for (const [index, north] of [42, 48, 54].entries()) {
    workfaceFrame(`west-workface-${index}`, true, north);
  }
  for (const [index, north] of [72, 78, 84, 87].entries()) {
    workfaceFrame(`east-workface-${index}`, false, north);
  }

  for (const [family, placements] of batches) {
    const mesh = new InstancedMesh(geometry, materials.get(family)!, placements.length);
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.name = `town-c2-second-mine-timbering/${family}`;
    placements.forEach(({ pose }, index) => mesh.setMatrixAt(index, pose));
    applyInstanceWear(mesh, family, placements);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
    group.add(mesh);
  }

  const tally = triangleCount(group);
  const bounds = visualBoxes.reduce((result, { box }) => ({
    minEast: Math.min(result.minEast, box.x - box.w / 2),
    maxEast: Math.max(result.maxEast, box.x + box.w / 2),
    minNorth: Math.min(result.minNorth, box.n - box.d / 2),
    maxNorth: Math.max(result.maxNorth, box.n + box.d / 2),
    minHeight: Math.min(result.minHeight, box.y),
    maxHeight: Math.max(result.maxHeight, box.y + box.h),
  }), { minEast: Infinity, maxEast: -Infinity, minNorth: Infinity,
    maxNorth: -Infinity, minHeight: Infinity, maxHeight: -Infinity });
  const stats: C2SecondMineTimberingStats = Object.freeze({
    coordinateFrame: 'east-up-north',
    supportCount: counts.support,
    postCount: counts.post,
    postBlockCount: counts.postBlock,
    beamCount: counts.beam,
    braceCount: counts.brace,
    shoeCount: counts.shoe,
    capCount: counts.cap,
    nailCount: counts.nail,
    pieceCount: visualBoxes.length,
    guardedEntityCount: visualBoxes.length,
    materialFamilies: materials.size,
    materialFamilyNames: Object.freeze([...materials.keys()]),
    textureSize: 16,
    drawCalls: tally.drawCalls,
    triangles: tally.triangles,
    bounds: Object.freeze(bounds),
    interactive: false,
  });
  parent?.add(group);
  let disposed = false;
  return Object.freeze({
    group,
    visualBoxes: Object.freeze([...visualBoxes]),
    stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials.values()) material.dispose();
      for (const texture of textures.values()) texture.dispose();
      geometry.dispose();
      group.clear();
    },
  });
}
