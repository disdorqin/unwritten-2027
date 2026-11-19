import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Points, Scene, type BufferAttribute } from 'three';
import { addDistrictHousing } from '../tools/voxel-tavern/town-blockout/district-layout.ts';
import { addForestDensity } from '../tools/voxel-tavern/town-blockout/forest-density.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildVillageLandmark } from '../tools/voxel-tavern/town-blockout/landmark-village.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { addStreetscape } from '../tools/voxel-tavern/town-blockout/streetscape.ts';
import { bridgeAt, canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { campfirePartsPerSite, campfirePieces, createTownCampfires, findRegionalCampfires, fireWarmthRadius, maxCampfireSites, pineCampfireId, type CampfireSite } from '../tools/voxel-tavern/town-blockout/town-campfires.ts';
import { extensionRoadClearance, extensionStreetClearance } from '../tools/voxel-tavern/town-blockout/town-extension.ts';
import {
  createForestCampfire, findForestChopSites, forestChopHits, forestChopRange, forestWoodPileLimit, forestWoodStorageKey,
} from '../tools/voxel-tavern/town-blockout/town-forest-campfire.ts';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import { createTownWater } from '../tools/voxel-tavern/town-blockout/town-water.ts';

const grid = createTerrainGrid();
const fireX = 122.48, fireN = 407.65;
const firePoint = { x: fireX, n: fireN + 2.15, ground: grid.heightAt(fireX, fireN + 2.15), yaw: Math.PI,
  approach: { x: fireX, n: fireN + 1.47, ground: grid.heightAt(fireX, fireN + 1.47) } };
const fires: CampfireSite[] = [{
  id: 'forest', label: '森林篝火', style: 'stone',
  x: fireX, n: fireN, ground: grid.heightAt(fireX, fireN), seats: [firePoint],
}];

function checkedMapGround() {
  const area = new Group();
  const railway = createTownRailway(grid);
  const water = createTownWater(grid);
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    }) }) },
  });
  let scenery: ReturnType<typeof addScenery>;
  try { scenery = addScenery(area, grid); }
  finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const houses = addDistrictHousing(area, grid, scenery.blocked, railway.keepClear);
  const streets = addStreetscape(area, grid,
    (x, n, margin) => houses.keepClear(x, n, margin) || extensionRoadClearance(x, n, margin));
  const forest = addForestDensity(area, grid,
    (x, n, margin) => houses.keepClear(x, n, margin) || streets.occupied(x, n, margin),
    (x, n, margin) => railway.keepClear(x, n, margin) || extensionRoadClearance(x, n, margin) ||
      extensionStreetClearance(x, n, margin));
  const cabinPlot = layout.plots.find(({ id }) => id === 'cabins')!;
  const cabin = buildVillageLandmark(cabinPlot);
  const [e, n, height] = cabinPlot.origin;
  cabin.position.set(e, height, -n);
  const { colliders, floors } = readWalkGeometry(cabin);

  return (x: number, n: number) => {
    const feet = grid.heightAt(x, n);
    if (!canEnter(x, n) || bridgeAt(x, n) || water.at(x, n) || railway.keepClear(x, n, .27) ||
        extensionRoadClearance(x, n, .27) || extensionStreetClearance(x, n, .27) ||
        [scenery, houses, streets, forest].some(item => item.blocked(x, n))) return;
    const hit = [...colliders, ...floors].some(({ min, max }) => feet + .025 < max[1] && feet + 1.775 > min[1] &&
      Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27);
    return hit ? undefined : feet;
  };
}

test('both chop spots and their prop footprints are clear against the production map', () => {
  const checked = checkedMapGround();
  const sites = findForestChopSites(fires, checked);
  assert.equal(sites.length, 2);
  const [village, camp] = sites;
  assert.deepEqual([village.x, village.n], [94.30, 263.25]);
  assert.ok(Math.abs(camp.x - 119.98) < 1e-8 && Math.abs(camp.n - 406.35) < 1e-8);
  assert.ok(Math.hypot(camp.x - fireX, camp.n - fireN) < fireWarmthRadius);
  assert.equal(findForestChopSites(fires, () => undefined).length, 0);
  const forest = createForestCampfire(new Scene(), { announce() {} }, sites, { isNight: () => true });
  for (const spot of sites) {
    assert.equal(forest.blocked?.(spot.props.x, spot.props.n, spot.props.ground), true);
    for (const radius of [0, forestChopRange]) {
      for (let i = 0; i < 16; i++) {
        const angle = i * 2 * Math.PI / 16;
        const x = spot.x + Math.cos(angle) * radius;
        const n = spot.n + Math.sin(angle) * radius;
        const height = checked(x, n);
        assert.ok(height !== undefined && Math.abs(height - spot.ground) < .30);
        assert.ok(!forest.blocked?.(x, n, height));
      }
    }
    assert.equal(nearestTownActivity(forest.spots, spot.x, spot.n, spot.ground)?.label,
      spot.id === 'village' ? '木屋旁劈柴' : '篝火旁劈柴');
  }
});

test('five rhythm strikes store wood from two sites and sitting at night records the party once', () => {
  const sites = findForestChopSites(fires, grid.heightAt);
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  const notes: string[] = [];
  let time = 1000, night = false, sits = 0;
  const scene = new Scene();
  const options = { now: () => time, isNight: () => night, storage };
  const forest = createForestCampfire(scene, { announce: text => notes.push(text) }, sites, options);
  const [cabin, camp] = forest.spots;
  const props = scene.children[0];
  assert.ok(props instanceof InstancedMesh && props.count === 12);
  assert.equal(forest.level(), 0);
  cabin.run();
  cabin.run();
  assert.match(notes.at(-1)!, /等一拍/);
  for (let i = 1; i < forestChopHits - 1; i++) { time += 400; cabin.run(); }
  assert.equal(forest.state().fuel, 0);
  time += 400;
  cabin.run();
  assert.equal(forest.state().fuel, 1);
  assert.equal(props.count, 15);

  for (const spot of [camp, cabin, camp]) {
    time += 400;
    for (let i = 0; i < forestChopHits; i++) { spot.run(); time += 400; }
  }
  assert.deepEqual(forest.state(), { fuel: 4, piles: { village: 2, campfire: 2 }, attended: false });
  assert.equal(forest.level(), 1);
  const campfires = createTownCampfires(scene, { sit: () => { sits++; } }, fires, forest.flames);
  campfires.spots[0].run();
  assert.equal(forest.state().attended, false);
  night = true;
  assert.equal(forest.level(), 2);
  campfires.spots[0].run();
  campfires.spots[0].run();
  assert.equal(sits, 3);
  assert.equal(forest.state().attended, true);
  assert.equal(notes.filter(note => note.includes('已参加')).length, 1);
  assert.deepEqual([...data.keys()], [forestWoodStorageKey]);
  assert.deepEqual(createForestCampfire(new Scene(), { announce() {} }, sites, options).state(), forest.state());
});

test('three stages and village chimney growth reuse one particle pool with unchanged warmth radius', () => {
  const scene = new Scene();
  const storage = {
    getItem: () => JSON.stringify({ piles: { village: forestWoodPileLimit - 1, campfire: 0 } }),
    setItem() {},
  };
  let time = 0, night = false;
  const spots = findForestChopSites(fires, grid.heightAt);
  const forest = createForestCampfire(scene, { announce() {} }, spots, { storage, now: () => time, isNight: () => night });
  const campfires = createTownCampfires(scene, { sit() {} }, fires, forest.flames);
  const flames = scene.children.find(object => object instanceof Points);
  assert.ok(flames instanceof Points);
  assert.equal(scene.children.length, 2);
  assert.equal(campfires.warmAt(fireX + fireWarmthRadius, fireN, fires[0].ground), true);
  assert.equal(campfires.warmAt(fireX + fireWarmthRadius + .01, fireN, fires[0].ground), false);

  const activeCount = () => flames.geometry.drawRange.count;
  campfires.updateFlames(.1, fireX, fireN, false);
  assert.equal(activeCount(), 1 + 36);
  night = true;
  campfires.updateFlames(.1, fireX, fireN, false);
  assert.equal(activeCount(), 1 + 48);
  const chimney = forest.flames.villageSmoke!;
  campfires.updateFlames(.1, chimney.x, chimney.n, false);
  assert.equal(activeCount(), 1 + 4);
  for (let i = 0; i < forestChopHits; i++) { forest.spots[0].run(); time += 400; }
  campfires.updateFlames(.1, chimney.x, chimney.n, false);
  assert.equal(activeCount(), 1 + 8);
  const styles = flames.geometry.getAttribute('fireStyle') as BufferAttribute;
  assert.ok(styles.getZ(1) < 0);
  const quiet = createForestCampfire(scene, { announce() {} }, spots, {
    storage: { getItem: () => '{}', setItem() {} }, isNight: () => true,
  });
  const low = createTownCampfires(scene, { sit() {} }, fires, quiet.flames);
  low.updateFlames(.1, fireX, fireN, false);
  const lowFlames = scene.children.at(-1);
  assert.ok(lowFlames instanceof Points);
  assert.equal(lowFlames.geometry.drawRange.count, 1 + 24);
});

test('pine fire adds a ninth site with six warm seats and leaves the eight accepted sites unchanged', t => {
  const levelGround = (_x: number, _n: number, fixed?: number) => fixed ?? 12;
  const before = findRegionalCampfires(levelGround, layout.plaza.bounds);
  const after = findRegionalCampfires(levelGround, layout.plaza.bounds, { pineCamp: true });
  assert.equal(before.length, 8);
  assert.equal(maxCampfireSites, 9);
  assert.equal(after.length, maxCampfireSites);
  assert.deepEqual(after.slice(0, before.length), before);
  const pine = after.at(-1)!;
  assert.deepEqual([pine.id, pine.x, pine.n, pine.ground], [pineCampfireId, 418, 225, 12]);
  assert.deepEqual(pine.woodPile, { x: 416.5, n: 223.65, ground: 12 });
  assert.equal(pine.seats.length, 6);

  const scene = new Scene();
  const warmSittings: number[] = [];
  const outdoor = createTownCampfires(scene, { sit: seat => {
    assert.ok(outdoor.warmAt(seat.x, seat.n, seat.eyeY - 1.475));
    warmSittings.push(seat.eyeY);
  } }, after);
  for (const seat of pine.seats) {
    assert.ok(Math.abs(Math.hypot(seat.x - pine.x, seat.n - pine.n) - 2.15) < 1e-8);
    assert.equal(outdoor.blocked?.(seat.approach.x, seat.approach.n, seat.approach.ground), false);
  }
  const pineSit = outdoor.spots.filter(spot => spot.label === '在松林火塘旁坐下');
  assert.equal(pineSit.length, 6);
  pineSit.forEach(spot => spot.run());
  assert.equal(warmSittings.length, 6);
  assert.ok(outdoor.warmAt(421, 225, 12));
  assert.equal(outdoor.warmAt(421.01, 225, 12), false);
  const pieces = campfirePieces(after);
  assert.equal(campfirePieces([pine]).length, 45);
  assert.ok(pieces.length <= maxCampfireSites * campfirePartsPerSite);
  assert.equal(scene.children.filter(child => child instanceof Points).length, 1);
  t.diagnostic(`fixture: ${before.length}→${after.length} fires, pine adds 45 pieces, ${pieces.length}/${maxCampfireSites * campfirePartsPerSite} used, 6 warm seats, 1 particle batch`);
});

test('pine chopping and feeding a supported site reuse five strikes while keeping old fuel separate', t => {
  const flat = () => 12;
  const [pine] = findRegionalCampfires(flat, undefined, { pineCamp: true }).filter(fire => fire.id === pineCampfireId);
  const chopSites = findForestChopSites([pine], flat);
  const chopSite = chopSites.find(site => site.id === pineCampfireId)!;
  assert.deepEqual([chopSite.x, chopSite.n, chopSite.props.x, chopSite.props.n], [418.5, 218.5, 417.05, 218.5]);
  const distance = (a: { x: number; n: number }, b: { x: number; n: number }) => Math.hypot(a.x - b.x, a.n - b.n);
  for (const seat of pine.seats) {
    assert.ok(distance(seat, chopSite) > .61 + .58);
    assert.ok(distance(seat, chopSite.props) > .61 + .72);
  }
  assert.ok(distance(pine.woodPile!, chopSite) > .72 + .58);
  assert.ok(distance(pine.woodPile!, chopSite.props) > .72 + .72);
  const blockedAnchor = (x: number, n: number) => x === chopSite.x && n === chopSite.n ? undefined : flat();
  assert.ok(!findForestChopSites([pine], blockedAnchor).some(spot => spot.id === pineCampfireId),
    'the pine activity must stay off if its only surveyed footprint becomes blocked');

  const data = new Map([[forestWoodStorageKey, JSON.stringify({ piles: { village: 2, campfire: 2 } })]]);
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  const notes: string[] = [];
  let time = 0, lit = 0;
  const options = { pineCamp: pine, isNight: () => true, now: () => time, storage, onPineCampLit: () => { lit++; } };
  const activity = createForestCampfire(new Scene(), { announce: line => notes.push(line) }, chopSites, options);
  const chop = activity.spots.find(spot => spot.label === '松林营地劈柴')!;
  const feed = activity.spots.find(spot => spot.label === '给松林火塘添柴')!;
  assert.ok(chop && feed);
  const outdoor = createTownCampfires(new Scene(), { sit() {} }, [pine], activity.flames);
  assert.equal(outdoor.blocked?.(feed.x, feed.n, feed.ground), false);
  feed.run();
  assert.equal(lit, 0);

  for (let stock = 0; stock < 4; stock++) {
    for (let hit = 1; hit < forestChopHits; hit++) { time += 400; chop.run(); }
    assert.equal(activity.pineCampState().wood, 0);
    time += 400;
    chop.run();
    assert.equal(activity.pineCampState().wood, 1);
    feed.run();
    assert.deepEqual(activity.pineCampState(), { wood: 0, fuel: stock + 1, level: stock === 3 ? 2 : 0 });
  }
  assert.equal(lit, 1);
  assert.deepEqual(activity.state(), { fuel: 4, piles: { village: 2, campfire: 2 }, attended: false });
  assert.deepEqual(createForestCampfire(new Scene(), { announce() {} }, chopSites, options).pineCampState(), activity.pineCampState());
  assert.deepEqual([...data.keys()], [forestWoodStorageKey]);
  t.diagnostic('fixture: fourth strike no wood, fifth strike +1; four feeds unlock night stage, original camp fuel unchanged');
});
