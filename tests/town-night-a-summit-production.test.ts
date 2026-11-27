import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {buildMainSummitTrailCut} from '../tools/voxel-tavern/town-blockout/main-summit-trail-cut';
import {mountSouthProduction} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-production';

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
  }finally{s.dispose();s.dispose();}
  assert.equal(f.tile.geometry,f.original);assert.equal(f.disposals(),1);
  assert.equal(f.owner.getObjectByName('night-a-south-sector'),undefined);
  assert.equal(s.supportAt(110,100),undefined);assert.equal(s.blocked(24,23,347),false);
 }finally{f.original.dispose();f.mat.dispose();}
});
test('missing near-ground coverage rolls back cut buffers and does not mount any duplicate sector',()=>{
 const f=fixture();
 try{
  assert.throws(()=>mountSouthProduction({...f.input,last:21,trail:f.input.trail.map(p=>({...p,east:p.east+16}))}),/coverage/);
  assert.equal(f.tile.geometry,f.original);assert.equal(f.owner.getObjectByName('night-a-south-sector'),undefined);
  assert.equal(f.disposals(),1);
  assert.throws(()=>mountSouthProduction({...f.input,legacyTreadExcluded:false}),/exclusive/);
 }finally{f.original.dispose();f.mat.dispose();}
});
