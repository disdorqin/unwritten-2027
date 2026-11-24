import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Box3,Group,Vector3} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {craterWorkstationIds,mountCraterWorkstations,surveyCraterWorkstations} from '../tools/voxel-tavern/town-blockout/town-crater-workstation-sites';

const terrain=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>terrain.groundHeightAt(0,n));
const rail=buildCraterRailExtension(terrain,road);
const scene=new Group();
const host=mountCraterWorkstations(scene,road,rail);
test('batch 91: five workshop models stand on surveyed terrain and preserve rail and body clearance',()=>{
  assert.deepEqual(host.sites.map(s=>s.id),[...craterWorkstationIds]);
  assert.equal(host.group.parent,scene);
  assert.equal(host.group.children.length,5);
  for(const site of host.sites){
    assert.ok(site.railClearance>=1.65,site.id);
    assert.ok(site.bodyClearance>=.55,site.id);
    assert.equal(site.foot.height,road.heightAt(site.foot.east,site.foot.north));
    assert.ok(Math.hypot(site.foot.east-site.center.east,site.foot.north-site.center.north)>1.4);
    const model=host.group.getObjectByName('b91-'+site.id)!;
    assert.ok(model.children.length>=5,site.id);
    const bounds=new Box3().setFromObject(model);
    assert.ok(bounds.min.y>=site.center.height-.001,site.id);
    assert.ok(bounds.max.y<site.center.height+2,site.id);
    assert.ok(bounds.min.x>=site.footprint.min[0]-.03 && bounds.max.x<=site.footprint.max[0]+.03,site.id+' E extent');
    assert.ok(bounds.min.z>=site.footprint.min[2]-.03 && bounds.max.z<=site.footprint.max[2]+.03,site.id+' N extent');
  }
});
test('batch 91: same first person ray targets each actual tool face, never its back or remote position',()=>{
  for(const s of host.sites){
    const dx=s.target.east-s.foot.east,dn=s.target.north-s.foot.north;
    const yaw=Math.atan2(dx,dn),pitch=Math.atan2(s.target.height-s.foot.height-1.65,Math.hypot(dx,dn));
    assert.equal(host.aim(s.foot,yaw,pitch,1.65),s.id,s.id);
    assert.equal(host.aim(s.foot,yaw+Math.PI,pitch,1.65),null,s.id+' facing away');
    const back={east:2*s.center.east-s.foot.east,north:2*s.center.north-s.foot.north,height:s.foot.height};
    assert.equal(host.aim(back,yaw+Math.PI,pitch,1.65),null,s.id+' through backing');
    assert.equal(host.aim({...s.foot,height:s.foot.height+3},yaw,pitch,1.65),null);
    assert.equal(host.aim({...s.foot,north:s.foot.north+10},yaw,pitch,1.65),null);
  }
});
test('batch 91: a new upstream obstacle invalidates a surveyed pad instead of silently clipping a tool',()=>{
  const s=host.sites[0];
  const obstructed={...road,outerWorks:{...road.outerWorks,colliders:[...road.outerWorks.colliders,s.footprint]}};
  assert.throws(()=>surveyCraterWorkstations(obstructed,rail),/Occupied workshop pad: bellows/);
});
test('batch 91: animations only project external rule state, returning to a previous view exactly',()=>{
  const initial={bellowsStroke:0,gaugeNeedle:0,sortingFill:[0,0,0] as const,weighingNeedle:0,turnout:'straight' as const};
  const changed={bellowsStroke:1,gaugeNeedle:.8,sortingFill:[.8,.5,1] as const,weighingNeedle:.75,turnout:'branch' as const};
  const snapshot=()=>{const rows:string[]=[];host.group.traverse(o=>rows.push(JSON.stringify([o.position.toArray(),o.rotation.toArray(),o.scale.toArray()])));return rows;};
  host.show(initial);const before=snapshot();
  host.show(changed);assert.notDeepEqual(snapshot(),before);
  host.show(changed);const steady=snapshot();host.show(changed);assert.deepEqual(snapshot(),steady);
  host.show(initial);assert.deepEqual(snapshot(),before);
  assert.equal(host.colliders.length,5);
  host.dispose();assert.equal(scene.children.length,0);
});
