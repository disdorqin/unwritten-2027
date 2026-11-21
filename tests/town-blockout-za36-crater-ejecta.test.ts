import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterEjecta } from '../tools/voxel-tavern/town-blockout/town-za36-crater-ejecta';
import { createMeteorCrater, meteorCraterFixturePlan } from '../tools/voxel-tavern/town-blockout/meteor-crater';

test('ZA-36 visual relief has 60 house-size ejecta on 8 rays, a blackstone crown and no new road block', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const { placements, group } = buildZa36CraterEjecta(road);
  assert.equal(group.name, 'za36-crater-ejecta-landmarks');
  const rays = placements.filter(p => p.kind === 'ejecta');
  const black = placements.filter(p => p.kind === 'blackstone');
  const char = placements.filter(p => p.kind === 'char');
  assert.equal(rays.length, 60);
  assert.deepEqual([...new Set(rays.map(p => p.ray))].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(rays.every(p => p.height >= 2 && p.height <= 5 && p.footprint * 2 >= 2 && p.footprint * 2 <= 5.1));
  assert.ok(black.length >= 40 && new Set(black.map(p => p.ray)).size >= 18);
  assert.ok(char.length >= 18);
  assert.equal(group.children.length, 4, 'all landmarks must be grouped into 4 instance batches');
  let polys = 0;
  for (const mesh of group.children) {
    assert.ok('isInstancedMesh' in mesh && mesh.isInstancedMesh);
    assert.ok('count' in mesh && (mesh.count as number) > 0);
    assert.ok('boundingSphere' in mesh && mesh.boundingSphere);
    const geometry = (mesh as unknown as { geometry: { index?: { count: number }; attributes: { position: { count: number } } } }).geometry;
    polys += (geometry.index?.count ?? geometry.attributes.position.count) * (mesh.count as number) / 3;
  }
  assert.ok(polys < 7500, `4 draw batches too costly: ${polys} tris`);

  const terrain = createMeteorCrater(meteorCraterFixturePlan);
  const c = Math.cos(road.anchor.yaw), s = Math.sin(road.anchor.yaw);
  const spiral = Array.from({ length: 1401 }, (_, i) => {
    const p = terrain.mainTrailPoint(i / 1400);
    return { east: road.anchor.east + p.east * c + p.north * s,
      north: road.anchor.north + p.north * c - p.east * s };
  });
  const nearSegment = (e: number, n: number, a: {east:number; north:number},
    b: {east:number; north:number}) => {
    const dx = b.east - a.east, dn = b.north - a.north;
    const t = Math.max(0, Math.min(1, ((e - a.east) * dx + (n - a.north) * dn) / (dx*dx + dn*dn)));
    return Math.hypot(e - a.east - t*dx, n - a.north - t*dn);
  };
  for (const piece of placements) {
    assert.equal(piece.ground, road.heightAt(piece.east, piece.north));
    assert.ok(piece.east <= -7 && piece.east >= -237 && piece.north >= 7 && piece.north <= 530);
    assert.ok(Math.hypot(piece.east-road.lip.east,piece.north-road.lip.north) >= 10 + piece.footprint);
    assert.ok(nearSegment(piece.east,piece.north,road.lip,{east:0,north:159}) >= piece.footprint+4.5);
    assert.ok(spiral.every(p=>Math.hypot(p.east-piece.east,p.north-piece.north) >= piece.footprint+3.05));
  }
  assert.ok(road.group.getObjectByName('za36-crater-ejecta-landmarks'), 'only default west-domain mounting qualifies');
});
