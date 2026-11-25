import {
  BoxGeometry, Color, DataTexture, FrontSide, Group, InstancedMesh, MeshLambertMaterial,
  NearestFilter, Object3D, RGBAFormat, SRGBColorSpace, StaticDrawUsage,
} from 'three';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

export const c2SecondMineCampLifePrefix = 'town-c2/second-mine/camp-life/';

export type C2SecondMineCampArea = 'entry' | 'west-workface' | 'east-workface' | 'river-camp';
export type C2SecondMineCampProp = 'pick' | 'chisel' | 'scrap-rail' | 'slag' |
  'boots' | 'blanket' | 'bowl' | 'jug' | 'crate';
export type C2SecondMineCampFamily = 'iron' | 'rust' | 'timber' | 'cloth' | 'stone' | 'slag';

export type C2SecondMineCampLifePiece = C2SecondMineBox & Readonly<{
  id: string;
  area: C2SecondMineCampArea;
  prop: C2SecondMineCampProp;
  family: C2SecondMineCampFamily;
}>;

const families: readonly C2SecondMineCampFamily[] = ['iron', 'rust', 'timber', 'cloth', 'stone', 'slag'];
const palette: Readonly<Record<C2SecondMineCampFamily, readonly [number, number, number]>> = {
  iron: [0x727b82, 0xaeb3ad, 0x3f4b52],
  rust: [0x8a5d42, 0xc08455, 0x49342c],
  timber: [0x7a5b3e, 0xb08759, 0x403127],
  cloth: [0x6d7475, 0xa5a79c, 0x3d484c],
  stone: [0x7c7770, 0xb0a793, 0x454c4c],
  slag: [0x4b504f, 0x808078, 0x252e31],
};
const propOrder: readonly C2SecondMineCampProp[] = [
  'pick', 'chisel', 'scrap-rail', 'slag', 'boots', 'blanket', 'bowl', 'jug', 'crate',
];
const areaOrder: readonly C2SecondMineCampArea[] = ['entry', 'west-workface', 'east-workface', 'river-camp'];

function mixTone(a: number, b: number, amount: number) {
  const mix = (start: number, end: number) => Math.round(start + (end - start) * amount);
  return (mix(a >>> 16, b >>> 16) << 16) |
    (mix((a >>> 8) & 255, (b >>> 8) & 255) << 8) | mix(a & 255, b & 255);
}

function nearestTexture(family: C2SecondMineCampFamily, seed: number) {
  const [base, light, dark] = palette[family];
  const middle = mixTone(base, light, .48);
  const deep = mixTone(base, dark, .58);
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = (Math.imul(x + seed, 15731) ^ Math.imul(y + 17, 4817)) >>> 0;
    const fleck = grain % 29;
    let color = base;
    if (family === 'timber') {
      const grainLine = (x + Math.floor(y / 4) * 3) % 8;
      color = grainLine === 0 ? deep : grainLine === 1 ? dark :
        fleck < 4 ? light : fleck < 11 ? middle : base;
    } else if (family === 'cloth') {
      const weave = (x + y * 3) % 7;
      color = weave === 0 ? dark : weave === 1 ? deep : weave === 2 ? middle :
        fleck < 5 ? light : base;
      if ((x * 5 + y * 11) % 37 === 0) color = light;
    } else if (family === 'stone' || family === 'slag') {
      const block = (Math.floor(x / 3) * 7 + Math.floor(y / 4) * 11 + seed) % 13;
      color = block < 3 ? deep : block === 3 ? dark : fleck < 5 ? light :
        fleck < 11 ? middle : base;
    } else {
      color = fleck < 5 ? dark : fleck < 10 ? deep : fleck > 23 ? light :
        fleck > 18 ? middle : base;
      if ((x + y * 3) % 19 === 0) color = middle;
      if ((x * 7 + y * 5) % 43 === 0) color = light;
    }
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    if (border && grain % 4 === 0) color = dark;
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16, RGBAFormat);
  texture.name = `c2-second-mine-camp-life/${family}-worn-16px`;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const wearProfiles: Readonly<Record<C2SecondMineCampFamily, readonly [number, number, number]>> = {
  iron: [.94, .99, 1.04],
  rust: [1.07, .94, .82],
  timber: [1.05, .97, .87],
  cloth: [.97, 1.01, 1.02],
  stone: [1.01, .99, .94],
  slag: [.96, 1.01, .99],
};

function applyInstanceWear(mesh: InstancedMesh, family: C2SecondMineCampFamily,
  members: readonly C2SecondMineCampLifePiece[]) {
  const tint = new Color();
  const [red, green, blue] = wearProfiles[family];
  members.forEach((piece, index) => {
    const seed = Math.imul(index + 31, 1597334677) ^ Math.round((piece.x + 40) * 8191) ^
      Math.round((piece.n + 20) * 4093);
    const shade = .86 + ((seed >>> 0) % 9) * .02;
    const worn = /tip|head|rim|cuff|top|corner|strap|plate-lip/.test(piece.id) ? .07 : 0;
    tint.setRGB((shade + worn) * red, (shade + worn) * green, (shade + worn) * blue);
    mesh.setColorAt(index, tint);
  });
  mesh.instanceColor!.setUsage(StaticDrawUsage);
  mesh.instanceColor!.needsUpdate = true;
}

function makePieces() {
  const pieces: C2SecondMineCampLifePiece[] = [];
  const objectCounts = Object.fromEntries(propOrder.map(prop => [prop, 0])) as Record<C2SecondMineCampProp, number>;
  const areaCounts = Object.fromEntries(areaOrder.map(area => [area, 0])) as Record<C2SecondMineCampArea, number>;
  let serial = 0;

  function object(area: C2SecondMineCampArea, prop: C2SecondMineCampProp) {
    const id = `${c2SecondMineCampLifePrefix}${area}/${prop}-${objectCounts[prop]++}`;
    areaCounts[area]++;
    return id;
  }
  function add(id: string, area: C2SecondMineCampArea, prop: C2SecondMineCampProp,
    family: C2SecondMineCampFamily, x: number, n: number, y: number,
    w: number, d: number, h: number, part: string) {
    const piece: C2SecondMineCampLifePiece = Object.freeze({
      id: `${id}/${part}-${serial++}`, area, prop, family, x, n, y, w, d, h,
    });
    if (!c2SecondMineBoxAllowed(piece)) throw new RangeError(`C2 camp-life piece rejected: ${piece.id}`);
    pieces.push(piece);
  }

  function pick(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'pick');
    for (let i = 0; i < 4; i++) add(id, area, 'pick', 'timber', x - .36 + i * .24, n, .10, .26, .13, .13, 'handle');
    add(id, area, 'pick', 'iron', x + .58, n, .15, .17, .64, .16, 'head');
    for (const side of [-1, 1]) add(id, area, 'pick', 'iron', x + .58, n + side * .36, .12, .23, .13, .12, 'tip');
  }
  function chisel(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'chisel');
    add(id, area, 'chisel', 'timber', x - .20, n, .11, .36, .15, .15, 'grip');
    add(id, area, 'chisel', 'iron', x + .20, n, .10, .48, .09, .09, 'shaft');
    add(id, area, 'chisel', 'iron', x + .49, n, .10, .14, .15, .10, 'tip');
    add(id, area, 'chisel', 'rust', x - .01, n, .13, .08, .20, .12, 'ferrule');
  }
  function scrapRail(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'scrap-rail');
    for (const side of [-1, 1]) add(id, area, 'scrap-rail', 'iron', x + side * .22, n, .13, .10, 1.45, .12, 'rail');
    for (let i = 0; i < 4; i++) add(id, area, 'scrap-rail', 'timber', x, n - .54 + i * .36, .065, .72, .16, .13, 'sleeper');
    add(id, area, 'scrap-rail', 'rust', x + .38, n + .52, .16, .30, .34, .08, 'bent-plate');
    add(id, area, 'scrap-rail', 'iron', x + .48, n + .68, .21, .18, .18, .16, 'plate-lip');
  }
  function boots(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'boots');
    for (const side of [-1, 1]) {
      const bx = x + side * .18;
      add(id, area, 'boots', 'rust', bx, n, .055, .27, .50, .10, 'sole');
      add(id, area, 'boots', 'cloth', bx, n - .06, .21, .24, .32, .25, 'upper');
      add(id, area, 'boots', 'rust', bx, n + .13, .37, .27, .18, .17, 'cuff');
    }
  }
  function blanket(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'blanket');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      add(id, area, 'blanket', 'cloth', x + (col - .5) * .30 + row * .035,
        n + (row - 1) * .23, .085 + row * .115, .31, .25, .11, 'fold');
    }
  }
  function bowl(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'bowl');
    add(id, area, 'bowl', 'stone', x, n, .045, .34, .34, .09, 'bottom');
    for (const side of [-1, 1]) {
      add(id, area, 'bowl', 'stone', x + side * .16, n, .14, .08, .38, .18, 'rim-x');
      add(id, area, 'bowl', 'stone', x, n + side * .16, .14, .26, .08, .18, 'rim-n');
    }
  }
  function jug(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'jug');
    add(id, area, 'jug', 'stone', x, n, .23, .36, .36, .42, 'body');
    add(id, area, 'jug', 'stone', x, n, .49, .27, .27, .14, 'shoulder');
    add(id, area, 'jug', 'stone', x, n, .62, .14, .14, .17, 'neck');
    add(id, area, 'jug', 'stone', x + .23, n, .50, .20, .09, .09, 'spout');
    add(id, area, 'jug', 'iron', x - .24, n, .37, .07, .09, .28, 'handle-upright');
    add(id, area, 'jug', 'iron', x - .29, n, .51, .12, .09, .07, 'handle-top');
  }
  function crate(area: C2SecondMineCampArea, x: number, n: number) {
    const id = object(area, 'crate');
    for (let i = 0; i < 3; i++) {
      add(id, area, 'crate', 'timber', x - .25 + i * .25, n, .055, .23, .66, .11, 'base');
      add(id, area, 'crate', 'timber', x - .25 + i * .25, n, .65, .23, .66, .11, 'top');
    }
    for (const dx of [-1, 1]) for (const dn of [-1, 1]) {
      add(id, area, 'crate', 'timber', x + dx * .32, n + dn * .30, .35, .10, .10, .62, 'corner');
    }
    for (const side of [-1, 1]) {
      add(id, area, 'crate', 'timber', x, n + side * .30, .34, .66, .09, .16, 'side-rail');
      add(id, area, 'crate', 'rust', x + side * .32, n, .34, .05, .62, .12, 'strap');
    }
  }
  function slag(area: C2SecondMineCampArea, x: number, n: number, index: number) {
    const id = object(area, 'slag');
    const size = .16 + (index % 4) * .055;
    const height = .10 + (index % 3) * .06;
    add(id, area, 'slag', index % 5 === 0 ? 'rust' : 'slag', x, n, height / 2,
      size * 1.3, size, height, 'chunk');
  }

  // Entrance and support-station edge: every cluster leaves the surveyed
  // central aisle, campfire ring and existing furniture footprints clear.
  crate('entry', 4.3, 4.7);
  scrapRail('entry', -4.5, 3.0);
  pick('entry', -4.4, 20.5);
  chisel('entry', 4.5, 20.7);
  boots('entry', -4.6, 17.2);
  blanket('entry', -5.6, 15.6);
  bowl('entry', -5.75, 11.7);
  jug('entry', -5.55, 14.55);
  const entrySlag = [[4.3, 2.0], [4.2, 6.0], [-4.4, 6.2], [-4.4, 21.7], [4.5, 18.5], [-4.5, 13.7]] as const;
  entrySlag.forEach(([x, n], index) => slag('entry', x, n, index));

  // West workface: a tool cache and washing/eating corner, not a mineable node.
  pick('west-workface', -10, 43);
  chisel('west-workface', -12.5, 50.5);
  scrapRail('west-workface', -15.5, 46);
  boots('west-workface', -9, 51.5);
  blanket('west-workface', -11, 54.5);
  bowl('west-workface', -16, 43);
  jug('west-workface', -9.5, 40.5);
  crate('west-workface', -17.5, 53);
  for (let i = 0; i < 12; i++) slag('west-workface', -18.5 + (i % 4) * 2.1,
    40.5 + Math.floor(i / 4) * 5.4 + (i % 2) * .45, i);

  // East workface: separated resting places and empty transport storage.
  pick('east-workface', 10.5, 74);
  chisel('east-workface', 13, 81);
  scrapRail('east-workface', 17, 78);
  boots('east-workface', 11, 86);
  blanket('east-workface', 15, 72);
  bowl('east-workface', 18, 84);
  jug('east-workface', 10, 88);
  crate('east-workface', 20, 72);
  for (let i = 0; i < 12; i++) slag('east-workface', 9 + (i % 4) * 3.1,
    70.5 + Math.floor(i / 4) * 6.2 + (i % 2) * .40, i + 12);

  // River-camp perimeter: daily-use objects only, with no fire, reward or
  // inventory socket added around the existing authoritative camp anchor.
  pick('river-camp', -8, 152.8);
  chisel('river-camp', -16, 152.5);
  scrapRail('river-camp', -7.5, 156.5);
  boots('river-camp', -15.5, 154.2);
  blanket('river-camp', -16.5, 157);
  bowl('river-camp', -14.7, 152.3);
  jug('river-camp', -14.8, 154.2);
  crate('river-camp', -15, 159.5);
  for (let i = 0; i < 8; i++) slag('river-camp', -17 + (i % 4) * 2.4,
    153 + Math.floor(i / 4) * 5.1 + (i % 2) * .35, i + 24);

  return Object.freeze({
    pieces: Object.freeze(pieces),
    objectCounts: Object.freeze(objectCounts),
    areaCounts: Object.freeze(areaCounts),
  });
}

/** Builds detached local ENY artwork, or adds only its own group to a supplied owner. */
export function buildC2SecondMineCampLife(owner?: Group) {
  const plan = makePieces();
  const group = new Group();
  group.name = 'town-c2-second-mine-camp-life';
  const geometry = new BoxGeometry(1, 1, 1);
  const pose = new Object3D();
  const meshes: InstancedMesh[] = [];
  const materials: MeshLambertMaterial[] = [];
  const textures: DataTexture[] = [];

  for (const [index, family] of families.entries()) {
    const members = plan.pieces.filter(piece => piece.family === family);
    const texture = nearestTexture(family, index * 19 + 3);
    const material = new MeshLambertMaterial({
      map: texture,
      side: FrontSide,
      flatShading: true,
    });
    material.userData.materialFamily = family;
    const mesh = new InstancedMesh(geometry, material, members.length);
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.name = `${c2SecondMineCampLifePrefix}${family}`;
    for (const [pieceIndex, piece] of members.entries()) {
      pose.position.set(piece.x, piece.y, -piece.n);
      pose.scale.set(piece.w, piece.h, piece.d);
      pose.rotation.set(0, 0, 0);
      pose.updateMatrix();
      mesh.setMatrixAt(pieceIndex, pose.matrix.clone());
    }
    applyInstanceWear(mesh, family, members);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    materials.push(material);
    textures.push(texture);
  }

  const data = Object.freeze({
    coordinateFrame: 'local-eny',
    pieceCount: plan.pieces.length,
    objectCount: Object.values(plan.objectCounts).reduce((sum, count) => sum + count, 0),
    objectCounts: plan.objectCounts,
    areaCounts: plan.areaCounts,
    materialFamilyCount: families.length,
    materialFamilies: Object.freeze([...families]),
    drawCount: meshes.length,
    triangleCount: plan.pieces.length * 12,
    textureSize: 16,
    floorChangeCount: 0,
    collisionCount: 0,
    authorityChangeCount: 0,
    inventoryCount: 0,
    textCount: 0,
  });
  owner?.add(group);
  let disposed = false;
  function stats() { return data; }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const mesh of meshes) mesh.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    geometry.dispose();
    group.clear();
  }
  return { group, pieces: plan.pieces, meshes, data, stats, dispose };
}

export type C2SecondMineCampLifeScene = ReturnType<typeof buildC2SecondMineCampLife>;
export type C2SecondMineCampLifeStats = ReturnType<C2SecondMineCampLifeScene['stats']>;
export { buildC2SecondMineCampLife as build };
export function stats(scene: C2SecondMineCampLifeScene): C2SecondMineCampLifeStats {
  return scene.stats();
}
export function dispose(scene: C2SecondMineCampLifeScene): void {
  scene.dispose();
}
