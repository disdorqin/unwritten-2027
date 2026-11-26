import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {r30ReturnRelocationCandidate as plan,mountR30ReturnRelocationCandidate,surveyR30ReturnRelocation} from '../tools/voxel-tavern/town-blockout/town-c-r30-return-relocation-candidate.js';
import {r30ReturnBay,r30ReturnBayFloor} from '../src/shared/town-c-r30-return-bay.js';
test('new B return axis fits a sealed relocated station and real continuous candidate rock corridor',()=>{
 const parent=new Group(),candidate=mountR30ReturnRelocationCandidate(parent),survey=surveyR30ReturnRelocation();
 const real=new Group(),h=mountUndergroundDomainHost({parent:real,road:mountWestCraterRoad(260,()=>10.7773)});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  assert.ok(survey.axisError<1e-8);assert.ok(survey.allFeetWithinPresence);
  assert.ok(survey.planarOffset>18.6&&survey.planarOffset<18.61);
  assert.ok(survey.routeLength>24&&survey.routeLength<26);
  assert.equal(survey.productionReady,false);assert.equal(candidate.station.contract?.productionReady,false);
  assert.ok(candidate.parts>200);
  parent.updateMatrixWorld(true);
  let distance=0;
  for(const [i,b] of plan.path.slice(1).entries()){
   const a=plan.path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/.08);distance+=length;
   for(let j=0;j<=n;j++){
    const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n,p=candidate.passageAt(x,z);
    assert.ok(p,'candidate path '+x+','+z);
    const hit=new Raycaster(new Vector3(x,p.floor+.25,z),new Vector3(0,-1,0),0,.5).intersectObject(candidate.shell)[0];
    assert.ok(hit&&Math.abs(hit.point.y-p.floor)<.001);
    const roof=new Raycaster(new Vector3(x,p.floor+1.8,z),new Vector3(0,1,0),0,2).intersectObject(candidate.shell)[0];
    assert.ok(roof&&Math.abs(roof.point.y-p.floor-plan.ceiling)<.001,'closed roof');
   }
  }
  assert.ok(distance>24);
  assert.ok(candidate.arrows.length>=4);assert.equal(candidate.lamps.length,3);
  for(const a of candidate.arrows){
   assert.ok(candidate.passageAt(a.x,a.z));
   assert.ok(candidate.passageAt(a.x+.25*a.dx,a.z+.25*a.dz),'arrow points along actual return corridor');
  }
  for(const l of candidate.lamps){
   const q=candidate.passageAt(l.x,l.z)!;assert.ok(q&&q.clearance>2.5&&q.clearance<2.6);
   assert.equal(candidate.passageAt(l.x,l.z,.27,2.8),undefined,'real hanging lantern limits tall capsule');
   const hit=new Raycaster(new Vector3(l.x,q.floor+1.8,l.z),new Vector3(0,1,0),0,2).intersectObjects(candidate.group.children,true)[0];
   assert.ok(hit&&Math.abs(hit.point.y-q.floor-q.clearance)<.002,'lamp underside matches actual clearance');
  }
  assert.ok(candidate.passageAt(plan.approach[0],plan.approach[2]));
  assert.ok(candidate.passageAt(plan.dock[0],plan.dock[2]));
  for(const f of candidate.feet)assert.equal(candidate.passageAt(f.x,f.z),undefined);
  const old=h.returnBay.contract!.dock,proposed=h.mounted.toWorld(plan.dock)!;
  assert.ok(Math.hypot(proposed.east-survey.world.east,proposed.north-survey.world.north,proposed.height-survey.world.height)<1e-8);
  assert.ok(h.passageAt(old.east,old.north));
  assert.equal(h.passageAt(proposed.east,proposed.north),undefined,'candidate not production');
  real.updateMatrixWorld(true);
  const a=h.mounted.toWorld([-6.5,r30ReturnBayFloor(r30ReturnBay.dock.z)+1,r30ReturnBay.dock.z])!,b=h.mounted.toWorld([-7.5,r30ReturnBayFloor(r30ReturnBay.dock.z)+1,r30ReturnBay.dock.z])!;
  const rock=h.mounted.group.getObjectByName('underground-mine-rock')!,dir=new Vector3(b.east-a.east,b.height-a.height,-b.north+a.north).normalize();
  const wall=new Raycaster(new Vector3(a.east,a.height,-a.north),dir,0,1).intersectObject(rock)[0];
  assert.ok(wall&&Math.abs(wall.distance-.3)<.001,'existing rock west face remains sealed');
 }finally{h.mounted.dispose();candidate.dispose()}
 assert.equal(parent.children.length,0);assert.equal(real.children.length,0);
});
