import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Matrix4,Vector3,type InstancedMesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const mouth=road.mouthWorks,boxes=road.group.userData.colliders as {min:number[];max:number[]}[];
function blocked(e:number,n:number,h:number,r=.27){
 return boxes.some(b=>e+r>b.min[0]&&e-r<b.max[0]&&-n+r>b.min[2]&&-n-r<b.max[2]&&h+1.8>b.min[1]&&h+.03<b.max[1]);
}
test('B91 point 4: registration table has a physical table and a free grounded use foot distinct from the old notice',()=>{
 const d=mouth.registrationDesk;assert.ok(d);
 assert.equal(d.useHeight,road.heightAt(d.useEast,d.useNorth));
 assert.ok(blocked(d.east,d.north,d.height));
 assert.ok(!blocked(d.useEast,d.useNorth,d.useHeight));
 assert.ok(Math.hypot(d.useEast-d.east,d.useNorth-d.north)>1.5);
 const notice=mouth.actions.find(a=>a.id==='registration');assert.ok(notice);
 assert.equal(notice.label,'阅读入坑告示');
 assert.ok(Math.hypot(notice.east-d.useEast,notice.north-d.useNorth)>2);
});
test('B91 point 3: all existing wrecks are individually identified; exactly five physical ship fragments in separated sectors',()=>{
 const p=mouth.wreckagePieces;
 assert.equal(p.length,mouth.debrisCount);
 assert.ok(p.length>=20);
 assert.equal(new Set(p.map(x=>x.id)).size,p.length);
 const ships=p.filter(x=>x.ship);assert.equal(ships.length,5);
 const ring=mouth.group.getObjectByName('crater-wreckage-ring') as InstancedMesh;
 const m=new Matrix4(),v=new Vector3();
 for(const x of p){
   ring.getMatrixAt(x.instance,m);v.setFromMatrixPosition(m);
   assert.ok(Math.hypot(v.x-x.east,-v.z-x.north)<.00005);
   assert.equal(x.height,road.heightAt(x.east,x.north));
   assert.ok(Math.hypot(x.east-road.anchor.east,x.north-road.anchor.north)>=59);
 }
 for(const x of ships){
   assert.ok(mouth.sites.some(s=>s.id===x.id));
   assert.ok(!blocked(x.east,x.north,x.height));
   for(const y of ships)if(x!==y)assert.ok(Math.hypot(x.east-y.east,x.north-y.north)>20);
 }
});
test('B91 point 3 and 4: surveyed outer-slope ground routes stay outside the bowl and structural colliders',()=>{
 const routes=[
  [[-68,142],[-98,127],[-108,118]],
  [[-68,142],[-98,127],[-110,124],[-126,123],[-161,132],[-171,142]],
  [[-68,142],[-98,127],[-110,124],[-126,123],[-151,129],[-170,148],[-178,163],[-187,174],[-195,201]],
  [[-68,142],[-59,174],[-58,192],[-65,217],[-105,257]],
  [[-68,142],[-59,174],[-58,192],[-66,224]],
  [[-68,142],[-59,174],[-58,192],[-65,217],[-83,235],[-98,243],[-110,246],[-126,247],[-150,247]]
 ];
 for(const route of routes)for(let j=1;j<route.length;j++){
  const a=route[j-1],b=route[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*5);
  for(let i=0;i<=steps;i++){
   const e=a[0]+(b[0]-a[0])*i/steps,n=a[1]+(b[1]-a[1])*i/steps,h=road.heightAt(e,n);
   assert.ok(h!==undefined);
   assert.ok(Math.hypot(e-road.anchor.east,n-road.anchor.north)>61.5);
   assert.ok(!blocked(e,n,h,.55),JSON.stringify({e,n}));
  }
 }
});
