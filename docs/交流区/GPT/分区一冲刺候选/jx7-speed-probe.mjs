import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checkout = path.resolve(process.argv[2] ?? '.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
const entry = file => import(pathToFileURL(path.join(checkout, file)).href);
const townAsset = asset => entry('tools/voxel-tavern/town-blockout/' + asset + '.ts');

const [
  { createSledMotion, sledMaximumSpeed, sledSoftSpeed },
  { createTerrainGrid, canEnter, worldBounds },
  { sampleNorthRidge350 },
  { longHallSledRoute },
  { sledWallImpact, sledWallMaximumReportSpeed, sledWallReportSpeed },
] = await Promise.all([
  townAsset('sled-motion'), townAsset('terrain'), townAsset('north-ridge-350-terrain'),
  townAsset('sled-route'), entry('src/presence/snowfight.ts'),
]);

const sprint = 11.3; // viewer.ts sprint anchor
const tick = 1 / 120;
const snow = { grade: 0, surface: 0, deepSnow: false };
function runSlope(grade, target) {
  const motion = createSledMotion();
  let peak = 0;
  let distance = 0;
  for (let step = 0; step < 60 / tick; step++) {
    const { speed } = motion.step(tick, { forward: 1, turn: 0 }, { ...snow, grade: -grade });
    peak = Math.max(peak, speed);
    distance += speed * tick;
  }
  const terminal = motion.state.speed;
  assert.ok(terminal <= sledMaximumSpeed + 1e-9 && peak <= sledMaximumSpeed + 1e-9);
  return { slopePercent: grade * 100, target, terminal, delta: terminal - target, peak, distance };
}

function runDrift(initial) {
  const motion = createSledMotion();
  motion.reset(0, initial);
  let peakSlipDegrees = 0;
  for (let step = 0; step < 120; step++) {
    const state = motion.step(tick, { forward: -1, turn: 1 }, { ...snow, grade: -.2 });
    peakSlipDegrees = Math.max(peakSlipDegrees, Math.abs(state.slipAngle) * 180 / Math.PI);
    assert.ok(state.speed <= sledMaximumSpeed + 1e-9);
  }
  return { initial, slopePercent: 20, peakSlipDegrees, finalSpeed: motion.state.speed };
}

const grid = createTerrainGrid();
const anchors = [
  { label: 'R2 模型起点', east: 440, north: 520 },
  { label: '山脚南轴', east: 320, north: 270 },
  { label: '前山顶站参考', east: 336, north: 640 },
].map(point => ({ ...point, releaseCanEnter: canEnter(point.east, point.north),
  releaseYClamped: grid.heightAt(point.east, point.north),
  northRidge350Y: sampleNorthRidge350(point.east, point.north) }));

const terminals = [[0, 2], [.1, 2], [.2, 3], [.3, 4]].map(([grade, multiplier]) => runSlope(grade, multiplier * sprint));
const drift = [3, 4].map(multiplier => runDrift(multiplier * sprint));
const wall = [7.99, 8, 15, 22, 22.01, 45, 45.2, 47].map(speed => {
  const byte = sledWallReportSpeed(speed);
  return { speed, byte, allowedByUpperBound: byte <= sledWallMaximumReportSpeed,
    layersBeforeServerValidation: sledWallImpact(byte).layers };
});
assert.equal(sledMaximumSpeed, 45.2);
assert.equal(sledWallMaximumReportSpeed, 46);
assert.equal(anchors[2].releaseCanEnter, false);
console.log(JSON.stringify({
  sha, model: { hz: 120, seconds: 60, surface: 'normal snow', sprint, sledSoftSpeed, sledMaximumSpeed },
  terminals, drift, wall, sledWallMaximumReportSpeed, worldBounds, anchors,
  existingLongHallRoute: { points: longHallSledRoute.length, maxNorth: Math.max(...longHallSledRoute.map(point => point[1])) },
}, null, 2));
