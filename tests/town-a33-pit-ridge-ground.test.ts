import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,Raycaster,Vector3} from 'three';
import {createTerrainGrid} from '../tools/voxel-tavern/town-blockout/terrain';
import {addTerrainMeshes} from '../tools/voxel-tavern/town-blockout/terrain-mesh';
import {createA33ExactGroundCoverage} from '../tools/voxel-tavern/town-blockout/town-a33-pit-ridge-ground';
test('exact ground covers railway shoulder and E0 seam before any movement; ridge owns its own cells',()=>{
 const grid=createTerrainGrid(),root=new Group();
 const mask=(e:number,n:number)=>e>=288&&e<320&&n>=496&&n<528;
 const exact=createA33ExactGroundCoverage([[{east:300,north:520},{east:312,north:580}]]);
 addTerrainMeshes(root,grid,mask,false,exact);
 root.updateMatrixWorld(true);
 const detail=root.getObjectByName('Walkable terrain')!;
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 let samples=0;
 for(const [e0,n0] of [[0,384],[256,512],[320,512],[256,576]])for(let e=e0+.37;e<e0+64;e+=7.1)for(let n=n0+.217;n<n0+64;n+=7.3){
  ray.ray.origin.set(e,900,-n);const hits=ray.intersectObjects(detail.children,false);
  if(mask(Math.floor(e),Math.floor(n)))assert.equal(hits.length,0);
  else{assert.equal(hits.length,1,JSON.stringify({e,n}));assert.ok(Math.abs(hits[0]!.point.y-grid.groundHeightAt(e,n))<.0001);samples++;}
 }
 assert.ok(samples>250);
 for(const mesh of detail.children as Mesh[])mesh.geometry.dispose();
});
