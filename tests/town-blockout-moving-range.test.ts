import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, Scene, Vector3, type InstancedMesh } from 'three';
import { createSnowPracticeTarget, snowPracticeStand, snowPracticeTarget } from '../tools/voxel-tavern/town-blockout/town-snow-target';
import { createTownSnowballFight, type SnowballEvent } from '../tools/voxel-tavern/town-blockout/town-snowball';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { roadCorridorKeepClear } from '../tools/voxel-tavern/town-blockout/road-clearance';
import { ceremonyEdgeLandings, ceremonyMainLandings } from '../src/presence/ceremony-arrival';

const { heightAt } = createTerrainGrid();
const [east, north] = snowPracticeTarget;
const [standEast, standNorth] = snowPracticeStand;
const ground = heightAt(east, north);
const cells = { colliders: [], floors: [] };

function setup() {
  const scene = new Scene();
  let clock = 0;
  const status: string[] = [];
  const notices: string[] = [];
  const targetActivity = createSnowPracticeTarget(scene, heightAt, {
    now: () => clock,
    status: text => status.push(text),
    announce: text => notices.push(text),
  });
  const [target] = targetActivity.snowballTargets;
  const [spot] = targetActivity.spots;
  const hit = createSnowballSweep({
    targets: targetActivity.snowballTargets,
    geometryAt: () => cells,
    occupiedAt: () => false,
    surfaceHeight: heightAt,
  });
  return {
    scene, clock: (time: number) => { clock = time; }, status, notices, targetActivity, target, spot, hit,
  };
}

test('the moving snowman shares one mesh, a registered hit box and its normal walking collision', t => {
  const { scene, clock, targetActivity, target, spot, hit } = setup();
  const model = scene.getObjectByName('town-snow-practice-target') as InstancedMesh;

  assert.equal(target.id, 'snow-practice');
  assert.equal(target.shape, 'box');
  assert.deepEqual([spot.x, spot.n, spot.ground], [standEast, standNorth, 12]);
  assert.equal(scene.children.length, 1);
  assert.equal(model.isInstancedMesh, true);
  assert.equal(model.count, 22);
  assert.equal(model.count * model.geometry.index!.count / 3, 264);

  spot.run();
  clock(1250);
  targetActivity.updateRound();
  assert.ok(Math.abs(target.x - (east + target.radius * 2)) < 1e-9);
  assert.equal(model.position.x + east, target.x);
  assert.equal(target.y, 12);
  assert.equal(targetActivity.blocked?.(target.x, north, ground), true);
  assert.equal(targetActivity.blocked?.(east, north, ground), false);
  const through = (x: number) => hit(new Vector3(x, ground + 1, -standNorth),
    new Vector3(x, ground + 1, -north - 1), .115, 'local');
  assert.equal(through(east), undefined);
  assert.equal(through(target.x)?.targetId, target.id);

  let min: number = east;
  let max: number = east;
  let clearance = Infinity;
  const landings = [...ceremonyMainLandings, ...ceremonyEdgeLandings];
  for (let time = 1250; time < 60_000; time += 10) {
    clock(time);
    targetActivity.updateRound();
    min = Math.min(min, target.x);
    max = Math.max(max, target.x);
    assert.equal(target.y, ground);
    assert.equal(roadCorridorKeepClear(target.x, north, .85), false);
    for (const slot of landings) {
      clearance = Math.min(clearance, Math.hypot(target.x - slot.east, north - slot.north));
    }
  }
  assert.ok(clearance > .85 + .27);
  t.diagnostic(`靶中心 E${min.toFixed(2)}–${max.toFixed(2)}/N${north}/Y${ground}，最近仪式点 ${clearance.toFixed(3)} m，1 组实例 / 264 tris`);
});

test('a 60s trial counts each owned hit once against the existing snowball step and resets to practice', t => {
  const { scene, clock, targetActivity, target, spot, hit, status, notices } = setup();
  let time = 0;
  let lastImpact: SnowballEvent | undefined;
  const game = createTownSnowballFight({
    scene,
    sweep: (from, to, radius, thrower) => hit(from, to, radius, thrower),
    onEvent(event) {
      if (event.type === 'impact') lastImpact = event;
      targetActivity.onSnowballEvent(event);
    },
  });
  const spawn = (offset = 0) => new Vector3(target.x + offset, ground + 1, -north + 1);
  const toward = new Vector3(0, 0, -1);
  function advance(frames: number) {
    for (let i = 0; i < frames; i++) {
      clock(time += 1000 / 60);
      targetActivity.updateRound();
      game.update(1 / 60);
    }
  }

  game.gather(5);
  assert.equal(game.throwBall(spawn(), toward, 'local', 1), true);
  spot.run();
  assert.equal(spot.available?.(), false);
  assert.match(status.at(-1)!, /60 秒 · 命中 0/);
  advance(18);
  assert.equal(lastImpact?.type === 'impact' && lastImpact.targetId, target.id);
  assert.match(status.at(-1)!, /命中 0/);

  assert.equal(game.throwBall(spawn(), toward, 'local', 1), true);
  advance(18);
  assert.equal(lastImpact?.type === 'impact' && lastImpact.targetId, target.id);
  assert.match(status.at(-1)!, /命中 1/);
  targetActivity.onSnowballEvent(lastImpact!);
  assert.match(status.at(-1)!, /命中 1/);

  assert.equal(game.throwNpc(spawn(), toward, 'npc:fixture', 1), true);
  assert.equal(game.throwBall(spawn(3), toward, 'local', 1), true);
  advance(18);
  assert.match(status.at(-1)!, /命中 1/);
  clock(time = 59_999);
  targetActivity.updateRound();
  assert.match(status.at(-1)!, /1 秒 · 命中 1/);

  assert.equal(game.throwBall(spawn(), toward, 'local', 1), true);
  clock(60_000);
  game.update(1 / 60);
  assert.equal(lastImpact?.type === 'impact' && lastImpact.targetId, target.id);
  targetActivity.updateRound();
  targetActivity.updateRound();
  assert.deepEqual(notices, ['移动靶结算 · 命中 1']);
  assert.equal(status.at(-1), '');
  assert.equal(spot.available?.(), true);
  assert.deepEqual([target.x, target.z], [east, -north]);

  spot.run();
  assert.match(status.at(-1)!, /60 秒 · 命中 0/);
  t.diagnostic('阈值 59,999 ms 仍在局内 / 60,000 ms 只结算一次；旧球、重复事件、NPC、偏离靶点及超时命中均 0 分');
  game.dispose();
});

test('the standing snowman keeps its original hit box and rebound between rounds', () => {
  const { scene, clock, targetActivity, target, hit, spot } = setup();
  const model = scene.getObjectByName('town-snow-practice-target') as InstancedMesh;
  const rest = new Matrix4();
  const rebound = new Matrix4();
  const settled = new Matrix4();
  model.getMatrixAt(0, rest);

  assert.deepEqual([target.x, target.y, target.z, target.radius, target.height], [east, 12, -north, .58, 2.35]);
  assert.equal(targetActivity.blocked?.(east, north, ground), true);
  const contact = hit(new Vector3(east, ground + 1, -standNorth), new Vector3(east, ground + 1, -north - 1), .115, 'local');
  assert.equal(contact?.targetId, target.id);
  target.onHit(1, 0);
  targetActivity.update?.(.17);
  model.getMatrixAt(0, rebound);
  assert.notDeepEqual(rebound.elements, rest.elements);
  targetActivity.update?.(.17);
  model.getMatrixAt(0, settled);
  assert.deepEqual(settled.elements, rest.elements);

  spot.run();
  clock(1250);
  targetActivity.updateRound();
  clock(60_000);
  targetActivity.updateRound();
  assert.deepEqual([target.x, target.y, target.z], [east, 12, -north]);
  assert.equal(model.position.x, 0);
  assert.equal(targetActivity.blocked?.(east, north, ground), true);
});
