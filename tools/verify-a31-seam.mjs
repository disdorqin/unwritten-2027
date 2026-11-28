// Actual mounted front and rear geometry; no authority overrides.
import {Group,Scene} from 'three';
import {createTerrainGrid} from './voxel-tavern/town-blockout/terrain.ts';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.ts';
import {createTownRailway} from './voxel-tavern/town-blockout/town-railway.ts';
import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension.ts';
import {mountProductionRidge} from './voxel-tavern/town-blockout/town-d-r30-production-ridge.ts';
import {createA31PublicSummitRoute} from './voxel-tavern/town-blockout/town-a31-public-summit.ts';
const grid=createTerrainGrid(),town=new Scene(),skyline=new Group();
town.add(skyline);
const west=mountWestCraterRoad(800,n=>grid.groundHeightAt(0,n));
const rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points);
const ridge=mountProductionRidge(town,grid,{loop:rail.route.points,branch:branch.samples,rearConnectorCandidate:true});
const rear=createA31PublicSummitRoute({town,skyline,now:()=>0,yieldFrame:async()=>{}});
try{
 if(!await rear.prepare())throw Error('Rear host failed');
 const samples=[];
 for(let n=658;n<=680;n+=.25){
  const rows=[];
  for(let e=298;e<=302;e+=.25){
   const front=ridge.heightAt(e,n);
   const back=rear.surveyedSupport(e,n);
   rows.push({e,n,front,back,frontBlocked:front===undefined||ridge.blocked(e,n,front,.27),rearBlocked:back===undefined||rear.surveyedBlocked(e,n,back)});
  }
  samples.push({n,frontClear:rows.filter(x=>!x.frontBlocked&&Math.abs(x.front-347)<=.08).length,rearClear:rows.filter(x=>!x.rearBlocked&&Math.abs(x.back-347)<=.08).length,
    overlap:rows.filter(x=>!x.frontBlocked&&!x.rearBlocked&&Math.abs(x.front-x.back)<=.08).length,
    center:rows[8]});
 }
 console.log(JSON.stringify({frontRoads:ridge.roads.length,cloudSeam:ridge.cloudSeam,rearReady:rear.state().ready,scope:'actual mounted ridge/rear terrain and registered obstacles only; no public passage grant',samples:samples.filter(x=>x.n%1===0||x.n===663.25||x.n===666.25||x.n===666.5)},null,2));
}finally{rear.dispose();}
