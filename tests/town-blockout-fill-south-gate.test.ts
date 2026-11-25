import assert from 'node:assert/strict';
import test from 'node:test';
const gradient = () => ({ addColorStop() {} });
const context = { createRadialGradient: gradient, createLinearGradient: gradient, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, translate() {}, rotate() {}, measureText() { return { width: 1 }; } };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context, width: 0, height: 0 }) } });
const { Group } = await import('three');
const terrain = await import('../tools/voxel-tavern/town-blockout/terrain.ts');
const { addScenery } = await import('../tools/voxel-tavern/town-blockout/scenery.ts');
const { addDistrictHousing } = await import('../tools/voxel-tavern/town-blockout/district-layout.ts');
const { createTownRailway } = await import('../tools/voxel-tavern/town-blockout/town-railway.ts');
const { extensionRoadClearance, extensionStreetClearance } = await import('../tools/voxel-tavern/town-blockout/town-extension.ts');
const { mountTownFillSouthGate, fillSouthGateClusters, SOUTH_GATE_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-south-gate.ts');
const { isWater } = terrain;

test('fill-south-gate clusters clear the assembled town at their own radii', () => {
  const landscape = new Group();
  const grid = terrain.createTerrainGrid();
  const track = createTownRailway(grid);
  const scenery = addScenery(landscape, grid);
  const district = addDistrictHousing(landscape, grid, scenery.blocked, track.keepClear);
  const sampled = (fn: (x: number, n: number) => boolean, e: number, n: number, r: number) => {
    if (fn(e, n)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (fn(e + Math.cos(a) * r * .7, n + Math.sin(a) * r * .7)) return true;
    }
    return false;
  };
  const blocked = (e: number, n: number, r: number) =>
    extensionRoadClearance(e, n, r) || extensionStreetClearance(e, n, r)
    || track.keepClear(e, n, r)
    || sampled(scenery.blocked, e, n, r) || sampled(district.blocked, e, n, r);
  for (const cluster of fillSouthGateClusters) {
    const r = SOUTH_GATE_RADII[cluster.kind];
    if (cluster.id === 'sg-paifang-330') {
      // Road-spanning gate: the cluster centre sits on the approach road by
      // design. Exempt from the centre road check; instead verify both post
      // footprints (posts at +/-3.8 m, outside the 7 m roadbed) are clear.
      assert.equal(blocked(cluster.east - 3.8, cluster.north, 0.5), false,
        'paifang west post blocked');
      assert.equal(blocked(cluster.east + 3.8, cluster.north, 0.5), false,
        'paifang east post blocked');
    } else {
      assert.equal(blocked(cluster.east, cluster.north, r), false,
        `${cluster.id} blocked at ${cluster.east},${cluster.north} r=${r}`);
    }
    assert.equal(isWater(cluster.east, cluster.north), false, `${cluster.id} in water`);
    assert.notEqual(grid.surfaces[Math.round(cluster.north) * grid.gridWidth + Math.round(cluster.east)], 4,
      `${cluster.id} on a type-4 surface`);
  }
  const parent = new Group();
  const mounted = mountTownFillSouthGate(parent, (e, n) => grid.heightAt(e, n));
  assert.equal(mounted.placed.length, fillSouthGateClusters.length);
  assert.equal(mounted.group.children.length, fillSouthGateClusters.length);
  mounted.dispose();
});
