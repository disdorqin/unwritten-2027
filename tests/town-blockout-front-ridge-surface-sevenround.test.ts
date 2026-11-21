import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DoubleSide, Group, Mesh, MeshLambertMaterial, NearestFilter,
  RepeatWrapping, SRGBColorSpace,
} from 'three';
import { buildFrontRidgeProxy, FRONT_RIDGE_PROXY, mountFrontRidgeProxy } from '../tools/voxel-tavern/town-blockout/town-front-ridge-proxy';
import {
  FRONT_RIDGE_PALETTE, frontRidgeBandAt,
  frontRidgePixelSpec, frontRidgeSurfaceColorAt, makeFrontRidgePixelTexture,
} from '../tools/voxel-tavern/town-blockout/town-front-ridge-surface';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';

test('R1/R3: front slope genuinely starts at town ground, not a 150m high vertical cliff', t=>{
  const group=buildFrontRidgeProxy();
  const mesh=group.children[0]as Mesh;
  const vertices=mesh.geometry.getAttribute('position');
  const data=new Map<number,number>();
  let minNorth=Infinity,minY=Infinity,maxY=-Infinity,negativeSkirt=0;
  for(let i=0;i<vertices.count;i++){
    const e=vertices.getX(i), n=-vertices.getZ(i), y=vertices.getY(i);
    minNorth=Math.min(minNorth,n);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    // Mesh samples E316 and E324 with 8m steps; E320 is between vertices.
    if(n===FRONT_RIDGE_PROXY.toeNorth && Math.abs(e-320)<=4.01 && y>=0)
      data.set(y,y);
    if(y<=-59.99)negativeSkirt++;
  }
  const grid=createTerrainGrid();
  const ground=grid.heightAt(320,FRONT_RIDGE_PROXY.toeNorth);
  assert.ok(Math.min(...data.keys())<=ground+2.2,
    'first front shell row must meet actual town ground without the old Y150 face');
  assert.equal(minNorth,692);
  assert.ok(minY<=-60);
  assert.ok(maxY>344&&maxY<=392,'crest and original teeth remain recognizable');
  assert.ok(negativeSkirt>0,'skirt stays buried, not removed into a floating seam');
  assert.ok(vertices.count/3>=5000,
    'R4 actual snow ledges, ochre/rock strata and conifer silhouettes must exist as geometry');
  const normal=mesh.geometry.getAttribute('normal');
  let positiveFrontFace=0;
  for(let i=0;i<vertices.count;i++){
    if(-vertices.getZ(i)>=697&&-vertices.getZ(i)<=735&&normal.getY(i)>.1)
      positiveFrontFace++;
  }
  assert.ok(positiveFrontFace>150,
    'R4 mesh orientation: front-slope normal must point UP, not into mountain');
  const report=group.userData.surfaceSurvey as Record<string,unknown>;
  assert.ok(Number(report.snowShelves)>40);
  assert.ok(Number(report.exposedRocks)>40);
  assert.ok(Number(report.conifers)>100);
  assert.equal(report.includesWorldCollision,false);
  t.diagnostic(JSON.stringify({toe:Math.min(...data.keys()),ground,crown:maxY,triangles:vertices.count/3}));
});

test('R2/R4: one real 32px nearest-neighbor surface map with UV and rock/snow bands',()=>{
  const group=buildFrontRidgeProxy(),mesh=group.children[0]as Mesh;
  const material=mesh.material as MeshLambertMaterial;
  const map=material.map!;
  assert.ok(map,'large mountain faces need a real texture, not pure flat vertex colors');
  assert.equal(map.image.width,32);
  assert.equal(map.image.height,32);
  assert.equal(map.magFilter,NearestFilter);
  assert.equal(map.minFilter,NearestFilter);
  assert.equal(map.wrapS,RepeatWrapping);
  assert.equal(map.wrapT,RepeatWrapping);
  assert.equal(map.colorSpace,SRGBColorSpace);
  assert.equal(map.generateMipmaps,false);
  assert.equal(material.vertexColors,true);
  assert.equal(material.side,DoubleSide);
  assert.ok(material.onBeforeCompile,'existing long-range haze shader remains available');
  const vertices=mesh.geometry.getAttribute('position');
  const colors=mesh.geometry.getAttribute('color');
  const uvs=mesh.geometry.getAttribute('uv');
  assert.equal(vertices.count,colors.count);
  assert.equal(vertices.count,uvs.count);
  const data=map.image.data as Uint8Array;
  let varied=0,cracks=0,fullyWhite=0;
  const shades=new Set<number>();
  for(let i=0;i<data.length;i+=4){
    shades.add(data[i]!);
    if(data[i]!<=160)cracks++;
    if(data[i]===255&&data[i+1]===255&&data[i+2]===255)fullyWhite++;
    if(data[i]!==data[i+1])varied++;
  }
  assert.ok(shades.size>=25,'procedural grain must be a visual texture, not one color');
  assert.ok(cracks>=20,'per-pixel dark seams must exist');
  assert.ok(varied>0);
  assert.ok(fullyWhite===0,'pure-white 32px tile banned by style palette');
  assert.ok(Math.max(...Array.from({length:Math.min(100,uvs.count)},(_,i)=>uvs.getX(i)))>10,
    'UV uses world-space 16px/m repetition, not stretched over 600m');
  assert.equal(frontRidgePixelSpec.pixelsPerMetre,16);
  assert.deepEqual(Object.keys(FRONT_RIDGE_PALETTE).length,7);
  assert.ok(material.color);
});

test('R4/R5: altitude and slope govern rock-vs-snow without turning cliffs blank white',()=>{
  assert.equal(frontRidgeBandAt(65,.62),'moss-rock');
  assert.equal(frontRidgeBandAt(165,.62),'stone-ochre');
  assert.equal(frontRidgeBandAt(315,.82),'dark-cliff');
  assert.equal(frontRidgeBandAt(320,.07),'snow-ledge');
  const snow=frontRidgeSurfaceColorAt(320,758,350,.03);
  const exposed=frontRidgeSurfaceColorAt(320,758,350,.85);
  const toe=frontRidgeSurfaceColorAt(320,692,9,.55);
  const brightness=(c:{r:number;g:number;b:number})=>(c.r+c.g+c.b)/3;
  assert.ok(brightness(snow)>brightness(exposed)*2,
    'only actual ledges/crown get snow white, sheer cliff stays dark');
  assert.ok(brightness(toe)<brightness(snow));
  assert.notDeepEqual(snow.toArray(),exposed.toArray());
});

test('R7: proxy remains a single merged draw and dispose frees GPU geometry+texture',()=>{
  const group=buildFrontRidgeProxy();
  const mesh=group.children[0]as Mesh;
  assert.equal(group.children.length,1);
  assert.equal(mesh.geometry.index,null,'merged proxy should stay single-draw nonindexed');
  let freed=0;
  const mat=mesh.material as MeshLambertMaterial;
  mesh.geometry.addEventListener('dispose',()=>freed++);
  mat.addEventListener('dispose',()=>freed++);
  mat.map!.addEventListener('dispose',()=>freed++);
  const parent=new Group();
  const host=mountFrontRidgeProxy(parent);
  assert.equal(parent.children.length,1);
  let hostFree=0;
  const hostMesh=host.group.children[0]as Mesh;
  hostMesh.geometry.addEventListener('dispose',()=>hostFree++);
  (hostMesh.material as MeshLambertMaterial).map!.addEventListener('dispose',()=>hostFree++);
  host.dispose();host.dispose();
  assert.equal(parent.children.length,0);
  assert.equal(hostFree,2);
  assert.ok(freed===0,'independent unmounted model belongs to caller');
  mesh.geometry.dispose();mat.map!.dispose();mat.dispose();
  assert.equal(freed,3);
});
