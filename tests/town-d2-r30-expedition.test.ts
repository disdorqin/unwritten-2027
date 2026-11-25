import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createTownD2R30Expedition } from '../tools/voxel-tavern/town-blockout/town-d2-r30-expedition';
import { summitPassportSites } from '../src/presence/summit-passport-authority';
import { summitSledGateCount, summitSledLineLengthM } from '../tools/voxel-tavern/town-blockout/town-summit-sled-line';
import { surveyTownD2R30SledGates } from '../tools/voxel-tavern/town-blockout/town-d2-r30-sled-gate-support';

function cleanup<T extends { dispose(): void }>(context: TestContext, value: T): T {
  context.after(() => value.dispose());
  return value;
}

test('R6: every summit-domain waypoint stands on the real R30 terrain', context => {
  const expedition = cleanup(context, createTownD2R30Expedition());
  const nodes = expedition.nodes();
  assert.equal(nodes.length, 8);
  const summitNodes = nodes.filter(node => node.domain === 'summit');
  assert.equal(summitNodes.length, 7);
  for (const node of summitNodes) {
    assert.equal(node.status, 'grounded', `${node.id} must land on the R30 solid terrain`);
    assert.ok(node.ground !== undefined && Math.abs(node.delta!) < 1.5);
  }
  const cloud = nodes.find(node => node.id === 'cloud-stamp')!;
  assert.equal(cloud.domain, 'cloud-deck');
  assert.equal(cloud.status, 'external-domain', 'front-ridge stamp is audited by window D, not R30');
  // Canonical passport anchors are consumed, never re-invented.
  const sites = summitPassportSites(347);
  assert.equal(cloud.east, sites['cloud-stamp'].east);
  assert.equal(expedition.node('register-summit')!.east, sites['register-summit'].east);
});

test('R6: visits need the right place, height and domain; repeats are idempotent', context => {
  const expedition = cleanup(context, createTownD2R30Expedition());
  expedition.advance(100);
  const gate = expedition.node('gate')!;
  // Too far away.
  assert.equal(expedition.visit('gate', { east: gate.east + 20, north: gate.north, height: gate.height }), false);
  // Right spot, wrong height (an invisible platform cannot satisfy this).
  assert.equal(expedition.visit('gate', { east: gate.east, north: gate.north, height: gate.height + 30 }), false);
  // Wrong domain for a summit node.
  assert.equal(expedition.visit('gate', { east: gate.east, north: gate.north, height: gate.height, area: 'cloud-deck' }), false);
  let snapshot = expedition.snapshot();
  assert.equal(snapshot.visited.length, 0);
  // The domain mismatch is rejected before any position event is logged.
  assert.equal(snapshot.events.filter(e => e.type === 'out-of-reach').length, 2);

  assert.equal(expedition.visit('gate', { east: gate.east, north: gate.north, height: gate.height, area: 'summit' }), true);
  expedition.advance(200);
  assert.equal(expedition.visit('gate', { east: gate.east + .2, north: gate.north, height: gate.height }), true);
  snapshot = expedition.snapshot();
  assert.deepEqual([...snapshot.visited], ['gate']);
  assert.equal(snapshot.events.filter(e => e.type === 'visit').length, 1);
  assert.equal(snapshot.events.filter(e => e.type === 'repeat').length, 1);
  assert.equal(snapshot.events.find(e => e.type === 'visit')!.at, 100);
});

test('R6: full traversal completes once and reset restarts the expedition', context => {
  const expedition = cleanup(context, createTownD2R30Expedition());
  for (const node of expedition.nodes()) {
    expedition.advance(expedition.snapshot().events.length * 10 + 10);
    assert.equal(expedition.visit(node.id, {
      east: node.east, north: node.north, height: node.height,
      area: node.domain,
    }), true, `${node.id} should be visitable`);
  }
  let snapshot = expedition.snapshot();
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.progress, 1);
  assert.equal(snapshot.events.filter(e => e.type === 'complete').length, 1);
  expedition.reset();
  snapshot = expedition.snapshot();
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.visited.length, 0);
  assert.equal(snapshot.events.length, 0);
});

test('R6: sled rules are driven by canonical R30 gates, not reimplemented', context => {
  const expedition = cleanup(context, createTownD2R30Expedition());
  const surveyed = surveyTownD2R30SledGates(347);
  assert.equal(surveyed.length, summitSledGateCount);
  // Feed a straight crossing of all 12 gates in order at increasing times.
  expedition.armSled();
  for (let gate = 0; gate < surveyed.length; gate++) {
    const g = surveyed[gate]!;
    expedition.advance((gate + 1) * 1000);
    expedition.sledStep({ east: g.east - 5, north: g.north });
    expedition.sledStep({ east: g.east + 5, north: g.north });
  }
  const sled = expedition.snapshot().sled;
  assert.equal(sled.gatesPassed, summitSledGateCount);
  assert.equal(sled.finished, true);
  assert.equal(sled.running, false);
  assert.ok(summitSledLineLengthM > 6000);
});

test('R6: injected gate reports and terrain are honored; inputs and lifecycle are safe', context => {
  const gates = surveyTownD2R30SledGates(347).map((g, index) => ({
    gate: index + 1, east: g.east, north: g.north, height: g.height,
    ground: g.height, delta: 0, status: 'grounded' as const,
  }));
  const expedition = cleanup(context, createTownD2R30Expedition({ sledGates: gates }));
  assert.throws(() => createTownD2R30Expedition({ arrivalHeight: 400 }), /surveyed cloud-deck/i);
  assert.throws(() => expedition.advance(NaN), /finite|monotonic/i);
  assert.equal(expedition.visit('unknown' as never, { east: 0, north: 0, height: 0 }), false);
  expedition.dispose();
  assert.throws(() => expedition.advance(1), /disposed/i);
  assert.throws(() => expedition.visit('gate', { east: 0, north: -10, height: 347 }), /disposed/i);
});
