import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, InstancedMesh, MeshLambertMaterial, NearestFilter } from 'three';
import {
  mountUndergroundPalaceDressing, undergroundPalaceDressing,
} from '../tools/voxel-tavern/town-blockout/underground-palace-dressing.js';

const {pieces,zoneCounts,motifs}=undergroundPalaceDressing;
const zone=(name:string)=>pieces.filter(p=>p.zone===name);

test('U-11 seven-pass companion actually models all palace zones rather than substituting logic',()=>{
  assert.ok(pieces.length>5000,'the palace needs genuinely dense stonework and room modelling');
  for(const name of ['broken-steps','colonnade','side-passage','throne',
    'exit-shrine','forecourt','vault-antechamber','vault-display']){
    assert.ok(zoneCounts[name]!>40,name+' must contain built geometry');
  }
  assert.ok(zone('broken-steps').length>300);
  assert.ok(zone('colonnade').length>2200);
  assert.ok(zone('throne').length>900);
  assert.ok(zone('forecourt').length>800);
  assert.ok(zone('vault-antechamber').length>2000);
  assert.equal(motifs.uniqueHandMarks,1);
  assert.equal(motifs.coreClosed,1);
  assert.ok(pieces.some(p=>p.name.includes('/one-hand/palm-')));
  assert.ok(!pieces.some(p=>/pickup|treasure|inventory|enemy|monster|placeholder|unfinished|inscription|fake/.test(p.name)));
});

test('U-11 R5 adds five full stone lantern sculptures without owning actual light sources',()=>{
  const lanterns=pieces.filter(p=>p.name.startsWith('u11/lantern-'));
  assert.equal(lanterns.length,720);
  assert.equal(pieces.length,10581);
  for(const key of ['west-27','east-40','west-82','east-82','north-gateway']){
    const layers=lanterns.filter(p=>p.name.startsWith('u11/lantern-'+key+'/'));
    assert.equal(layers.length,144,key+' must have a built frame and prism, not only a light marker');
    assert.ok(layers.some(p=>p.name.includes('/moonstone-prism-')));
    assert.ok(layers.some(p=>p.name.includes('/outer-frame-')));
    assert.ok(layers.some(p=>p.name.includes('/hood-tile-')));
  }
  assert.equal(undergroundPalaceDressing.lightSockets.length,5,
    'stone sculptures must not add extra authority-controlled point lights');
});

test('U-11 main path, empty throne and certified radius 22m preserve Window D shell footprint',()=>{
  const court=zone('forecourt').filter(p=>p.name.includes('apron-'));
  assert.ok(court.every(p=>Math.hypot(p.center[0],p.center[2]-126)<22.3));
  assert.equal(undergroundPalaceDressing.lightSockets.length,5);
  assert.ok(pieces.filter(p=>p.name.includes('/one-hand/')).every(p=>p.zone==='throne'));
  assert.ok(!pieces.some(p=>p.zone==='throne' && /enemy|loot|seat/.test(p.name)));
  assert.ok(!pieces.some(p=>p.zone==='vault-display' && /take|open|loot|item/.test(p.name)));
  const names=new Set<string>();
  for(const p of pieces){
    assert.ok(!names.has(p.name),p.name);names.add(p.name);
    assert.ok([...p.center,...p.size].every(Number.isFinite));
    assert.ok(p.size.every(v=>v>0));
    assert.ok(p.center[2]>=0 && p.center[2]<170,p.name);
  }
  assert.ok(pieces.length<13000,'avoid a mobile memory explosion');
});

test('U-11 add-on mounts with at most eight instanced material batches and keeps vault gated',()=>{
  const parent=new Group();
  const a=mountUndergroundPalaceDressing(parent);
  assert.equal(parent.children.length,1);
  assert.ok(a.visualPieceCount>1500);
  assert.equal(a.isVaultPresent,false);
  assert.ok(a.meshes.length<=8);
  assert.ok(a.meshes.every(m=>m instanceof InstancedMesh));
  assert.ok(a.meshes.every(m=>m.material instanceof MeshLambertMaterial &&
    m.material.map?.magFilter===NearestFilter &&
    m.material.map.generateMipmaps===false));
  assert.equal(a.visualPieceCount,pieces.filter(p=>!p.zone.startsWith('vault-')).length);
  a.dispose();a.dispose();
  assert.equal(parent.children.length,0);
  const b=mountUndergroundPalaceDressing(parent,true);
  assert.equal(b.isVaultPresent,true);
  assert.equal(b.visualPieceCount,pieces.length);
  b.dispose();
});
