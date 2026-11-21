import {
  BoxGeometry, DataTexture, Group, InstancedMesh, Matrix4, MeshStandardMaterial, NearestFilter,
  Object3D, PointLight, SRGBColorSpace, Vector3,
} from 'three';

export type WarriorDistrictFoot = Readonly<{ east: number; north: number; height: number }>;
export type WarriorDistrictSite = WarriorDistrictFoot & Readonly<{ domainId: string; yaw: number }>;
type DistrictRole = 'search-room' | 'take-cover' | 'arcade-cover' | 'lookout' | 'trace';
type House = Readonly<{
  id: string; side: 'north' | 'south'; accessible: boolean;
  blockedBy?: 'rubble' | 'grille' | 'fallen-slab';
  workFeet: readonly DistrictRole[];
  localEntrance: readonly [number, number, number];
}>;
type Local = readonly [east: number, y: number, north: number];
type WorldBox = Readonly<{ name: string; min: readonly number[]; max: readonly number[] }>;
type Host = Readonly<{
  parent: Group;
  /** Official -165m city world frame, not an arbitrary review fixture. */
  site?: WarriorDistrictSite;
  supportsDistrict(site: WarriorDistrictSite): boolean;
  /** Every physically relevant user route foot must be supported by authoritative terrain. */
  supportsFoot(foot: WarriorDistrictFoot): boolean;
  acceptsSolidWorldBox(box: WorldBox): boolean;
  readViewer(): Readonly<{ playerId: string; domainId: string; foot: WarriorDistrictFoot }> | undefined;
  canUse(playerId: string, foot: WarriorDistrictFoot, role: DistrictRole): boolean;
  dispatch(intent: Readonly<{ playerId: string; role: DistrictRole; locationId: string }>): void;
  readLightBudget(): number;
}>;
const stone = {
  wall: 0x8a8378, shade: 0x2c3648, tan: 0xa98a56, wood: 0x5d4630,
  moss: 0x44503c, rust: 0x8a4a34, crystal: 0x7fd4c8, moon: 0xe8ecf0,
} as const;
type StoneFamily = keyof typeof stone;
const familyAccent: Record<StoneFamily, number> = {
  wall: stone.tan, shade: stone.wall, tan: stone.wall, wood: stone.rust,
  moss: stone.wood, rust: stone.shade, crystal: stone.moon, moon: stone.crystal,
};
export const warriorDistrictCanon = Object.freeze({
  houseCount: 12,
  accessibleHomes: 4,
  marketStallCount: 7,
  arcadeSignCount: 0,
  wallWalkLength: 90,
  wallWalkWidth: 4.2,
  story: {
    room: '门后的旧石柜留着一道深槽，有人把常用的物件搬走了。',
    cover: '石屋只有面街一处出口，躲开追兵后仍要从原门离开。',
    arcade: '柱间能绕开追兵，摊台上只有无字旧器物。',
    wall: '垛口外是来路，黑暗里只剩地宫下行道的一截。',
    trace: '磨亮的旧石阶和半截石矛，静静指着城外。',
  },
});
const plannedHouses: readonly House[] = Array.from({ length: 12 }, (_, index) => {
  const accessible = [1, 4, 7, 10].includes(index);
  const side = index < 6 ? 'north' as const : 'south' as const;
  // Stop before the existing 40x40m central statue square, without swallowing
  // the 25m entry approach or compressing house-to-house collision gaps.
  const x = 29 + index % 6 * 8.75;
  const front = side === 'north' ? 8.15 : -8.15;
  return {
    id: 'u10/stone-home-' + String(index + 1).padStart(2, '0'),
    side, accessible, blockedBy: accessible ? undefined :
      (['rubble', 'grille', 'fallen-slab'] as const)[(index + Math.floor(index / 3)) % 3],
    workFeet: accessible ? ['search-room', 'take-cover'] as const : [] as const,
    localEntrance: [x, 0, front] as const,
  };
});

function tex(color: number, accent: number) {
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const useAccent = (y * 29 + x * 17 + (x >> 2) * 5) % 37 < 4 ||
      (color === stone.wood && y % 5 === 0);
    const c = useAccent ? accent : color;
    pixels.set([c >>> 16, (c >>> 8) & 255, c & 255, 255], (y * 16 + x) * 4);
  }
  const map = new DataTexture(pixels, 16, 16);
  map.minFilter = map.magFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}
const finite = (value: number) => Number.isFinite(value);

/**
 * U-10 house + arcade + battlement prebuilt district.
 * Coordinates here are local to ONE host-certified city site. No default-map registrations,
 * second forge/statue, fight rewards or invisible movement walls are created.
 */
export function mountWarriorStoneDistrict(host: Host) {
  const site = host.site;
  if (!site) return { kind: 'unregistered' } as const;
  if (!site.domainId.trim() || ![site.east, site.north, site.height, site.yaw].every(finite) ||
      !host.supportsDistrict(site)) return { kind: 'unsupported-site' } as const;
  const fixedSite = site;
  const group = new Group();
  group.name = 'u10-warrior-houses-arcade-walkable-wall';
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;

  const localToWorld = ([e, y, north]: Local): WarriorDistrictFoot => {
    const p = new Vector3(e, y, -north).applyAxisAngle(new Vector3(0, 1, 0), fixedSite.yaw)
      .add(group.position);
    return { east: p.x, north: -p.z, height: p.y };
  };
  const blocks = new Map<StoneFamily, Matrix4[]>();
  const solids: Array<{ name: string; center: Local; size: Local }> = [];
  const pose = new Object3D();
  let elements = 0;
  function part(family: StoneFamily, e: number, y: number, north: number,
    width: number, height: number, depth: number, solid = false, name = '') {
    const parts = blocks.get(family) ?? [];
    pose.position.set(e, y, -north);
    pose.scale.set(width, height, depth);
    pose.rotation.set(0, 0, 0);
    pose.updateMatrix();
    parts.push(pose.matrix.clone());
    blocks.set(family, parts);
    elements++;
    if (solid) solids.push({ name: name || family + '/solid-' + solids.length,
      center: [e, y, north], size: [width, height, depth] });
  }
  const floor: Array<Readonly<{ name: string; foot: Local; role?: DistrictRole; houseId?: string }>> = [];
  const entryFeet: Array<Readonly<{ id: string; foot: Local; role: DistrictRole }>> = [];

  // Round 1: twelve recognizable contiguous ancient homes: exactly one public doorway
  // for an accessible home; collapsed roofs are visible but never player-climbable.
  for (const [index, house] of plannedHouses.entries()) {
    const x = house.localEntrance[0];
    const side = house.side === 'north' ? 1 : -1;
    const front = side * 8.15, rear = side * 16.55;
    const center = (front + rear) / 2;
    const w = index % 3 === 0 ? 7.3 : index % 3 === 1 ? 7.7 : 8.1;
    const h = 3.5 + (index % 4) * .27;
    part('wall', x, -.18, center, w + .14, .35, 8.55);
    part('shade', x, 1.72, rear, w, 3.65, .5, true, house.id + '/back');
    for (const dir of [-1, 1]) {
      part(index % 2 ? 'wall' : 'tan', x + dir * w / 2, 1.72,
        center, .45, 3.65, 8.38, true, house.id + '/side');
      for (let j = 0; j < 6; j++) {
        part('shade', x + dir * w / 2 + dir * .18, .15 + j * .55,
          center + side * ((j % 3) * .21 - .21), .1, .12, .53);
      }
    }
    const gap = 1.26;
    const wallWing = w / 2 - gap;
    for (const dir of [-1, 1]) {
      const centerE = x + dir * (gap + wallWing / 2);
      part('wall', centerE, 1.70, front, wallWing, 3.52, .52,
        true, house.id + '/door-wing');
    }
    part('shade', x, 3.18, front, gap * 2, .72, .65, true,
      house.id + '/door-lintel');
    part('tan', x, h + .18, center, w + .5, .23, 9.0, false, house.id + '/roof');
    // Hand-hewn stone joints: batches keep draw calls low despite a dense, weathered facade.
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      const e = x - w / 2 + .48 + col * (w - .96) / 5;
      const mark = ((row * 5 + col * 11 + index * 17) % 9) / 100;
      for (const face of [front, rear])
        part((row + col + index) % 9 === 0 ? 'moss' : 'shade',
          e, .35 + row * .53 + mark, face + (face > 0 ? .274 : -.274),
          .12 + col % 2 * .04, .08 + row % 3 * .012, .055);
    }
    // Coarse roof damage remains visible, but no invisible rooftop platform.
    for (let j = 0; j < 6; j++) {
      const left = x - w / 2 + .6 + j * (w - 1.2) / 5;
      if ((index + j) % 4 !== 0) {
        part(j % 2 ? 'wall' : 'shade', left, h + .41,
          center + ((j % 3) - 1) * 2.25, 1.05, .28, 2.7);
      } else {
        part('rust', left, h + .23, center + ((j % 3) - 1) * 2.25, .34, .06, 1.7);
      }
    }
    // Distinct visible "no through" blockers rather than unfinished opaque doors.
    if (!house.accessible) {
      if (house.blockedBy === 'rubble') {
        for (let j = 0; j < 9; j++) {
          part(j % 3 ? 'wall' : 'shade', x + (j % 3 - 1) * .64,
            .25 + Math.floor(j / 3) * .29, front + side * (.2 + j % 2 * .3),
            .56, .5, .63, true, house.id + '/rubble');
        }
      } else if (house.blockedBy === 'grille') {
        for (let j = 0; j < 6; j++)
          part('rust', x - 1.08 + j * .42, 1.25, front, .16, 2.47, .25, true,
            house.id + '/stone-grille');
      } else {
        part('shade', x, 1.30, front + side * .05, 2.55, 2.63, .36,
          true, house.id + '/fallen-slab');
        for (let j = 0; j < 4; j++)
          part('wall', x + (j - 1.5) * .55, .22, front - side * .50,
            .4, .44, .35, true);
      }
      continue;
    }
    // Single-facing doorway, no side/back exits. The room interior is 1–2 genuine work stations.
    // No client loot credit; the host's inventory/encounter system adjudicates requests.
    for (const dir of [-1, 1]) {
      part('wood', x + dir * 1.72, .52, rear - side * 1.3,
        .68, 1.02, 1.22, true, house.id + '/stone-cabinet');
      part('tan', x + dir * 1.72, 1.04, rear - side * 1.3,
        .79, .15, 1.29);
      for (let j = 0; j < 5; j++)
        part(j % 3 ? 'shade' : 'moss', x + dir * 1.78 + (j % 2) * .17,
          .13 + Math.floor(j / 2) * .18, rear - side * (1.17 + .25 * (j % 3)),
          .22, .2, .24);
    }
    part('tan', x - 1.0, .32, center, .74, .61, .65, true, house.id + '/stool');
    part('wood', x + .80, .60, center, 1.03, .21, .75, true, house.id + '/shelter-shelf');
    for (let j = 0; j < 5; j++)
      part(j % 2 ? 'shade' : 'wall', x + (j % 3 - 1) * .3, .12,
        center + side * (1.0 + (j % 2) * .2), .27, .22, .28);
    const search: Local = [x - 1.0, 0, rear - side * 2.2];
    const cover: Local = [x + 1.05, 0, center - side * 1.1];
    entryFeet.push({ id: house.id, role: 'search-room', foot: search },
      { id: house.id, role: 'take-cover', foot: cover });
    floor.push({ name: house.id + '/entrance', foot: [x, 0, front - side * .60] },
      { name: house.id + '/passage', foot: [x, 0, front + side * .75] },
      { name: house.id + '/interior', foot: [x, 0, center] });
  }

  // Round 2: south-side market arcade. Pillars have room for circling, and every stall
  // bears only abstract stone wares: NO text signage in this ancient layer.
  for (let index = 0; index < 7; index++) {
    // Southern market begins beyond the existing square's eastern edge.
    const x = 122 + index * 6.5;
    for (const south of [-17, -24.8]) {
      part('shade', x, 1.95, south, .80, 3.9, .85, true, 'arcade/column-' + index);
      part('tan', x, 3.97, south, 1.22, .38, 1.18);
      part('wall', x, .18, south, 1.12, .34, 1.19, true);
    }
    part('wall', x, 4.22, -20.9, 6.65, .25, 9.1);
    part('wood', x + .65, .64, -22.4, 2.4, .25, 1.18, true, 'arcade/stand-' + index);
    part('shade', x + .65, .33, -22.4, 1.5, .53, .55, true);
    for (let j = 0; j < 11; j++) {
      const a = (j * 7 + index * 11) % 17;
      part(j % 3 ? 'tan' : 'wall', x - .45 + (j % 5) * .4,
        .81 + Math.floor(j / 5) * .20, -22.55 + j % 2 * .17,
        .20 + a * .006, .12 + j % 3 * .07, .20 + j % 4 * .04);
    }
    // A deliberately navigable loop around the front row of stone columns.
    floor.push({ name: 'arcade/aisle-' + index, foot: [x + 2.65, 0, -20.4] },
      { name: 'arcade/columns-' + index, foot: [x + 2.0, 0, -17.1] });
  }
  entryFeet.push({ id: 'u10/market-arcade', role: 'arcade-cover', foot: [133, 0, -19.05] });

  // Round 3: cold moonstone sources are attached to actual stone/wood sconces.
  // The forge remains the single warm source elsewhere in the city.
  const moonFixtures: Local[] = [];
  for (const [x, north] of [[35, 6.25], [55, -6.25], [75, 6.25],
    [121, -12.35], [141, -12.35], [161, -12.35]]) {
    part('wood', x, 1.18, north, .21, 2.36, .21, true, 'u10/moonstone-street-lamp');
    part('moon', x, 2.45, north, .30, .42, .30);
    part('crystal', x, 2.74, north, .46, .18, .43);
    for (const dir of [-1, 1])
      part('shade', x + dir * .18, 2.45, north, .04, .40, .04);
    moonFixtures.push([x, 2.45, north]);
  }
  // Round 3: one physically walkable 90m battlement, a wide top for two players,
  // worn steps and rubble at both natural endpoints (no invisible collision wall).
  for (let x = 79; x <= 169; x += 1) {
    part('wall', x, 3.50, 27, .99, 7.0, 4.1, true, 'citywall/body');
    part('tan', x, 7.02, 27, 1.01, .19, 4.1);
    for (const side of [-1, 1]) {
      const edge = 27 + side * 2.1;
      const landingCut = side < 0 && x >= 98 && x <= 102;
      if (!landingCut) part('shade', x, 7.45, edge, .98, .75, .35, true, 'citywall/parapet');
      if (!landingCut && x % 3 !== 0)
        part('wall', x, 8.04, edge, .72, .5, .38, true, 'citywall/crenel');
      if (x % 11 === 0)
        part('moss', x + .18, 7.70, edge - side * .20, .16, .09, .29);
    }
    if (x % 8 === 0) {
      part('shade', x, 7.18, 25.15, .55, .18, .27);
      part('rust', x + .12, 7.46, 25.26, .09, .55, .10);
    }
  }
  for (let i = 0; i < 26; i++) {
    // A 0.271m rise keeps climbing compatible with a sub-0.30m walking step,
    // avoiding the old half-metre stairs that forced players to jump.
    // Running PARALLEL to the outer wall removes the overhead stone obstruction.
    // The final landing crosses to the open parapet without any invisible wall.
    const e = 85 + i * .55;
    const top = (i + 1) * (7.12 / 26);
    part('tan', e, top / 2, 23.1, .54, top, 2.15, true, 'citywall/stair-' + i);
    if (i === 0) part('moon', e, top + .025, 23.1, .48, .045, 1.90);
    floor.push({ name: 'citywall/stair-foot-' + i,
      foot: [e, top, 23.1] });
  }
  part('tan', 99.5, 7.12 / 2, 25.7, 2.5, 7.12, 2.6, true, 'citywall/stair-landing');
  floor.push({ name: 'citywall/stair-landing-foot', foot: [99.5, 7.12, 25.7] });
  for (let x = 83; x < 169; x += 2)
    floor.push({ name: 'citywall/top-foot-' + x, foot: [x, 7.12, 27] });
  for (const x of [79.5, 80, 168, 169]) {
    for (let i = 0; i < 6; i++) {
      part(i % 3 ? 'shade' : 'wall', x + (i % 2 - .5) * .53,
        7.26 + Math.floor(i / 2) * .24, 27 + (i % 3 - 1) * .51,
        .46, .36, .57, true, 'citywall/broken-end');
    }
  }
  // Two piles used as historical rolled stones, a weathered spear and arrow-slot scars.
  for (let i = 0; i < 18; i++) {
    const x = 111 + (i % 6) * .31;
    const n = 26.25 + Math.floor(i / 6) * .37;
    part(i % 4 ? 'wall' : 'shade', x, 7.26 + i % 3 * .11, n,
      .24, .17, .28);
  }
  part('rust', 130, 7.90, 28.40, .13, 1.34, .12);
  part('shade', 130.06, 8.65, 28.4, .23, .23, .26);
  entryFeet.push({ id: 'u10/wall-lookout', role: 'lookout', foot: [147, 7.12, 27] },
    { id: 'u10/worn-stair', role: 'trace', foot: [85, 7.12 / 26, 23.1] });

  // Test physical human-cylinder clearance against the SAME stone props exported to
  // the movement authority. A supported ground foot cannot hide inside a house/solid.
  function isClearLocal([e, y, north]: Local, radius = .27, playerHeight = 1.8) {
    if (![e, y, north, radius, playerHeight].every(finite) || radius <= 0 || playerHeight <= 0)
      return false;
    const lower = y + .025, upper = y + playerHeight;
    return !solids.some(box => {
      const [x, cy, z] = box.center;
      const [w, h, d] = box.size;
      if (cy + h / 2 <= lower || cy - h / 2 >= upper) return false;
      const dx = Math.max(0, Math.abs(e - x) - w / 2);
      const dz = Math.max(0, Math.abs(north - z) - d / 2);
      return Math.hypot(dx, dz) < radius;
    });
  }
  // Separately certify every story/action station AND the full continuous stair + top route.
  const feet = entryFeet.map(item => ({ ...item, world: localToWorld(item.foot) }));
  const sampledRoute = floor.map(item => ({ ...item, world: localToWorld(item.foot) }));
  const obstructed = [...feet, ...sampledRoute].find(item => !isClearLocal(item.foot));
  if (obstructed) return { kind: 'blocked-playable-route', blocked:
    'id' in obstructed ? obstructed.id : obstructed.name } as const;
  if ([...feet, ...sampledRoute].some(item => !host.supportsFoot(item.world))) {
    return { kind: 'unsupported-foot' } as const;
  }
  const boxWorld = (item: (typeof solids)[number]): WorldBox => {
    const [e, y, s] = item.center;
    const [w, h, d] = item.size;
    const pts = [
      localToWorld([e - w / 2, y - h / 2, s - d / 2]),
      localToWorld([e + w / 2, y - h / 2, s - d / 2]),
      localToWorld([e - w / 2, y - h / 2, s + d / 2]),
      localToWorld([e + w / 2, y - h / 2, s + d / 2]),
      localToWorld([e - w / 2, y + h / 2, s - d / 2]),
      localToWorld([e + w / 2, y + h / 2, s - d / 2]),
      localToWorld([e - w / 2, y + h / 2, s + d / 2]),
      localToWorld([e + w / 2, y + h / 2, s + d / 2]),
    ];
    return { name: item.name,
      min: [Math.min(...pts.map(p => p.east)), Math.min(...pts.map(p => p.height)),
        Math.min(...pts.map(p => -p.north))],
      max: [Math.max(...pts.map(p => p.east)), Math.max(...pts.map(p => p.height)),
        Math.max(...pts.map(p => -p.north))] };
  };
  const colliders = solids.map(boxWorld);
  if (colliders.some(box => !host.acceptsSolidWorldBox(box))) {
    return { kind: 'unsupported-collider' } as const;
  }

  const geometry = new BoxGeometry();
  const meshes: InstancedMesh[] = [];
  const mats: MeshStandardMaterial[] = [];
  const textures: DataTexture[] = [];
  for (const [family, transforms] of blocks) {
    const texture = tex(stone[family], familyAccent[family]);
    const material = new MeshStandardMaterial({ map: texture, roughness: .94,
      metalness: 0, flatShading: true });
    const mesh = new InstancedMesh(geometry, material, transforms.length);
    mesh.name = 'u10-clay-stone/' + family;
    transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh); mats.push(material); textures.push(texture);
  }
  const lamps: PointLight[] = [];
  for (const [e, y, north] of moonFixtures) {
    const light = new PointLight(stone.crystal, 3.6, 6, 2);
    light.name = 'u10-certified-moonstone-lamp';
    light.position.set(e, y, -north);
    light.visible = false;
    lamps.push(light);
    group.add(light);
  }
  host.parent.add(group);
  let disposed = false;
  function sync() {
    if (disposed) return false;
    const lightLimit = Math.max(0, Math.min(lamps.length, Math.floor(host.readLightBudget() || 0)));
    lamps.forEach((lamp, index) => { lamp.visible = index < lightLimit; });
    return true;
  }
  sync();
  function getPrompts(role?: DistrictRole) {
    const viewer = host.readViewer();
    if (disposed || !viewer || viewer.domainId !== fixedSite.domainId ||
      !viewer.playerId.trim() || ![viewer.foot.east, viewer.foot.north, viewer.foot.height].every(finite)) return [];
    return feet.filter(item => (!role || role === item.role) &&
      Math.hypot(viewer.foot.east - item.world.east,
        viewer.foot.north - item.world.north, viewer.foot.height - item.world.height) <= 1.4 &&
      host.canUse(viewer.playerId, item.world, item.role))
      .map(item => ({ id: item.id, role: item.role, story: warriorDistrictCanon.story[
        item.role === 'search-room' ? 'room' : item.role === 'take-cover' ? 'cover' :
          item.role === 'arcade-cover' ? 'arcade' : item.role === 'lookout' ? 'wall' : 'trace' ] }));
  }
  function press(role: DistrictRole, id: string) {
    const viewer = host.readViewer();
    const prompt = getPrompts(role).find(item => item.id === id);
    if (!viewer || !prompt) return false;
    // Host rechecks accepted foot/domain, permissions, monster state and loot grant.
    host.dispatch({ playerId: viewer.playerId, role, locationId: id });
    return true;
  }
  return {
    kind: 'ready', group, houses: plannedHouses, colliders, feet,
    sampledRoute, isClearLocal, voxelCount: elements, batches: meshes.length,
    lamps, sync, story: warriorDistrictCanon.story, getPrompts, press,
    toWorld: localToWorld,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const mat of mats) mat.dispose();
      for (const map of textures) map.dispose();
      geometry.dispose();
      group.clear();
    },
  } as const;
}
