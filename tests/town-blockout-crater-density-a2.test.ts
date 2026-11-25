import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Light, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { craterBeltTrackCorridor } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';
import { craterBranchControlLine } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';

// A2 density backfill (self-build; atlas ref-02 / ref-05 / ref-11): pipe heaps,
// rim crane, fallen fence at the collapsed gaps, moss boulders, crate stacks,
// one gate lamp. Scenery only — no new systems, no new real lights.
const anchor = { east: -120, north: 185 };

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function distToPolyline(px: number, pz: number, pts: readonly (readonly [number, number])[]) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    best = Math.min(best, distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return best;
}

function counts(group: { traverse(cb: (node: unknown) => void): void }) {
  let draws = 0, triangles = 0, lights = 0;
  group.traverse(node => {
    if ((node as Light).isLight) lights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    draws++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  return { draws, triangles, lights };
}

const terrain = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));

test('A2 density: seventeen surveyed clusters land, kinds counted', () => {
  const placements = road.densityA2.placements;
  assert.equal(placements.length, 17, '2 pipe heaps + 1 crane + 2 fallen fences + 8 moss clusters + 3 crate stacks + 1 gate lamp');
  const kinds = new Map<string, number>();
  for (const p of placements) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  assert.deepEqual(Object.fromEntries(kinds), {
    'pipe-heap': 2, crane: 1, 'fallen-fence': 2, 'moss-stone': 8, 'crate-stack': 3, 'gate-lamp': 1,
  });
  const group = road.group.getObjectByName('crater-density-a2');
  assert.ok(group, 'density group mounted');
  const ledger = counts(group);
  assert.ok(ledger.draws <= 12, `A2 draws ${ledger.draws}`);
  assert.ok(ledger.triangles < 8000, `A2 triangles ${ledger.triangles}`);
  assert.equal(ledger.lights, 0, 'A2 adds no real light — the gate lamp is emissive only');
  const byId = new Map(road.densityA2.sites.map(s => [s.id, s]));
  assert.ok(byId.has('density-crane'), 'crane surveyed');
  assert.ok(byId.has('wall-gate-lamp'), 'gate lamp surveyed');
});

test('A2 density: every cluster clears fence, wall, narrow gauge and main rail', () => {
  const placements = road.densityA2.placements;
  const posts = [...road.outerWorks.fencePosts, ...road.mouthWorks.fencePosts].map(post => {
    const rad = post.bearing * Math.PI / 180;
    return { east: anchor.east + post.radius * Math.sin(rad), north: anchor.north + post.radius * Math.cos(rad) };
  });
  const narrowGauge = craterBeltTrackCorridor.map(([bearing, radius]) => {
    const rad = bearing * Math.PI / 180;
    return [anchor.east + radius * Math.sin(rad), anchor.north + radius * Math.cos(rad)] as const;
  });
  for (const p of placements) {
    const postClear = Math.min(...posts.map(q => Math.hypot(p.east - q.east, p.north - q.north))) - p.footprint;
    assert.ok(postClear >= 1, `${p.kind} (${p.east.toFixed(1)}, ${p.north.toFixed(1)}) clears fence posts by ${postClear.toFixed(2)}`);
    if (p.north >= 13 && p.north <= 307) {
      assert.ok(Math.abs(p.east + 18) >= 1.2, `${p.kind} clears the town wall`);
    }
    const gaugeClear = distToPolyline(p.east, p.north, narrowGauge) - p.footprint;
    assert.ok(gaugeClear >= 1, `${p.kind} clears the narrow-gauge corridor by ${gaugeClear.toFixed(2)}`);
    const railClear = distToPolyline(p.east, p.north, craterBranchControlLine) - p.footprint;
    assert.ok(railClear >= 1.5, `${p.kind} clears the main branch by ${railClear.toFixed(2)}`);
  }
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i], b = placements[j];
      assert.ok(Math.hypot(a.east - b.east, a.north - b.north) >= a.footprint + b.footprint,
        `clusters ${a.kind}/${b.kind} do not overlap`);
    }
  }
});
