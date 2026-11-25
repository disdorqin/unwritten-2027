import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCarvedStoneRubbing } from '../tools/voxel-tavern/town-blockout/town-carved-stone-rubbing';
import { buildMoundPlanting, moundCentre, moundRadius } from '../tools/voxel-tavern/town-blockout/town-mound-planting';

test('carved stone rubbing: hold to press, grace on release, atlas entry exactly once', () => {
  const rub = createCarvedStoneRubbing({ id: 'c2-carved-stone' });
  assert.equal(rub.frame(1_000, true), undefined);
  assert.ok(Math.abs(rub.progress - 1000 / 2400) < 1e-9);
  rub.frame(500, false); // released inside the grace window: progress holds
  assert.ok(rub.progress > 0);
  rub.frame(900, false); // grace spent: progress fades
  assert.equal(rub.progress, 0);
  rub.frame(2_000, true);
  assert.deepEqual(rub.frame(500, true), { atlasEntry: 'carved-stone' });
  assert.equal(rub.frame(500, true), undefined, 'completion fires once');
});

// A synthetic height authority carrying the RULED mound (centre
// E-120/N196, r21, h7.5 over the -35 floor) — the planting logic is
// proven against the ruling; the measured-surface run repeats the
// same assertions against C2's real authority when it lands.
const floorHeight = -35;
const ruledMound = {
  heightAt(east: number, north: number): number | undefined {
    const d = Math.hypot(east - moundCentre.east, north - moundCentre.north);
    if (d > 60) return floorHeight;
    if (d >= moundRadius) return floorHeight;
    const t = d / moundRadius;
    return floorHeight + 7.5 * (1 - t * t);
  },
};

test('mound planting: 24 slope + 12 summit trees + 3 wind flags, all standing on the surface', () => {
  const { placements, batches } = buildMoundPlanting(ruledMound);
  const trees = placements.filter(p => p.kind === 'charred-tree');
  const slope = placements.filter(p => p.ring === 'slope');
  const summit = placements.filter(p => p.ring === 'summit');
  const flags = placements.filter(p => p.kind === 'wind-flag');
  assert.equal(slope.length, 24);
  assert.equal(summit.length, 12);
  assert.equal(trees.length, 36);
  assert.equal(flags.length, 3);
  assert.equal(batches.length, 2, 'two instanced batches: trees and flags');
  for (const p of placements) {
    assert.equal(p.height, ruledMound.heightAt(p.east, p.north), 'every piece stands on the reported surface');
    assert.ok(Math.hypot(p.east - moundCentre.east, p.north - moundCentre.north) < moundRadius, 'nothing planted off the mound');
  }
  const top = Math.max(...summit.map(p => p.height));
  assert.ok(top > floorHeight + 6, `summit ring stands near the top (got ${top})`);
});
