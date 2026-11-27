import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Raycaster,Vector3,Mesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad,craterWestSurvey} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {mountWestMountainGround,westMountainTrackProtection} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-west-ground';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
test('new west carrier fills precisely the old missing 1m cells, preserves seams and supplies exact rendered foot height',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);
 const a=mountWestMountainGround(road.heightAt,{west:craterWestSurvey.west,east:0,south:336,north:worldBounds.depth},westMountainTrackProtection([rail.samples,rail.narrowSamples,rail.sidingSamples]));
 const root=new Group();root.add(a.group);root.updateMatrixWorld(true);
 try{
  assert.equal(a.stats.cells,98048);assert.equal(a.stats.triangles,196096);
  assert.equal(a.stats.chunks,29);
  for(let n=336;n<800;n++)for(let e=-240;e<0;e++){
   const old=road.terrainReadyAt(e+.5,n+.5),fresh=a.ownsCell(e,n);
   assert.notEqual(old,fresh);
   assert.ok(old||a.readyAt(e+.5,n+.5));
  }
  for(let e=-240;e<=0;e++)if(a.readyAt(e,336))assert.equal(a.heightAt(e,336),Math.fround(road.heightAt(e,336)!));
  for(let n=336;n<=544;n++)assert.equal(a.heightAt(-64,n),Math.fround(road.heightAt(-64,n)!));
  for(let e=-64;e<=0;e++)assert.equal(a.heightAt(e,544),Math.fround(road.heightAt(e,544)!));
  for(let n=544;n<=800;n++)assert.equal(a.heightAt(0,n),Math.fround(grid.groundHeightAt(0,n)));
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));let count=0;
  for(let n=339.32;n<800;n+=13.19)for(let e=-239.61;e<0;e+=12.13){
   ray.ray.origin.set(e,500,-n);const hits=ray.intersectObjects(a.group.children,false);
   if(a.readyAt(e,n)){assert.equal(hits.length,1);assert.ok(Math.abs(hits[0]!.point.y-a.heightAt(e,n)!)<1e-5);count++;}
   else assert.equal(hits.length,0);
  }
  assert.ok(count>500);
  // A shared raster vertex must carry the same lighting normal in every tile.
  const seen=new Map<string,number[]>();let shared=0;
  for(const tile of a.group.children){
   const mesh=tile as Mesh;assert.ok(mesh.isMesh);
   const p=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal');
   for(let i=0;i<p.count;i++){
    const k=p.getX(i)+','+p.getZ(i),v=[normal.getX(i),normal.getY(i),normal.getZ(i)];
    assert.ok(v[1]!>0);assert.ok(Math.abs(Math.hypot(...v)-1)<1e-6);
    const prior=seen.get(k);if(prior){assert.deepEqual(v,prior);shared++;}else seen.set(k,v);
   }
  }
  assert.ok(shared>1000);
 }finally{a.dispose();}
});
