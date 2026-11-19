import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { Group, type Mesh } from 'three';
import { createMainSummitCable, summitCableSpec, type SummitCablePoint } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { mountMainSummitCableStations } from '../tools/voxel-tavern/town-blockout/main-summit-cable-stations';

const arrivalHeight = 347;
const p1Path = '../tools/voxel-tavern/town-blockout/main-summit-block.ts';
const terrainFixture = existsSync(new URL(p1Path, import.meta.url)) ? await import(p1Path) : undefined;
const fixtureRequired = { skip: terrainFixture ? false : 'Compose audited P-1 as in the P-4/P-7 workflow.' };

function setup() {
  if (!terrainFixture) throw new Error('P-1 terrain fixture is missing.');
  const { createMainSummitBlock, mainSummitLayout } = terrainFixture;
  const owner = new Group();
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  const cable = createMainSummitCable(0, 10_000, arrivalHeight);
  const facilities = mountMainSummitCableStations(owner, cable, block);
  return { owner, block, cable, facilities, dispose() { facilities.dispose(); block.dispose(); } };
}

function samplePath(path: readonly SummitCablePoint[], maxStep = .05) {
  const samples = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    const count = Math.ceil(Math.hypot(to.east - from.east, to.north - from.north) / maxStep);
    for (let k = 1; k <= count; k++) {
      const t = k / count;
      samples.push({ east: from.east + (to.east - from.east) * t, north: from.north + (to.north - from.north) * t,
        height: from.height + (to.height - from.height) * t });
    }
  }
  return samples;
}

function assertWalkable(facilities: ReturnType<typeof mountMainSummitCableStations>, path: readonly SummitCablePoint[]) {
  for (const { east, north, height } of samplePath(path)) {
    for (const [offsetE, offsetN] of [[0, 0], [.27, 0], [-.27, 0], [0, .27], [0, -.27]]) {
      const actual = facilities.heightAt(east + offsetE!, north + offsetN!);
      assert.ok(Math.abs((actual ?? Infinity) - height) <= .025, `Floor support at [${east}, ${north}, ${height}]: ${actual}`);
    }
    assert.equal(facilities.blocked(east, north, height), false, `Standing capsule blocked at [${east}, ${north}, ${height}]`);
  }
}

test('P-7 both stations allow walking from outside through the hall to both surveyed boarding approaches', fixtureRequired, () => {
  const { cable, facilities, dispose } = setup();
  try {
    for (const name of ['cloud-deck', 'summit'] as const) {
      const station = facilities.stations[name];
      assert.ok(station.group.getObjectByName('flush-oak-waiting-room-floor'));
      assert.ok(station.group.getObjectByName('sloped-slate-roof'));
      assert.equal(station.group.children.filter(object => object.name === 'waiting-bench-oak-seat').length, 2);
      for (const [index, route] of station.routes.entries()) {
        assert.deepEqual({ approach: route.approach, board: route.board }, cable.ropes[index]!.dock(name));
        assertWalkable(facilities, route.path);
        // P-2 supplies the moving cabin collision and boarding state for this final strip.
        assertWalkable(facilities, [route.approach, route.board]);
        assertWalkable(facilities, [...route.path].reverse());
      }
      const { east, south, north } = station.bounds;
      assert.equal(facilities.blocked(east - .12, south + 1, station.hall.height), true);
      assert.equal(facilities.blocked(east - .12, north - 1, station.hall.height), true);
    }
  } finally { dispose(); }
});

test('P-7 mount shares the audited P-1 gate and connects its apron, guardroom and lower station', fixtureRequired, () => {
  const { facilities, dispose } = setup();
  try {
    assert.deepEqual(facilities.gate.from, { east: 0, north: -14, height: 347 });
    assert.deepEqual(facilities.gate.to, { east: 0, north: 20, height: 347 });
    assert.ok(facilities.group.getObjectByName('main-summit-gate'));
    assert.ok(facilities.group.getObjectByName('gate-registration-counter'));
    assertWalkable(facilities, facilities.gate.route);
    assertWalkable(facilities, [...facilities.gate.route].reverse());
    assertWalkable(facilities, facilities.gate.guardroom);
    assertWalkable(facilities, facilities.gate.stationWalk);
    assert.equal(facilities.blocked(2.2, -5, arrivalHeight), true);
    assert.equal(facilities.blocked(-2.2, -5, arrivalHeight), true);
    assert.equal(facilities.heightAt(8, -14), undefined);
  } finally { dispose(); }
});

test('P-7 waiting room solids and roof overhangs clear the moving terminal cabins', fixtureRequired, () => {
  const { cable, facilities, dispose } = setup();
  try {
    for (const rope of cable.ropes) {
      for (const end of [0, rope.totalMetres]) {
        const facility = end === 0 ? facilities.stations['cloud-deck'] : facilities.stations.summit;
        const height = facility.hall.height;
        for (let offset = 0; offset <= 20; offset += .25) {
          const pose = rope.sample(end === 0 ? offset : end - offset);
          const heading = pose.heading;
          const floor = pose.height - summitCableSpec.cabinFloorBelowRope;
          // With the roof eave low enough to matter at the cable height, its western edge is also checked.
          for (const x of [-summitCableSpec.cabinHalfWidth, 0, summitCableSpec.cabinHalfWidth]) {
            for (const z of [-summitCableSpec.cabinHalfLength, 0, summitCableSpec.cabinHalfLength]) {
              const e = pose.east + x * Math.cos(heading) + z * Math.sin(heading);
              const n = pose.north - x * Math.sin(heading) + z * Math.cos(heading);
              assert.equal(facilities.blocked(e, n, floor), false);
              if (pose.height - .2 < height + 4.7 && pose.height > height + 2.9) {
                assert.ok(e < facility.bounds.west - .58 || n < facility.bounds.south - .54 || n > facility.bounds.north + .54);
              }
            }
          }
        }
      }
    }
  } finally { dispose(); }
});

test('P-7 rejects mismatched P-1 arrival datum and disposes newly mounted geometry only once', fixtureRequired, () => {
  if (!terrainFixture) throw new Error('P-1 terrain fixture is missing.');
  const { createMainSummitBlock, mainSummitLayout } = terrainFixture;
  const { owner, block, facilities, dispose } = setup();
  try {
    assert.throws(() => mountMainSummitCableStations(owner, createMainSummitCable(0, 10_000, 350), block), /arrival datum/);
    const roof = facilities.stations.summit.group.getObjectByName('sloped-slate-roof') as Mesh;
    let disposed = 0;
    roof.geometry.addEventListener('dispose', () => { disposed++ });
    facilities.dispose();
    facilities.dispose();
    assert.equal(disposed, 1);
    assert.equal(owner.children.length, 0);
    assert.equal(block.heightAt(0, 0), 347);
  } finally { dispose(); }
});
