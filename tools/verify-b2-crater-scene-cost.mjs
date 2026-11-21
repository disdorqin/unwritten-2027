/**
 * B-2 full-loaded crater module budget: independent from first-person renderer
 * statistics. The output is a source-level live Three.js object-graph census,
 * NOT visible triangles per camera and NOT an optimized camera benchmark.
 * Never confuse these counts with renderer.info.render.*
 */
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createTerrainGrid,worldBounds} from './voxel-tavern/town-blockout/terrain.ts';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.ts';
const out=path.resolve(process.argv[2]??'');
assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});
const terrain=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>terrain.groundHeightAt(0,n));
function count(root,label) {
  let meshNodes=0,triangleCapacity=0,lights=0,instanced=0,points=0;
  root.traverse(n=>{
    if(n.isLight) lights++;
    if(n.isMesh||n.isPoints||n.isLine) {
      if(!n.geometry) return;
      meshNodes++;
      const primitiveCount=n.geometry.index?.count??n.geometry.attributes.position?.count??0;
      const multiply=n.isInstancedMesh?n.count:1;
      // Points/Lines do not draw triangles; keep them separate.
      if(n.isMesh)triangleCapacity+=primitiveCount/3*multiply;
      if(n.isInstancedMesh)instanced++;
      if(n.isPoints)points++;
    }
  });
  return {label,meshNodes,triangles:Math.round(triangleCapacity),lights,instanced,points,
    scope:'full loaded group before camera frustum and occlusion, not per-view draws'};
}
const names=new Map();
for(const child of road.group.children) {
  if(child.name==='meteor-crater-west-ground') {
    const k='terrain-west-ground-batches';
    names.set(k,(names.get(k)??[]).concat(child));
  } else {
    const k=child.name || child.type;
    names.set(k,(names.get(k)??[]).concat(child));
  }
}
const modules=[];
for(const [name,members] of names){
  const items=members.map(x=>count(x,x.name));
  modules.push({module:name,meshNodes:items.reduce((s,x)=>s+x.meshNodes,0),
    triangles:items.reduce((s,x)=>s+x.triangles,0),
    lights:items.reduce((s,x)=>s+x.lights,0),
    meshInstances:members.length});
}
modules.sort((a,b)=>b.triangles-a.triangles);
assert.ok(modules.length>=7,'must identify several real official crater components');
const totals={meshNodes:modules.reduce((s,x)=>s+x.meshNodes,0),
 triangles:modules.reduce((s,x)=>s+x.triangles,0),lights:modules.reduce((s,x)=>s+x.lights,0)};
assert.equal(modules.find(m=>m.module==='crater-outer-works')?.lights,1);
assert.equal(modules.find(m=>m.module==='crater-mouth-works')?.lights,3);
const report={kind:'static runtime Three.js module census, NOT per-camera real renderer contribution',
  test:'pass: model mounted and per-group real geometries/lights traversed',totals,
  modules,topFiveByTotalGeometry:modules.slice(0,5)};
await writeFile(path.join(out,'b2-crater-module-census.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
