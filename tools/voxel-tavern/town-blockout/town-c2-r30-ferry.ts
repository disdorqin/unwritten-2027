import {
  BoxGeometry, DataTexture, DoubleSide, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, NearestFilter, PlaneGeometry, PointLight,
  Quaternion, RGBAFormat, SRGBColorSpace, Vector3, type Material, type Texture,
} from 'three';
import {
  secondMineAnchors, secondMineBed, type MineRiverState,
} from '../../../src/shared/underground-second-mine-layout.js';

/** The complete nine-colour bitmap palette shared by the hull, pole and signs. */
export const townC2R30FerryPalette = Object.freeze([
  0x2d211b, 0x4b3427, 0x715239, 0x9a7350,
  0x3d474c, 0x5c686d, 0x929f9f, 0xc08455, 0xffd18a,
] as const);

export type TownC2R30FerryState =
  | 'near-docked' | 'near-boarded' | 'near-ready'
  | 'traveling-to-far' | 'far-boarded' | 'far-docked'
  | 'far-ready' | 'traveling-to-near' | 'stopped' | 'grounded';

export type TownC2R30FerryPosition = Readonly<{
  east: number;
  north: number;
  height: number;
}>;

export type TownC2R30FerryStats = Readonly<{
  state: TownC2R30FerryState;
  level: MineRiverState;
  position: TownC2R30FerryPosition;
  available: boolean;
  notice: '停渡' | '搁浅' | null;
  visualOnly: true;
  colliderCount: 0;
  realLightCount: number;
  pieceCount: number;
  travelProgress: number;
  disposed: boolean;
}>;

export type TownC2R30FerryScene = Readonly<{
  group: Group;
  boat: Group;
  /** Accepts only the existing hydrology level. It never reads a clock or network packet. */
  sync(level: MineRiverState): TownC2R30FerryStats;
  /** All four interactions reject every argument: only direct local calls are accepted. */
  board(input?: unknown): boolean;
  pole(input?: unknown): boolean;
  travel(input?: unknown): boolean;
  disembark(input?: unknown): boolean;
  /** Advances only this module's local visual animation; it cannot move a player. */
  update(seconds: number): boolean;
  stats(): TownC2R30FerryStats;
  dispose(): void;
}>;

const TRAVEL_SECONDS = 6;
const FLOAT_HEIGHT = -.18;
const GROUNDED_HEIGHT = -.52;
const LOCAL_FRAME = 'local-ENY' as const;

function pixelTexture(name: string, indices: readonly number[]) {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = (Math.imul(x + 5, 15731) ^ Math.imul(y + 13, 4817)) >>> 0;
    const index = indices[(x + Math.floor(y / 3) * 2 + (grain % 3)) % indices.length]!;
    const color = townC2R30FerryPalette[index]!;
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16, RGBAFormat);
  texture.name = `town-c2-r30-ferry/${name}-16px-nearest`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// Deliberately tiny 7x7 bitmap lettering keeps the notices legible without a DOM canvas.
const noticeGlyphs: Readonly<Record<'停渡' | '搁浅', readonly [readonly string[], readonly string[]]>> = {
  停渡: [
    ['  X    ', ' X X   ', 'X  X   ', 'XXXXXX ', '  X X  ', '  X X  ', '  X X  '],
    ['   X   ', '  X X  ', ' XXXXX ', 'X XXX X', '  XXX  ', ' X X X ', 'X     X'],
  ],
  搁浅: [
    ['X X X  ', ' XXXXX ', 'X XXX X', ' XXXXX ', '  XXX  ', ' X X X ', 'X X X X'],
    ['X X X  ', ' X X   ', 'XXXXXXX', 'X X X X', ' XXXXX ', 'X X X X', ' X X X '],
  ],
};

function noticeTexture(label: '停渡' | '搁浅') {
  const pixels = new Uint8Array(16 * 16 * 4);
  const ink = townC2R30FerryPalette[8]!;
  noticeGlyphs[label].forEach((glyph, character) => {
    glyph.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel !== 'X') return;
        pixels.set([ink >>> 16, (ink >>> 8) & 255, ink & 255, 255],
          ((y + 4) * 16 + character * 8 + x + 1) * 4);
      });
    });
  });
  const texture = new DataTexture(pixels, 16, 16, RGBAFormat);
  texture.name = `town-c2-r30-ferry/notice-${label}-16px-nearest`;
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function validLevel(level: unknown): level is MineRiverState {
  return level === 'middle' || level === 'high' || level === 'low';
}

/**
 * C2-R01 local ferry tableau. Coordinates are second-mine local ENY, mapped to
 * Three.js as (east, height, -north). The two registered pier anchors are the
 * only destinations. This module owns no world anchor, floor, collider,
 * presence registration, network send or server permission.
 */
export function mountTownC2R30Ferry(options: Readonly<{ parent?: Group }> = {}): TownC2R30FerryScene {
  const group = new Group();
  group.name = 'town-c2-r30-ferry';
  group.userData.coordinateFrame = LOCAL_FRAME;
  group.userData.visualOnly = true;
  group.userData.localOnly = true;
  group.userData.colliderCount = 0;
  group.userData.serverAuthority = false;

  const cube = new BoxGeometry(1, 1, 1);
  const panel = new PlaneGeometry(1.62, 1.12);
  const textures: Texture[] = [
    pixelTexture('timber', [0, 1, 2, 3]),
    pixelTexture('iron', [4, 5, 6]),
    pixelTexture('rope-lamp', [7, 8]),
    noticeTexture('停渡'), noticeTexture('搁浅'),
  ];
  const timber = new MeshLambertMaterial({ map: textures[0], flatShading: true });
  const iron = new MeshLambertMaterial({ map: textures[1], flatShading: true });
  const detail = new MeshLambertMaterial({ map: textures[2], flatShading: true });
  const glow = new MeshBasicMaterial({ map: textures[2] });
  const stopNotice = new MeshBasicMaterial({
    map: textures[3], transparent: true, alphaTest: .5, side: DoubleSide, depthWrite: false,
  });
  const groundedNotice = new MeshBasicMaterial({
    map: textures[4], transparent: true, alphaTest: .5, side: DoubleSide, depthWrite: false,
  });
  const materials: Material[] = [timber, iron, detail, glow, stopNotice, groundedNotice];

  // Reuse the established single-pole-ferry silhouette: plank bottom, raised
  // sides, squared ends, three cross-benches and one hand pole on starboard.
  const boat = new Group();
  boat.name = 'single-pole-ferry';
  const parts: { matrix: Matrix4; material: Material }[] = [];
  function part(x: number, height: number, north: number,
    width: number, tall: number, depth: number, material = timber, tilt = 0) {
    const matrix = new Matrix4().compose(
      new Vector3(x, height, -north),
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), tilt),
      new Vector3(width, tall, depth),
    );
    parts.push({ matrix, material });
  }
  for (let north = -2.3; north <= 2.31; north += .34) {
    part(0, 0, north, 2.1, .18, .32);
  }
  for (const east of [-1.05, 1.05]) for (let north = -2.25; north <= 2.31; north += .5) {
    part(east, .38, north, .17, .49, .58);
  }
  for (const north of [-2.55, 2.55]) part(0, .36, north, 2.1, .58, .18);
  for (const north of [-1.4, 0, 1.4]) part(0, .58, north, 1.96, .14, .3);
  for (const north of [-2.48, 2.48]) part(0, .36, north, 2.14, .08, .2, iron);

  const hullFamilies = [timber, iron] as const;
  for (const material of hullFamilies) {
    const selected = parts.filter(item => item.material === material);
    const mesh = new InstancedMesh(cube, material, selected.length);
    mesh.name = `single-pole-ferry/${material === timber ? 'planked-hull' : 'iron-bands'}`;
    selected.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    boat.add(mesh);
  }

  const polePivot = new Group();
  polePivot.name = 'single-pole-ferry/pole-pivot';
  polePivot.position.set(.82, .25, 0);
  const poleMesh = new Mesh(cube, timber);
  poleMesh.name = 'single-pole-ferry/single-pole';
  poleMesh.position.y = 1.5;
  poleMesh.scale.set(.07, 3, .07);
  polePivot.add(poleMesh);
  const poleGrip = new Mesh(cube, detail);
  poleGrip.name = 'single-pole-ferry/pole-grip';
  poleGrip.position.set(0, 2.72, 0);
  poleGrip.scale.set(.11, .28, .11);
  polePivot.add(poleGrip);
  polePivot.rotation.z = .2;
  boat.add(polePivot);

  const lantern = new Mesh(cube, glow);
  lantern.name = 'single-pole-ferry/lantern';
  lantern.position.set(-.76, 1.02, 1.76);
  lantern.scale.set(.24, .34, .24);
  boat.add(lantern);
  const lamp = new PointLight(0xffc27d, 8, 9, 2);
  lamp.name = 'single-pole-ferry/only-real-light';
  lamp.position.copy(lantern.position);
  boat.add(lamp);
  group.add(boat);

  const signs = new Group();
  signs.name = 'town-c2-r30-ferry/pier-notices';
  const noticeMeshes: { stop: Mesh; grounded: Mesh }[] = [];
  for (const pier of [secondMineAnchors.nearPier, secondMineAnchors.farPier]) {
    const sign = new Group();
    sign.name = `town-c2-r30-ferry/${pier === secondMineAnchors.nearPier ? 'near' : 'far'}-notice`;
    sign.position.set(pier.east - 4.2, 1.48, -pier.north);
    const frame = new Mesh(cube, timber);
    frame.scale.set(1.82, 1.3, .12);
    sign.add(frame);
    const stop = new Mesh(panel, stopNotice);
    stop.name = '停渡';
    stop.position.z = .07;
    const grounded = new Mesh(panel, groundedNotice);
    grounded.name = '搁浅';
    grounded.position.z = .071;
    sign.add(stop, grounded);
    signs.add(sign);
    noticeMeshes.push({ stop, grounded });
  }
  group.add(signs);
  const pieceCount = parts.length + 2 + 1 + noticeMeshes.length * 3;

  const near = secondMineAnchors.nearPier;
  const far = secondMineAnchors.farPier;
  const middleNorth = (near.north + far.north) / 2;
  let disposed = false;
  let open = false;
  let level: MineRiverState = 'low';
  let state: TownC2R30FerryState = 'grounded';
  let docked: 'near' | 'far' = 'near';
  let elapsed = 0;
  let animationTime = 0;
  let travelProgress = 0;

  function placeBoat(north: number, height: number) {
    boat.position.set(near.east, height, -north);
    boat.rotation.z = 0;
  }

  function realLightCount() {
    let count = 0;
    group.traverse(object => {
      if (object.type === 'PointLight' || object.type === 'DirectionalLight' ||
        object.type === 'SpotLight') count++;
    });
    return count;
  }

  function stats(): TownC2R30FerryStats {
    return Object.freeze({
      state,
      level,
      position: Object.freeze({
        east: boat.position.x,
        north: -boat.position.z,
        height: boat.position.y,
      }),
      available: open,
      notice: state === 'stopped' ? '停渡' : state === 'grounded' ? '搁浅' : null,
      visualOnly: true,
      colliderCount: 0,
      realLightCount: realLightCount(),
      pieceCount,
      travelProgress,
      disposed,
    });
  }

  function refreshMetadata() {
    group.userData.stats = stats();
    group.userData.state = state;
    group.userData.level = level;
    group.userData.available = open;
  }

  function resetTrip(nextLevel: MineRiverState) {
    level = nextLevel;
    open = nextLevel === 'middle';
    docked = 'near';
    elapsed = 0;
    animationTime = 0;
    travelProgress = 0;
    polePivot.rotation.z = .2;
    if (nextLevel === 'middle') {
      state = 'near-docked';
      placeBoat(near.north, FLOAT_HEIGHT);
    } else if (nextLevel === 'high') {
      state = 'stopped';
      placeBoat(near.north, FLOAT_HEIGHT);
    } else {
      state = 'grounded';
      placeBoat(middleNorth, GROUNDED_HEIGHT + secondMineBed(middleNorth));
    }
    for (const notices of noticeMeshes) {
      notices.stop.visible = nextLevel === 'high';
      notices.grounded.visible = nextLevel === 'low';
    }
    refreshMetadata();
  }

  function sync(nextLevel: MineRiverState): TownC2R30FerryStats {
    if (disposed) return stats();
    if (!validLevel(nextLevel)) {
      // Malformed external data fails closed without inventing a water authority.
      open = false;
      state = 'stopped';
      docked = 'near';
      elapsed = 0;
      travelProgress = 0;
      placeBoat(near.north, FLOAT_HEIGHT);
      for (const notices of noticeMeshes) {
        notices.stop.visible = true;
        notices.grounded.visible = false;
      }
      refreshMetadata();
      return stats();
    }
    // Repeated middle snapshots must not reset an in-progress local interaction.
    if (nextLevel === level && open === (nextLevel === 'middle')) return stats();
    resetTrip(nextLevel);
    return stats();
  }

  function board(input?: unknown): boolean {
    if (disposed || input !== undefined || !open || level !== 'middle') return false;
    if (state === 'near-docked') state = 'near-boarded';
    else if (state === 'far-docked') state = 'far-boarded';
    else return false;
    refreshMetadata();
    return true;
  }

  function pole(input?: unknown): boolean {
    if (disposed || input !== undefined || !open || level !== 'middle') return false;
    if (state === 'near-boarded') state = 'near-ready';
    else if (state === 'far-boarded') state = 'far-ready';
    else return false;
    animationTime = 0;
    refreshMetadata();
    return true;
  }

  function travel(input?: unknown): boolean {
    if (disposed || input !== undefined || !open || level !== 'middle') return false;
    if (state === 'near-ready') state = 'traveling-to-far';
    else if (state === 'far-ready') state = 'traveling-to-near';
    else return false;
    elapsed = 0;
    travelProgress = 0;
    refreshMetadata();
    return true;
  }

  function disembark(input?: unknown): boolean {
    if (disposed || input !== undefined || !open || level !== 'middle') return false;
    if (state === 'near-boarded') {
      state = 'near-docked';
      docked = 'near';
    } else if (state === 'far-boarded') {
      state = 'far-docked';
      docked = 'far';
    } else return false;
    refreshMetadata();
    return true;
  }

  function update(seconds: number): boolean {
    if (disposed || !Number.isFinite(seconds) || seconds <= 0 || !open || level !== 'middle') {
      return false;
    }
    if (state !== 'near-ready' && state !== 'far-ready' &&
      state !== 'traveling-to-far' && state !== 'traveling-to-near') return false;
    animationTime += Math.min(seconds, 1);
    polePivot.rotation.z = .2 + Math.sin(animationTime * 4) * .13;
    if (state !== 'traveling-to-far' && state !== 'traveling-to-near') return true;
    elapsed += seconds;
    travelProgress = Math.min(1, elapsed / TRAVEL_SECONDS);
    const toFar = state === 'traveling-to-far';
    const start = toFar ? near.north : far.north;
    const end = toFar ? far.north : near.north;
    placeBoat(start + (end - start) * travelProgress, FLOAT_HEIGHT);
    boat.rotation.z = Math.sin(travelProgress * Math.PI * 4) * .012;
    if (travelProgress < 1) return true;
    docked = toFar ? 'far' : 'near';
    state = toFar ? 'far-boarded' : 'near-boarded';
    placeBoat(end, FLOAT_HEIGHT);
    polePivot.rotation.z = .2;
    refreshMetadata();
    return true;
  }

  resetTrip('low');
  options.parent?.add(group);
  return Object.freeze({
    group, boat, sync, board, pole, travel, disembark, update, stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      open = false;
      group.removeFromParent();
      // InstancedMesh.dispose releases its instance buffers; shared resources
      // are released exactly once below. PointLight.dispose releases shadow state.
      group.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
      lamp.dispose();
      cube.dispose();
      panel.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
      refreshMetadata();
    },
  });
}

/** Build-style alias for hosts that construct, rather than mount, scene leaves. */
export const createTownC2R30Ferry = mountTownC2R30Ferry;
