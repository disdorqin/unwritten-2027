import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Scene, Vector3 } from 'three';
import { CAPTURE_MS, POINT_RADIUS, WALL_BLOCK_HP } from '../src/presence/snowfight';
import { createFortressAssault, fortressBattleMs } from '../tools/voxel-tavern/town-blockout/town-fortress-assault';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world';

const gate = { gx: 260, gy: 376, layers: 4, sealsBell: true } as const;
const side = { gx: 261, gy: 376, layers: 1 } as const;
const bell = { east: 130.25, north: 189.25 };
const blueprint = { walls: [gate, side], bell };

function fixture() {
  const scene = new Scene();
  let now = 0;
  const activity = createFortressAssault({ scene, heightAt: () => 12, canEnter: () => true, now: () => now });
  const wallMesh = scene.children[0] as InstancedMesh;
  return {
    ...activity,
    advance(ms: number, position?: typeof bell) {
      now += ms;
      activity.update(position);
    },
    traceGate() {
      const sweep = createSnowballSweep({
        targets: activity.targets(), surfaceHeight: () => 12,
        geometryAt: () => ({ colliders: [], floors: [] }), occupiedAt: () => false,
      });
      const result = sweep(new Vector3(130.25, 12.25, -186.25), new Vector3(130.25, 12.25, -190.25), .08);
      assert.equal(result?.kind, 'target');
      const candidate = activity.targets().find(target => target.id === result?.targetId);
      assert.equal(candidate?.id, 'fortress-wall:260:376:0');
      candidate!.onHit(0, -1);
    },
    wallMesh,
  };
}

test('real snowball sweep collapses the protected four-block stack and enables the timed bell', t => {
  const run = fixture();
  assert.ok(run.start(blueprint));
  assert.equal(run.wallMesh.count, 5);
  assert.equal(run.wallMesh.geometry.index!.count / 3 * run.wallMesh.count, 60);
  assert.equal(run.targets().length, 5);
  assert.deepEqual(run.colliders()[0], { min: [130, 12, -188.5], max: [130.5, 12.5, -188] });
  const blocksGate = () => run.colliders().some(({ min, max }) =>
    130.25 > min[0] && 130.25 < max[0] && -188.25 > min[2] && -188.25 < max[2] &&
    12 < max[1] && 13.78 > min[1]);
  assert.equal(blocksGate(), true);
  run.advance(CAPTURE_MS, bell);
  assert.equal(run.state().captureMs, 0);
  run.traceGate();
  run.traceGate();
  assert.equal(run.wallMesh.count, 5);
  run.traceGate();
  assert.equal(WALL_BLOCK_HP, 3);
  assert.equal(run.wallMesh.count, 1);
  assert.equal(run.colliders().length, 1);
  assert.equal(blocksGate(), false);
  run.advance(0, bell);
  run.advance(CAPTURE_MS - 1, bell);
  assert.equal(run.state().captureMs, 4_999);
  assert.equal(run.state().result, undefined);
  run.advance(1, bell);
  assert.deepEqual(run.state().result, { reason: 'captured', elapsedMs: 10_000, wallHits: 3, destroyed: 4 });
  assert.equal(run.wallMesh.count, 0);
  assert.equal(run.wallMesh.visible, false);
  assert.equal(run.colliders().length, 0);
  t.diagnostic('five initial blocks / one instance batch / 60 triangles; 3 hits collapsed 4 blocks and opened the physical gate; 4999 ms pending; 5000 ms captured');
});

test('leaving the live capture circle resets hold and deadline remains six minutes', t => {
  const run = fixture();
  assert.ok(run.start(blueprint));
  for (let i = 0; i < WALL_BLOCK_HP; i++) run.traceGate();
  run.advance(0, bell);
  run.advance(2_000, bell);
  assert.equal(run.state().captureMs, 2_000);
  run.advance(1, { east: bell.east + POINT_RADIUS + .01, north: bell.north });
  assert.equal(run.state().captureMs, 0);
  run.advance(fortressBattleMs - 2_002, bell);
  assert.equal(run.state().remainingMs, 1);
  run.advance(1, bell);
  assert.deepEqual(run.state().result, { reason: 'timeout', elapsedMs: 360_000, wallHits: 3, destroyed: 4 });
  assert.ok(run.start(blueprint));
  assert.equal(run.state().remainingMs, 360_000);
  assert.equal(run.state().blocks, 5);
  t.diagnostic('capture left at 2000 ms reset to 0; alive at 359999 ms; timeout at 360000 ms; restart rebuilt 5 blocks');
});

test('invalid blueprints leave the world clear and sled smash preserves the current one-layer gate', t => {
  const run = fixture();
  const blockedRoad = { gx: 322, gy: 404, layers: 1, sealsBell: true };
  assert.equal(run.start({ walls: [blockedRoad], bell }), false);
  assert.equal(run.start({ walls: [gate, gate], bell }), false);
  assert.equal(run.start({ walls: [side], bell }), false);
  assert.equal(run.start({ walls: [{ ...gate, layers: 5 }], bell }), false);
  assert.equal(run.wallMesh.count, 0);
  assert.ok(run.start(blueprint));
  assert.equal(run.smash(gate.gx, gate.gy, 12), false);
  assert.equal(run.smash(side.gx, side.gy, 6), false);
  assert.equal(run.smash(side.gx, side.gy, 20.01), false);
  assert.equal(run.smash(side.gx, side.gy, 10), true);
  assert.equal(run.state().blocks, 4);
  t.diagnostic('6 m/s rejected; 10 m/s clears one-layer wall; 12 m/s does not clear 4 layers; 20.01 m/s preserves old cap');
});
