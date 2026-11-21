import {
  BoxGeometry, CanvasTexture, DataTexture, CylinderGeometry, DoubleSide, Group, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, Object3D, PlaneGeometry, PointLight,
  SRGBColorSpace, Vector3,
} from 'three';
import { pumpHouseLogbook, type PumpHouseSnapshot } from '../../../src/presence/underground-pump-house.js';

type Point = Readonly<{ east: number; north: number; height: number }>;
export type PumpHouseSceneSite = Point & Readonly<{ domainId: string; yaw: number }>;
type Role = 'journal' | 'pump' | 'open-cover' | 'strike-blockage' | 'reset-lever' | 'cross' | 'ore';
type Host = Readonly<{
  parent: Group;
  site?: PumpHouseSceneSite;
  /** B-01-approved world placement and swept player support; an arbitrary point is not accepted. */
  supportsSite(site: PumpHouseSceneSite): boolean;
  supportsActionFoot(role: Role, point: Point): boolean;
  /** Read the latest U-17 revisioned server snapshot; local animation never changes water authority. */
  readSnapshot(): PumpHouseSnapshot | undefined;
  /** Derived from the U-17 host's accepted waterline threshold; never a client guess. */
  readPassageOpen(): boolean;
  readLightBudget(): number;
  /** Player input is forwarded to a host handler which must recheck accepted foot and revision. */
  readViewer(): Readonly<{ id: string; domainId: string; foot: Point }> | undefined;
  canSee(role: Role, point: Point): boolean;
  dispatch(intent: Readonly<{ playerId: string; revision: number; role: Role; hold?: boolean }>): void;
  onAcceptedSound?(event: 'pump' | 'jam' | 'clear' | 'reset'): void;
}>;
type Box = Readonly<{ at: readonly [number, number, number]; scale: readonly [number, number, number] }>;
type Solid = Readonly<{
  name: string; min: readonly [number, number, number]; max: readonly [number, number, number];
}>;
// Existing Clay-Factory canon swatches. Texture variants may only sample these colors.
export const pumpHouseCanonSwatches = {
  stone: 0x8a8378, earth: 0xa98a56, timber: 0x5d4630, green: 0x44503c,
  midnight: 0x2c3648, snow: 0xe8ecf0, ember: 0xe08a3c, crystal: 0x7fd4c8,
  rust: 0x8a4a34,
} as const;
const c = pumpHouseCanonSwatches;
const palette = {
  slate: c.stone, masonry: c.earth, timber: c.timber, darkTimber: c.timber,
  iron: c.midnight, steel: c.stone, rust: c.rust, copper: c.earth,
  paper: c.earth, glass: c.ember, moss: c.green,
} as const;
const textureBand: Record<keyof typeof palette, readonly [number, number, number]> = {
  slate: [c.stone, c.midnight, c.earth], masonry: [c.earth, c.stone, c.rust],
  timber: [c.timber, c.earth, c.green], darkTimber: [c.timber, c.green, c.midnight],
  iron: [c.midnight, c.stone, c.rust], steel: [c.stone, c.midnight, c.snow],
  rust: [c.rust, c.timber, c.earth], copper: [c.earth, c.rust, c.stone],
  paper: [c.earth, c.snow, c.timber], glass: [c.ember, c.earth, c.snow],
  moss: [c.green, c.timber, c.stone],
};
function makePixelMaterial(family: keyof typeof palette) {
  const pixels = new Uint8Array(16 * 16 * 4);
  const [base, dark, accent] = textureBand[family];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const grain = (x * 17 + y * 23 + Math.floor(x / 3) * 7 + Math.floor(y / 5) * 11) % 37;
    const woodStreak = (family === 'timber' || family === 'darkTimber') && y % 4 === 0;
    const rustPits = family === 'rust' && (x * 3 + y * 5) % 11 <= 2;
    const cracked = (family === 'slate' || family === 'masonry') && (x + y * 3) % 19 === 0;
    const color = woodStreak || rustPits || cracked ? dark : grain < 3 ? accent : base;
    pixels.set([color >> 16, (color >> 8) & 255, color & 255, 255], (y * 16 + x) * 4);
  }
  const map = new DataTexture(pixels, 16, 16);
  map.minFilter = map.magFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  const metal = ['iron', 'steel', 'rust', 'copper'].includes(family);
  const material = new MeshStandardMaterial({ map, roughness: metal ? .82 : .98,
    metalness: metal ? .17 : 0, flatShading: true });
  return { map, material };
}
const roleNames: Record<Role, string> = {
  journal: pumpHouseLogbook.title,
  pump: pumpHouseLogbook.labels.pump,
  'open-cover': pumpHouseLogbook.labels.cover,
  'strike-blockage': pumpHouseLogbook.labels.strike,
  'reset-lever': pumpHouseLogbook.labels.reset,
  cross: pumpHouseLogbook.labels.passage, ore: pumpHouseLogbook.labels.ore,
};
const roleFeet: Readonly<Record<Role, readonly [number, number, number]>> = {
  journal: [3.25, 0, -2.10], pump: [-2.25, 0, -3.55],
  'open-cover': [-.4, 0, -6.25], 'strike-blockage': [-.4, 0, -6.25],
  'reset-lever': [-.45, 0, -4.75], cross: [0, 0, -21.8],
  ore: [1.75, 0, -17.2],
};
export const pumpHouseStoryText = Object.freeze({
  header: '沉水泵房 · 第六班',
  gate: '晶洞水道 / 漫水止步',
  warning: '泵停即涨。泵涩先拆盖，击净再复位。',
  logbook: pumpHouseLogbook.pages,
  cart: '旧矿一线 · 矿车不入水',
  gauge: ['漫', '浅', '通'] as const,
});

function valid(point: Point) {
  return [point.east, point.north, point.height].every(Number.isFinite);
}
function validState(value?: PumpHouseSnapshot): value is PumpHouseSnapshot {
  return !!value && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    Number.isFinite(value.water) && value.water >= 0 && value.water <= 1 &&
    Number.isFinite(value.pumpedMs) && value.pumpedMs >= 0 &&
    ['running', 'jammed', 'cover-open', 'blockage-cleared'].includes(value.stage);
}

/**
 * U-17 four-round scene. One certified pose transforms the shell, corridor, water, story boards,
 * colliders and interactive feet. No client-side water, player teleport, stamina or loot creation.
 */
export function mountUndergroundPumpHouseScene(host: Host) {
  const site = host.site;
  if (!site) return { kind: 'unregistered' } as const;
  if (!site.domainId.trim() || site.domainId !== site.domainId.trim() || !valid(site) ||
      !Number.isFinite(site.yaw)) return { kind: 'invalid-site' } as const;
  if (host.supportsSite(site) !== true) return { kind: 'unsupported-site' } as const;
  const installedSite = site;

  const root = new Group();
  root.name = 'u17-old-mine-pump-house';
  root.position.set(site.east, site.height, -site.north);
  root.rotation.y = site.yaw;
  const up = new Vector3(0, 1, 0);
  const localToWorld = (point: readonly [number, number, number]): Point => {
    const p = new Vector3(...point).applyAxisAngle(up, site.yaw).add(root.position);
    return { east: p.x, north: -p.z, height: p.y };
  };
  const feet = Object.fromEntries((Object.keys(roleFeet) as Role[]).map(role =>
    [role, localToWorld(roleFeet[role])])) as Record<Role, Point>;
  for (const role of Object.keys(roleFeet) as Role[]) {
    if (host.supportsActionFoot(role, feet[role]) !== true) return { kind: 'unsupported-feet' } as const;
  }

  const groups = new Map<keyof typeof palette, Box[]>();
  const solids: Solid[] = [];
  function place(material: keyof typeof palette, x: number, y: number, z: number,
    w: number, h: number, d: number, solid = false, name = '') {
    const parts = groups.get(material) ?? [];
    parts.push({ at: [x, y, z], scale: [w, h, d] });
    groups.set(material, parts);
    if (solid) solids.push({ name: name || material + '/' + solids.length,
      min: [x - w / 2, y - h / 2, z - d / 2],
      max: [x + w / 2, y + h / 2, z + d / 2] });
  }
  // Round 1: entire ground floor and enclosed cross-layer drainage corridor.
  // Clear central entry/corridor are continuous; player can approach the pump and journal.
  place('slate', 0, -.20, -5.1, 12.6, .4, 10.8);
  place('slate', 0, -.20, -17.55, 6.9, .4, 14.1);
  // Masonry walls are full-height; front and back preserve walk-through door openings.
  for (let row = 0; row < 7; row++) {
    const y = .25 + row * .52;
    for (const x of [-6.02, 6.02]) {
      for (let z = -10; z <= 0; z += .65)
        place(row % 3 ? 'masonry' : 'slate', x, y, z, .45, .49, .64, true, 'pump-outer-wall');
    }
    for (const z of [.07, -10.25]) for (let x = -5.65; x <= 5.65; x += .55) {
      if (Math.abs(x) < 1.85 && y < 2.85) continue;
      place(row % 4 ? 'masonry' : 'slate', x, y, z, .54, .5, .4, true, 'pump-doorwall');
    }
  }
  // Gabled full roof with solid rafters and matching eaves; no unfinished ceiling.
  for (let step = 0; step < 13; step++) {
    const x = -6 + step;
    const y = 3.88 + (6 - Math.abs(x)) * .28;
    place('darkTimber', x, y, -5.1, .21, .20, 11.6);
    place('slate', x, y + .18, -5.1, 1.08, .24, 11.45);
  }
  for (const z of [-9.7, -5.1, -.55]) {
    for (const x of [-5.4, 5.4]) {
      place('darkTimber', x, 2.1, z, .33, 4.15, .31);
      place('copper', x, 3.87, z, .43, .16, .36);
    }
    place('darkTimber', 0, 3.83, z, 12.25, .25, .27);
  }
  // Covered gallery, guard rails, drainage and level-change markings.
  for (const x of [-3.22, 3.22]) {
    for (let z = -10.75; z > -24.45; z -= .58) {
      place('slate', x, 1.34, z, .40, 2.65, .53, true, 'gallery-rock-wall');
      if (Math.round(-z * 100) % 3 === 0) place('moss', x * .88, .07, z, .12, .11, .36);
    }
    place('darkTimber', x * .75, 1.92, -17.45, .25, .22, 13.9);
    place('copper', x * .72, 1.69, -17.45, .09, .10, 13.2);
  }
  place('slate', 0, 2.75, -17.45, 6.85, .29, 13.9);
  for (let z = -10.6; z >= -24.5; z -= 1.15) {
    place('darkTimber', 0, .065, z, 6.25, .12, .16);
    place('steel', 2.46, .11, z, .18, .08, .16);
    place('steel', -2.46, .11, z, .18, .08, .16);
  }
  // Round 2: legible pump internals, copper delivery pipes and working drainage.
  place('slate', -2.15, .33, -5.27, 2.6, .67, 2.12, true, 'pump-footing');
  place('iron', -2.15, 1.05, -5.27, 1.95, .98, 1.68, true, 'pump-chamber');
  place('rust', -2.15, 1.57, -5.27, 2.05, .17, 1.78);
  for (const x of [-3.2, -1.12]) for (const z of [-6.08, -4.48]) {
    place('steel', x, .86, z, .21, .20, .24);
    place('rust', x, 1.3, z, .18, .22, .20);
  }
  for (let i = 0; i < 13; i++) {
    place(i % 4 === 0 ? 'rust' : 'copper', -3.48, .98, -8.65 + i * .55, .19, .19, .53);
    place(i % 4 === 0 ? 'rust' : 'copper', -4.02, 1.75, -8.65 + i * .55, .16, .17, .53);
  }
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    place('steel', -2.15 + Math.cos(a) * .58, 1.19 + Math.sin(a) * .58, -4.36,
      .17, .17, .17);
  }
  const pumpLever = new Group();
  pumpLever.name = 'pump-mechanical-hand-crank';
  pumpLever.position.set(-2.15, 1.55, -4.18);
  root.add(pumpLever);
  const iron = new MeshStandardMaterial({ color: c.midnight, metalness: .24, roughness: .79 });
  const leverGeometry = new BoxGeometry();
  const lever = new Mesh(leverGeometry, iron);
  lever.name = 'pump-crank-iron-arm';
  lever.position.set(.42, .06, 0);
  lever.scale.set(.84, .12, .16);
  pumpLever.add(lever);
  const grip = new Mesh(leverGeometry, new MeshStandardMaterial({ color: palette.timber, roughness: .96 }));
  grip.name = 'pump-crank-wooden-grip';
  grip.position.set(.86, .05, -.1);
  grip.scale.set(.16, .24, .25);
  pumpLever.add(grip);
  const cap = new Mesh(leverGeometry, new MeshStandardMaterial({ color: palette.rust, roughness: .94 }));
  cap.name = 'pump-removable-maintenance-lid';
  cap.position.set(-1.0, .99, -6.18);
  cap.scale.set(.71, .15, .55);
  root.add(cap);
  const blockage = new Mesh(leverGeometry, new MeshStandardMaterial({ color: c.stone, roughness: .96 }));
  blockage.name = 'pump-blockage-stones';
  blockage.position.set(-1.0, .80, -6.17);
  blockage.scale.set(.35, .26, .35);
  root.add(blockage);
  const resetLever = new Mesh(leverGeometry, iron);
  resetLever.name = 'pump-reset-iron-lever';
  resetLever.position.set(-1.25, 1.25, -5.3);
  resetLever.scale.set(.16, .76, .14);
  resetLever.rotation.z = -.25;
  root.add(resetLever);
  // A pressure dial and three-band flood ruler, rendered in the environment, never a UI bar.
  const dial = new Group();
  dial.name = 'pump-physical-pressure-gauge';
  dial.position.set(-4.95, 1.78, -8.52);
  root.add(dial);
  const circleGeometry = new CylinderGeometry(.55, .55, .105, 12);
  const dialMetal = new Mesh(circleGeometry, new MeshStandardMaterial({ color: palette.copper, metalness: .22 }));
  dialMetal.rotation.x = Math.PI / 2;
  dial.add(dialMetal);
  const needle = new Mesh(leverGeometry, new MeshStandardMaterial({ color: c.rust, emissive: c.timber, emissiveIntensity: .2 }));
  needle.name = 'pump-pressure-needle';
  needle.position.z = .095;
  needle.scale.set(.047, .45, .05);
  dial.add(needle);
  for (let i = 0; i <= 8; i++) {
    const a = (-.8 + i / 8 * 1.6) * Math.PI;
    place('rust', -4.95 + Math.sin(a) * .50, 1.78 + Math.cos(a) * .50, -8.4,
      .09, .07, .04);
  }
  const ruler = new Group();
  ruler.name = 'pump-physical-water-ruler';
  ruler.position.set(2.86, .3, -11.55);
  root.add(ruler);
  for (let i = 0; i < 15; i++) {
    const segment = new Mesh(leverGeometry, new MeshStandardMaterial({
      color: i > 9 ? c.rust : i > 4 ? c.earth : c.crystal,
      roughness: .82, emissive: c.midnight, emissiveIntensity: .08,
    }));
    segment.position.set(.16, i * .10, 0);
    segment.scale.set(i % 5 === 0 ? .48 : .31, .045, .08);
    ruler.add(segment);
  }
  const waterMarker = new Mesh(leverGeometry, new MeshBasicMaterial({ color: c.snow }));
  waterMarker.name = 'pump-water-ruler-moving-pointer';
  waterMarker.scale.set(.25, .08, .14);
  ruler.add(waterMarker);
  const waterMaterial = new MeshStandardMaterial({ color: c.crystal, transparent: true,
    opacity: .55, metalness: .10, roughness: .27, side: DoubleSide, depthWrite: false });
  const waterGeometry = new PlaneGeometry(6.05, 13.45, 1, 1);
  const water = new Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.48, -17.38);
  water.name = 'pump-gallery-live-water-surface';
  root.add(water);

  // Round 3: dense story props in believable clusters; no uniform filler scattering.
  // Pump workbench, spare valves, tool wall, bucket, and maintenance scraps.
  place('darkTimber', 3.25, .78, -3.7, 1.9, .14, 1.45, true, 'journal-workbench');
  for (const x of [2.48, 4.0]) for (const z of [-4.25, -3.15])
    place('timber', x, .39, z, .15, .79, .14);
  place('paper', 3.12, .87, -3.68, .78, .07, .61);
  place('rust', 3.67, .88, -3.84, .34, .05, .42);
  for (let i = 0; i < 8; i++)
    place('paper', 3.08 + .042 * i, .94 + .004 * i, -3.62, .42, .015, .28);
  for (const x of [2.65, 3.16, 3.67]) {
    place('rust', x, 1.35, -9.92, .18, .12, .31);
    place('steel', x, 1.59, -9.91, .09, .4, .11);
    place('copper', x, 1.69, -9.9, .22, .07, .15);
  }
  for (let i = 0; i < 7; i++) {
    const x = 4.7 + (i % 2) * .37;
    const z = -2.6 - Math.floor(i / 2) * .49;
    place(i % 3 ? 'timber' : 'darkTimber', x, .22 + (i % 3) * .19, z, .48, .42, .44,
      i < 3, 'supply-crate');
    place('steel', x + .09, .42 + (i % 3) * .19, z, .06, .04, .4);
  }
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2;
    place(i % 4 ? 'rust' : 'steel', -4.7 + Math.cos(a) * .32, .15, -2.7 + Math.sin(a) * .32,
      .15, .28, .13);
  }
  for (let i = 0; i < 13; i++) {
    const z = -11.5 - i * .9;
    place(i % 4 ? 'masonry' : 'moss', 3.04, .06 + i % 2 * .07, z, .23, .18, .45);
    place('darkTimber', -2.75, .62, z, .17, 1.1, .09);
  }
  for (let i = 0; i < 6; i++) {
    const z = -14.1 - i * 1.37;
    place(i % 3 ? 'rust' : 'copper', 3.0, 1.15, z, .19, .47, .26);
    place('iron', 2.84, 1.35, z, .22, .13, .17);
  }
  // Three physical source lanterns: an armature, amber glass and caged warm light.
  const lamps: PointLight[] = [];
  const lampGlass = new MeshStandardMaterial({ color: c.earth, emissive: c.ember,
    emissiveIntensity: .8 });
  const lampGeometry = new BoxGeometry();
  for (const [x, y, z] of [[-3.85, 2.56, -3], [3.91, 2.65, -7.1], [0, 2.28, -17.1]]) {
    place('iron', x, y + .26, z, .52, .12, .55);
    place('iron', x, y - .26, z, .52, .12, .55);
    for (const dx of [-.23, .23]) for (const dz of [-.22, .22])
      place('steel', x + dx, y, z + dz, .055, .56, .07);
    const glass = new Mesh(lampGeometry, lampGlass);
    glass.position.set(x, y, z);
    glass.scale.set(.31, .38, .32);
    glass.name = 'pump-host-budgeted-lantern';
    root.add(glass);
    const light = new PointLight(c.ember, 6, 9, 2);
    light.position.set(x, y - .1, z);
    light.name = 'pump-host-budgeted-source';
    light.visible = false;
    lamps.push(light);
    root.add(light);
  }

  // Batch voxel-like stone/wood/metal/cloth; owned resources disposed exactly once.
  const sharedBox = new BoxGeometry();
  const mats: MeshStandardMaterial[] = [];
  const texMaps: DataTexture[] = [];
  const instances: InstancedMesh[] = [];
  const placement = new Object3D();
  for (const [family, pieces] of groups) {
    const { map, material: mat } = makePixelMaterial(family);
    mats.push(mat); texMaps.push(map);
    const batch = new InstancedMesh(sharedBox, mat, pieces.length);
    batch.name = 'pump-house/' + family;
    for (let i = 0; i < pieces.length; i++) {
      placement.position.fromArray(pieces[i].at);
      placement.scale.fromArray(pieces[i].scale);
      placement.rotation.set(0, 0, 0);
      placement.updateMatrix();
      batch.setMatrixAt(i, placement.matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    root.add(batch);
    instances.push(batch);
  }

  const signPlanes: Mesh[] = [];
  const signMats: MeshBasicMaterial[] = [];
  const signGeo: PlaneGeometry[] = [];
  const surfaces: readonly [string, string, number, number, number, number, number][] = [
    ['header', pumpHouseStoryText.header, 0, 3.07, -.16, 3.8, .48],
    ['journal', '值守簿 · 请翻阅', 3.18, 1.16, -3.5, 1.65, .32],
    ['warning', pumpHouseStoryText.warning, 3.07, 2.38, -9.93, 3.6, .37],
    ['gate', pumpHouseStoryText.gate, 0, 2.18, -10.16, 3.2, .44],
    ['gauge', '漫水 / 浅水 / 通行', 1.64, 1.75, -11.42, 2.1, .34],
    ['cart', pumpHouseStoryText.cart, -1.16, 1.18, -10.04, 2.35, .28],
  ];
  for (const [name, text, x, y, z, width, height] of surfaces) {
    // Source text is always complete, whether running on the server test host or a browser.
    if (typeof document === 'undefined') continue;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#302a27';
    ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = '#caa16b';
    ctx.lineWidth = 9; ctx.strokeRect(6, 5, 1012, 150);
    ctx.fillStyle = '#ecd7a8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 61px "Microsoft YaHei","Noto Sans CJK SC",sans-serif';
    ctx.fillText(text, 512, 79, 950);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map: tex, side: DoubleSide, transparent: false });
    const geometry = new PlaneGeometry(width, height);
    const mesh = new Mesh(geometry, mat);
    mesh.name = 'pump-inscription/' + name;
    mesh.position.set(x, y, z);
    root.add(mesh); signPlanes.push(mesh); signMats.push(mat); signGeo.push(geometry);
  }

  host.parent.add(root);
  let disposed = false;
  let lastSnapshot: PumpHouseSnapshot | undefined;
  const state = () => host.readSnapshot();
  function sync(snapshot = state()) {
    if (disposed || !validState(snapshot)) {
      // No authenticated snapshot means no authored permission to show an open passage.
      water.position.y = 1.48;
      waterMarker.position.y = 1.49;
      cap.visible = true;
      blockage.visible = false;
      for (const light of lamps) light.visible = false;
      return false;
    }
    const waterLevel = snapshot.water;
    water.position.y = -.18 + waterLevel * 1.66;
    waterMarker.position.y = waterLevel * 1.45;
    needle.rotation.z = Math.PI * (waterLevel - .5) * .85;
    pumpLever.rotation.z = snapshot.pumpedMs / 1000 * Math.PI * 1.3;
    cap.visible = snapshot.stage !== 'cover-open' && snapshot.stage !== 'blockage-cleared';
    blockage.visible = snapshot.stage === 'cover-open';
    resetLever.rotation.z = snapshot.stage === 'running' ? -.25 : .41;
    const budget = Math.min(lamps.length, Math.max(0, Math.floor(host.readLightBudget() || 0)));
    lamps.forEach((light, i) => { light.visible = i < budget; });
    const last = lastSnapshot;
    if (last && snapshot.revision > last.revision && snapshot.pumpedMs !== last.pumpedMs)
      host.onAcceptedSound?.('pump');
    if (last && snapshot.revision > last.revision && last.stage !== snapshot.stage) {
      if (snapshot.stage === 'jammed') host.onAcceptedSound?.('jam');
      if (snapshot.stage === 'blockage-cleared') host.onAcceptedSound?.('clear');
      if (last.stage === 'blockage-cleared' && snapshot.stage === 'running') host.onAcceptedSound?.('reset');
    }
    lastSnapshot = structuredClone(snapshot);
    return true;
  }
  sync();

  function canStandLocal(x: number, z: number, radius = .27, height = 1.8) {
    if (![x, z, radius, height].every(Number.isFinite) || radius <= 0 || height <= 0) return false;
    const room = Math.abs(x) + radius <= 5.75 && z <= 0 && z >= -10.05;
    const corridor = Math.abs(x) + radius <= 2.85 && z <= -10.05 && z >= -24.35;
    if (!room && !corridor) return false;
    return !solids.some(({ min, max }) => min[1] < height && max[1] > 0 &&
      Math.hypot(Math.max(0, min[0] - x, x - max[0]),
        Math.max(0, min[2] - z, z - max[2])) < radius);
  }
  function prompt() {
    if (disposed) return;
    const viewer = host.readViewer();
    const snapshot = state();
    if (!viewer || viewer.domainId !== installedSite.domainId || !valid(viewer.foot) || !validState(snapshot)) return;
    const roles: Role[] = snapshot.stage === 'jammed' ? ['open-cover', 'journal', 'cross', 'ore'] :
      snapshot.stage === 'cover-open' ? ['strike-blockage', 'journal', 'cross', 'ore'] :
        snapshot.stage === 'blockage-cleared' ? ['reset-lever', 'journal', 'cross', 'ore'] :
          ['pump', 'journal', 'cross', 'ore'];
    const available = roles.filter(role =>
      (role !== 'cross' && role !== 'ore' || host.readPassageOpen() === true) &&
      Math.hypot(viewer.foot.east - feet[role].east,
        viewer.foot.north - feet[role].north, viewer.foot.height - feet[role].height) <= 1.45 &&
      host.canSee(role, feet[role]) === true);
    const role = available[0];
    return role ? { id: 'u17/' + role, label: roleNames[role], role,
      revision: snapshot.revision } : undefined;
  }
  function press(role: Role, hold = false) {
    const available = prompt();
    const viewer = host.readViewer();
    if (!viewer || !available || available.role !== role) return false;
    host.dispatch({ playerId: viewer.id, revision: available.revision, role, hold });
    return true;
  }
  return {
    kind: 'ready', group: root, feet, labels: roleNames, story: pumpHouseStoryText,
    colliders: solids, materialFamilies: [...groups.keys()],
    voxels: [...groups.values()].reduce((s, value) => s + value.length, 0),
    sync, prompt, press, canStandLocal, toWorld: localToWorld,
    waterSurface: water, pressureNeedle: needle, physicalCrank: pumpLever,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const batch of instances) batch.dispose();
      for (const material of mats) material.dispose();
      for (const map of texMaps) map.dispose();
      sharedBox.dispose();
      leverGeometry.dispose();
      lampGeometry.dispose();
      circleGeometry.dispose();
      waterGeometry.dispose();
      waterMaterial.dispose();
      for (const element of [lever, grip, cap, blockage, resetLever, needle, dialMetal, waterMarker]) {
        if (element.material instanceof MeshStandardMaterial || element.material instanceof MeshBasicMaterial)
          element.material.dispose();
      }
      for (const mark of ruler.children) if (mark instanceof Mesh) mark.material.dispose();
      for (let i = 0; i < signMats.length; i++) {
        signMats[i].map?.dispose(); signMats[i].dispose(); signGeo[i].dispose();
      }
      lampGlass.dispose();
      root.clear();
    },
  } as const;
}
