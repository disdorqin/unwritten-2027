import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createZa22CloudRoute, createZa22NorthRidgeLine, za22StationApproach } from '../../../../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import { northRidgeMidStation, northRidgeSummit, sampleNorthRidge350 } from '../../../../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

const reference = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const epoch = Date.UTC(2026, 0, 1);
const line = createZa22NorthRidgeLine(26);
const last = line.pointAt(line.length);
const radius = .27;
const bodyHeight = 1.8;
const middleUpMs = 8000 + line.lowerMetres / 5 * 1000;
const middleDownMs = line.legMs + 8000 + (line.length - line.lowerMetres) / 5 * 1000;
const time = (ms: number) => epoch + Math.ceil(ms);
for (const middleStart of [middleUpMs, middleDownMs]) {
  assert.notEqual(line.timeline(time(middleStart - 1), 0).station, 'middle');
  assert.equal(line.timeline(time(middleStart + 5_000), 0).station, 'middle');
  assert.notEqual(line.timeline(time(middleStart + 10_001), 0).station, 'middle');
  assert.equal(line.timeline(time(middleStart + 5_000), 0).boarding, undefined);
}
const carLaneSeparation = Math.abs(line.timeline(time(20_000), 0).at.east - line.timeline(time(line.legMs + 20_000), 1).at.east);
assert.ok(Math.abs(carLaneSeparation - 3.1) < .001);
const boardMessages: { title: string; detail: string }[] = [];
const transfers: { terminal: string; at: { east: number; north: number; height: number } }[] = [];
let now = time(500);
const cloud = createZa22CloudRoute({
  now: () => now,
  enterOrExit(terminal, at) { transfers.push({ terminal, at }); },
  view(title, detail) { boardMessages.push({ title, detail }); },
});
const baseLabel = cloud.action(za22StationApproach)?.label;
assert.equal(baseLabel, '乘缆车一线前往云海台');
cloud.action(za22StationApproach)?.run();
cloud.update(za22StationApproach);
assert.equal(cloud.riding(), true);
now = time(middleUpMs + 5000);
cloud.update(za22StationApproach);
const middleRiding = cloud.riding();
const middleAction = cloud.action({ ...northRidgeMidStation })?.label ?? null;
assert.equal(middleRiding, true);
assert.equal(middleAction, null);
assert.equal(transfers.length, 0);
now = time(line.legMs);
cloud.update(za22StationApproach);
assert.deepEqual(transfers, [{ terminal: 'summit', at: last }]);
const floor = (east: number, north: number) => cloud.surfaceAt(east, north, radius) ?? null;
const points = [
  ['顶站落点', 336, 640], ['东行脚道', 336, 654], ['横路换向', 336, 663.25],
  ['门前转入', 300, 663.25], ['山门南缘', 300, 665.9], ['山门北缘', 300, 666.12],
  ['山门班次牌站位', 307.25, 683], ['台中心', 320, 650], ['台东沿', 352, 650],
  ['盘山道上口', 312, 628], ['南向滑翔锚', 320, 634], ['星港坪近侧', 327, 657],
  ['星港坪装配互动', 324, 655], ['现役起飞线中点', 309.75, 662],
] as const;
const anchors = points.map(([name, east, north]) => ({
  name, east, north, terrain: sampleNorthRidge350(east, north), floor: floor(east, north),
}));
const path = [[336, 640], [336, 663.25], [300, 663.25], [300, 666.12], [300, 683], [307.25, 683]] as const;
let previous: [number, number] = [336, 640];
let samples = 0;
let maxHeightStep = 0;
for (const [leg, [toE, toN]] of path.slice(1).entries()) {
  const [fromE, fromN] = path[leg]!;
  const count = Math.ceil(Math.hypot(toE - fromE, toN - fromN) / .10);
  for (let i = 1; i <= count; i++) {
    const east = fromE + (toE - fromE) * i / count;
    const north = fromN + (toN - fromN) * i / count;
    const height = floor(east, north);
    assert.notEqual(height, null, `Missing support at ${east}/${north}`);
    assert.equal(cloud.acceptsStep(previous[0], previous[1], east, north, radius), true);
    assert.equal(cloud.blocked(east, north, height!, radius, bodyHeight), false);
    maxHeightStep = Math.max(maxHeightStep, Math.abs(height! - floor(previous[0], previous[1])!));
    previous = [east, north];
    samples++;
  }
}

let terrainSamples = 0;
let supported = 0;
let nonblocked = 0;
let minTerrain = Infinity;
let maxTerrain = -Infinity;
for (let north = 618.5; north < 682; north++) {
  for (let east = 288.5; east < 352; east++) {
    const ground = sampleNorthRidge350(east, north);
    const surface = floor(east, north);
    minTerrain = Math.min(minTerrain, ground);
    maxTerrain = Math.max(maxTerrain, ground);
    terrainSamples++;
    if (surface === null) continue;
    supported++;
    if (!cloud.blocked(east, north, surface, radius, bodyHeight)) nonblocked++;
  }
}

const gateBoard = cloud.action({ east: 307.25, north: 683, height: 347 });
assert.equal(gateBoard?.label, '查看山门班次');
gateBoard?.run();
assert.equal(boardMessages[0]?.title, '山门班次与登记');
assert.doesNotMatch(JSON.stringify(boardMessages), /版本|更新|未开放|敬请期待/);
assert.equal(cloud.acceptsStep(301.72, 665.9, 301.72, 666.12, radius), true);
assert.equal(cloud.acceptsStep(301.74, 665.9, 301.74, 666.12, radius), false);
const mounted = cloud.assembly()?.mountedParts();
const objects: string[] = [];
cloud.front()?.traverse(object => { if (object.name) objects.push(object.name); });
const existingStarportAction = cloud.action({ east: 324, north: 655, height: 347 })?.label;
const returnLabel = cloud.action(last)?.label;
assert.equal(returnLabel, '乘缆车一线返回山脚站');
cloud.action(last)?.run();
cloud.update(last);
assert.equal(cloud.riding(), true);
now = time(2 * line.legMs);
cloud.update(last);
assert.deepEqual(transfers, [{ terminal: 'summit', at: last }, { terminal: 'base', at: za22StationApproach }]);
assert.equal(cloud.assembly(), undefined);

console.log(JSON.stringify({
  reference,
  stations: [line.pointAt(0), line.pointAt(line.lowerMetres), last],
  line: { lowerMetres: line.lowerMetres, upperMetres: line.length - line.lowerMetres, length: line.length,
    travelWithMidStopSeconds: (line.legMs - 8000) / 1000, endDwellSeconds: 8, legSeconds: line.legMs / 1000,
    middleDwellSeconds: 10, middleRiding, middleAction,
    middleUpStartSeconds: middleUpMs / 1000, middleDownStartSeconds: (middleDownMs - line.legMs) / 1000, carLaneSeparation },
  baseLabel, returnLabel, transfers, mounted, existingStarportAction, objects,
  gate: { boardLabel: gateBoard?.label, boardMessages, clearHalfWidthLimit: 1.73, radius },
  platform: { ...northRidgeSummit, terrainSamples, supported, nonblocked, minTerrain, maxTerrain },
  anchors, path: { points: path, samples, maxHeightStep },
}, null, 2));
