import {
  BoxGeometry, Color, DataTexture, FrontSide, Group, InstancedMesh, MeshLambertMaterial,
  NearestFilter, Object3D, PointLight, RGBAFormat, SRGBColorSpace, StaticDrawUsage,
} from 'three';
import {
  c2SecondMineBoxAllowed, type C2SecondMineBox,
} from './town-c2-second-mine-contract.js';

export const c2SecondMineLightPrefix = 'town-c2/second-mine/light-sources/';
export const c2SecondMineLightBudget = Object.freeze({
  fixtures: 10,
  pointLights: 3,
  maxPointLights: 3,
  intensity: 5,
  distance: 8,
});
export const c2SecondMineLampColors = Object.freeze({
  dock: Object.freeze({ hex: 0xffc078, kelvin: 2700 }),
  bypass: Object.freeze({ hex: 0xffb277, kelvin: 2500 }),
  workface: Object.freeze({ hex: 0xe5a05a, kelvin: 2200 }),
});

export type C2SecondMineLightRole = 'dock' | 'bypass' | 'workface';
export type C2SecondMineLightFamily = 'stone' | 'timber' | 'iron' | 'rust' | 'amber';
export type C2SecondMineLightPiece = C2SecondMineBox & Readonly<{
  id: string;
  fixtureId: string;
  role: C2SecondMineLightRole;
  family: C2SecondMineLightFamily;
}>;
export type C2SecondMineLampEmitter = Readonly<{
  id: string;
  role: C2SecondMineLightRole;
  east: number;
  north: number;
  height: number;
  color: number;
  kelvin: number;
  realLight: boolean;
}>;

const families: readonly C2SecondMineLightFamily[] = ['stone', 'timber', 'iron', 'rust', 'amber'];
const palette: Readonly<Record<C2SecondMineLightFamily, readonly [number, number, number]>> = {
  stone: [0x77736c, 0xa49c8b, 0x4b4d4c],
  timber: [0x71553c, 0xa17b52, 0x45362b],
  iron: [0x777b82, 0xa0a39d, 0x444a50],
  rust: [0x815b44, 0xb07950, 0x4d3c33],
  amber: [0xe5a05a, 0xffd39a, 0x8e5c37],
};
const roleOrder: readonly C2SecondMineLightRole[] = ['dock', 'bypass', 'workface'];
const fixturePlan: readonly Readonly<{
  id: string;
  role: C2SecondMineLightRole;
  east: number;
  north: number;
  style: 'post' | 'wall';
  wall: -1 | 1;
  realLight: boolean;
}>[] = Object.freeze([
  { id: 'near-dock-west', role: 'dock', east: -6.4, north: 124.8, style: 'post', wall: -1, realLight: true },
  { id: 'near-dock-east', role: 'dock', east: 6.4, north: 124.8, style: 'post', wall: 1, realLight: false },
  { id: 'far-dock-west', role: 'dock', east: -6.4, north: 149.2, style: 'post', wall: -1, realLight: false },
  { id: 'far-dock-east', role: 'dock', east: 6.4, north: 149.2, style: 'post', wall: 1, realLight: false },
  { id: 'bypass-north', role: 'bypass', east: 54.25, north: 116, style: 'wall', wall: 1, realLight: false },
  { id: 'bypass-middle', role: 'bypass', east: 54.25, north: 136, style: 'wall', wall: 1, realLight: true },
  { id: 'bypass-south', role: 'bypass', east: 54.25, north: 156, style: 'wall', wall: 1, realLight: false },
  { id: 'west-workface', role: 'workface', east: -26.95, north: 54.8, style: 'wall', wall: -1, realLight: false },
  { id: 'east-workface', role: 'workface', east: 30.95, north: 75.5, style: 'wall', wall: 1, realLight: true },
  { id: 'east-workface-south', role: 'workface', east: 30.95, north: 88, style: 'wall', wall: 1, realLight: false },
]);

// Ten visible fixtures but only three physical sources: four dock, three bypass
// and three workface lamps remain readable without multiplying real lights.
const selectedFixtures = Object.freeze([
  fixturePlan[0]!, fixturePlan[5]!, fixturePlan[8]!,
]);

function nearestTexture(family: C2SecondMineLightFamily, seed: number) {
  const [base, light, dark] = palette[family];
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    const grain = (Math.imul(x + seed, 15731) ^ Math.imul(y + 17, 4817)) >>> 0;
    const seam = family === 'timber' ? y === 5 || y === 11 :
      family === 'amber' ? (x + y) % 5 === 0 :
        (Math.floor(x / 3) * 7 + Math.floor(y / 4) * 11 + seed) % 13 < 3;
    const color = border || seam && grain % 3 === 0 ? dark : seam || grain % 5 === 0 ? light : base;
    pixels.set([color >>> 16, (color >>> 8) & 255, color & 255, 255], (y * 16 + x) * 4);
  }
  const texture = new DataTexture(pixels, 16, 16, RGBAFormat);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type Fixture = (typeof fixturePlan)[number];
function makePieces() {
  const pieces: C2SecondMineLightPiece[] = [];
  let serial = 0;
  function add(fixture: Fixture, family: C2SecondMineLightFamily, dx: number, n: number,
    y: number, w: number, d: number, h: number, part: string) {
    const piece: C2SecondMineLightPiece = Object.freeze({
      id: `${c2SecondMineLightPrefix}${fixture.id}/${part}-${serial++}`,
      fixtureId: fixture.id, role: fixture.role, family,
      x: fixture.east + dx, n: fixture.north + n, y, w, d, h,
    });
    if (!c2SecondMineBoxAllowed(piece)) throw new RangeError(`C2 light-source piece rejected: ${piece.id}`);
    pieces.push(piece);
  }
  function cage(fixture: Fixture, centerY: number) {
    add(fixture, 'iron', 0, 0, centerY - .25, .54, .54, .10, 'lamp-base');
    for (const dx of [-1, 1]) for (const dn of [-1, 1]) {
      add(fixture, 'iron', dx * .22, dn * .22, centerY, .055, .055, .48, 'cage-post');
    }
    add(fixture, 'amber', 0, 0, centerY, .31, .31, .37, 'light-core');
    add(fixture, 'iron', 0, 0, centerY + .28, .64, .64, .11, 'cap');
    add(fixture, 'rust', 0, 0, centerY + .39, .38, .38, .10, 'cap-step');
    add(fixture, 'iron', 0, 0, centerY + .50, .30, .08, .08, 'handle');
  }
  for (const fixture of fixturePlan) {
    if (fixture.style === 'post') {
      add(fixture, 'stone', 0, 0, .08, .68, .68, .16, 'foot');
      add(fixture, 'iron', 0, 0, .22, .45, .45, .13, 'plinth');
      add(fixture, 'timber', 0, 0, 1.02, .17, .17, 1.55, 'post');
      for (const dx of [-1, 1]) add(fixture, 'iron', dx * .12, 0, .80, .055, .09, 1.10, 'post-band');
      cage(fixture, 2.08);
    } else {
      // Wall plates and brackets sit above the existing bypass rail. The amber
      // core is a warm work lamp, never a healing circle or a second campfire.
      const wallDx = fixture.wall * (fixture.role === 'bypass' ? .70 : .60);
      add(fixture, 'rust', wallDx, 0, 1.98, .18, .52, .74, 'backplate');
      add(fixture, 'iron', wallDx / 2, 0, 1.84, Math.abs(wallDx) + .20, .10, .10, 'bracket');
      add(fixture, 'iron', wallDx / 2, 0, 2.12, Math.abs(wallDx) + .20, .10, .10, 'upper-bracket');
      cage(fixture, 2.16);
    }
  }
  return Object.freeze(pieces);
}

/** Local ENY fixtures only. Mounting never reads or changes the host's two campfires. */
export function buildC2SecondMineLightSources(owner?: Group) {
  const pieces = makePieces();
  const group = new Group();
  group.name = 'town-c2-second-mine-light-sources';
  const geometry = new BoxGeometry(1, 1, 1);
  const pose = new Object3D();
  const meshes: InstancedMesh[] = [];
  const materials: MeshLambertMaterial[] = [];
  const textures: DataTexture[] = [];

  for (const [index, family] of families.entries()) {
    const members = pieces.filter(piece => piece.family === family);
    const texture = nearestTexture(family, index * 23 + 5);
    const material = new MeshLambertMaterial({
      map: texture,
      side: FrontSide,
      ...(family === 'amber' ? {
        color: 0xffffff,
        emissive: new Color(c2SecondMineLampColors.bypass.hex),
        emissiveIntensity: .12,
      } : {}),
    });
    material.userData.materialFamily = family;
    const mesh = new InstancedMesh(geometry, material, members.length);
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.name = `${c2SecondMineLightPrefix}${family}`;
    for (const [pieceIndex, piece] of members.entries()) {
      pose.position.set(piece.x, piece.y, -piece.n);
      pose.scale.set(piece.w, piece.h, piece.d);
      pose.rotation.set(0, 0, 0);
      pose.updateMatrix();
      mesh.setMatrixAt(pieceIndex, pose.matrix.clone());
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    materials.push(material);
    textures.push(texture);
  }

  const emitters: readonly C2SecondMineLampEmitter[] = Object.freeze(fixturePlan.map(fixture => {
    const color = c2SecondMineLampColors[fixture.role];
    return Object.freeze({
      id: fixture.id, role: fixture.role,
      east: fixture.east, north: fixture.north,
      height: fixture.style === 'post' ? 2.08 : 2.16,
      color: color.hex, kelvin: color.kelvin,
      realLight: fixture.realLight,
    });
  }));
  const lights = selectedFixtures.map(fixture => {
    const emitter = emitters.find(item => item.id === fixture.id)!;
    const light = new PointLight(emitter.color, c2SecondMineLightBudget.intensity,
      c2SecondMineLightBudget.distance, 2);
    light.name = `${c2SecondMineLightPrefix}${fixture.id}/source`;
    light.position.set(emitter.east, emitter.height, -emitter.north);
    light.visible = false;
    group.add(light);
    return light;
  });
  const amberMaterial = materials.find(material => material.userData.materialFamily === 'amber')!;
  const roleCounts = Object.fromEntries(roleOrder.map(role => [role,
    fixturePlan.filter(fixture => fixture.role === role).length])) as Record<C2SecondMineLightRole, number>;
  const data = Object.freeze({
    coordinateFrame: 'local-eny',
    fixtureCount: fixturePlan.length,
    emitterCount: emitters.length,
    pointLightCount: lights.length,
    pointLightBudget: c2SecondMineLightBudget,
    roleCounts: Object.freeze(roleCounts),
    materialFamilyCount: families.length,
    materialFamilies: Object.freeze([...families]),
    drawCount: meshes.length,
    pieceCount: pieces.length,
    triangleCount: pieces.length * 12,
    textureSize: 16,
    colorTemperatureRange: Object.freeze([2200, 2700]),
    floorChangeCount: 0,
    collisionCount: 0,
    authorityChangeCount: 0,
    campfireCount: 0,
    healingFlameCount: 0,
  });
  owner?.add(group);
  let night = false;
  let disposed = false;
  function setNight(value: boolean) {
    if (disposed) return data;
    const nextNight = !!value;
    if (night === nextNight) return data;
    night = nextNight;
    for (const light of lights) light.visible = night;
    amberMaterial.emissiveIntensity = night ? 1.45 : .12;
    return data;
  }
  function stats() { return data; }
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const light of lights) light.dispose();
    for (const mesh of meshes) mesh.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    geometry.dispose();
    group.clear();
  }
  return {
    group, pieces, emitters, lights, meshes, data, stats, setNight,
    get isNightLit() { return night; },
    dispose,
  };
}

export type C2SecondMineLightSourcesScene = ReturnType<typeof buildC2SecondMineLightSources>;
export type C2SecondMineLightSourcesStats = ReturnType<C2SecondMineLightSourcesScene['stats']>;
export { buildC2SecondMineLightSources as build };
export function stats(scene: C2SecondMineLightSourcesScene): C2SecondMineLightSourcesStats {
  return scene.stats();
}
export function setNight(scene: C2SecondMineLightSourcesScene, night: boolean): C2SecondMineLightSourcesStats {
  return scene.setNight(night);
}
export function dispose(scene: C2SecondMineLightSourcesScene): void {
  scene.dispose();
}
