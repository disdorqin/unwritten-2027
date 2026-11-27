import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {createFrontRidgeSwitchbackRoad} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import {createTerrainSupportContract} from '../tools/voxel-tavern/town-blockout/town-a-r30-terrain-contract';
import {protectRailStationRoad,protectedRailStationSurface} from '../tools/voxel-tavern/town-blockout/town-a-r30-station-protection';
test('rail station concourse and north apron never select the buried legacy road',()=>{
 const grid=createTerrainGrid(),road=createFrontRidgeSwitchbackRoad();
 const contract=createTerrainSupportContract({town:grid.heightAt,townReady:grid.terrainReadyAt,west:()=>undefined,westReady:()=>false,ridgeRoad:protectRailStationRoad(road.heightAt)});
 assert.ok(grid.heightAt(526,347)-road.heightAt(526,347,26)!>7);
 let prev=26;
 for(let n=338;n<=349;n+=.05){
  const h=contract.heightAt(526,n,prev)!;
  assert.equal(h,grid.heightAt(526,n));
  assert.ok(Math.abs(h-prev)<.1);prev=h;
 }
 assert.equal(contract.sample({east:536.8,north:317.15,hintHeight:26.14})?.surfaceId,'town-ground');
 // All queries outside the existing plot and apron keep the original
 // road-selection behavior; the patch does not resurvey D's route.
 for(const p of road.centreline.filter(p=>!protectedRailStationSurface(p.east,p.north)).filter((_,i)=>i%19===0)){
  const old=road.heightAt(p.east,p.north,p.height);
  if(old!==undefined)assert.equal(contract.heightAt(p.east,p.north,p.height),old);
 }
 assert.equal(protectedRailStationSurface(526,329),true);
 assert.equal(protectedRailStationSurface(440,520),false);
 road.dispose();
});
