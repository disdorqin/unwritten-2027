import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
type Point={east:number;north:number;height:number};
test('both deep dry retreat trails are continuous in both directions and dead siding pocket is physically filled',()=>{
 const parent=new Group(),h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773)});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const t=h.deepRetreat;assert.equal(t.trails.length,2);assert.ok(t.markers.length>=12);
  const world=(x:number,z:number)=>h.mounted.toWorld([x,-91,z])!;
  for(const r of t.trails)for(const points of [r.points,[...r.points].reverse()]){
   let foot:Point=world(...points[0]);
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.08);
    for(let k=1;k<=n;k++){
     const to=world(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n);
     const next=h.resolveMineStep(foot,to,'standing');assert.ok(next,r.id+' segment '+i+'/'+k);
     assert.equal(h.passageAt(next.foot.east,next.foot.north)?.waterDepth,0);foot=next.foot;
    }
   }
  }
  const p=world(-3.875,118.375);assert.equal(h.passageAt(p.east,p.north,'crouching'),undefined);
  const rock=world(-4.03,118.45);parent.updateMatrixWorld(true);
  assert.ok(new Raycaster(new Vector3(rock.east,-90.2,-rock.north),new Vector3(0,-1,0),0,.8).intersectObject(h.mounted.galleryArt!.group,true).length);
  assert.equal(h.mainline?.kind,'ready');assert.equal(h.encounterSurvey?.ready,true);assert.equal(h.oreSurvey.kind,'ready');
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
