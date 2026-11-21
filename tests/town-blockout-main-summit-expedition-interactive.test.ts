import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitTrail } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { mountMainSummitExpeditionSites } from '../tools/voxel-tavern/town-blockout/main-summit-expedition-sites';
import { mountSummitExpeditionPlaques, summitExpeditionPlaqueCopy } from '../tools/voxel-tavern/town-blockout/main-summit-expedition-plaques';
import { mountSummitExpeditionDynamics } from '../tools/voxel-tavern/town-blockout/main-summit-expedition-dynamics';
import { createSummitExpeditionActivities, summitExpeditionActivityScript } from '../tools/voxel-tavern/town-blockout/main-summit-expedition-activities';

function fixture(t: { after: (dispose: () => void) => void }) {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  t.after(block.dispose);
  const trail = createMainSummitTrail(block.heightAt, 347);
  const owner = new Group();
  const art = mountMainSummitExpeditionSites(owner, block.heightAt, trail.points);
  t.after(art.dispose);
  const dynamics = mountSummitExpeditionDynamics(owner, art.sites);
  t.after(dynamics.dispose);
  const plaques = mountSummitExpeditionPlaques(owner, art.sites);
  t.after(plaques.dispose);
  const stations = [...art.sites, { id: 'expedition-cable-machine-room',
    kind: 'machine-hall' as const, east: -21, north: 7, height: 347, yaw: Math.PI/2,
    trail: { east: 0, north: 7, height: 347 }, distanceToTrail: 21 }];
  const activities = createSummitExpeditionActivities(stations);
  return { art, dynamics, plaques, activities, stations, block };
}

test('R4/R5: all six new story signs are physically instantiated with finalized copy and solid supports', t => {
  const { plaques, art } = fixture(t);
  assert.equal(plaques.plaques.length, 6);
  assert.ok(art.familyCounts.bronze > 0 && art.familyCounts.tile > 0 && art.familyCounts.cloth > 0);
  for (const copy of Object.values(summitExpeditionPlaqueCopy)) {
    assert.equal(copy.length, 4);
    assert.ok(copy.every(line => line.length >= 4 && !line.includes('待定') &&
      !line.includes('TODO') && !line.includes('占位')));
  }
  for (const plaque of plaques.plaques) {
    assert.ok(Number.isFinite(plaque.east) && Number.isFinite(plaque.height));
    assert.ok(plaques.group.getObjectByName(plaque.id + '-plaque'));
    assert.ok(plaques.group.getObjectByName(plaque.id + '-authored-words'));
    assert.ok(plaque.lines.every(s => s.trim().length > 2));
  }
  assert.equal(plaques.hasRealTextures, false, 'Node fixture has no canvas; native Chrome test proves text textures');
});

test('R6: only authorized in-range V/L/E interactions change a physical fire, puzzle, peg or flag', t => {
  const { stations, dynamics, activities } = fixture(t);
  assert.deepEqual(dynamics.visuals, {
    movingStarFragments: 3, hearthLogs: 6, ropeAnchors: 6,
    mechanicalInspectionMarks: 2, yearStampCount: 1,
  });
  const active = stations.filter(site => ['shelter','observatory','icefall','summit-flag','machine-hall'].includes(site.kind));
  assert.equal(active.length, 6);
  for (const site of active) {
    const args = { siteId: site.id, action: 'touch' as const, player: {
      east: site.east, north: site.north, height: site.height,
    }, authorized: true };
    const original = activities.snapshot()[site.id]!;
    assert.deepEqual(activities.interact({ ...args, authorized: false }),
      { accepted: false, reason: 'not-authorized' });
    assert.deepEqual(activities.interact({ ...args, player: { east: site.east + 1000,
      north: site.north, height: site.height } }), { accepted: false, reason: 'out-of-reach' });
    assert.equal(activities.snapshot()[site.id]!.touches, original.touches);
    for (const action of ['view','listen'] as const) {
      const decision = activities.interact({ ...args, action });
      assert.equal(decision.accepted, true);
      assert.equal(decision.action, action);
      assert.ok(decision.copy.length > 4);
    }
    assert.equal(activities.snapshot()[site.id]!.touches, 0,
      'Observing or listening must not itself complete a gameplay touch');
    let count = 0;
    const script = summitExpeditionActivityScript[site.kind as keyof typeof summitExpeditionActivityScript];
    for (const expected of script.steps) {
      const receipt = activities.interact(args);
      assert.equal(receipt.accepted, true);
      count++;
      assert.equal(receipt.progress, count);
      assert.equal(receipt.copy, expected);
      assert.equal(dynamics.apply(site.id, receipt.progress), true);
      assert.equal(dynamics.snapshot()[site.id]!.touched, count);
      assert.equal(dynamics.snapshot()[site.id]!.appearanceChanged, true);
    }
    assert.equal(activities.snapshot()[site.id]!.complete, true);
    assert.equal(dynamics.apply(site.id, 0), false,
      'A lower or replayed receipt cannot rewind already accepted physical props');
    const duplicate = activities.interact(args);
    assert.equal(duplicate.accepted, true);
    assert.equal(duplicate.progress, count,
      'Completed story point is idempotent rather than awarding repeated touches');
  }
  assert.equal(dynamics.apply('unknown', 1), false);
  assert.equal(dynamics.apply('expedition-watch-ruins', 10000), true);
});

test('R3: graded shelter stairs are physically supported and walkable to the actual threshold', t => {
  const { art } = fixture(t);
  for (const site of art.sites.filter(s => s.kind === 'shelter' || s.kind === 'icefall')) {
    const at = (z: number) => {
      const east = site.east + Math.sin(site.yaw) * z;
      const north = site.north - Math.cos(site.yaw) * z;
      return { east, north };
    };
    const floor = art.surfaceAt(site.east, site.north);
    assert.ok(floor !== undefined);
    const points = [2.95, 3.13, 3.4, 3.82, 4.24];
    let last = floor;
    for (const z of points) {
      const here = at(z);
      const next = art.surfaceAt(here.east, here.north);
      assert.ok(next !== undefined, 'Stair platform is missing physical foot support at z=' + z);
      assert.ok(Math.abs(next - last) <= .44,
        'Impossible jump in shelter stair surface at z=' + z + ': ' + next + ' from ' + last);
      assert.equal(art.blocked(here.east, here.north, next, .27, 1.8), false);
      last = next;
    }
  }
});
