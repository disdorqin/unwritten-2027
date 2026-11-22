import assert from 'node:assert/strict';
import test from 'node:test';

// AW-5/AW-6: district housing blocks by built walls, not whole lots; wide plaza
// props block by outline for players while placement keeps the legacy circles.
const gradient = () => ({ addColorStop() {} });
const context = { createRadialGradient: gradient, createLinearGradient: gradient, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, translate() {}, rotate() {}, measureText() { return { width: 1 }; } };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context, width: 0, height: 0 }) } });
const { Group } = await import('three');
const terrain = await import('../tools/voxel-tavern/town-blockout/terrain.ts');
const { addDistrictHousing } = await import('../tools/voxel-tavern/town-blockout/district-layout.ts');
const { addScenery } = await import('../tools/voxel-tavern/town-blockout/scenery.ts');

const grid = terrain.createTerrainGrid();
const districts = addDistrictHousing(new Group(), grid, () => false, () => false);

const footprint = (site: (typeof districts.sites)[number]) =>
  Math.abs(Math.sin(site.angle)) > .5 ? { ...site, w: site.d, d: site.w } : site;
const oldBlocked = (x: number, n: number) => districts.sites.some(site => {
  const fp = footprint(site);
  return Math.abs(x - fp.x) < fp.w / 2 + .27 && Math.abs(n - fp.n) < fp.d / 2 + .27;
});

test('AW-5 placement is unchanged: 53 houses in the established zone counts', () => {
  assert.equal(districts.count, 53);
  assert.deepEqual(districts.zoneCounts, { forest: 11, memorial: 5, market: 17, lakeside: 11, central: 9 });
  assert.equal(districts.siteBlockingRects.length, 53);
  for (const rects of districts.siteBlockingRects) assert.ok(rects.length >= 1, 'every house has wall rects');
});

test('AW-5 every wall rect centre blocks and every door stand stays open', () => {
  for (const rects of districts.siteBlockingRects) {
    for (const r of rects) {
      assert.ok(districts.blocked((r.e0 + r.e1) / 2, (r.n0 + r.n1) / 2), 'wall centre must block');
    }
  }
  for (const portal of districts.housePortals) {
    assert.ok(!districts.blocked(portal.x, portal.n), `door stand ${portal.id} must stay open`);
  }
});

test('AW-5 new blocking never reaches beyond the built walls', () => {
  const unions = districts.siteBlockingRects.map(rects => ({
    e0: Math.min(...rects.map(r => r.e0)) - .35, n0: Math.min(...rects.map(r => r.n0)) - .35,
    e1: Math.max(...rects.map(r => r.e1)) + .35, n1: Math.max(...rects.map(r => r.n1)) + .35,
  }));
  let violations = 0;
  for (let x = 50; x <= 430; x += 1) {
    for (let n = 50; n <= 350; n += 1) {
      if (!districts.blocked(x, n) || oldBlocked(x, n)) continue;
      if (!unions.some(u => x > u.e0 && x < u.e1 && n > u.n0 && n < u.n1)) violations++;
    }
  }
  assert.equal(violations, 0);
});

test('AW-5 sealed interiors reopen exactly at the nine carded central houses', () => {
  // Mechanical census (2026-11-22): the 44 themed houses are built as solid
  // full-lot masses — nothing to reclaim, and the fix must not invent openings.
  // The nine central carded houses are shell/U forms whose courtyards and
  // interiors the whole-lot rule sealed; each must reopen real ground.
  const carded = new Set(['147,182.5', '262,180', '264,228', '253,243', '221,251', '202,247', '179,248', '249,264', '199,262']);
  let reclaimedSites = 0;
  let reclaimedPoints = 0;
  for (const site of districts.sites) {
    const fp = footprint(site);
    let reclaimed = 0;
    for (let x = fp.x - fp.w / 2 + .25; x < fp.x + fp.w / 2; x += .5) {
      for (let n = fp.n - fp.d / 2 + .25; n < fp.n + fp.d / 2; n += .5) {
        if (oldBlocked(x, n) && !districts.blocked(x, n)) reclaimed++;
      }
    }
    if (carded.has(`${site.x},${site.n}`)) {
      assert.ok(reclaimed > 100, `carded house ${site.x},${site.n} must reopen its yard/interior`);
      reclaimedSites++;
      reclaimedPoints += reclaimed;
    } else {
      assert.equal(reclaimed, 0, `solid-mass house ${site.x},${site.n} must not gain openings`);
    }
  }
  assert.equal(reclaimedSites, 9);
  assert.ok(reclaimedPoints * .25 > 500, 'reclaimed ground should exceed 500 m² at 0.5 m sampling');
});

test('AW-6 plaza props block players by outline, placement keeps legacy circles', () => {
  const scenery = addScenery(new Group(), grid);
  // Notice board (234, 208), panel 3.26 x 0.28: 0.8 m in front of the panel the
  // legacy circle blocked thin air; the outline does not. The panel still blocks.
  assert.equal(scenery.blocked(234, 208.8), false);
  assert.equal(scenery.placementBlocked(234, 208.8), true);
  assert.equal(scenery.blocked(234, 208), true);
  assert.equal(scenery.blocked(235.9, 208), true, 'panel end still blocks');
  // Ice horse (242.5, 207.5), base 2.70 x 1.62: flank air reopens, body blocks.
  assert.equal(scenery.blocked(242.5, 208.8), false);
  assert.equal(scenery.placementBlocked(242.5, 208.8), true);
  assert.equal(scenery.blocked(244.1, 207.5), true);
  // Firework stand (204, 172.65), body 1.66 x 1.10: side air reopens.
  assert.equal(scenery.blocked(204, 173.7), false);
  assert.equal(scenery.placementBlocked(204, 173.7), true);
  assert.equal(scenery.blocked(204, 172.65), true);
});
