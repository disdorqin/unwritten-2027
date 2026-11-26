import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {attachBR30PhysicalKit,surveyBR30FloorLampBoxes} from '../tools/voxel-tavern/town-blockout/town-b-r30-physical-kit';
import {craterFloorWorklightSites} from '../tools/voxel-tavern/town-blockout/meteor-crater-floor-worklight-sites';

test('B physical kit attaches once to actual west road and removes only its own boxes',()=>{
 const g=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>g.groundHeightAt(0,n));
 const rail=buildCraterRailExtension(g,road),before=[...road.group.userData.colliders];
 const floor=road.group.userData.floors,ramps=road.group.userData.ramps;
 const kit=attachBR30PhysicalKit(road,rail);
 assert.equal(kit.face.sites.length,3);assert.equal(kit.machines.sites.length,5);
 assert.equal(kit.addedRelicBoxes,road.midgroundS5.colliders.length);
 assert.equal(kit.addedLampBoxes,18);
 assert.equal(road.group.userData.colliders.length,before.length+kit.addedRelicBoxes+kit.addedLampBoxes+8);
 const lamps=surveyBR30FloorLampBoxes(road.group),a=road.anchor;
 const c=Math.cos(a.yaw),s=Math.sin(a.yaw);
 for(const [i,p] of craterFloorWorklightSites.entries()){
   const e=a.east+p.east*c+p.north*s,n=a.north+p.north*c-p.east*s;
   const shaft=lamps[i*3+1],h=road.heightAt(e,n)!;
   assert.ok(shaft.min[0]<e&&shaft.max[0]>e&&shaft.min[2]<-n&&shaft.max[2]>-n);
   assert.ok(shaft.min[1]<h+.7&&shaft.max[1]>h+1.6);
   assert.ok(shaft.max[0]-shaft.min[0]<.7&&shaft.max[2]-shaft.min[2]<.7);
 }
 for(const p of road.winch!.survey.descentApproach)for(const b of lamps)
   assert.ok(Math.hypot(Math.max(b.min[0]-p.east,0,p.east-b.max[0]),Math.max(b.min[2]+p.north,0,-p.north-b.max[2]))>1.25);

 assert.equal(attachBR30PhysicalKit(road,rail),kit);
 assert.equal(road.group.userData.floors,floor);assert.equal(road.group.userData.ramps,ramps);
 kit.dispose();kit.dispose();assert.deepEqual(road.group.userData.colliders,before);
 const existing=road.midgroundS5.colliders[0];
 road.group.userData.colliders.push(existing);
 const again=attachBR30PhysicalKit(road,rail);
 assert.equal(again.addedRelicBoxes,road.midgroundS5.colliders.length-1);
 again.dispose();assert.deepEqual(road.group.userData.colliders,[...before,existing]);
 const blocked={min:[-162,10,-123],max:[-160,14,-121]};
 const original=[...before,blocked];road.group.userData.colliders=original;
 assert.throws(()=>attachBR30PhysicalKit(road,rail),/Occupied workshop pad/);
 assert.equal(road.group.userData.colliders,original);
 assert.equal(road.group.getObjectByName('b-r30-pit-workface'),undefined);
 assert.equal(road.group.getObjectByName('b-r30-crater-workstations'),undefined);
});
