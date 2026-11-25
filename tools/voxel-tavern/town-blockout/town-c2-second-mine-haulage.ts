import {
  BoxGeometry, DataTexture, Euler, FrontSide, Group, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, MeshStandardMaterial, NearestFilter, Quaternion, SRGBColorSpace,
  StaticDrawUsage, Vector3, type Material,
} from 'three';
import { createUndergroundMineCartModel } from './underground-mine-cart-model.js';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

type Family = 'sleeper' | 'iron' | 'rust' | 'slag';
type Rotation = readonly [number, number, number];

export type C2SecondMineHaulageVisualBox = Readonly<{
  name: string;
  family: Family | 'static-cart-envelope';
  box: C2SecondMineBox;
}>;

export type C2SecondMineHaulageStats = Readonly<{
  coordinateFrame: 'east-up-north';
  sidingCount: number;
  cartCount: number;
  stopperCount: number;
  sleeperCount: number;
  railPieceCount: number;
  debrisPieceCount: number;
  detailPieceCount: number;
  guardedEntityCount: number;
  materialFamilies: number;
  materialObjects: number;
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

export type C2SecondMineHaulageScene = Readonly<{
  group: Group;
  visualBoxes: readonly C2SecondMineHaulageVisualBox[];
  stats: C2SecondMineHaulageStats;
  dispose(): void;
}>;

const palette: Readonly<Record<Family, readonly [number, number, number]>> = Object.freeze({
  sleeper: Object.freeze([0x674b35, 0x94704c, 0x403026] as const),
  iron: Object.freeze([0x596368, 0x879094, 0x303a3f] as const),
  rust: Object.freeze([0x805139, 0xad6c43, 0x493126] as const),
  slag: Object.freeze([0x64635d, 0x8b8678, 0x3f423f] as const),
});

function pixelTexture(family: Family) {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  const [base, light, dark] = palette[family];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fleck = (x * 41 + y * 67 + x * y * 7) % 31;
    let tone = base;
    if (family === 'sleeper') {
      if (x % 6 === 0 || fleck < 4) tone = dark;
      else if (fleck > 25) tone = light;
    } else if (family === 'iron') {
      if (fleck < 5) tone = dark;
      else if (fleck > 26) tone = light;
    } else if (family === 'rust') {
      if (fleck < 9) tone = dark;
      else if (fleck > 22) tone = light;
    } else {
      if (fleck < 8) tone = dark;
      else if (fleck > 23) tone = light;
    }
    pixels.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], (y * size + x) * 4);
  }
  const texture = new DataTexture(pixels, size, size);
  texture.name = `c2-second-mine-haulage/${family}-16px`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function sceneTally(group: Group) {
  const materials = new Set<Material>();
  let triangles = 0, drawCalls = 0;
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    drawCalls++;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (material instanceof MeshLambertMaterial || material instanceof MeshStandardMaterial) {
        materials.add(material);
      }
    }
    const geometryTriangles = (object.geometry.index?.count ??
      object.geometry.getAttribute('position').count) / 3;
    triangles += geometryTriangles * (object instanceof InstancedMesh ? object.count : 1);
  });
  return { materials, triangles, drawCalls };
}

/**
 * Read-only entrance sidings. Two canonical mine carts are parked outside the
 * through route; this module deliberately exposes no push, inventory or host API.
 */
export function buildTownC2SecondMineHaulage(parent?: Group): C2SecondMineHaulageScene {
  const group = new Group();
  group.name = 'town-c2-second-mine-haulage';
  group.userData.coordinateFrame = 'east-up-north';
  group.userData.interactive = false;
  group.userData.readOnly = true;
  const geometry = new BoxGeometry(1, 1, 1);
  const textures = new Map<Family, DataTexture>();
  const materials = new Map<Family, MeshLambertMaterial>();
  const batches = new Map<Family, Matrix4[]>();
  const visualBoxes: C2SecondMineHaulageVisualBox[] = [];
  const meshes: InstancedMesh[] = [];
  const carts: ReturnType<typeof createUndergroundMineCartModel>[] = [];
  const counts = { siding: 0, stopper: 0, sleeper: 0, rail: 0, debris: 0 };

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
      throw new RangeError(`C2 haulage placement rejected: ${name}`);
    }
    batches.get(family)!.push(pose);
    visualBoxes.push(Object.freeze({ name, family, box }));
  }

  function stopper(id: string, east: number, north: number) {
    add(`${id}/timber-buffer`, 'sleeper', east, north, .48, 1.58, .24, .26);
    for (const side of [-1, 1]) {
      add(`${id}/foot-${side}`, 'iron', east + side * .64, north, .27, .2, .54, .34);
      add(`${id}/plate-${side}`, 'rust', east + side * .64, north, .56, .3, .08, .4);
      for (const offset of [-.075, .075]) {
        add(`${id}/bolt-${side}-${offset}`, 'rust', east + side * .64 + offset,
          north, .615, .055, .045, .055);
      }
    }
    counts.stopper++;
  }

  function siding(id: string, east: number, n0: number, n1: number,
    cartNorth: number, bufferNorth: number, yaw: number) {
    counts.siding++;
    for (let north = n0, index = 0; north <= n1 + .001; north += 1.05, index++) {
      add(`${id}/sleeper-${index}`, 'sleeper', east, north, .07, 1.52, .14, .25);
      counts.sleeper++;
      if (index % 3 === 0) {
        add(`${id}/sleeper-rust-${index}`, 'rust', east - .49, north, .148, .13, .025, .2);
        add(`${id}/sleeper-rust-east-${index}`, 'rust', east + .49, north, .148, .13, .025, .2);
      }
    }
    const segments = Math.ceil((n1 - n0) / 1.05);
    const segmentLength = (n1 - n0) / segments + .025;
    for (const side of [-1, 1]) {
      for (let index = 0; index < segments; index++) {
        const north = n0 + (index + .5) * (n1 - n0) / segments;
        add(`${id}/rail-${side}-${index}`, 'iron', east + side * .5, north, .18,
          .115, .12, segmentLength);
        if (index % 4 === 1) add(`${id}/rail-joint-${side}-${index}`, 'rust',
          east + side * .5, north, .225, .17, .035, .22);
        counts.rail++;
      }
    }
    stopper(`${id}/buffer`, east, bufferNorth);
    const cart = createUndergroundMineCartModel();
    cart.group.name = `town-c2-second-mine-haulage/${id}-static-cart`;
    cart.group.userData.readOnly = true;
    cart.group.userData.interactive = false;
    cart.group.position.set(east, .24, -cartNorth);
    cart.group.rotation.y = yaw;
    cart.setWheelTravel(0);
    group.add(cart.group);
    carts.push(cart);
    // Conservative whole-model AABB: canonical open bin, wheels and push handle.
    const cartBox: C2SecondMineBox = Object.freeze({
      x: east, y: .24, n: cartNorth, w: 1.2, h: .82, d: 2.05,
    });
    if (!c2SecondMineBoxAllowed(cartBox)) {
      throw new RangeError(`C2 haulage cart envelope rejected: ${id}`);
    }
    visualBoxes.push(Object.freeze({ name: `${id}/static-cart-envelope`,
      family: 'static-cart-envelope', box: cartBox }));
  }

  // West cart faces its south buffer; east cart faces north. Neither occupies x=0.
  // The west track and its inner rail end before the support-camp clearance circle.
  siding('west-entry', -4.65, 3.5, 7.6, 6.5, 4.9, Math.PI);
  siding('east-entry', 4.65, 15.5, 22, 18.5, 20.25, 0);

  function slagPile(id: string, east: number, north: number, radius: number) {
    for (let index = 0; index < 16; index++) {
      const angle = index * 2.399963;
      const distance = radius * Math.sqrt((index + .5) / 16);
      const size = .2 + (index % 4) * .055;
      const tall = .12 + (index % 3) * .075;
      add(`${id}/slag-${index}`, index % 5 === 0 ? 'rust' : 'slag',
        east + Math.cos(angle) * distance, north + Math.sin(angle) * distance,
        tall / 2 + .015, size, tall, size * (1.15 + index % 2 * .25),
        [0, (index % 5) * .21, (index % 3 - 1) * .08]);
    }
    counts.debris += 16;
  }

  slagPile('west-spoil', -2.95, 15.7, .86);
  slagPile('east-spoil', 2.95, 9.1, .76);

  for (const [id, east, north, yaw] of [
    ['west-scrap', -3.35, 19.1, .22], ['east-scrap', 3.35, 12.4, -.18],
  ] as const) {
    for (let index = 0; index < 2; index++) {
      add(`${id}/bent-rail-${index}`, 'iron', east + index * .14,
        north + index * .34, .12 + index * .025, .13, .14, 1.42,
        [.035 * index, yaw * (index ? -1 : 1), index ? -.055 : .045]);
      add(`${id}/rust-fishplate-${index}`, 'rust', east + index * .14,
        north + index * .34 - .28, .215 + index * .025, .24, .055, .28,
        [0, yaw, 0]);
    }
    for (let index = 0; index < 3; index++) {
      add(`${id}/waste-timber-${index}`, 'sleeper', east + .34 + index * .09,
        north - .72 + index * .17, .1 + index * .035, .19, .18, .72,
        [0, yaw + index * .16, index * .025]);
    }
    counts.debris += 7;
  }

  for (const [family, matrices] of batches) {
    const mesh = new InstancedMesh(geometry, materials.get(family)!, matrices.length);
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.name = `town-c2-second-mine-haulage/${family}`;
    matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    meshes.push(mesh);
    group.add(mesh);
  }

  const tally = sceneTally(group);
  const detailPieceCount = visualBoxes.length - carts.length;
  const bounds = visualBoxes.reduce((result, { box }) => ({
    minEast: Math.min(result.minEast, box.x - box.w / 2),
    maxEast: Math.max(result.maxEast, box.x + box.w / 2),
    minNorth: Math.min(result.minNorth, box.n - box.d / 2),
    maxNorth: Math.max(result.maxNorth, box.n + box.d / 2),
    minHeight: Math.min(result.minHeight, box.y),
    maxHeight: Math.max(result.maxHeight, box.y + box.h),
  }), { minEast: Infinity, maxEast: -Infinity, minNorth: Infinity,
    maxNorth: -Infinity, minHeight: Infinity, maxHeight: -Infinity });
  const stats: C2SecondMineHaulageStats = Object.freeze({
    coordinateFrame: 'east-up-north',
    sidingCount: counts.siding,
    cartCount: carts.length,
    stopperCount: counts.stopper,
    sleeperCount: counts.sleeper,
    railPieceCount: counts.rail,
    debrisPieceCount: counts.debris,
    detailPieceCount,
    guardedEntityCount: visualBoxes.length,
    materialFamilies: materials.size + 4,
    materialObjects: tally.materials.size,
    materialFamilyNames: Object.freeze([
      ...materials.keys(), 'cart-iron', 'cart-frame', 'cart-edge', 'cart-oxide',
    ]),
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
      for (const cart of carts) cart.dispose();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials.values()) material.dispose();
      for (const texture of textures.values()) texture.dispose();
      geometry.dispose();
      group.clear();
    },
  });
}
