import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundMainlineTrack, type UndergroundMainlineProfile,
} from '../../src/shared/underground-mainline-track.js';
import { createUndergroundMineCartTrack, undergroundMineCartLocalTrack } from
  '../../src/shared/underground-mine-cart-track.js';

function fixture(): UndergroundMainlineProfile {
  return {
    domainId: 'underground/mine',
    // Test-only made-up straight waypoints. NEVER copy to production coordinate registers.
    waypoints: [0, 24, 48, 72, 96, 120].map(m => ({ east: -100, north: 200 - m, height: -90 })),
    turnoutMetres: 94, gaugeMetres: 1, clearanceRadius: .82,
    faults: { sleepers: 18, gauge: 48, 'turnout-rust': 83 },
    acceptsTrackStep: () => true,
    acceptsWorkFoot: () => true,
  };
}
test('U-19 rejects U-7 two-step fixture and requires 115–125m continuous host-certified corridor', () => {
  const tiny = createUndergroundMineCartTrack(undergroundMineCartLocalTrack);
  assert.ok(tiny.length < 2);
  const f = fixture();
  assert.equal(createUndergroundMainlineTrack(f).length, 120);
  assert.throws(() => createUndergroundMainlineTrack({ ...f, waypoints: f.waypoints.slice(0, 2) }), /complete route/);
  assert.throws(() => createUndergroundMainlineTrack({ ...f,
    waypoints: f.waypoints.slice(0, 3) }), /complete route/);
  assert.throws(() => createUndergroundMainlineTrack({ ...f,
    waypoints: [f.waypoints[0]!, f.waypoints[1]!, f.waypoints[2]!, f.waypoints[3]!] }),
  /120m/);
});

test('U-19 sampled rails and sleepers use the identical ENY and Three yaw along the certified host path', () => {
  const route = createUndergroundMainlineTrack(fixture());
  assert.deepEqual(route.sample(0).position, { east: -100, north: 200, height: -90 });
  assert.deepEqual(route.sample(30).position, { east: -100, north: 170, height: -90 });
  assert.deepEqual(route.sample(120).position, { east: -100, north: 80, height: -90 });
  assert.ok(Math.abs(Math.abs(route.sample(25).heading) - Math.PI) < 1e-12);
  assert.equal(route.work.sleepers.chainage, 18);
  assert.equal(route.work.gauge.chainage, 48);
  assert.equal(route.work['turnout-rust'].chainage, 83);
  assert.equal(route.work.turnout.chainage, 94);
  const sleepers = route.sampleSleepers(.8);
  assert.ok(sleepers.length >= 150);
  assert.deepEqual(sleepers[0].position, route.sample(0).position);
  assert.deepEqual(sleepers[sleepers.length - 1].position, route.sample(120).position);
  assert.ok(sleepers.every(p => Number.isFinite(p.position.east + p.position.north + p.position.height)));
  assert.throws(() => route.sample(121), /outside confirmed/);
  assert.throws(() => route.sample(-1), /outside confirmed/);
});

test('U-19 cannot use fake or unsupported repair feet, missing true work clearance, unsafe slopes or blocked rails', () => {
  const f = fixture();
  assert.throws(() => createUndergroundMainlineTrack({
    ...f, acceptsTrackStep: (_from, to) => to.north >= 180,
  }), /no accepted/);
  assert.throws(() => createUndergroundMainlineTrack({
    ...f, acceptsWorkFoot: kind => kind !== 'turnout',
  }), /not movement-authorized: turnout/);
  assert.throws(() => createUndergroundMainlineTrack({
    ...f, waypoints: f.waypoints.map((p, i) => i === 2 ? { ...p, height: -83 } : p),
  }), /no accepted/);
  assert.throws(() => createUndergroundMainlineTrack({
    ...f, clearanceRadius: .1,
  }), /body clearance/);
  assert.throws(() => createUndergroundMainlineTrack({
    ...f, waypoints: f.waypoints.map((p, i) => i === 3 ? { ...p, north: NaN } : p),
  }), /complete route/);
});

test('U-19 faults are distinct, have positive physical chainage, and must remain within endpoints', () => {
  const f = fixture();
  for (const faults of [
    { sleepers: 18, gauge: 19, 'turnout-rust': 83 },
    { sleepers: -1, gauge: 48, 'turnout-rust': 83 },
    { sleepers: 18, gauge: Infinity, 'turnout-rust': 83 },
    { sleepers: 18, gauge: 48, 'turnout-rust': 119 },
  ]) {
    assert.throws(() => createUndergroundMainlineTrack({ ...f, faults }),
      /three separated|Invalid|fault/i);
  }
  assert.throws(() => createUndergroundMainlineTrack({ ...f, turnoutMetres: 119 }), /120m/);
  assert.throws(() => createUndergroundMainlineTrack({ ...f, turnoutMetres: 6 }), /120m/);
  assert.throws(() => createUndergroundMainlineTrack({ ...f, domainId: '' }), /surveyed mine domain/);
});

test('U-19 a gentle mine curve preserves physical distance while enforcing full body clearance at every segment', () => {
  const f = fixture();
  const waypoints = f.waypoints.map((p, i) => ({ ...p, east: p.east + (i === 2 ? .7 : i === 3 ? .5 : 0) }));
  const route = createUndergroundMainlineTrack({ ...f, waypoints });
  assert.ok(route.length > 120 && route.length < 121);
  const at = route.sample(58);
  assert.ok(at.position.east > -100);
  assert.ok(at.position.east < -99);
  assert.ok(Math.abs(at.grade) < .05);
  assert.throws(() => route.sampleSleepers(.1), /spacing/);
});
