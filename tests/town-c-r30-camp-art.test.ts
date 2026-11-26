import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,PointLight,MeshStandardMaterial} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';

test('R30 camp roof, hearth and localized rock finish preserve registered feet and collision',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 const h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const camp=h.mounted.camp!;
  assert.equal(camp.r30Roof.parts.length,118);
  for(const p of camp.r30Roof.parts){
   const half=(Math.abs(Math.sin(p.angle))*p.size[0]+Math.abs(Math.cos(p.angle))*p.size[1])/2;
   assert.ok(p.centre[1]-half>=-91+1.8);
   assert.ok(p.centre[1]+half<=-91+3.5);
  }
  const hearth=h.mounted.toWorld(camp.r30Hearth.at)!;
  assert.equal(h.passageAt(hearth.east,hearth.north),undefined,'physical hearth must block movement');
  const recovery=h.mounted.toWorld(camp.recovery)!;
  assert.ok(h.passageAt(recovery.east,recovery.north),'healing foot remains walkable');
  const rock=h.mounted.group.getObjectByName('underground-mine-rock') as Mesh;
  const mats=rock.material as MeshStandardMaterial[];
  assert.equal(mats.length,4);
  for(const i of [1,2,3]){assert.ok(mats[i].map);assert.ok(rock.geometry.groups.some(g=>g.materialIndex===i));}
  assert.equal(rock.geometry.groups.reduce((n,g)=>n+g.count,0),rock.geometry.getAttribute('position').count);
  const source=createUndergroundMineLayout(undergroundMineSpec).mesh.rock;
  assert.deepEqual(rock.geometry.getAttribute('position').array,source,'visual finish keeps source triangles unchanged');
  let lights=0;camp.r30Hearth.group.traverse(o=>{if(o instanceof PointLight)lights++});assert.equal(lights,0);
  assert.equal(camp.rooms.length,6);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
