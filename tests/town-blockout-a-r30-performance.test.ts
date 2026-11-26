import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,MeshStandardMaterial,type Mesh} from 'three';
import {mountAR30StaticBatches} from '../tools/voxel-tavern/town-blockout/town-a-r30-static-batches';
import {nearestTownActivity,type TownActivitySpot} from '../tools/voxel-tavern/town-blockout/town-activity';

function triangleKeys(g:BufferGeometry){
 const names=Object.keys(g.attributes).sort(),count=g.index?.count??g.getAttribute('position').count;
 const keys:string[]=[];
 for(let i=0;i<count;i+=3){
  const data:number[]=[];
  for(let j=0;j<3;j++){
   const v=g.index?.getX(i+j)??i+j;
   for(const name of names){const a=g.getAttribute(name);for(let k=0;k<a.itemSize;k++)data.push(a.array[v*a.itemSize+k]!);}
  }
  keys.push(JSON.stringify(data));
 }
 return keys;
}
test('indexed spatial batches preserve every authored triangle, normal, UV, winding and shared material',()=>{
 const material=new MeshStandardMaterial();
 const box=new BoxGeometry(2,3,4).translate(-12,2,-5);
 // Large network with triangles on both sides of several partition boundaries.
 const line=new BoxGeometry(960,1,2,850,1,1).translate(310,5,-50).toNonIndexed();
 const plane=new BoxGeometry(2,4,2).translate(11,3,-85);
 const parts=[box,line,plane],expected=parts.flatMap(triangleKeys).sort();
 // Make the real large-material threshold active, without simplifying any vertex.
 for(let i=0;i<300;i++)parts.push(new BoxGeometry(1,1,1).translate(i*2-250,0,-80));
 const all=parts.flatMap(triangleKeys).sort();
 assert.ok(all.length>expected.length);
 const originalVertices=parts.reduce((n,g)=>n+(g.index?.count??g.getAttribute('position').count),0);
 let released=0;for(const p of parts)p.addEventListener('dispose',()=>released++);
 const group=new Group(),batches=new Map([[material,parts]]);
 mountAR30StaticBatches(group,batches,'audit',160);
 const meshes=group.children as Mesh[];
 assert.ok(meshes.length>1);assert.equal(batches.size,0);
 assert.ok(meshes.every(m=>m.material===material&&m.geometry.index&&m.geometry.boundingSphere));
 assert.deepEqual(meshes.flatMap(m=>triangleKeys(m.geometry)).sort(),all);
 assert.ok(meshes.reduce((n,m)=>n+m.geometry.getAttribute('position').count,0)<originalVertices);
 assert.equal(released,parts.length);
 for(const m of meshes)m.geometry.dispose();material.dispose();
});
test('nearby activity selection checks live availability only after spatial rejection',()=>{
 let remoteCalls=0,nearCalls=0,enabled=false;
 const spot=(x:number,n:number,range:number,available:()=>boolean):TownActivitySpot=>({x,n,range,ground:10,label:String(x),available,run(){}});
 const remote=Array.from({length:300},(_,i)=>spot(i+20,0,1,()=>{remoteCalls++;return true;}));
 const first=spot(1,0,2,()=>{nearCalls++;return enabled;});
 const tied=spot(-1,0,2,()=>{nearCalls++;return true;});
 const farther=spot(1.8,0,2,()=>{nearCalls++;return true;});
 const spots=[...remote,first,tied,farther];
 assert.equal(nearestTownActivity(spots,0,0,10),tied);assert.equal(remoteCalls,0);assert.equal(nearCalls,2);
 enabled=true;nearCalls=0;
 assert.equal(nearestTownActivity(spots,0,0,10),first);assert.equal(nearCalls,1);
 assert.equal(nearestTownActivity(spots,0,0,12),undefined);
 assert.equal(remoteCalls,0);
});
