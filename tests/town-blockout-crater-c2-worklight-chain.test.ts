import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Group, InstancedMesh, MeshStandardMaterial, PointLight, NearestFilter,
} from 'three';
import {
  craterFloorWorklightGeometry,mountCraterFloorWorklightChain,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-floor-worklight-chain.js';
import {
  craterFloorLampRockBufferM,craterFloorWorklightSites,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-floor-worklight-sites.js';
import {
  craterInteriorDressingPieces,craterInteriorDressingStats,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-interior-dressing.js';
import {mountMeteorCraterSurface} from '../tools/voxel-tavern/town-blockout/meteor-crater-surface.js';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain.js';

test('C-2 makes six complete fixed lantern carriers, each with real physical amber source',()=>{
  assert.equal(craterFloorWorklightGeometry.lampCount,6);
  assert.equal(craterFloorWorklightGeometry.posts.length,craterFloorWorklightSites.length);
  assert.equal(craterFloorWorklightGeometry.nearestPixelMaterialCount,6);
  assert.ok(craterFloorWorklightGeometry.pieceCount>=90);
  assert.equal(new Set(craterFloorWorklightGeometry.pieces.map(p=>p.id)).size,
    craterFloorWorklightGeometry.pieceCount,'each lamp part has unique physical identity');
  for(const site of craterFloorWorklightGeometry.posts){
    assert.equal(site.footHeight,-35,'lamppost sits on the actual B-01 flat pit floor');
    assert.equal(site.bulbHeight,site.footHeight+2.62);
    assert.ok(Math.hypot(site.east,site.north)<20);
    for(const suffix of ['/foot','/shaft','/light-core','/roof','/roof-ridge','/snow-foot'])
      assert.ok(craterFloorWorklightGeometry.pieces.some(p=>p.id===site.id+suffix),site.id+suffix);
  }
});

test('C-2 lamp posts do not cover U-1 winch/rope-turning foot or become new mine sites',()=>{
  // These are existing Z31 B-01 surveyed local references, not newly
  // declared player spawn/mine coordinates.
  const shaftRadius=55/30;
  const winch={east:shaftRadius*2.6-.62,north:-(shaftRadius*.5+.72)};
  const bend={east:-3.4,north:-6};
  const useFoot={east:winch.east-1.18,north:winch.north-.10};
  for(const post of craterFloorWorklightGeometry.posts){
    for(const [name,point] of Object.entries({winch,bend,useFoot})){
      assert.ok(Math.hypot(post.east-point.east,post.north-point.north)>=2.3,
        post.id+' overlaps '+name);
    }
    for(const shard of craterInteriorDressingPieces){
      if(shard.zone!=='floor') continue;
      const dx=post.east-shard.center[0],dn=post.north-shard.center[2];
      const extent=Math.hypot(shard.size[0],shard.size[2])*.5;
      assert.ok(Math.hypot(dx,dn)+1e-9>=craterFloorLampRockBufferM+extent,
        post.id+' intersects older floor stone '+shard.id);
    }
  }
  assert.ok(craterInteriorDressingStats.floor>1800,'avoid dropping floor density to clear only six posts');
});

test('C-2 mounted stage night switch actually toggles six light sources and 16px nearest lamps',()=>{
  const host=new Group();
  const scene=mountMeteorCraterSurface({east:-120,north:185,rimHeight:14,yaw:-.42});
  host.add(scene.group);
  const stage=scene.floorWorklights;
  assert.equal(stage.lights.length,6);
  assert.equal(stage.meshes.length,6);
  assert.equal(stage.isNightLit,false);
  assert.equal(stage.lights.filter(light=>light.visible).length,0);
  for(const mesh of stage.meshes){
    assert.ok(mesh instanceof InstancedMesh);
    const material=mesh.material as MeshStandardMaterial;
    assert.equal(material.map?.image.width,16);
    assert.equal(material.map?.image.height,16);
    assert.equal(material.map?.minFilter,NearestFilter);
    assert.equal(material.map?.magFilter,NearestFilter);
    assert.equal(material.map?.generateMipmaps,false);
  }
  stage.setNight(true);
  assert.equal(stage.isNightLit,true);
  assert.equal(stage.lights.filter(x=>x.visible&&x instanceof PointLight).length,6);
  stage.setNight(false);
  assert.equal(stage.lights.filter(x=>x.visible).length,0);
  assert.equal(scene.heightAt(-120,185),14-35,'ground authority unchanged');
  stage.dispose();stage.dispose();
  assert.equal(stage.group.parent,null);
  scene.interiorDressing.dispose();
});

test('C-2 production WestCraterRoad forwards its existing town phase to bottom lamps',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const lights:PointLight[]=[];
  road.group.traverse(item=>{
    if(item instanceof PointLight && item.name.startsWith('c2/'))lights.push(item);
  });
  assert.equal(lights.length,6,'default WestCraterRoad must contain all six real warm lamps');
  assert.equal(lights.filter(l=>l.visible).length,0);
  road.craterActions.setNight(true);
  assert.equal(lights.filter(l=>l.visible).length,6);
  road.craterActions.setNight(false);
  assert.equal(lights.filter(l=>l.visible).length,0);
});
