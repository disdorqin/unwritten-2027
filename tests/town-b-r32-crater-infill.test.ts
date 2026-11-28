import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Box3,Matrix4,Vector3,type InstancedMesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {ar30SurfacePort} from '../tools/voxel-tavern/town-blockout/town-a-r30-surface-port';
import {surveyAR30InscriptionAccess} from '../tools/voxel-tavern/town-blockout/town-a-r30-unified-surface-host';
test('B33 actual public crater host has grounded north/west/floor physical strata, same geometry and collision, unchanged inscription path and rollback',()=>{
 const grid=createTerrainGrid(),port=ar30SurfacePort(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:port.story}),railway=createTownRailway(grid,()=>0),rail=buildCraterRailExtension(grid,road,railway.route.points);
 const before=surveyAR30InscriptionAccess(road,rail),original=road.group.userData.colliders;
 const completion=port.attach(road,rail),infill=completion.infill;
 try{
  const stats=infill.stats();console.log(JSON.stringify({stats,clusters:infill.sites.length}));
  assert.ok(stats.north>0&&stats.west>0&&stats.floor>0);
  assert.equal(infill.group.parent,road.group);
  assert.equal(infill.boxes.length,infill.stones.length);
  assert.ok(infill.boxes.every(b=>road.group.userData.colliders.includes(b)));
  const matrix=new Matrix4(),unit=new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5));
  for(const child of infill.group.children){const mesh=child as InstancedMesh,zone=mesh.name.slice('b33-crater-'.length),sites=infill.stones.filter(s=>s.zone===zone);
   assert.equal(mesh.count,sites.length);
   for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const measured=unit.clone().applyMatrix4(matrix),b=sites[i]!.box;
    assert.ok(measured.min.distanceTo(new Vector3().fromArray(b.min))<.00002);
    assert.ok(measured.max.distanceTo(new Vector3().fromArray(b.max))<.00002);
    const e=(b.min[0]!+b.max[0]!)/2,n=-(b.min[2]!+b.max[2]!)/2,h=road.heightAt(e,n)!;
    if(sites[i]!.id.endsWith('/bed'))assert.ok(b.min[1]!<=h&&b.max[1]!>b.min[1]!);
    else assert.ok(infill.sites.some(s=>sites[i]!.id.startsWith(s.id+'/')&&s.box.min[1]!<=b.min[1]!&&s.box.max[1]!>=b.max[1]!-1e-6));
   }
  }
  const after=surveyAR30InscriptionAccess(road,rail);assert.deepEqual(after,before);
 }finally{completion.dispose();}
 assert.equal(infill.group.parent,null);assert.ok(infill.boxes.every(b=>!road.group.userData.colliders.includes(b)));assert.ok(original.every((b:unknown)=>road.group.userData.colliders.includes(b)));
});
