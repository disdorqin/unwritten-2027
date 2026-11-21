import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, InstancedMesh, MeshStandardMaterial, NearestFilter, PointLight } from 'three';
import {
  craterInteriorSurvey, craterInteriorDressingPieces, craterInteriorDressingStats,
  mountCraterInteriorDressing,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-interior-dressing.js';
import {
  createMeteorCrater, meteorCraterFixturePlan, meteorCraterDepth,
} from '../tools/voxel-tavern/town-blockout/meteor-crater.js';

const crater=createMeteorCrater(meteorCraterFixturePlan);
const trail=Array.from({length:1001},(_,i)=>crater.mainTrailPoint(i/1000));

test('C3 R1 actually fills all three surveyed areas with finite, colored model pieces',()=>{
  assert.deepEqual([
    craterInteriorSurvey.terraceAreaM2,
    craterInteriorSurvey.floorAreaM2,
    craterInteriorSurvey.wellAreaM2,
  ],[6597.3,1256.6,10.6]);
  assert.ok(craterInteriorDressingStats.terraces>2500,'cliff terraces must not be flat gray');
  assert.ok(craterInteriorDressingStats.floor>1300,'crater floor needs real stacked stones');
  assert.ok(craterInteriorDressingStats.sealedWell>250,'sealed well needs visible full masonry ring');
  assert.ok(craterInteriorDressingStats.count>5000);
  assert.equal(craterInteriorDressingStats.count,craterInteriorDressingPieces.length);
  assert.equal(craterInteriorDressingStats.materialBatches,6);
  const names=new Set<string>();
  for(const part of craterInteriorDressingPieces){
    assert.ok(!names.has(part.id),'duplicated stone: '+part.id);
    names.add(part.id);
    assert.ok([...part.center,...part.size].every(Number.isFinite));
    assert.ok(part.size.every(x=>x>0));
    const r=Math.hypot(part.center[0],part.center[2]);
    assert.ok(r<55.5);
    if(part.zone==='sealed-well'){
      assert.ok(r>=2.18-1e-6);
      assert.ok(part.center[1]>-meteorCraterDepth-.5);
    }
  }
});

test('C3 R3 cliff geology and bottom stones stay off the real 3.5-turn walking strip',()=>{
  // Check actual B-01 spiral with surveyed 1,001 points, not an assumed line.
  for(const part of craterInteriorDressingPieces){
    if(part.zone==='sealed-well')continue;
    for(const spot of trail){
      const dx=part.center[0]-spot.east,dn=part.center[2]-spot.north;
      assert.ok(dx*dx+dn*dn>=3.1*3.1,
        'C3 prop intrudes into trail clearance: '+part.id);
    }
  }
});

test('C3 R4/R5 mounts real 16px nearest-textured instanced geometry without extra lights or authority',()=>{
  const group=new Group();
  const first=mountCraterInteriorDressing(group);
  assert.equal(group.children.length,1);
  assert.equal(first.stats.count,craterInteriorDressingStats.count);
  assert.equal(first.meshes.length,6);
  assert.equal(first.group.name,'c3-crater-interior-dressing-visual-only');
  for(const mesh of first.meshes){
    assert.ok(mesh instanceof InstancedMesh);
    assert.ok(mesh.material instanceof MeshStandardMaterial);
    const material=mesh.material as MeshStandardMaterial;
    assert.equal(material.map?.image.width,16);
    assert.equal(material.map?.image.height,16);
    assert.equal(material.map?.minFilter,NearestFilter);
    assert.equal(material.map?.magFilter,NearestFilter);
    assert.equal(material.map?.generateMipmaps,false);
  }
  assert.equal(first.group.children.filter(x=>x instanceof PointLight).length,0);
  first.dispose();first.dispose();
  assert.equal(group.children.length,0);
});
