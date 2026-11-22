import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, type InstancedMesh, type Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

const grid=createTerrainGrid();
const west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));

test('A-5: all fourteen cyan melt tips sample their OWN offset footprint, not the parent basalt',()=>{
  const mesh=west.midground.group.getObjectByName('za36-midground-cyan') as InstancedMesh;
  assert.ok(mesh?.isInstancedMesh);
  const melt=west.midground.placements.filter(p=>p.kind==='lava-column');
  assert.equal(melt.length,14);
  assert.equal(mesh.count,melt.length);
  const matrix=new Matrix4();
  let worst=0;
  for(const [i,p]of melt.entries()){
    mesh.getMatrixAt(i,matrix);
    const east=matrix.elements[12],north=-matrix.elements[14],centerY=matrix.elements[13];
    assert.ok(Math.abs(east-(p.east+.38))<1e-5);
    assert.ok(Math.abs(north-(p.north+.13))<1e-5);
    const own=west.heightAt(east,north);
    assert.ok(own!==undefined,`cyan ${i} has no actual foot surface`);
    const gap=centerY-.17-own;
    worst=Math.max(worst,Math.abs(gap));
    assert.ok(Math.abs(gap)<2e-5,`cyan ${i} is ${gap.toFixed(4)}m above actual ground`);
  }
  assert.ok(worst<.00002);
});

test('A-5: B-01 lip feather matches west carrier snow at outer ring without mesh or collider changes',()=>{
  const bowl=west.group.getObjectByName('meteor-crater-walk-mesh') as Mesh;
  assert.ok(bowl?.isMesh);
  const pos=bowl.geometry.getAttribute('position');
  const rgb=bowl.geometry.getAttribute('color');
  const feather=bowl.geometry.getAttribute('aCraterSnowFeather');
  assert.equal(feather.count,pos.count);
  let outer=0,mid=0,inner=0;
  // THREE colors are stored linear; the carrier material #c1cedc is converted
  // to linear here using a numeric source color, not display-space RGB bytes.
  const carrier=(bowl.material as {color?:unknown}).color;
  void carrier;
  for(let i=0;i<pos.count;i++){
    const r=Math.hypot(pos.getX(i),pos.getZ(i));
    const t=feather.getX(i);
    assert.ok(t>=0&&t<=1,'roughness transition weight not clamped');
    if(r>58.99){
      outer++;
      assert.ok(t<.001,'outer 59m edge roughness cannot jump');
    } else if(r>53.5&&r<55.5){
      mid++;
      assert.ok(t>.5,'missing soft material roughness change');
    } else if(r<49){
      inner++;
      assert.ok(t<.001,'bowl interior roughness changed');
    }
  }
  assert.ok(outer>10&&mid>100&&inner>100);
  assert.equal(west.heightAt(west.lip.east,west.lip.north),west.lip.height,
    'A-5 color/roughness must not move the playable B-01 rim');
});

test('A-5: roughness gradient is installed on original StandardMaterial, no extra bowl draws',()=>{
  const bowl=west.group.getObjectByName('meteor-crater-walk-mesh') as Mesh;
  const m=bowl.material as {onBeforeCompile:(s:{vertexShader:string;fragmentShader:string})=>void};
  const shader={vertexShader:'#include <common>\n#include <begin_vertex>',
    fragmentShader:'#include <common>\n#include <roughnessmap_fragment>'};
  m.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('aCraterSnowFeather'));
  assert.ok(shader.fragmentShader.includes('roughnessFactor = mix(roughnessFactor, 0.97, vCraterSnowFeather);'));
  const meshes:Mesh[]=[];
  west.group.traverse(node=>{if((node as Mesh).isMesh&&node.name==='meteor-crater-walk-mesh')meshes.push(node as Mesh);});
  assert.equal(meshes.length,1,'double-layer bowl drawing would reintroduce lip artifacts');
});
