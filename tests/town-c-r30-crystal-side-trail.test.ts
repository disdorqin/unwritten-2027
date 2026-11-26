import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernToWorld,crystalCavernTrailHeight,crystalCavernTrailEast,crystalCavernArchitecture,crystalCavernR30Pieces} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {crystalSideTrailNorth,r30CrystalSideTrail} from '../tools/voxel-tavern/town-blockout/town-c-r30-crystal-support.js';
test('original west gallery becomes a supported side trail with real continuous bidirectional steps',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
 crystalBridge:{acceptsFrame:()=>true,readGateStage:()=>'open'}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();const ch=h.crystalHost,c=ch.contract!,art=ch.sideArt!;
  const p=(e:number,n:number)=>crystalCavernToWorld(c.frame,[e,crystalCavernTrailHeight(n),n]);
  const start=p(crystalCavernTrailEast(56),56);
  foot={...start,domainId:c.crystal.domainId};h.mounted.sync();parent.updateMatrixWorld(true);
  const floor=ch.mounted!.group.getObjectByName('r30-crystal-route-floor')!;
  let steps=0,distance=0;
  const walk=(to:{east:number;north:number})=>{
   const a=foot!,d=Math.hypot(a.east-to.east,a.north-to.north),count=Math.max(1,Math.ceil(d/.08));
   for(let i=1;i<=count;i++){
    const q={east:a.east+(to.east-a.east)*i/count,north:a.north+(to.north-a.north)*i/count};
    const next=h.resolveUndergroundStep(foot!,q,'standing');
    assert.ok(next,'continuous path '+JSON.stringify(q));foot=next.foot;steps++;
    const hits=new Raycaster(new Vector3(foot.east,foot.height+.2,-foot.north),new Vector3(0,-1,0),0,.4).intersectObject(floor);
    assert.ok(hits[0]&&Math.abs(hits[0].point.y-foot.height)<.001,'visible floor matches foot');
   }
   distance+=d;
  };
  const west=-50.85;
  for(let e=10.1;e>west;e-=.1)walk(p(e,crystalSideTrailNorth(e)!));
  walk(p(west,crystalSideTrailNorth(west)!));
  for(let e=west;e<10.1;e+=.1)walk(p(e,crystalSideTrailNorth(e)!));
  walk(start);
  assert.ok(steps>1500&&distance>122&&distance<125);
  assert.ok(Math.hypot(foot.east-start.east,foot.north-start.north,foot.height-start.height)<.001);
  for(const e of [-50,-43,-36,-23,-15,-5,0]){
   const n=crystalSideTrailNorth(e)!;
   for(const s of [-1,1]){
    const q=p(e,n+s*(r30CrystalSideTrail.halfWidth+.5));
    assert.equal(ch.passageAt(c.crystal.domainId,q.east,q.north),undefined);
   }
  }
  // Cast from both exposed sides below the walking plane: this is a
  // continuous supporting volume, not a detached top plane.
  const bed=ch.mounted!.group.getObjectByName('r30-crystal-side-trail-subgrade')!;
  for(const e of [-45,-35,-25,-15,-5]){
   const n=crystalSideTrailNorth(e)!;
   for(const side of [-1,1]){
    const from=p(e,n+side*2.1),to=p(e,n),origin=new Vector3(from.east,from.height-.30,-from.north),target=new Vector3(to.east,to.height-.30,-to.north);
    const hit=new Raycaster(origin,target.sub(origin).normalize(),0,2.1).intersectObject(bed)[0];assert.ok(hit,'subgrade side '+e+'/'+side);
   }
  }
  assert.ok(art.parts.length>100);assert.equal(art.alcove.length,18);
  for(const b of art.alcove)assert.ok(art.blocks(b.e,b.n,b.y-b.h/2,.27,1.8));
  assert.equal(crystalCavernR30Pieces.length,crystalCavernArchitecture.pieces.length);
  const changed=crystalCavernR30Pieces.filter((part,i)=>part!==crystalCavernArchitecture.pieces[i]);
  assert.ok(changed.length>20&&changed.every(part=>part.name.startsWith('u3/crystals/48/')));
  assert.ok(changed.every(part=>{const old=crystalCavernArchitecture.pieces.find(p=>p.name===part.name)!;return Math.abs(part.center[2]-old.center[2]-6)<1e-9&&part.rotationZ===old.rotationZ}));
  console.log(JSON.stringify({steps,distance,parts:art.parts.length,bounds:art.bounds.length,shifted:changed.length}));
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
