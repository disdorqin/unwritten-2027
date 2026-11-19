import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, type Scene } from 'three';
import { roadCorridorKeepClear } from './road-clearance';
import type { TownActivity, TownActivityContext } from './town-activity';
import { pineCampfireId, type CampfireForestOptions, type CampfireSite } from './town-campfires';
import { layout } from './terrain';

type Place = { x: number; n: number; ground: number };
const forestSiteIds = ['village', 'campfire', pineCampfireId] as const;
type SiteId = typeof forestSiteIds[number];
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Piles = Record<SiteId, number>;
export type ForestChopSite = Place & { id: SiteId; props: Place };
export const forestWoodStorageKey = 'unwritten.forest-campfire.v1';
export const forestChopRange = .58;
export const forestChopHits = 5;
export const forestWoodPileLimit = 12;
const blazeThreshold = 4;
const minimumRhythmMs = 175;
const maximumRhythmMs = 950;
const propRadius = .72;
const standOffset = 1.45;
const fixedChopOffset = [[0, 0]] as const;
const nearCandidates = [...fixedChopOffset, [0, -.45], [-.45, 0], [0, .45], [.45, 0]] as const;
const siteLabel = { village: '木屋旁劈柴', campfire: '篝火旁劈柴', [pineCampfireId]: '松林营地劈柴' } as const;

export function findForestChopSites(
  fires: readonly CampfireSite[],
  walkableGround: (east: number, north: number) => number | undefined,
): ForestChopSite[] {
  const seeds: { id: SiteId; x: number; n: number }[] = [{ id: 'village', x: 94.30, n: 263.25 }];
  const forestFire = fires.find(({ id }) => id === 'forest');
  if (forestFire) seeds.push({ id: 'campfire', x: forestFire.x - 2.50, n: forestFire.n - 1.30 });
  // Surveyed south of the fire pad, keeping its seats, woodpile and snowman route clear.
  if (fires.some(({ id }) => id === pineCampfireId)) seeds.push({ id: pineCampfireId, x: 418.5, n: 218.5 });

  function clearPlate(x: number, n: number, radius: number) {
    if (roadCorridorKeepClear(x, n, radius + .18)) return;
    const ground = walkableGround(x, n);
    if (ground === undefined) return;
    const safe = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4).every(angle => {
      const height = walkableGround(x + Math.cos(angle) * radius, n + Math.sin(angle) * radius);
      return height !== undefined && Math.abs(ground - height) < .30;
    });
    return safe ? ground : undefined;
  }

  const spots: ForestChopSite[] = [];
  for (const { id, x, n } of seeds) {
    const offsets = id === pineCampfireId ? fixedChopOffset : nearCandidates;
    for (const [dx, dn] of offsets) {
      const east = x + dx;
      const north = n + dn;
      const ground = clearPlate(east, north, forestChopRange);
      const propX = east - standOffset;
      const propsGround = clearPlate(propX, north, propRadius);
      if (ground === undefined || propsGround === undefined || Math.abs(ground - propsGround) >= .4) continue;
      spots.push({ id, x: east, n: north, ground, props: { x: propX, n: north, ground: propsGround } });
      break;
    }
  }
  return spots;
}

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return undefined; }
}

function readForestWood(storage: StoragePort | undefined) {
  const piles: Piles = { village: 0, campfire: 0, [pineCampfireId]: 0 };
  let attended = false;
  let pineFuel = 0;
  try {
    const saved = JSON.parse(storage?.getItem(forestWoodStorageKey) ?? '{}');
    for (const id of forestSiteIds) {
      const count = saved?.piles?.[id];
      if (Number.isInteger(count)) piles[id] = Math.min(forestWoodPileLimit, Math.max(0, count));
    }
    attended = saved?.attended === true;
    if (Number.isInteger(saved?.pineFuel)) pineFuel = Math.min(forestWoodPileLimit, Math.max(0, saved.pineFuel));
  } catch { /* A broken save leaves the wood piles empty. */ }
  return { piles, attended, pineFuel };
}

function buildChopProps(scene: Scene, sites: readonly ForestChopSite[], counts: Piles) {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), sites.length * (6 + 3 * forestWoodPileLimit));
  batch.name = '森林劈柴墩与柴垛';
  batch.instanceMatrix.setUsage(DynamicDrawUsage);
  scene.add(batch);
  const pose = new Object3D();
  const tint = new Color();

  function refresh() {
    let used = 0;
    for (const { id, props } of sites) {
      const add = (x: number, y: number, z: number, width: number, height: number, depth: number, color: string) => {
        pose.position.set(props.x + x, props.ground + y, -props.n + z);
        pose.scale.set(width, height, depth);
        pose.updateMatrix();
        batch.setMatrixAt(used, pose.matrix);
        batch.setColorAt(used++, tint.set(color));
      };
      add(0, .23, -.26, .49, .46, .45, '#795643');
      add(0, .475, -.26, .49, .03, .45, '#b79768');
      add(.02, .56, -.27, .33, .14, .16, '#9d7650');
      add(0, .06, .24, .82, .12, .53, '#4e4651');
      for (const end of [-.36, .36]) add(end, .28, .24, .11, .47, .55, '#71523d');
      for (let index = 0; index < counts[id]; index++) {
        const row = Math.floor(index / 4);
        const z = .04 + (index % 4) * .133;
        const y = .185 + row * .116;
        add(0, y, z, .60, .109, .113, index % 2 ? '#916743' : '#a4774c');
        for (const x of [-.302, .302]) add(x, y, z, .02, .079, .091, '#cca37a');
      }
    }
    batch.count = used;
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
  }
  refresh();
  return refresh;
}

export function createForestCampfire(
  scene: Scene,
  context: Pick<TownActivityContext, 'announce'>,
  sites: readonly ForestChopSite[],
  options: { isNight(): boolean; now?: () => number; storage?: StoragePort; pineCamp?: CampfireSite; onPineCampLit?(): void },
) {
  const storage = options.storage ?? browserStorage();
  const now = options.now ?? Date.now;
  const saved = readForestWood(storage);
  const refresh = sites.length ? buildChopProps(scene, sites, saved.piles) : undefined;
  const beats = new Map<SiteId, { count: number; at: number }>();
  const fuel = () => saved.piles.campfire + saved.piles.village;
  const level = () => fuel() < blazeThreshold ? 0 : options.isNight() ? 2 : 1;
  const pineLevel = () => saved.pineFuel < blazeThreshold ? 0 : options.isNight() ? 2 : 1;
  const levelNames = ['微火', '旺火', '篝火晚会'] as const;

  function persist() {
    try { storage?.setItem(forestWoodStorageKey, JSON.stringify(saved)); }
    catch { /* Chopping continues for this visit. */ }
  }

  function chop(id: SiteId) {
    if (saved.piles[id] >= forestWoodPileLimit) {
      context.announce('柴垛已满');
      return;
    }
    const at = now();
    const last = beats.get(id);
    const gap = last ? at - last.at : Infinity;
    if (gap < minimumRhythmMs) {
      context.announce('等一拍再劈');
      return;
    }
    const count = last && gap <= maximumRhythmMs ? last.count + 1 : 1;
    if (count < forestChopHits) {
      beats.set(id, { count, at });
      context.announce(`劈柴 · ${count}/${forestChopHits}`);
      return;
    }
    beats.delete(id);
    saved.piles[id]++;
    refresh?.();
    persist();
    if (id === pineCampfireId) {
      context.announce(`柴垛 ${saved.piles[id]}/${forestWoodPileLimit}`);
      return;
    }
    context.announce(`柴垛 ${saved.piles[id]}/${forestWoodPileLimit} · 燃料 ${fuel()} · ${levelNames[level()]}`);
  }

  function addPineCampWood() {
    if (saved.piles[pineCampfireId] === 0) {
      context.announce('到松林劈柴，再回火塘添柴。');
      return;
    }
    if (saved.pineFuel >= forestWoodPileLimit) {
      context.announce('柴垛已满');
      return;
    }
    const first = saved.pineFuel === 0;
    saved.piles[pineCampfireId]--;
    saved.pineFuel++;
    refresh?.();
    persist();
    context.announce(`松林火塘 · 燃料 ${saved.pineFuel} · ${levelNames[pineLevel()]}`);
    if (first) options.onPineCampLit?.();
  }

  function recordPartySeat() {
    if (level() !== 2 || saved.attended) return;
    saved.attended = true;
    persist();
    context.announce('森林篝火晚会 · 已参加');
  }

  const cabin = layout.plots.find(({ id }) => id === 'cabins')!;
  const [cabinEast, cabinNorth, cabinGround] = cabin.origin;
  const flames: CampfireForestOptions = {
    level,
    onForestSeat: recordPartySeat,
    pineLevel,
    // The chimney on the walk-in cabin in landmark-village.ts.
    villageSmoke: {
      x: cabinEast + 7.5, n: cabinNorth - .075, height: cabinGround + 5.775,
      scale: () => saved.piles.village >= forestWoodPileLimit ? 1.6 : 1,
    },
  };
  const spots: TownActivity['spots'] = sites.map(({ id, x, n, ground }) => ({
    x, n, ground, label: siteLabel[id], range: forestChopRange, run: () => chop(id),
  }));
  const pineCamp = options.pineCamp;
  const pile = pineCamp?.woodPile;
  if (pineCamp && pile && sites.some(({ id }) => id === pineCampfireId)) {
    // Reach the north side of the pile from the existing fire pad.
    spots.push({ x: pile.x, n: pile.n + propRadius + .18, ground: pineCamp.ground,
      range: forestChopRange, label: '给松林火塘添柴', run: addPineCampWood });
  }
  const activity: TownActivity = {
    spots,
    blocked(east, north, feet) {
      return sites.some(({ props }) => Math.abs(feet - props.ground) < .9 &&
        Math.hypot(east - props.x, north - props.n) < propRadius);
    },
  };

  return {
    ...activity,
    flames,
    level,
    recordPartySeat,
    state: () => ({ fuel: fuel(), piles: { village: saved.piles.village, campfire: saved.piles.campfire }, attended: saved.attended }),
    pineCampState: () => ({ wood: saved.piles[pineCampfireId], fuel: saved.pineFuel, level: pineLevel() }),
  };
}
