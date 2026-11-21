import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Color,Mesh,MeshLambertMaterial,Scene} from 'three';
import {buildFrontRidgeProxy} from '../tools/voxel-tavern/town-blockout/town-front-ridge-proxy';
import {frontRidgeSurfaceColorAt,FRONT_RIDGE_PALETTE} from '../tools/voxel-tavern/town-blockout/town-front-ridge-surface';

// D-1: these are source + render-material anti-regression checks, not proof
// of 3 player-reachable camera positions. The native six-camera field review
// remains an independent acceptance requirement.
test('D-1 day slope has warm rock/ochre families without a uniformly black or all-white paint',()=>{
  const sampled: Color[] = [];
  for(const north of [714,729,743,751,760]){
    for(const altitude of [85,120,155,190,225,255,300]){
      for(const east of [80,160,240,320,400,480,560]){
        sampled.push(frontRidgeSurfaceColorAt(east,north,altitude,.55));
      }
    }
  }
  const srgb=sampled.map(c=>new Color().copy(c).getHex());
  const r=srgb.map(hex=>(hex>>>16)&255);
  const g=srgb.map(hex=>(hex>>>8)&255);
  const b=srgb.map(hex=>hex&255);
  const litRockCount=r.filter((v,i)=>v>=100&&g[i]!>=85&&b[i]!>=70).length;
  const whiteFaceCount=r.filter((v,i)=>v>=224&&g[i]!>=224&&b[i]!>=224).length;
  const pitchBlackCount=r.filter((v,i)=>v<=55&&g[i]!<=55&&b[i]!<=55).length;
  assert.ok(litRockCount>sampled.length*.6,`warm/stone face scarcity: ${litRockCount}/${sampled.length}`);
  assert.ok(whiteFaceCount<sampled.length*.2,'Snow should only occupy ledges and wind pockets');
  assert.equal(pitchBlackCount,0,'The existing dark daytime cliff regression cannot return');
  assert.notEqual(FRONT_RIDGE_PALETTE.ochre,FRONT_RIDGE_PALETTE.snow);
});

test('D-1 exposed daylight rock uses sun bounce, night returns to dark silhouette without a fog-distance change',()=>{
  const group=buildFrontRidgeProxy();
  const mesh=group.children[0]as Mesh;
  const material=mesh.material as MeshLambertMaterial;
  const day=new Scene(),night=new Scene();
  day.background=new Color('#acc2dd');
  night.background=new Color('#182642');
  const fakeRender={} as never, fakeCamera={} as never;
  mesh.onBeforeRender(fakeRender,day,fakeCamera,mesh.geometry,material,{} as never);
  assert.equal(material.emissiveIntensity,.38);
  assert.equal(material.emissive.getHexString(),'a98a56');
  mesh.onBeforeRender(fakeRender,night,fakeCamera,mesh.geometry,material,{} as never);
  assert.equal(material.emissiveIntensity,.025);
  assert.ok(material.onBeforeCompile!==undefined);
  // No separate ambient/point light rigs; texture remains 32px nearest.
  assert.equal(group.children.length,1);
  assert.equal((material.map?.image as {width:number}).width,32);
  mesh.geometry.dispose();material.map?.dispose();material.dispose();
});
