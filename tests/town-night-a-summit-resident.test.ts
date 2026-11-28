import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,Raycaster,Vector3} from 'three';
import {createTerrainGrid,layout} from '../tools/voxel-tavern/town-blockout/terrain';
import {addTerrainMeshes} from '../tools/voxel-tavern/town-blockout/terrain-mesh';
test('pending terrain is real, disjoint from ridge cells and replaced by exact near geometry',()=>{
 const g=createTerrainGrid(),parent=new Group();
 // A diagonal and mixed-cell cut like the real ridge ownership fringe.
 const owns=(e:number,n:number)=>n>=352&&e>=300&&e<=530&&Math.floor(n/3)%2===0;
 const prepare=addTerrainMeshes(parent,g,owns);
 const resident=parent.getObjectByName('Continuous outer terrain coverage')!;
 const detail=parent.getObjectByName('Walkable terrain')!;
 assert.ok(resident.children.length>0);
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 const hit=(e:number,n:number)=>{parent.updateMatrixWorld(true);ray.ray.origin.set(e,1000,-n);return ray.intersectObjects([...resident.children,...detail.children] as Mesh[],false);};
 let checked=0;
 for(let n=Math.ceil(layout.depth/64)*64+.37;n<799;n+=19.21)for(let e=1.24;e<639;e+=23.73){
  const hits=hit(e,n);
  assert.equal(hits.length,owns(Math.floor(e),Math.floor(n))?0:1,JSON.stringify({e,n}));
  checked++;
 }
 assert.ok(checked>400);
 const oldCount=resident.children.length;
 const e=42.21,n=683.31;
 assert.equal(hit(e,n).length,1);
 prepare(e,n,false,false);
 assert.ok(resident.children.length<oldCount);
 const h=hit(e,n);
 assert.equal(h.length,1);
 assert.ok(Math.abs(h[0]!.point.y-g.groundHeightAt(e,n))<1e-5);
 // All sampled cells across the mixed ownership fringe stay hole-free.
 for(let n=647.23;n<709;n+=3.71)for(let e=299.31;e<340;e+=3.13)
  assert.equal(hit(e,n).length,owns(Math.floor(e),Math.floor(n))?0:1);
});
