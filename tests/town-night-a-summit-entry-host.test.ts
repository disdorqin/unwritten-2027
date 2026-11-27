import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {mountMainSummitAssembly} from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import {mountZa22MountainGate} from '../tools/voxel-tavern/town-blockout/town-za22-mountain-gate';
import {createSouthEntryHost} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-entry-host';
test('real main summit assembly consumes the A entrance once and keeps existing gate and guardroom routes clear',()=>{
 const owner=new Group(),a=mountMainSummitAssembly(owner,0),gate=mountZa22MountainGate(a,{open(){}});
 const host=createSouthEntryHost();
 try{
  host.sync(undefined,false);assert.equal(host.mounted(),false);
  host.sync(a,false);assert.equal(host.mounted(),true);
  const first=a.group.getObjectByName('night-a-south-entry');assert.ok(first);
  host.sync(a,true);assert.equal(a.group.getObjectByName('night-a-south-entry'),first);
  const localBlocked=(e:number,n:number,h:number)=>host.blocked(e+300,n+676,h)||a.blocked(e,n,h,.27,1.8);
  for(let n=-14;n<=35;n+=.2){
   const h=gate.surfaceAt(300,n+676)??a.stations.heightAt(0,n)!;
   assert.ok(!localBlocked(0,n,h),JSON.stringify({n,h}));
  }
  for(let e=0;e<=7.25;e+=.2)assert.ok(!localBlocked(e,7,347),'guardroom entrance E'+e);
  assert.ok(host.blocked(324,699,347));
  for(let e=15.8;e<=18.2;e+=.2)assert.ok(!localBlocked(e,31.8,347),'rest shelter approach');
  assert.ok(host.blocked(315.35,710.03,347));
  assert.ok(host.blocked(318.65,710.03,347));
  // Later D2 mount owns this exact same entrance; narrow host withdraws.
  const full=new Group();full.name='night-a-south-sector';a.group.add(full);
  host.sync(a,true);assert.equal(host.mounted(),false);assert.equal(first.parent,null);
  full.removeFromParent();host.sync(a,false);assert.equal(host.mounted(),true);
  // Detaching a real domain must disable the old colliders immediately,
  // even before the next animation-frame sync.
  const beforeDetach=a.group.getObjectByName('night-a-south-entry');assert.ok(beforeDetach);
  a.group.removeFromParent();assert.equal(host.mounted(),false);assert.equal(host.blocked(324,699,347),false);
  host.sync(a,true);assert.equal(beforeDetach.parent,null);
  owner.add(a.group);host.sync(a,true);assert.equal(host.mounted(),true);
  const remounted=a.group.getObjectByName('night-a-south-entry');assert.ok(remounted);assert.notEqual(remounted,beforeDetach);
  assert.ok(host.blocked(324,699,347));
  remounted.removeFromParent();assert.equal(host.blocked(324,699,347),false);
  host.sync(a,true);assert.equal(host.mounted(),true);assert.notEqual(a.group.getObjectByName('night-a-south-entry'),remounted);
  host.sync(undefined,false);assert.equal(host.mounted(),false);assert.equal(host.blocked(324,699,347),false);
 }finally{host.dispose();gate.dispose();a.dispose();}
});
