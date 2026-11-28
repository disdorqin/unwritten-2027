import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh} from 'three';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {composeNightBWestHeight,inNightBWest} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {createNightBWestRoad} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-road';
test('west road replaces the canonical tread only inside west ownership with exact seam and continuous stone support',t=>{
 const block=createMainSummitBlock(mainSummitLayout,347,100);t.after(block.dispose);
 const trail=createMainSummitTrail(block.heightAt,347),source=JSON.stringify(trail.points),height=composeNightBWestHeight(sampleTownD2R30Height);
 const road=createNightBWestRoad(trail.points,height);t.after(road.dispose);
 assert.equal(JSON.stringify(trail.points),source);assert.ok(road.stats.length>500&&road.stats.length<515);assert.ok(road.stats.maxGrade<=.120001);assert.ok(road.stats.maxFill>5);assert.ok(road.stats.stoneTris>1000);assert.ok(road.stats.railMetres>0);assert.ok(road.stats.draws<40);
 let centerSamples=0,seams=0,railCollision=0;
 for(let i=1;i<trail.points.length;i++){
  const a=trail.points[i-1]!,b=trail.points[i]!;
  if(inNightBWest(b.east,b.north)){const h=road.surfaceAt(b.east,b.north);assert.ok(h!==undefined);assert.ok(Math.abs(h-b.height-.07)<.15);assert.ok(road.reserved(b.east,b.north,0));centerSamples++;}
  if((a.east< -300)!==(b.east< -300)&&a.north>=480&&b.north>=480){const u=(-300-a.east)/(b.east-a.east),n=a.north+(b.north-a.north)*u,h=a.height+(b.height-a.height)*u;assert.ok(Math.abs((road.surfaceAt(-300,n)??Infinity)-h-.07)<.1);seams++;}
 }
 for(const obj of road.group.children as Mesh[]){const p=obj.geometry.getAttribute('position');for(let i=0;i<p.count;i++){assert.ok(p.getX(i)>=-1100.001&&p.getX(i)<=-299.999&&-p.getZ(i)>=479.999&&-p.getZ(i)<=1790.001);if(obj.name.endsWith('-rail')&&road.blocked(p.getX(i),-p.getZ(i),p.getY(i)-.5))railCollision++;}}
 assert.equal(seams,2);assert.ok(centerSamples>=500);assert.ok(railCollision>0);assert.equal(road.surfaceAt(-299,600),undefined);console.log('west road',JSON.stringify(road.stats));
});
