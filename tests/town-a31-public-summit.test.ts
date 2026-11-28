import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Scene,Mesh,InstancedMesh} from 'three';
import {createA31PublicSummitRoute} from '../tools/voxel-tavern/town-blockout/town-a31-public-summit';
test('public route owns the actual four sector mount and exclusive far/near display',async()=>{
 const town=new Scene(),skyline=new Group();town.add(skyline);
 const route=createA31PublicSummitRoute({town,skyline,now:()=>0,yieldFrame:async()=>{}});
 try{
  const loading=route.prepare();assert.equal(route.prepare(),loading);assert.equal(await loading,true);
  const state=route.state();assert.equal(state.ready,true);assert.equal(state.sceneOwner,'town');
  assert.deepEqual(state.installed,['A','B','C2']);assert.deepEqual(state.sectorSamples,[238,220,240,160]);assert.equal(state.cutTiles,9);assert.equal(state.southRoad.connected,false);assert.ok(state.southRoad.length>528);
  assert.deepEqual(state.duplicates,[]);assert.equal(state.cable.boardable,false);
  assert.ok(state.hiking?.ready);assert.ok(state.hiking.metres>1100&&state.hiking.maxGrade<=.70&&state.hiking.markers>240);
  const root=town.getObjectByName('town-d2-r30-production') as Group;assert.ok(root);
  assert.deepEqual(root.position.toArray(),[300,0,-676]);assert.equal(root.visible,false);
  assert.ok(state.legacyPruned!.roadTriangles>0);assert.ok(state.legacyPruned!.forestInstances>0);
  const guide=root.getObjectByName('a32-certified-hiking-guides');assert.ok(guide&&guide.userData.visualOnly&&guide.userData.includesWorldCollision===false);
  assert.ok(root.getObjectByName('night-a-south-sector'));assert.ok(root.getObjectByName('night-b-west-sector'));assert.ok(root.getObjectByName('town-night-c2-summit-east-production'));
  assert.equal(root.getObjectByName('main-summit-assembly'),undefined);assert.equal(root.getObjectByName('town-d2-r30-ropeway'),undefined);
  const far={east:223,north:180,height:12},station={east:296,north:520,height:8.13},near={east:336,north:640,height:347};
  route.update(far);assert.equal(skyline.visible,true);assert.equal(root.visible,false);
  route.update(station);assert.equal(skyline.visible,true);assert.equal(root.visible,false);
  route.update({...near,height:140});assert.equal(skyline.visible,true);assert.equal(root.visible,false);
  let snowSamples=0;
  const weather=(e:number,n:number,h:number)=>{assert.ok(Number.isFinite(e+n+h));assert.ok(n>=666);snowSamples++;return {targetCover:.2,pilingRate:.1};};
  for(let i=0;i<4;i++)route.updateSnow(.25,weather);assert.equal(snowSamples,0);
  route.update(near);assert.equal(skyline.visible,false);assert.equal(root.visible,true);
  for(let i=0;i<4;i++)route.updateSnow(.25,weather);assert.ok(snowSamples>0);
  route.setNight(true);route.setNight(false);
  const trail=root.getObjectByName('town-d2-r30-trail-support')!;
  trail.traverse(node=>{
   if(!(node instanceof Mesh)||node instanceof InstancedMesh)return;
   const p=node.geometry.getAttribute('position'),index=node.geometry.getIndex()!;
   for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];const e=ids.reduce((s,j)=>s+p.getX(j),0)/3,n=-ids.reduce((s,j)=>s+p.getZ(j),0)/3;assert.ok(n>=480&&e>=-300&&e<300);}
  });
  const gate={east:300,north:669,height:347};
  assert.equal(route.surveyedSupport(gate.east,gate.north),347);
  assert.equal(route.surfaceAt(gate.east,gate.north),undefined);
  assert.equal(route.enterAt(gate,()=>false),false);assert.equal(route.active(),false);
  assert.equal(route.enterAt({...gate,height:340},()=>{throw Error('unsupported foot must not reach authority');}),false);
  // An affirmative test certificate exercises reparenting, not public access.
  assert.equal(route.enterAt(gate,()=>true),true);
  assert.equal(route.state().sceneOwner,'summit');assert.equal(root.parent,route.scene);assert.equal(route.surfaceAt(gate.east,gate.north),347);
  assert.match(route.updateView(gate),/金色徒步线.*山顶约.*山门约/);
  assert.equal(route.leaveAt({...gate,height:340},()=>{throw Error('unsupported exit must not reach authority');}),false);
  assert.equal(route.leaveAt(gate,()=>false),false);assert.equal(route.active(),true);
  assert.equal(route.leaveAt(gate,()=>true),true);assert.equal(root.parent,town);assert.equal(route.surfaceAt(gate.east,gate.north),undefined);
  route.update(far);assert.equal(skyline.visible,true);
 }finally{route.dispose();route.dispose();}
 assert.equal(town.getObjectByName('town-d2-r30-production'),undefined);assert.equal(skyline.visible,true);
});
test('public staging aborts safely when its page is released',async()=>{
 const town=new Scene(),skyline=new Group();town.add(skyline);
 let unblock:()=>void=()=>{};
 const route=createA31PublicSummitRoute({town,skyline,now:()=>0,yieldFrame:()=>new Promise<void>(r=>{unblock=r;})});
 const loading=route.prepare();
 // Dispose while the import/first idle boundary is outstanding.
 route.dispose();await new Promise<void>(resolve=>setTimeout(resolve,50));unblock();
 assert.equal(await loading,false);assert.equal(route.state().status,'disposed');assert.equal(town.getObjectByName('town-d2-r30-production'),undefined);
});
