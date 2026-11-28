import assert from 'node:assert/strict';
import test from 'node:test';
import { createC2EastCanonicalGround } from '../tools/voxel-tavern/town-blockout/town-night-c2-summit-canonical.ts';
import { auditC2Traversal } from '../tools/voxel-tavern/town-blockout/town-night-c2-traversal.ts';

const heightAt = createC2EastCanonicalGround().heightAt;
const audit = auditC2Traversal(heightAt);

test('the 1692-station walk is collision-free in both directions', () => {
  assert.equal(audit.walk.length, 2);
  for (const leg of audit.walk) {
    assert.equal(leg.id, 'c2-east-summit-trail');
    assert.equal(leg.stations, 1692);
    assert.equal(leg.blocked, 0, `${leg.direction} still has blockers`);
    assert.equal(leg.pass, true);
    assert.ok(leg.maxStep > 0 && leg.maxStep < 2, 'real stone steps are bounded');
  }
  assert.deepEqual(audit.walk.map(l => l.direction), ['forward', 'return']);
});

test('the authored sled chute is rideable downhill and collision-free', () => {
  assert.equal(audit.sled.id, 'c2-east-sled-chute');
  assert.ok(audit.sled.stations >= 178);
  assert.equal(audit.sled.blocked, 0);
  assert.ok(audit.sled.minGrade < -0.15, `chute is too flat: ${audit.sled.minGrade}`);
  assert.ok(audit.sled.maxGrade < 0, 'chute must descend the whole way');
  assert.equal(audit.sled.pass, true);
});

test('front ascent and the 347 m seam stay fail-closed until D2/A certify', () => {
  assert.equal(audit.frontAscent.productionMount, false);
  assert.ok(audit.frontAscent.maxCut > 8 || audit.frontAscent.maxFill > 8,
    'delta must still be visibly outside the production tolerance');
  assert.ok(audit.frontAscent.metres > 2000);
  assert.equal(audit.frontSeam.gateInitiallyOpen, false);
  assert.equal(audit.frontSeam.contact.east, 300);
  assert.equal(audit.frontSeam.contact.north, 666.5);
  assert.equal(audit.frontSeam.contact.height, 347);
});

test('the F-facing manifest has stable IDs, bounds, owners and motion classes', () => {
  assert.equal(audit.assets.length, 8);
  for (const asset of audit.assets) {
    assert.equal(asset.owner, 'C2');
    assert.equal(asset.motion, 'static');
    assert.equal(asset.revision, 'C33-3');
    assert.equal(asset.batches, 1);
    assert.equal(asset.lights, 0);
    assert.ok(asset.pieces > 0);
    assert.ok(asset.bounds.west < asset.bounds.east && asset.bounds.south < asset.bounds.north);
    assert.ok(Number.isFinite(asset.bounds.bottom) && Number.isFinite(asset.bounds.top));
  }
  const ids = audit.segments.map(s => s.id);
  assert.deepEqual(ids, [
    'c2-east-summit-trail', 'c2-east-sled-chute', 'c2-front-midstation-to-terrace',
    'c2-front-seam-663-to-666', 'c2-road-middle-east-upper', 'c2-road-lower-east-service',
    'c2-road-middle-south-exit', 'c2-road-rear-connector',
  ]);
  for (const segment of audit.segments) {
    assert.equal(segment.owner, 'C2');
    assert.equal(segment.revision, 'C33-3');
    assert.ok(segment.width > 0 && segment.metres > 0);
    assert.ok(segment.bounds.west <= segment.bounds.east);
    assert.ok(Number.isFinite(segment.from.height) && Number.isFinite(segment.to.height));
    assert.ok(Math.hypot(segment.tangentFrom.east, segment.tangentFrom.north) > .99);
    assert.ok(Math.hypot(segment.tangentTo.east, segment.tangentTo.north) > .99);
  }
  const byId = new Map(audit.segments.map(s => [s.id, s]));
  assert.equal(byId.get('c2-east-summit-trail')!.status, 'open');
  assert.equal(byId.get('c2-east-sled-chute')!.status, 'open');
  assert.equal(byId.get('c2-front-midstation-to-terrace')!.status, 'candidate');
  assert.equal(byId.get('c2-front-seam-663-to-666')!.motion, 'gated');
  assert.equal(byId.get('c2-road-rear-connector')!.status, 'authored-centreline-only');
  // Front-sector handoffs belong to the 18..347 m ridge field. Sampling the
  // summit 8 m surface here previously produced phantom 500 m endpoints.
  for (const segment of audit.segments.filter(s => s.domain === 'front')) {
    assert.ok(segment.from.height < 400 && segment.to.height < 400,
      `${segment.id} leaked a summit height into the front handoff`);
  }
});

test('the audit is deterministic across repeated mounts', () => {
  const again = auditC2Traversal(heightAt);
  assert.deepEqual(again.walk, audit.walk);
  assert.deepEqual(again.sled, audit.sled);
  assert.deepEqual(again.segments, audit.segments);
});
