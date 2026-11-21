import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Light, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

// Geometric invariants rather than instanceof: the town-blockout package uses
// its own Three.js version and does not share constructors with the root tests.
test('ZA-36 batches sixty surveyed ground tiles into twelve visible-size groups without removing geometry', () => {
  const terrain = createTerrainGrid();
  const crater = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
  const ground = crater.group.children.filter((child): child is Mesh =>
    child.name === 'meteor-crater-west-ground' && (child as Mesh).isMesh);
  assert.equal(ground.length, 12);
  assert.equal(new Set(ground.map(mesh => mesh.userData.groundBatch)).size, 12);
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
  const outer=crater.outerworks.group;
  assert.ok(outer && crater.group.getObjectByName('za36-crater-outside-complex'));
  let outerDraws=0,outerTris=0;
  outer.traverse(node=>{
    if(!(node as Mesh).isMesh)return;
    const mesh=node as Mesh & {count?:number};
    outerDraws++;
    outerTris+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)*(mesh.count??1)/3;
  });
  assert.equal(outerDraws,13,'9 instanced material groups + 4 fixed notices');
  assert.ok(outerTris<20000,'do not turn 300m perimeter into 300 separate draws');
  let v4Draws=0,v4Tris=0;
  for (const name of ['za36-crater-ejecta-landmarks', 'za36-crater-midground', 'za36-winch-rope-stay']) {
    const sub=crater.group.getObjectByName(name);
    assert.ok(sub,'combined V4 module must mount in default west scene: '+name);
    sub.traverse(node=>{
      if(!(node as Mesh).isMesh)return;
      const mesh=node as Mesh & {count?:number};
      v4Draws++;
      v4Tris+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)*(mesh.count??1)/3;
    });
  }
  assert.equal(v4Draws,17,'V4 is 4 ejecta batches + 5 char-forest batches + 8 moving-rope parts');
  assert.ok(v4Tris<10000);
  assert.equal(draws - dressingDraws - outerDraws - v4Draws, 46,
    'old crater terrain and decor still save 48 ground draw batches');
  assert.equal(triangles - dressingTriangles - outerTris - v4Tris, 283027,
    'baseline terrain, old decor and well polygons unchanged');
  assert.ok(dressingDraws <= 15, 'added story details must stay batched');
  assert.ok(dressingTriangles < 9000, 'keep 200+ extra pieces under a small triangle budget');
  assert.equal(lights, 3 + crater.outerworks.pointLights.length,
    'retain three old warm pools and account separately for all new industrial-night lamps');
  for (let n = 10; n < worldBounds.depth - 1; n += 7.5) {
    const oldTownEdge = terrain.groundHeightAt(0, n);
    assert.ok(Math.abs(crater.heightAt(0, n)! - oldTownEdge) < .001, `seam at ${n}`);
    assert.ok(Number.isFinite(crater.heightAt(-200, n)));
  }
});
