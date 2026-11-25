import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Light, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

// Geometric invariants rather than instanceof: the town-blockout package uses
// its own Three.js version and does not share constructors with the root tests.
test('ZA-36 batches thirty-five surveyed ground tiles into nine visible-size groups without removing geometry', () => {
  const terrain = createTerrainGrid();
  const crater = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
  const ground = crater.group.children.filter((child): child is Mesh =>
    child.name === 'meteor-crater-west-ground' && (child as Mesh).isMesh);
  assert.equal(ground.length, 9);
  assert.equal(new Set(ground.map(mesh => mesh.userData.groundBatch)).size, 9);
  for (const mesh of ground) {
    assert.ok(mesh.isMesh && mesh.geometry.index && mesh.geometry.boundingSphere);
    assert.ok(mesh.geometry.boundingSphere.radius > 0);
    assert.ok(mesh.geometry.boundingSphere.radius < 150, 'large full-map mesh would disable spatial culling');
    assert.ok(mesh.geometry.index.count > 0);
  }
  let draws = 0, triangles = 0, lights = 0;
  crater.group.traverse(node => {
    if ((node as Light).isLight) lights++;
    if ((node as Mesh).isMesh) {
      const mesh = node as Mesh & { count?: number };
      draws++;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
    }
  });
  const newDressing = crater.group.getObjectByName('za36-crater-story-dressing');
  assert.ok(newDressing);
  let dressingDraws = 0, dressingTriangles = 0;
  newDressing.traverse(node => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    dressingDraws++;
    dressingTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  const mouthWorks = crater.group.getObjectByName('crater-mouth-works');
  assert.ok(mouthWorks, 'crater-mouth works (mainline 1) mounted');
  let mouthDraws = 0, mouthTriangles = 0, mouthLights = 0;
  mouthWorks.traverse(node => {
    if ((node as Light).isLight) mouthLights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    mouthDraws++;
    mouthTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  const outerWorks = crater.group.getObjectByName('crater-outer-works');
  assert.ok(outerWorks, 'crater-outer works (mainline 2) mounted');
  let outerDraws = 0, outerTriangles = 0, outerLights = 0;
  outerWorks.traverse(node => {
    if ((node as Light).isLight) outerLights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    outerDraws++;
    outerTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  // Salvage carve-outs (ruling 2026-11-21 17:30): the four salvaged groups ride
  // their own budget and do not move the pinned old-crater baseline.
  let salvageDraws = 0, salvageTriangles = 0;
  for (const name of ['za36-crater-ejecta-landmarks', 'za36-crater-midground', 'za36-winch-rope-stay', 'crater-survey-m1']) {
    const salvaged = crater.group.getObjectByName(name);
    assert.ok(salvaged, `salvaged group ${name} mounted`);
    salvaged.traverse(node => {
      if (!(node as Mesh).isMesh) return;
      const mesh = node as Mesh & { count?: number };
      salvageDraws++;
      salvageTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
    });
  }
  // A2 density carve-out (self-build): the backfill rides its own budget and
  // likewise does not move the pinned baseline.
  let densityDraws = 0, densityTriangles = 0;
  const densityA2 = crater.group.getObjectByName('crater-density-a2');
  assert.ok(densityA2, 'density group crater-density-a2 mounted');
  densityA2.traverse(node => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    densityDraws++;
    densityTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  // C-line carve-outs (ledger ruling 2026-11-22): two audited crater-interior
  // landings ride their own pinned budgets below and are NOT subtracted from
  // the remainder baseline — each is asserted on its own numbers so a future
  // drift inside either group turns red on its own line instead of hiding
  // inside a re-pinned total.
  //   823c6636 (C1/C2, 2026-11-21 22:14): six fixed work lamps on the crater
  //     floor — group 'c2-physical-worklights-authority-free', measured
  //     6 draws / 1,368 triangles / 6 lights.
  //   44a6088f (C3 R1, 2026-11-21 21:20): 7,019 colored crater-interior
  //     details — group 'c3-crater-interior-dressing-visual-only', measured
  //     6 draws / 72,672 triangles / 0 lights.
  let worklightDraws = 0, worklightTriangles = 0, worklightLights = 0;
  const worklights = crater.group.getObjectByName('c2-physical-worklights-authority-free');
  assert.ok(worklights, 'C2 physical worklight chain mounted');
  worklights.traverse(node => {
    if ((node as Light).isLight) worklightLights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    worklightDraws++;
    worklightTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  let c3Draws = 0, c3Triangles = 0, c3Lights = 0;
  const c3Dressing = crater.group.getObjectByName('c3-crater-interior-dressing-visual-only');
  assert.ok(c3Dressing, 'C3 crater-interior dressing mounted');
  c3Dressing.traverse(node => {
    if ((node as Light).isLight) c3Lights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    c3Draws++;
    c3Triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  // 卡06 lamp room carve-out (window C, U-20, ruling 2026-11-24): the
  // shaft-head lamp hut rides its own budget like the salvage groups and
  // is subtracted from the remainder below, so the W-1 pin does not move.
  const lampRoom = crater.group.getObjectByName('za31-crater-lamp-room');
  assert.ok(lampRoom, '卡06 lamp room mounted');
  let lampDraws = 0, lampTriangles = 0, lampLights = 0;
  lampRoom.traverse(node => {
    if ((node as Light).isLight) lampLights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    lampDraws++;
    lampTriangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  // C2 crater five groups carve-out (batch 106 collection repair, ruling
  // per the batch-96 lamp-room precedent): each group rides its own
  // budget and is subtracted from the remainder below, so the W-1 pin
  // does not move. Measured on the merged trunk tree (ffd64ff0):
  // mound 3 draws / 10,724 tris, broken circle 4 / 3,114, molten beads
  // 3 / 11,616, warm chain 6 / 3,840 / 6 lights, inscription 7 / 552.
  const c2Groups = [
    ['town-c2-crater-central-mound', 3, 10724, 0],
    ['town-c2-crater-broken-circle', 4, 3114, 0],
    ['c2-crater-molten-beads', 3, 11616, 0],
    ['town-c2-crater-warm-light-chain', 6, 3840, 6],
    ['town-c2-crater-inscription', 7, 552, 0],
  ] as const;
  let c2Draws = 0, c2Triangles = 0, c2Lights = 0;
  for (const [name, maxDraws, maxTriangles, wantLights] of c2Groups) {
    const g = crater.group.getObjectByName(name);
    assert.ok(g, `C2 group ${name} mounted`);
    let gd = 0, gt = 0, gl = 0;
    g.traverse(node => {
      if ((node as Light).isLight) gl++;
      if (!(node as Mesh).isMesh) return;
      const mesh = node as Mesh & { count?: number };
      gd++;
      gt += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
    });
    assert.ok(gd <= maxDraws, `C2 group ${name} stays inside its own draw budget (${gd} <= ${maxDraws})`);
    assert.ok(gt <= maxTriangles, `C2 group ${name} stays inside its own triangle budget (${Math.round(gt)} <= ${maxTriangles})`);
    assert.equal(gl, wantLights, `C2 group ${name} carries exactly ${wantLights} real lights`);
    c2Draws += gd; c2Triangles += gt; c2Lights += gl;
  }
  // Remainder baseline re-pinned 2026-11-22 (was 46 draws / 283,027 triangles
  // / 7 lights): the +12 draws, +74,040 triangles and +6 lights over the old
  // pin are exactly the two C-line landings itemized above (6+6 draws,
  // 1,368+72,672 triangles, 6 lights), verified group-by-group against the
  // mounted scene. Any further drift must name its own source commit here.
  // W-1 re-pin (2026-11-22, 分支窗 A): the west ground sheet is capped at
  // craterGroundSheetNorth (336) instead of following the world depth to
  // 800 — 3 fewer ground batch meshes (−3 draws) and the sheet rows north
  // of 336 removed (20 full tiles + the 12 m partial row at 528:
  // −97,920 triangles) against the pin above.
  assert.equal(draws - dressingDraws - mouthDraws - outerDraws - salvageDraws - densityDraws - lampDraws - c2Draws, 55, 'crater remainder stays at the W-1 re-pinned draw baseline (58 − 3 capped ground-sheet batches)');
  // Batch98 haulage-turn relocation restores eight 12-triangle floor shards net.
  // K-34 warning post merges into the winch's darkWood batch (+12
  // triangles, no new draw); its board face and the K-35 cast plate are
  // document-guarded textBoards, invisible to this node run.
  assert.equal(triangles - dressingTriangles - mouthTriangles - outerTriangles - salvageTriangles - densityTriangles - lampTriangles - c2Triangles, 259255, 'W-1 remainder 259243 + 12 triangles from the K-34 warning post');
  assert.ok(dressingDraws <= 17, 'added story details must stay batched (17 since C3 segments 1-4, crater offensive order 2026-11-21)');
  assert.ok(dressingTriangles < 9000, 'keep 200+ extra pieces under a small triangle budget');
  assert.ok(mouthDraws <= 40, 'crater-mouth works stay inside the approved mainline-1 draw budget');
  assert.ok(mouthTriangles <= 60000, 'crater-mouth works stay inside the approved mainline-1 triangle budget');
  assert.equal(mouthLights, 3, 'crater-mouth works add exactly three real light pools');
  assert.ok(outerDraws <= 30, 'crater-outer works stay inside the approved mainline-2 draw budget');
  assert.ok(outerTriangles <= 110000, 'crater-outer works stay inside the approved mainline-2 triangle budget');
  assert.equal(outerLights, 1, 'crater-outer works add exactly one real light pool (the north tower)');
  assert.ok(salvageDraws <= 25, 'salvaged ejecta + midground + rope-stay + M1 stay batched');
  assert.ok(salvageTriangles < 15000, 'salvaged groups stay inside the salvage triangle budget');
  assert.ok(densityDraws <= 12, 'A2 density backfill stays batched');
  assert.ok(densityTriangles < 8000, 'A2 density backfill stays inside its triangle budget');
  assert.ok(worklightDraws <= 6, 'C2 worklight chain stays inside its own draw budget (6 batched fixture meshes)');
  assert.ok(worklightTriangles <= 1500, 'C2 worklight chain stays inside its own triangle budget');
  assert.equal(worklightLights, 6, 'C2 worklight chain carries exactly six real lamps');
  assert.ok(c3Draws <= 6, 'C3 crater-interior dressing stays inside its own draw budget');
  assert.ok(c3Triangles <= 73000, 'C3 crater-interior dressing stays inside its own triangle budget');
  assert.equal(c3Lights, 0, 'C3 crater-interior dressing adds no real light pools');
  assert.equal(lights, 20, 'seven baseline light pools (camp 3 + crater-mouth 3 + north tower 1) plus the six C2 work lamps plus the one lamp-room door pool plus the six C2 warm-chain lamps');
  assert.ok(lampDraws <= 115, '卡06 lamp room stays inside its own draw budget');
  assert.ok(lampTriangles < 2500, '卡06 lamp room stays inside its own triangle budget');
  assert.equal(lampLights, 1, '卡06 lamp room adds exactly one real light (the door pool, end of the warm chain)');
  for (let n = 10; n < worldBounds.depth - 1; n += 7.5) {
    const oldTownEdge = terrain.groundHeightAt(0, n);
    assert.ok(Math.abs(crater.heightAt(0, n)! - oldTownEdge) < .001, `seam at ${n}`);
    assert.ok(Number.isFinite(crater.heightAt(-200, n)));
  }
});
