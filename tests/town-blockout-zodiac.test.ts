import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { InstancedMesh, Matrix4, PerspectiveCamera, Raycaster, Vector3, type Group } from 'three';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain';
import { buildTowerLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tower';
import { buildLakesideLandmark } from '../tools/voxel-tavern/town-blockout/landmark-lakeside';
import { buildMarketLandmark, workshopMonkeySteps, type WorkshopRiddleWall } from '../tools/voxel-tavern/town-blockout/landmark-market';
import { buildHotSpring } from '../tools/voxel-tavern/town-blockout/landmark-hot-spring';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { extensionPlots } from '../tools/voxel-tavern/town-blockout/town-extension';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity';
import { createTownZodiacSites } from '../tools/voxel-tavern/town-blockout/town-zodiac-atlas';
import {
  greenhouseRabbitSite, hotSpringPigSite, lanternWorkshopMonkeySite, towerDragonClues, towerDragonSite, workshopMonkeyClues,
} from '../tools/voxel-tavern/town-blockout/town-zodiac-sites';
import { createTownRailway } from '../tools/voxel-tavern/town-blockout/town-railway';
import { createRailHorseCharm } from '../tools/voxel-tavern/town-blockout/town-zodiac-rail';
import { createZodiacProgress, sealedGoldenGoatClue, zodiacStorageKey } from '../tools/voxel-tavern/town-blockout/town-zodiac';

test('the first zodiac pickup is personal, persistent and not repeatable', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const one = createZodiacProgress(['mouse'], storage);
  const another = createZodiacProgress(['mouse']);
  assert.equal(one.rows().length, 12);
  assert.equal(one.rows()[0].clue, '夜半信堆沙沙响，小影蹲在邮袋旁。');
  assert.equal(one.rows()[1].clue, '尚未现身');
  assert.equal(one.rows()[7].clue, sealedGoldenGoatClue);
  assert.equal(one.collect('ox'), false);
  assert.equal(one.collect('mouse', new Date(2026, 10, 18)), true);
  assert.equal(one.collect('mouse'), false);
  assert.equal(another.count(), 0);
  assert.equal(createZodiacProgress(['mouse'], storage).rows()[0].date, '2026-11-18');
  assert.equal(data.has(zodiacStorageKey), true);
});

test('even an old save with the other eleven charms stays sealed while the palace is unavailable', () => {
  const ids = ['mouse', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'monkey', 'rooster', 'dog', 'pig'];
  const storage = { getItem: () => JSON.stringify({ collected: Object.fromEntries(ids.map(id => [id, '2026-11-18'])) }),
    setItem: () => { throw new Error('storage is read only'); } };
  const later = createZodiacProgress(['mouse'], storage);
  assert.equal(later.count(), 11);
  assert.equal(later.rows()[7].sealed, true);
  assert.equal(later.collect('goat'), false);
});

test('the Horse is attached to the moving coach and can be picked at a stop or underway', () => {
  for (const underway of [false, true]) {
    let now = Date.UTC(2026, 0, 1);
    const railway = createTownRailway(createTerrainGrid(), () => now);
    const zodiac = createZodiacProgress(['horse']);
    let celebrations = 0;
    const horse = createRailHorseCharm(railway, zodiac, () => celebrations++);
    const anchor = railway.coachCharmAnchor;
    const start = anchor.getWorldPosition(new Vector3());
    const camera = new PerspectiveCamera();
    const coach = anchor.parent!;
    const target = new Vector3();
    function lookUnderBench(side = -.5, row = 1.55) {
      camera.position.copy(coach.localToWorld(new Vector3(side, 2.46, row)));
      camera.lookAt(anchor.getWorldPosition(target));
    }

    lookUnderBench();
    assert.equal(horse.visibleTo(camera), false);
    horse.action.run();
    assert.equal(zodiac.count(), 0);
    assert.ok(railway.board(railway.stops[0].id));
    if (underway) {
      now += (railway.dwellSeconds + 8) * 1_000;
      railway.update(.1);
      assert.ok(anchor.getWorldPosition(new Vector3()).distanceTo(start) > 10);
    }
    assert.equal(railway.atPlatform, !underway);
    coach.updateWorldMatrix(true, true);
    for (const side of [-.5, .5]) for (let row = 0; row < 6; row++) {
      lookUnderBench(side, (row - 2.5) * .62);
      const ray = new Raycaster(camera.position, target.clone().sub(camera.position).normalize());
      assert.equal(ray.intersectObject(coach)[0]?.object, anchor.children[0], `seat ${side}/${row} has a clear view`);
      assert.equal(horse.visibleTo(camera), true);
    }
    camera.lookAt(camera.position.clone().add(new Vector3(0, 1, 0)));
    assert.equal(horse.visibleTo(camera), false);
    lookUnderBench();
    horse.action.run();
    assert.equal(zodiac.rows().find(row => row.id === 'horse')?.location, '环镇列车 · 车厢');
    assert.equal(horse.visibleTo(camera), false);
    horse.action.run();
    assert.equal(celebrations, 1);
    assert.equal(anchor.children[0].visible, false);
  }
});

test('new landmark charms use one low-poly batch, preserve individual pickup saves and never expose Gold Goat', t => {
  const terrain = createTerrainGrid();
  const recordings = new Map<string, string>();
  const storage = {
    getItem: (key: string) => recordings.get(key) ?? null,
    setItem: (key: string, value: string) => { recordings.set(key, value); },
  };
  const ids = ['rabbit', 'dragon', 'pig'] as const;
  const zodiac = createZodiacProgress(ids, storage);
  const celebrations: string[] = [];
  const collection = createTownZodiacSites(zodiac, label => celebrations.push(label));
  assert.equal(collection.mesh.count, 0);
  assert.equal(collection.mesh.geometry.index!.count / 3, 52);

  function overlaps(e: number, n: number, { min, max }: Box) {
    return Math.hypot(Math.max(min[0] - e, e - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27;
  }
  function verifySite(group: Group, site: typeof greenhouseRabbitSite, route: readonly [number, number][]) {
    const { colliders, floors } = readWalkGeometry(group);
    const obstacle = (e: number, n: number, y: number) => [...colliders, ...floors].find(box => overlaps(e, n, box) &&
      y + .025 < box.max[1] && y + 1.775 > box.min[1]);
    const support = (e: number, n: number, old: number) => floors.reduce((height, box) =>
      box.max[1] <= old + .43 && overlaps(e, n, box) ? Math.max(height, box.max[1]) : height, terrain.heightAt(e, n));

    const spot = collection.mount(group, site);
    let feet = site.id === 'dragon' ? spot.ground : terrain.heightAt(group.position.x + route[0][0], -group.position.z - route[0][1]);
    let samples = 0;
    for (let leg = 1; leg < route.length; leg++) {
      const [x0, z0] = route[leg - 1], [x1, z1] = route[leg];
      const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .1);
      for (let i = 1; i <= steps; i++) {
        const x = group.position.x + x0 + (x1 - x0) * i / steps;
        const n = -group.position.z - z0 - (z1 - z0) * i / steps;
        assert.ok(canEnter(x, n), `unwalkable E${x} N${n}`);
        const next = support(x, n, feet);
        assert.ok(Math.abs(next - feet) <= .43 + 1e-9, `non-walkable step at E${x} N${n}, ${feet} -> ${next}`);
        assert.equal(obstacle(x, n, next), undefined, `blocked at E${x} N${n} Y${next}`);
        feet = next;
        samples++;
      }
    }
    for (const radius of [0, site.range / 2, site.range - .005]) for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const east = spot.x + radius * Math.cos(angle), north = spot.n + radius * Math.sin(angle);
      const height = support(east, north, spot.ground);
      assert.equal(obstacle(east, north, height), undefined, `pickup disc blocked at ${east},${north},${height}`);
      assert.equal(nearestTownActivity([spot], east, north, height), spot);
    }

    assert.equal(nearestTownActivity([spot], spot.x, spot.n, feet), spot);
    collection.update(new Vector3(spot.x, feet + 1.62, -spot.n), true);
    assert.equal(collection.mesh.count, 1);
    collection.update(new Vector3(spot.x + 30, feet + 1.62, -spot.n), true);
    assert.equal(collection.mesh.count, 0);
    spot.run();
    spot.run();
    assert.equal(spot.available?.(), false);
    assert.equal(nearestTownActivity([spot], spot.x, spot.n, feet), undefined);
    collection.update(new Vector3(spot.x, feet + 1.62, -spot.n), true);
    assert.equal(collection.mesh.count, 0);
    assert.equal(zodiac.rows().find(row => row.id === site.id)?.date?.length, 10);
    t.diagnostic(`${site.id}: E${spot.x.toFixed(2)} N${spot.n.toFixed(2)} Y${feet.toFixed(3)}, walked ${samples} samples`);
  }

  const greenhousePlot = layout.plots.find(plot => plot.id === 'glasshouse')!;
  const greenhouse = buildLakesideLandmark(greenhousePlot);
  greenhouse.position.set(372, 11, -96);
  verifySite(greenhouse, greenhouseRabbitSite, [[-9, 0], [-1.8, 0], [-1.8, 4.31]]);

  const towerPlot = layout.plots.find(plot => plot.id === 'clocktower')!;
  const tower = buildTowerLandmark(towerPlot);
  tower.position.set(226, 12, -223);
  verifySite(tower, towerDragonSite(tower.userData.stops.lookout), [[0, 1.3], [-.84, 1.28]]);

  const spring = buildHotSpring();
  const [east, north, base] = extensionPlots.find(plot => plot.id === 'hot-spring')!.origin;
  spring.position.set(east, base, -north);
  verifySite(spring, hotSpringPigSite, [[-24, 0], [-8, 0], [-8, -10.97], [-5.40, -10.97]]);
  assert.deepEqual(celebrations, ['兔', '龙', '猪']);
  assert.deepEqual([...recordings.keys()], [zodiacStorageKey]);
  assert.equal(createZodiacProgress(ids, storage).count(), 3);
  assert.equal(createZodiacProgress(ids).count(), 0);
  assert.equal(zodiac.collect('goat'), false);
  assert.equal(zodiac.rows().find(row => row.id === 'goat')?.clue, sealedGoldenGoatClue);
});

test('the workshop crates and existing bench admit the monkey climb continuously', t => {
  const plot = layout.plots.find(item => item.id === 'lantern-workshop')!;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }) }) },
  });
  let workshop: Group;
  try {
    workshop = buildMarketLandmark(plot);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  workshop.position.set(126, 10, -115);
  assert.equal(workshop.rotation.y, -Math.PI / 2);
  const wall = workshop.userData.riddleWall as WorkshopRiddleWall;
  assert.deepEqual(wall.stands, Array.from({ length: 10 }, (_, index) => [-6.75 + index * 1.5, .15, -4.7]));
  wall.update(0, new Set());
  const matrix = new Matrix4();
  const centre = new Vector3();
  const exterior = [
    [-3.70, 4.46, 7.67], [3.70, 4.46, 7.67],
    [-8.95, 4.56, -5.30], [8.95, 4.56, -5.30],
    [-4.22, 4.72, -6.76], [4.22, 4.72, -6.76],
    [-6.20, .759, 6.66], [6.10, .195, 6.62], [6.15, 3.79, 7.90],
  ].map(([x, y, z]) => new Vector3(x, y, z));
  const matched = new Set<Vector3>();
  for (const child of workshop.children) {
    if (!(child instanceof InstancedMesh) || child.geometry.type !== 'BoxGeometry') continue;
    for (let index = 0; index < child.count; index++) {
      child.getMatrixAt(index, matrix);
      centre.setFromMatrixPosition(matrix);
      for (const point of exterior) {
        if (centre.distanceToSquared(point) < 1e-8) matched.add(point);
      }
    }
  }
  assert.equal(matched.size, exterior.length, 'the trim and forecourt details survive with zero active riddles');
  wall.update(6, new Set());

  const terrain = createTerrainGrid();
  const zodiac = createZodiacProgress(['monkey']);
  const batch = createTownZodiacSites(zodiac, () => {});
  const spot = batch.mount(workshop, lanternWorkshopMonkeySite);
  const { colliders, floors } = readWalkGeometry(workshop);
  assert.equal(colliders.length, 47);
  assert.equal(floors.length, 8);
  const forecourtBounds = colliders.slice(-2).map(({ min, max }) =>
    [min, max].map(point => point.map(value => Number(value.toFixed(3)))));
  assert.deepEqual(forecourtBounds, [
    [[119.08, 10.15, -121.40], [119.68, 10.77, -120.80]],
    [[119.08, 10.15, -109.24], [119.68, 10.59, -108.56]],
  ]);
  const obstacles = [...colliders, ...floors];
  const localToWorld = (point: readonly [number, number, number]) => workshop.localToWorld(new Vector3(...point));
  const overlaps = (box: Box, vector: Vector3) =>
    Math.hypot(Math.max(box.min[0] - vector.x, vector.x - box.max[0], 0),
      Math.max(box.min[2] - vector.z, vector.z - box.max[2], 0)) < .27;
  const obstructions = (vector: Vector3) =>
    obstacles.find(box => overlaps(box, vector) && vector.y + .025 < box.max[1] && vector.y + 1.775 > box.min[1]);
  const takeoff = [6.05, .15, -3.66] as const;
  const approach = [[0, .15, 7.8], [0, .15, -3.66], takeoff] as const;
  const position = new Vector3();
  let walkedHeight = 10 + .15;
  for (let i = 1; i < approach.length; i++) {
    const from = localToWorld(approach[i - 1]);
    const to = localToWorld(approach[i]);
    const samples = Math.ceil(from.distanceTo(to) / .1);
    for (let step = 0; step <= samples; step++) {
      position.lerpVectors(from, to, step / samples);
      assert.ok(canEnter(position.x, -position.z));
      const support = floors.reduce((height, box) => box.max[1] <= walkedHeight + .43 && overlaps(box, position)
        ? Math.max(height, box.max[1]) : height, terrain.heightAt(position.x, -position.z));
      assert.ok(Math.abs(support - walkedHeight) <= .43);
      position.y = walkedHeight = support;
      assert.equal(obstructions(position), undefined, `workshop approach ${position.toArray()}`);
    }
  }
  assert.ok(Math.abs(walkedHeight - 10 - takeoff[1]) < 1e-8);
  const steps = [takeoff, ...workshopMonkeySteps];
  let jumpSamples = 0;
  const gravity = 22;
  const speed = Math.sqrt(2 * gravity * 1.255);
  for (let i = 1; i < steps.length; i++) {
    const from = localToWorld(steps[i - 1]);
    const to = localToWorld(steps[i]);
    const lift = to.y - from.y;
    assert.ok(lift > .43 && lift <= .7 + 1e-8);
    const landing = (speed + Math.sqrt(speed ** 2 - 2 * gravity * lift)) / gravity;
    for (let sample = 0; sample <= 60; sample++) {
      const time = sample * landing / 60;
      position.lerpVectors(from, to, Math.min(1, Math.max(0, (time - .16) / .38)));
      position.y = from.y + speed * time - .5 * gravity * time ** 2;
      assert.equal(obstructions(position), undefined, `jump ${i} at ${position.toArray()}`);
      jumpSamples++;
    }
    assert.ok(obstacles.some(box => Math.abs(box.max[1] - to.y) < 1e-8 && overlaps(box, to)));
  }
  assert.equal(nearestTownActivity([spot], spot.x, spot.n, spot.ground - .7), undefined, 'stairs below do not reveal the pickup');
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const point = new Vector3(spot.x + .29 * Math.cos(angle), spot.ground, -spot.n + .29 * Math.sin(angle));
    assert.equal(obstructions(point), undefined);
    assert.equal(nearestTownActivity([spot], point.x, -point.z, point.y), spot);
  }
  spot.run();
  assert.equal(zodiac.rows().find(row => row.id === 'monkey')?.location, '春灯工坊 · 房梁');
  t.diagnostic(`monkey: E${spot.x.toFixed(2)} N${spot.n.toFixed(2)} Y${spot.ground.toFixed(3)}, ${jumpSamples} jump samples`);
});

test('Dragon and Monkey questions reuse the registered lines verbatim', () => {
  const manuscript = readFileSync(new URL('../docs/交流区/Muse/NPC补供稿-小二明信片生肖线索-v1.md', import.meta.url), 'utf8');
  const lines = (animal: string) => manuscript.split(/\r?\n/).filter(line =>
    line.startsWith('- [') && line.includes('线索/' + animal + ' · 专程] ')).map(line => line.split('] ', 2)[1]);
  assert.deepEqual(towerDragonClues, lines('龙'));
  assert.deepEqual(workshopMonkeyClues, lines('猴'));
});
