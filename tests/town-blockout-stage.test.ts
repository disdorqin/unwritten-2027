import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { createStageActivity } from '../tools/voxel-tavern/town-blockout/stage-activity.ts';
import { sampleStagePose, stageClock, stageProgram, stageProgramDuration } from '../tools/voxel-tavern/town-blockout/stage-choreography.ts';
import { theaterPhotoPositions } from '../tools/voxel-tavern/town-blockout/community-theater.ts';
import { buildVillageLandmark } from '../tools/voxel-tavern/town-blockout/landmark-village.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { inPlazaPhotoStand } from '../src/presence/plaza-photo.ts';

test('the stage front tread gives a direct route onto a single deck', () => {
  const plot = layout.plots.find(({ id }) => id === 'stage')!;
  const [east, north, elevation] = plot.origin;
  const stage = buildVillageLandmark(plot);
  stage.position.set(east, elevation, -north);
  const floors = readWalkGeometry(stage).floors.filter(floor => floor.min[2] >= -north - 7);
  assert.equal(floors.length, 2);

  const centerlineFloors = new Set<number>();
  for (let northAt = plot.connect[1]; northAt >= north; northAt -= .1) {
    const height = Math.max(elevation, ...floors
      .filter(({ min, max }) => east >= min[0] && east <= max[0] && -northAt >= min[2] && -northAt <= max[2])
      .map(({ max }) => max[1]));
    centerlineFloors.add(height - elevation);
  }
  assert.deepEqual([...centerlineFloors].map(height => Math.round(height * 100)), [0, 28, 52]);
});

test('the south theater joins four photo tiers to two ramps without expanding photo eligibility', () => {
  const current = layout.plots.find(({ id }) => id === 'stage')!;
  const stage = buildVillageLandmark({ ...current, origin: [238, 140, 12] });
  stage.position.set(238, 12, -140);
  const { floors, ramps, colliders } = readWalkGeometry(stage);
  const columns = colliders.filter(({ min, max }) => min[1] === 12.5 &&
    Math.abs(max[1] - 19.3) < .01 && Math.abs(max[0] - min[0] - .92) < .01 &&
    Math.abs(max[2] - min[2] - .86) < .01);
  assert.equal(columns.length, 6);
  const front = columns.filter(({ min, max }) => Math.abs((min[2] + max[2]) / 2 + 144.7) < .01)
    .sort((one, two) => one.min[0] - two.min[0]);
  assert.equal(front.length, 4);
  assert.deepEqual(front.map(({ min, max }) => Math.round(((min[0] + max[0]) / 2 - 238) * 100)),
    [-852, -300, 300, 852]);
  const [left, innerLeft, innerRight, right] = front;
  assert.ok(Math.abs(right.min[0] - left.max[0] - 16.12) < .01);
  assert.ok(Math.abs(innerRight.min[0] - innerLeft.max[0] - 5.08) < .01);
  assert.ok(left.min[0] >= 229 && right.max[0] <= 247);
  const rear = columns.filter(({ min, max }) => Math.abs((min[2] + max[2]) / 2 + 134.4) < .01);
  assert.deepEqual(rear.map(({ min, max }) => Math.round(((min[0] + max[0]) / 2 - 238) * 100)).sort((a, b) => a - b),
    [-750, 750]);
  const tiers = floors.filter(floor => floor.min[0] === 213.6 && floor.max[0] === 234.4);
  assert.deepEqual(tiers.map(({ min, max }) => [min[2], max[2], max[1]]), [
    [-162.875, -162, 12.35],
    [-163.75, -162.875, 12.7],
    [-164.625, -163.75, 13.05],
    [-165.5, -164.625, 13.4],
  ]);
  assert.equal(theaterPhotoPositions.length, 48);
  for (const [index, photo] of theaterPhotoPositions.entries()) {
    const row = Math.floor(index / 12);
    const column = index % 12;
    assert.equal(Math.round(photo.east * 100), 21696 + column * 128);
    assert.equal(photo.north, 162.4375 + row * .875);
    assert.equal(photo.height, tiers[row].max[1]);
    assert.ok(inPlazaPhotoStand(photo.east, photo.north, photo.height));
    assert.ok(theaterPhotoPositions.slice(index + 1).every(other =>
      Math.hypot(other.east - photo.east, other.north - photo.north) > .54));
  }
  for (const x of [213.6, 234.4]) {
    for (const { min, max } of tiers) {
      assert.equal(inPlazaPhotoStand(x, -(min[2] + max[2]) / 2, max[1]), false);
    }
  }
  assert.deepEqual(ramps, [
    { min: [204.8, 12, -165.5], max: [216, 13.4, -164.1], axis: 'x', ascending: 1 },
    { min: [232, 12, -165.5], max: [243.2, 13.4, -164.1], axis: 'x', ascending: -1 },
  ]);
  for (const [west, east] of [[215.75, 216], [232, 232.25]]) {
    assert.ok(floors.some(({ min, max }) =>
      min[0] === west && max[0] === east && min[2] === -165.5 && max[2] === -164.625 && max[1] === 13.4));
  }
});

test('five-minute stage repeat uses continuous formations, closing bow and two prop intervals', () => {
  assert.deepEqual(stageProgram.map(({ id }) => id), ['opening', 'duet', 'solo', 'props', 'finale']);
  assert.equal(stageProgramDuration, 300);
  assert.deepEqual(stageProgram.filter(act => act.guest).map(act => act.id), ['opening', 'finale']);
  assert.equal(stageProgram[0].start, 0);
  for (let i = 1; i < stageProgram.length; i++) assert.equal(stageProgram[i].start, stageProgram[i - 1].end);
  assert.equal(stageProgram.at(-1)!.end, stageProgramDuration);
  assert.equal(stageClock(stageProgramDuration + 3), 3);

  for (const actor of [0, 1, 2, 3]) {
    const first = sampleStagePose(0, actor);
    const last = sampleStagePose(stageProgramDuration, actor);
    for (const property of Object.keys(first) as (keyof typeof first)[]) {
      assert.ok(Math.abs(first[property] - last[property]) < .0001);
    }
    for (const reducedMotion of [false, true]) {
      let previous = sampleStagePose(0, actor, reducedMotion);
      for (let frame = 1; frame <= stageProgramDuration * 30; frame++) {
        const now = sampleStagePose(frame / 30, actor, reducedMotion);
        assert.ok(Math.abs(now.x) < 6 && Math.abs(now.z) < 3 && now.y >= .52);
        assert.ok(Math.hypot(now.x - previous.x, now.y - previous.y, now.z - previous.z) < .10);
        for (const joint of ['heading', 'tilt', 'armLift', 'leftReach', 'rightReach', 'swing', 'stride'] as const) {
          assert.ok(Math.abs(now[joint] - previous[joint]) < .11);
        }
        previous = now;
      }
    }
  }

  assert.equal(sampleStagePose(0, 0).z, sampleStagePose(0, 3).z);
  assert.ok(sampleStagePose(40, 0).z - sampleStagePose(40, 2).z > 2);
  assert.ok(Math.abs(sampleStagePose(140, 1).x) < .3 && sampleStagePose(140, 1).z < -2.3);
  assert.ok(sampleStagePose(254, 1).z - sampleStagePose(254, 3).z > 4);
  assert.ok(sampleStagePose(90, 1).leftReach > sampleStagePose(90, 1).rightReach);
  assert.ok(sampleStagePose(90, 2).rightReach > sampleStagePose(90, 2).leftReach);
  assert.ok(sampleStagePose(140, 1).rightReach > sampleStagePose(140, 0).rightReach * 5);
  assert.equal(sampleStagePose(185, 1).prop, 1);
  assert.equal(sampleStagePose(223, 1).prop, 0);
  assert.ok(sampleStagePose(292, 0).tilt < -.5);
});

test('stage retains the viewer activity contract and guest toggles leave the clock running', () => {
  type StageNode = TownActivityContext['scene']['children'][number];
  type InstanceBatch = StageNode & { count: number; instanceMatrix: { array: Float32Array } };
  const roots: StageNode[] = [];
  const scene = { add(node: StageNode) { roots.push(node); } } as TownActivityContext['scene'];
  const announcements: string[] = [];
  const show = createStageActivity({
    scene, announce(message) { announcements.push(message); },
    open() { throw new Error('stage playback does not require a modal'); },
    sit() {}, face() {},
  });
  const batches: InstanceBatch[] = [];
  assert.equal(roots.length, 1);
  roots[0].traverse(node => {
    assert.notEqual(node.type, 'PointLight');
    if ('isInstancedMesh' in node && node.isInstancedMesh && 'instanceMatrix' in node) batches.push(node as InstanceBatch);
  });
  assert.equal(batches.length, 2);
  const [performers, lights] = batches;
  const baseTroupeSize = performers.count;
  assert.ok(baseTroupeSize >= 220);
  assert.ok(baseTroupeSize * 12 < 4000);

  const [audience, applause, guest] = show.spots;
  assert.equal(audience.label, '开启雪灯演出');
  assert.equal(guest.available!(), false);
  audience.run();
  assert.equal(show.start(), false);
  assert.deepEqual(show.getShowState(), { time: 0, act: 'opening', playing: true, joined: false });
  applause.run();
  const originalPose = performers.instanceMatrix.array.slice(0, 16);
  show.update!(8.25);
  assert.notDeepEqual(performers.instanceMatrix.array.slice(0, 16), originalPose);

  assert.equal(guest.available!(), true);
  guest.run();
  assert.equal(show.getShowState().time, 8.25);
  show.update!(1.25);
  assert.ok(performers.count > baseTroupeSize);
  assert.equal(show.getShowState().joined, true);
  guest.run();
  assert.equal(show.getShowState().time, 9.5);
  show.update!(1.5);
  assert.equal(performers.count, baseTroupeSize);
  assert.equal(show.getShowState().joined, false);

  show.update!(51);
  assert.equal(show.getShowState().act, 'duet');
  assert.equal(guest.available!(), false);
  guest.run();
  assert.equal(show.getShowState().joined, false);
  show.update!(76);
  assert.equal(show.getShowState().act, 'solo');
  assert.equal(lights.count, 20);
  applause.run();
  show.update!(.25);
  assert.equal(lights.count, 24);
  show.update!(22.75);
  assert.equal(show.getShowState().act, 'props');
  show.update!(68);
  assert.equal(show.getShowState().act, 'finale');
  assert.equal(guest.available!(), true);
  guest.run();
  show.update!(74);
  assert.deepEqual(show.getShowState(), { time: 3, act: 'opening', playing: true, joined: true });
  assert.ok(announcements.some(line => line.includes('第五幕')));
});

test('New Year Eve slots reuse the manual show and stop near-stage-only animation on departure', () => {
  type StageNode = TownActivityContext['scene']['children'][number];
  type InstanceBatch = StageNode & { count: number; instanceMatrix: { array: Float32Array; version: number } };
  const makeStage = () => {
    const roots: StageNode[] = [];
    const batches: InstanceBatch[] = [];
    const announcements: string[] = [];
    const scene = { add(root: StageNode) { roots.push(root); } } as TownActivityContext['scene'];
    const activity = createStageActivity({
      scene, announce(message) { announcements.push(message); },
      open() { throw new Error('scheduled playback does not require a modal'); },
      sit() {}, face() { throw new Error('scheduled playback must not move the camera'); },
    });
    for (const root of roots) root.traverse(node => {
      if ('isInstancedMesh' in node && node.isInstancedMesh && 'instanceMatrix' in node) batches.push(node as InstanceBatch);
    });
    return { activity, batches, announcements };
  };
  const [east, north] = layout.plots.find(({ id }) => id === 'stage')!.origin;
  const { activity, batches, announcements } = makeStage();
  const near = (now: number) => activity.syncCeremony(now, east, north);

  near(new Date(2026, 11, 30, 20).getTime());
  assert.equal(activity.getShowState().playing, false);
  for (const hour of [20, 21, 22, 23]) {
    const slot = new Date(2026, 11, 31, hour).getTime();
    near(slot - 1);
    assert.equal(activity.getShowState().playing, false);
    near(slot);
    assert.deepEqual(activity.getShowState(), { time: 0, act: 'opening', playing: true, joined: false });
    near(slot + 300_000);
    activity.update!(1 / 60);
    assert.equal(activity.getShowState().playing, false);
  }
  near(new Date(2027, 0, 1).getTime());
  assert.equal(activity.getShowState().playing, false);
  assert.equal(announcements.length, 4);

  const slot = new Date(2026, 11, 31, 21).getTime();
  near(slot + 140_000);
  activity.update!(1 / 60);
  assert.deepEqual(activity.getShowState(), { time: 140, act: 'solo', playing: true, joined: false });
  assert.equal(announcements.length, 4);
  assert.equal(activity.start(), false);

  const manual = makeStage();
  manual.activity.start();
  manual.activity.update!(140);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches.map(batch => batch.count), manual.batches.map(batch => batch.count));
  for (const [index, batch] of batches.entries()) {
    assert.deepEqual(batch.instanceMatrix.array, manual.batches[index].instanceMatrix.array);
  }

  const poseVersions = batches.map(batch => batch.instanceMatrix.version);
  activity.syncCeremony(slot + 145_000, east + 73, north);
  activity.update!(1);
  assert.equal(activity.getShowState().playing, false);
  assert.deepEqual(batches.map(batch => batch.instanceMatrix.version), poseVersions);

  manual.activity.syncCeremony(slot + 145_000, east, north);
  manual.activity.update!(1);
  assert.equal(manual.activity.getShowState().time, 145);
  manual.activity.syncCeremony(slot + 300_000, east, north);
  manual.activity.update!(1);
  assert.equal(manual.activity.getShowState().time, 141);
});
