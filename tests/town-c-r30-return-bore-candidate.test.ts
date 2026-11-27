import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountR30ReturnRelocationCandidate,surveyR30ReturnRelocation} from '../tools/voxel-tavern/town-blockout/town-c-r30-return-relocation-candidate.js';
import {mountR30ReturnBoreCandidate} from '../tools/voxel-tavern/town-blockout/town-c-r30-return-bore-candidate.js';
test('square bore joins the B survey datum while preserving both physically sealed surfaces',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),lower=surveyR30ReturnRelocation().world;
 // This is C's real local road fixture, not the B candidate full terrain.
 const surface=road.heightAt(lower.east,lower.north)!;
 const input={axis:{east:lower.east,north:lower.north,height:surface},yaw:road.anchor.yaw,apertureSide:2.2,roofSpan:0,dockHeight:lower.height,verticalSpan:surface-lower.height,productionReady:false as const};
 assert.equal(mountR30ReturnBoreCandidate(parent,{...input,axis:{...input.axis,east:lower.east+.1}}).kind,'blocked');
 assert.equal(mountR30ReturnBoreCandidate(parent,{...input,apertureSide:2}).kind,'blocked');
 assert.equal(mountR30ReturnBoreCandidate(parent,{...input,dockHeight:lower.height+1}).kind,'blocked');
 assert.equal(parent.children.length,0);
 const bore=mountR30ReturnBoreCandidate(parent,input);assert.equal(bore.kind,'ready');if(bore.kind!=='ready')assert.fail();
 try{
  assert.ok(input.verticalSpan>65&&input.verticalSpan<66);assert.ok(bore.span>61&&bore.span<62);assert.ok(bore.parts.length>500);
  assert.equal(bore.productionReady,false);assert.equal(bore.apertureSide,2.2);
  assert.ok(Math.abs(bore.lowerRoof-(lower.height+3.555))<1e-6);
  for(const p of bore.parts){
   if(p.y<.3||p.y>bore.span-.3)continue;
   assert.ok(Math.abs(p.x)-p.w/2>=bore.clearSquare/2||Math.abs(p.z)-p.d/2>=bore.clearSquare/2,'clear cage envelope');
  }
  parent.updateMatrixWorld(true);
  const local=(x:number,y:number,z:number)=>bore.group.localToWorld(new Vector3(x,y,z));
  const cast=(x:number,y:number,z:number,dx:number,dy:number,dz:number,limit:number)=>{
   const o=local(x,y,z),d=local(x+dx,y+dy,z+dz).sub(o).normalize();
   return new Raycaster(o,d,0,limit).intersectObject(bore.group,true)[0];
  };
  assert.ok(Math.abs(cast(0,.5,0,0,-1,0,1)!.distance-.38)<.001,'lower cap');
  assert.ok(Math.abs(cast(0,bore.span-.5,0,0,1,0,1)!.distance-.38)<.001,'upper cap');
  for(let y=1;y<bore.span-1;y+=2.4)for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const hit=cast(0,y,.25,x,0,z,1.5);assert.ok(hit,'continuous shaft wall');assert.ok(hit.distance>.8);
  }
  const ground=road.group.getObjectByName('meteor-crater-walk-mesh')!;
  road.group.updateMatrixWorld(true);
  assert.ok(new Raycaster(new Vector3(lower.east,surface+.5,-lower.north),new Vector3(0,-1,0),0,1).intersectObject(ground)[0]);
  const hall=mountR30ReturnRelocationCandidate(new Group());hall.group.updateMatrixWorld(true);
  try{
   const station=hall.station.contract!;assert.equal(station.productionReady,false);
   const [x,y,z]=[-12.87600600249972,lower.height,-.90834479104372];
   assert.ok(new Raycaster(new Vector3(x,y+1.8,z),new Vector3(0,1,0),0,2).intersectObject(hall.shell)[0]);
  }finally{hall.dispose()}
 }finally{bore.dispose()}
 assert.equal(parent.children.length,0);
});
