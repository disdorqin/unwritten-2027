import {Group,PerspectiveCamera,Frustum,Matrix4} from 'three';
import {createTerrainGrid} from './voxel-tavern/town-blockout/terrain.ts';
import {addTerrainMeshes} from './voxel-tavern/town-blockout/terrain-mesh.ts';
import {performance} from 'node:perf_hooks';
const grid=createTerrainGrid(),scene=new Group(),prepare=addTerrainMeshes(scene,grid);
const detail=scene.getObjectByName('Walkable terrain');
const camera=new PerspectiveCamera(58,1280/720,.1,2400);
const output=[];
for(const [east,north,h] of [[223,180,12],[543.6,412,11.89],[296,520,8.1]]){
 camera.position.set(east,h+1.65,-north);
 for(let i=0;i<20;i++)prepare(east,north,false,false,.55,camera,true);
 const sample=[];
 let uploads=0,bytes=0,triangles=0;
 const versions=new WeakMap();
 for(let i=0;i<360;i++){
  const a=i*Math.PI/180;
  camera.lookAt(east+Math.sin(a),h+1.65,-north-Math.cos(a));
  const t=performance.now();prepare(east,north,false,false,.55,camera,true);sample.push(performance.now()-t);
  const f=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const m of detail.children){
   const g=m.geometry,idx=g.index;
   if(m.visible&&f.intersectsObject(m)){
    triangles+=g.drawRange.count/3;
    if(idx&&versions.get(idx)!==idx.version){uploads++;bytes+=g.drawRange.count*idx.array.BYTES_PER_ELEMENT;versions.set(idx,idx.version);}
   }
  }
 }
 sample.sort((a,b)=>a-b);
 output.push({east,north,frames:sample.length,cpuMean:sample.reduce((a,b)=>a+b,0)/sample.length,cpuP95:sample[Math.floor(sample.length*.95)],cpuMax:sample.at(-1),indexChanges:uploads,indexBytesEstimate:bytes,meanSubmittedTriangles:triangles/sample.length});
}
console.log(JSON.stringify(output));
// CPU-only controlled sweep. The byte count is a conservative index update
// estimate, not a measurement of GPU upload bandwidth or game FPS.
