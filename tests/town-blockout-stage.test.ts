import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { createStageActivity } from '../tools/voxel-tavern/town-blockout/stage-activity.ts';
import { sampleStagePose, stageClock, stageProgram, stageProgramDuration } from '../tools/voxel-tavern/town-blockout/stage-choreography.ts';

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
    if ('isInstancedMesh' in node && node.isInstancedMesh) batches.push(node as InstanceBatch);
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
