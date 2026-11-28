import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {buildMainSummitTrailCut} from '../tools/voxel-tavern/town-blockout/main-summit-trail-cut';
import {mountSouthProduction} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-production';
import {createTownD2R30Massif} from '../tools/voxel-tavern/town-blockout/town-d2-r30-massif';
import {createTownD2R30Collision} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {createMainSummitCable} from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import {createSouthReservation} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-reservation';
import {proposeSouthRoadGrade} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-road-grade';

/** Independent test index: intersect the actual cut triangle mesh.
 * Production D2 injects B's canonical color-preserving cutter and index,
 * not this deliberately slow test ray. */
function fixture(){
 const owner=new Group(),terrain=new Group();owner.add(terrain);
 const p:number[]=[],idx:number[]=[];
 for(let n=88;n<=112;n+=8)for(let e=96;e<=128;e+=8){
  p.push(e,347,-n);
  if(n<112&&e<128){const i=(n-88)/8*5+(e-96)/8;idx.push(i,i+1,i+5,i+1,i+6,i+5);}
 }
 const original=new BufferGeometry();original.setAttribute('position',new Float32BufferAttribute(p,3));original.setIndex(idx);original.computeVertexNormals();
 const mat=new MeshBasicMaterial({side:DoubleSide}),tile=new Mesh(original,mat);terrain.add(tile);
 let indexDisposals=0;
 const input={owner,groundAt:()=>347,reserved:(e:number,n:number)=>Math.abs(n-100)<18&&e>80&&e<140,
  trail:Array.from({length:23},(_,i)=>({east:99+i,north:100,height:346.6})),first:1,last:21,
  nearTiles:[tile],legacySouthVegetationExcluded:true,legacyTreadExcluded:true,
  cutTerrain:buildMainSummitTrailCut,
  createCutSurface(g:BufferGeometry){
   g.computeBoundingBox();const b=g.boundingBox!,surface=new Mesh(g,mat),ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));surface.updateMatrixWorld(true);
   const covers=(e:number,n:number)=>e>=b.min.x&&e<=b.max.x&&-n>=b.min.z&&-n<=b.max.z;
   return {covers,surfaceAt(e:number,n:number){ray.ray.origin.set(e,900,-n);return ray.intersectObject(surface,false)[0]?.point.y;},dispose(){indexDisposals++;}};
  }
 };
 return {input,owner,tile,original,mat,disposals:()=>indexDisposals};
}
test('southern production replaces the real near mesh and releases it atomically',()=>{
 const f=fixture();
 try{
  const s=mountSouthProduction(f.input);
  try{
   assert.equal(s.cutChunks,1);assert.notEqual(f.tile.geometry,f.original);
   assert.equal(f.owner.getObjectByName('night-a-south-sector'),s.group);
   for(let e=100.25;e<120;e+=.25){
    assert.ok(Math.abs(s.supportAt(e,100)!-346.655)<.001);
    assert.ok(s.groundAt(e,100)!<346.655);
    assert.equal(s.blocked(e,100,346.655),false);
   }
   assert.equal(s.groundAt(90,100),347);
   assert.throws(()=>mountSouthProduction(f.input),/already mounted/);
   s.group.removeFromParent();
   assert.equal(s.supportAt(110,100),undefined);
   assert.equal(s.blocked(24,23,347),false);
   s.updateSnow(1,()=>{throw Error('Detached sector must not sample weather');});
   f.owner.add(s.group);assert.ok(s.supportAt(110,100)!>346.6);
  }finally{s.dispose();s.dispose();}
  assert.equal(f.tile.geometry,f.original);assert.equal(f.disposals(),1);
  assert.equal(f.owner.getObjectByName('night-a-south-sector'),undefined);
  assert.equal(s.supportAt(110,100),undefined);assert.equal(s.blocked(24,23,347),false);
 }finally{f.original.dispose();f.mat.dispose();}
});
test('full 833m A assembly replaces actual D2 8m tiles and restores them, not just a flat fixture',async()=>{
 // Integration automatically uses B's actual module once it lands.
 // For independent branch acceptance, pass its read-only checked-out file:
 // A_R30_B_CUT_MODULE=../window-b/tools/voxel-tavern/town-blockout/town-night-b-summit-west-cut.ts
 const modulePath=resolve(process.env.A_R30_B_CUT_MODULE??'tools/voxel-tavern/town-blockout/town-night-b-summit-west-cut.ts');
 if(process.env.A_R30_B_CUT_MODULE&&!existsSync(modulePath))throw Error('Requested B source does not exist');
 const actualB=existsSync(modulePath)?await import(pathToFileURL(modulePath).href) as {
  cutNightBWestTerrain:Parameters<typeof mountSouthProduction>[0]['cutTerrain'];
  createNightBWestCutSurface:Parameters<typeof mountSouthProduction>[0]['createCutSurface'];
 }:undefined;
 const owner=new Group(),massif=createTownD2R30Massif(),collision=createTownD2R30Collision();
 owner.add(massif.group);
 const block=createMainSummitBlock(mainSummitLayout,347,100);
 const old=createMainSummitTrail(block.heightAt,347).points,cable=createMainSummitCable(0,10000,347);
 const reserved=createSouthReservation([{points:old,radius:18},...cable.ropes.map(r=>({points:r.points,radius:40}))],[{west:-42,east:42,south:-10,north:55}]);
 const topTiles=massif.group.children.filter(o=>o.name.startsWith('town-d2-r30-top-')) as Mesh[];
 const originals=topTiles.map(m=>m.geometry);
 const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 try{
  const profile=proposeSouthRoadGrade(old,1,834,collision.surfaceAt);
  assert.ok(profile.ok);if(!profile.ok)throw Error('The current D2 terrain requires reprofile');
  const points=[...old.slice(0,1),...profile.profile,...old.slice(835)];
  const south=mountSouthProduction({owner,groundAt:collision.surfaceAt,reserved,trail:points,first:1,last:834,
   nearTiles:topTiles,legacySouthVegetationExcluded:true,legacyTreadExcluded:true,
   cutTerrain:actualB?.cutNightBWestTerrain??((source,tread)=>{
    const result=buildMainSummitTrailCut(source,tread);
    if(!result.refinedTriangles){result.geometry.dispose();return {geometry:source};}
    return result;
   }),
   createCutSurface:actualB?.createNightBWestCutSurface??(g=>{
    g.computeBoundingBox();const b=g.boundingBox!,m=new Mesh(g,mat);m.updateMatrixWorld(true);
    const covers=(e:number,n:number)=>e>=b.min.x&&e<=b.max.x&&-n>=b.min.z&&-n<=b.max.z;
    return {covers,surfaceAt(e,n){ray.ray.origin.set(e,900,-n);return ray.intersectObject(m,false)[0]?.point.y;},dispose(){}};
   })
  });
  try{
   assert.ok(south.cutChunks>1);
   assert.equal(south.cutChunks,topTiles.filter((m,i)=>m.geometry!==originals[i]).length);
   let samples=0;
   for(let i=2;i<=834;i++){
    const a=points[i-1]!,b=points[i]!,prev=points[i-2]!,next=points[i+1]!;
    const side=(p:typeof a,l:typeof a,r:typeof a,t:number)=>{
     const de=r.east-l.east,dn=r.north-l.north,d=Math.hypot(de,dn);
     return {e:p.east-dn/d*t,n:p.north+de/d*t};
    };
    for(const t of [-1,0,1])for(const f of actualB?[.125,.375,.625,.875]:[.5]){
     const u=side(a,prev,b,t),v=side(b,a,next,t),e=u.e+(v.e-u.e)*f,n=u.n+(v.n-u.n)*f,h=south.supportAt(e,n),road=south.sector.road!.supportAt(e,n);
     assert.ok(h!==undefined&&road!==undefined&&Math.abs(h-road)<.001,JSON.stringify({i,e,n,h,road}));
     assert.equal(south.blocked(e,n,h),false,JSON.stringify({i,e,n,h}));samples++;
    }
   }
   south.updateView(0,0);south.setNight(true);
   if(actualB)for(const tile of topTiles)assert.equal(tile.geometry.getAttribute('color').count,tile.geometry.getAttribute('position').count);
   assert.equal(samples,actualB?9996:2499);
   console.log(JSON.stringify({cutter:actualB?'actual B source':'independent P3 ray reference',length:profile.length,cutChunks:south.cutChunks,samples,topTiles:topTiles.length,forest:south.sector.forest.stats}));
  }finally{south.dispose();}
  assert.ok(topTiles.every((m,i)=>m.geometry===originals[i]));
  assert.equal(owner.getObjectByName('night-a-south-sector'),undefined);
 }finally{block.dispose();collision.dispose();massif.dispose();mat.dispose();}
});

test('missing near-ground coverage rolls back cut buffers and does not mount any duplicate sector',()=>{
 const f=fixture();
 try{
  assert.throws(()=>mountSouthProduction({...f.input,last:21,trail:f.input.trail.map(p=>({...p,east:p.east+16}))}),/coverage/);
  assert.equal(f.tile.geometry,f.original);assert.equal(f.owner.getObjectByName('night-a-south-sector'),undefined);
  assert.equal(f.disposals(),1);
  assert.throws(()=>mountSouthProduction({...f.input,legacyTreadExcluded:false}),/exclusive/);
  f.tile.parent!.position.x=1;
  assert.throws(()=>mountSouthProduction(f.input),/transform/);
  f.tile.parent!.position.x=0;
  f.tile.removeFromParent();
  assert.throws(()=>mountSouthProduction(f.input),/not owned/);
  assert.equal(f.tile.geometry,f.original);
 }finally{f.original.dispose();f.mat.dispose();}
});
