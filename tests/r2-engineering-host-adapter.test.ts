import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createR2EngineeringCandidate } from '../tools/voxel-tavern/r2-engineering/candidate';
import { createR2HostAdapter, r2SledFootRadius } from '../tools/voxel-tavern/r2-engineering/host-adapter';
import { rollR2EngineeringCandidate } from '../tools/voxel-tavern/r2-engineering/survey';
import { createSledRide } from '../tools/voxel-tavern/town-blockout/sled-ride';

type PortName = 'entry' | 'exit';
type Position = { east: number; north: number; height: number };

const candidate = createR2EngineeringCandidate();
const adapter = createR2HostAdapter(candidate);
const effects = { snow() {}, stopped() {} };
const runoutGrade = .127;
const foot = ({ east, north, height }: Position) => ({ x: east, n: north, y: height });

function coordinate(port: PortName, along: number, lateral = 0) {
  const anchor = port === 'entry' ? adapter.track.entrance : adapter.track.exit;
  const east = Math.cos(anchor.headingFromEast), north = Math.sin(anchor.headingFromEast);
  return { east: anchor.east + east * along - north * lateral,
    north: anchor.north + north * along + east * lateral, height: anchor.height - along * runoutGrade };
}

// Stand-in for the first 1.5 m of a future surveyed host, geometrically isolated from production.
function fixturePort(port: PortName, grade = runoutGrade) {
  const anchor = port === 'entry' ? adapter.track.entrance : adapter.track.exit;
  const de = Math.cos(anchor.headingFromEast), dn = Math.sin(anchor.headingFromEast);
  return {
    surfaceAt(east: number, north: number, radius: number) {
      assert.equal(radius, .36);
      const along = (east - anchor.east) * de + (north - anchor.north) * dn;
      if ((port === 'entry' ? -along : along) < -1e-6) return;
      return anchor.height - along * grade;
    },
    permitsTransfer: () => true,
  };
}

test('R2 SledWorld exposes the surveyed .36 m support corridor and omits isolated runout', () => {
  assert.equal(r2SledFootRadius, .36);
  assert.ok(Math.abs(adapter.halfNetWidth * 2 - 3.48) < 1e-10);
  const world = adapter.sledWorld({}, effects);
  for (const edge of [-1.74, 1.74]) {
    const inside = candidate.pointsAt(candidate.gate.metres, edge);
    assert.ok(Math.abs(adapter.supportAt(inside.east, inside.north)! - inside.height) < .001);
    assert.equal(world.blocked(inside.east, inside.north, inside.height), false);
    const outside = candidate.pointsAt(candidate.gate.metres, edge + Math.sign(edge) * .005);
    assert.equal(adapter.supportAt(outside.east, outside.north), undefined);
    assert.ok(Number.isNaN(world.height(outside.east, outside.north)));
    assert.equal(world.blocked(outside.east, outside.north, outside.height), true);
  }
  assert.equal(world.height(440, 520), 140);
  assert.ok(Math.abs(world.height(320, 270) - 18) < 1e-10);
  assert.ok(Number.isNaN(world.height(320, 269)));
  assert.ok(Number.isNaN(world.height(NaN, 270)));
});

test('R2 transitions require a grounded downhill sweep, both measured supports and a host grant', () => {
  const host = { entry: fixturePort('entry'), exit: fixturePort('exit') };
  const seen: Array<{ port: PortName; lateral: number }> = [];
  const world = adapter.sledWorld({
    entry: { ...host.entry, permitsTransfer: transfer => { seen.push(transfer); return true; } },
    exit: { ...host.exit, permitsTransfer: transfer => { seen.push(transfer); return true; } },
  }, effects);
  const outsideEntry = foot(coordinate('entry', -.4, .5));
  const insideEntry = foot(candidate.pointsAt(.4, .5));
  const insideExit = foot(candidate.pointsAt(candidate.track.horizontalMetres - .4, -.5));
  const outsideExit = foot(coordinate('exit', .4, -.5));

  assert.equal(world.canTraverse(outsideEntry, insideEntry), true);
  assert.equal(world.canTraverse(insideExit, outsideExit), true);
  assert.equal(world.canTraverse(insideEntry, outsideEntry), false);
  assert.equal(world.canTraverse(outsideExit, insideExit), false);
  assert.equal(world.canTraverse({ ...insideExit, y: insideExit.y + .1 }, outsideExit), false);
  assert.equal(world.canTraverse(insideExit, { ...outsideExit, y: NaN }), false);
  assert.equal(world.canTraverse(outsideEntry, outsideExit), false);
  assert.deepEqual(seen.map(item => item.port), ['entry', 'exit']);
  assert.ok(Math.abs(seen[0]!.lateral - .5) < .001 && Math.abs(seen[1]!.lateral + .5) < .001);
  const exit = adapter.crossing(insideExit, outsideExit);
  assert.ok(exit && exit.downhill && exit.port === 'exit');
  assert.ok(Math.abs(exit.point.height - 18) < 1e-10);
  assert.equal(exit.point.north, 270);
  assert.ok(Math.abs(exit.tangent.east) < 1e-12 && exit.tangent.north === -1 && exit.grade < 0);

  const denied = adapter.sledWorld({ exit: { ...host.exit, permitsTransfer: () => false } }, effects);
  assert.equal(denied.canTraverse(insideExit, outsideExit), false);
  const obstructed = adapter.sledWorld({ exit: { ...host.exit, blocked: () => true } }, effects);
  assert.equal(obstructed.canTraverse(insideExit, outsideExit), false);
  for (const surfaceAt of [() => 25, () => undefined, fixturePort('exit', -.1).surfaceAt, fixturePort('exit', .5).surfaceAt]) {
    const noSupport = adapter.sledWorld({ exit: { surfaceAt, permitsTransfer: () => true } }, effects);
    assert.ok(Number.isNaN(noSupport.height(outsideExit.x, outsideExit.n)));
    assert.equal(noSupport.canTraverse(insideExit, outsideExit), false);
  }
});

test('R2 port survey records the official seam, downhill probe and asymmetric clearance without granting entry', () => {
  const survey = adapter.surveyPort('exit', {
    ...fixturePort('exit'),
    blocked: ({ x }, radius) => {
      assert.equal(radius, .36);
      return x < 320 || x > 321;
    },
    permitsTransfer: () => assert.fail('A survey must not request a host grant'),
  });
  assert.equal(survey.collisionChecked, true);
  assert.equal(survey.samples.length, 71);
  assert.ok(survey.spacing < .05);
  const middle = survey.samples[35]!;
  assert.equal(middle.seam.east, 320);
  assert.equal(middle.seam.north, 270);
  assert.ok(Math.abs(middle.seam.height - 18) < 1e-10);
  assert.equal(middle.seamHeight, middle.seam.height);
  assert.equal(middle.probe.north, 268.5);
  assert.ok(Math.abs(middle.drop! - .1905) < 1e-10 && middle.clear);
  assert.deepEqual(survey.bands, [{ minimum: 0, maximum: survey.samples[55]!.lateral }]);
  assert.equal(survey.samples[34]!.blocked, true);

  const memorial = adapter.surveyPort('exit', { ...fixturePort('exit'), surfaceAt: () => 30.65 });
  assert.equal(memorial.collisionChecked, false);
  assert.deepEqual(memorial.bands, []);
  assert.equal(memorial.samples[35]!.seamHeight, 30.65);
  assert.equal(memorial.samples[35]!.probe.height, 30.65);
  assert.equal(memorial.samples[35]!.clear, false);
  const missing = adapter.surveyPort('entry', { ...fixturePort('entry'), surfaceAt: () => undefined });
  assert.deepEqual(missing.bands, []);
  assert.deepEqual(missing.samples[35]!.seam, { east: 440, north: 520, height: 140 });
  assert.equal(missing.samples[35]!.seamHeight, undefined);
});

test('R2 parked sled reachability shares the one-way hinge without recording a crash', () => {
  let contacts = 0;
  const world = adapter.sledWorld({}, { ...effects, onGateImpact() { contacts++; } });
  for (const offset of [-1.73, 0, 1.73]) {
    const parked = foot(candidate.pointsAt(candidate.gate.metres - .8, offset));
    const sameSide = foot(candidate.pointsAt(candidate.gate.metres - 1.2, offset));
    const downhillSide = foot(candidate.pointsAt(candidate.gate.metres + .8, offset));
    assert.equal(world.canReachParked(sameSide, parked), true);
    assert.equal(world.canReachParked(downhillSide, parked), false);
    assert.equal(world.canReachParked(parked, downhillSide), true);
  }
  assert.equal(contacts, 0);
});

test('actual stock ride runs the R2 hinge downhill and rejects swept uphill approach at both rails', () => {
  let contacts = 0;
  const world = adapter.sledWorld({ exit: fixturePort('exit') }, { ...effects, onGateImpact() { contacts++; } });
  const driven = rollR2EngineeringCandidate({ ...candidate, createRide: () => createSledRide(world) });
  assert.ok(driven.gateCrossingFrame && driven.gateCrossingFrame < driven.frames && driven.active);
  assert.ok(driven.finish.north < 270 && driven.finishPosition!.metres > candidate.track.horizontalMetres);
  assert.equal(driven.airborneFrames, 0);
  assert.equal(driven.greatestRise, 0);
  assert.equal(contacts, 0);

  for (const offset of [-1.73, 0, 1.73]) {
    const ride = createSledRide(world);
    const start = candidate.pointsAt(candidate.gate.metres + 3, offset);
    assert.ok(ride.mount(start.east, start.north, start.height, start.yaw + Math.PI));
    const before = contacts;
    for (let frame = 0; frame < 300; frame++) ride.step(1 / 60, { forward: 1, turn: 0 });
    const position = candidate.locate(ride.spot.x, ride.spot.n)!;
    assert.ok(contacts > before);
    assert.ok(position.metres >= candidate.gate.metres + r2SledFootRadius);
    assert.ok(position.metres < candidate.gate.metres + r2SledFootRadius + .01);
  }
});
