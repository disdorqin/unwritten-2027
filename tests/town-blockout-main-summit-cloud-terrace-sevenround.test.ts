import assert from 'node:assert/strict';
import test from 'node:test';
import {Group,InstancedMesh,PointLight} from 'three';
import {mountCloudTerraceArt} from '../tools/voxel-tavern/town-blockout/main-summit-cloud-terrace-art';
import {cloudStoneRingAnchor} from '../tools/voxel-tavern/town-blockout/main-summit-cloud-terrace-ring';
import {terraceFurnishingLayout} from '../tools/voxel-tavern/town-blockout/main-summit-cloud-terrace-furnishings';
import {sampleNorthRidge350} from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {za22CloudSurfaceAt,za22CloudRunway,cloudTerminal} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import {mountMainSummitAssembly,summitAssemblyAnchor} from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import {mountMainSummitExtras} from '../tools/voxel-tavern/town-blockout/main-summit-extras';
function sample(context:{after(f:()=>void):void}){
  const root=new Group(),art=mountCloudTerraceArt(root);
  context.after(art.dispose);
  return {root,art};
}
test('R1/2: actual m03+m34 monumental ring has masonry, broken crest, a readable inner cyan line',context=>{
  const {art}=sample(context);
  assert.ok(art.ring.count>450,'must build actual individual stone facets');
  assert.ok(art.ring.segmentCount>100,'arc has three layers of stone depth');
  assert.ok(art.ring.missingSlices>=1,'the m34 silhouette includes a weathered crest break');
  assert.ok(art.ring.draws<=8,'large ring should use material-family instancing');
  assert.ok(art.ring.group.getObjectByName('cloud-stone-ring-cut-stone')instanceof InstancedMesh);
  assert.ok(art.ring.group.getObjectByName('cloud-stone-ring-runes')instanceof InstancedMesh);
  assert.equal(art.group.parent?.type,'Group');
  assert.ok(art.stats().pieces>600);
});
test('R3: ring stands on real ZA22 snow slab WEST of the runway, with no dead zone',context=>{
  const {art}=sample(context);
  const anchor=cloudStoneRingAnchor;
  const worldE=summitAssemblyAnchor.east+anchor.east;
  const worldN=summitAssemblyAnchor.north+anchor.north;
  assert.equal(worldE,292);
  assert.equal(worldN,661);
  assert.equal(sampleNorthRidge350(worldE,worldN),347);
  assert.equal(za22CloudSurfaceAt(worldE,worldN),347);
  assert.ok(worldE+3.8<za22CloudRunway.start,'ring must remain to the west of E310.5 runway');
  assert.ok(worldN>cloudTerminal.north+15,'separate from transfer bell');
  assert.equal(art.blocked(anchor.east,anchor.north,347,.27,1.8),false,
    'no unwalkable invisible cube across the whole ring opening');
  assert.equal(art.blocked(anchor.east-3,anchor.north,347,.27,1.8),true,
    'one stone foot is physically solid');
  for(const east of [0,8,14,20,27,34]){
    assert.equal(art.blocked(east,-13.1,347,.27,1.8),false,
      `the accepted N-13.1 travel line remains clear at E${east}`);
  }
  // Aircraft may sweep the ENTIRE 2.2m half-width, not just player radius.
  for(let east=10.5;east<=51.5;east+=.5){
    assert.equal(art.blocked(east,-14,347,2.2,1.8),false,
      `stone art must not intrude into the aircraft wing sweep at E${east}`);
  }
  assert.equal(art.blocked(24,-19,347,.27,1.8),false,
    'starport rack and in-person assembly pad still belong to the original owner');
});
test('R4/R5: actual benches, retained supplies, rail lantern cores and three point lights exist',context=>{
  const {art}=sample(context);
  assert.deepEqual(terraceFurnishingLayout.benches.map(p=>p.east),[-3.0,1.8,5.7]);
  assert.equal(art.furnishings.lanterns.length,3);
  assert.ok(art.furnishings.lanterns.every(p=>p instanceof PointLight));
  assert.ok(art.furnishings.count>100,'small rocks and lamps must be real geometry');
  assert.ok(art.furnishings.draws<=10,'do not explode the cloud scene draw budget');
  assert.equal(art.furnishings.group.getObjectByName('cloud-terrace-dressing-wood')instanceof InstancedMesh,true);
  assert.equal(art.blocked(-3,-20.1,347,.27,1.8),true);
  assert.equal(art.blocked(-4,-18.5,347,.27,1.8),true);
  art.setNight(true);
  assert.equal(art.stats().night,true);
  assert.ok(art.furnishings.lanterns.every(p=>p.intensity===1));
  art.setNight(false);
  assert.ok(art.furnishings.lanterns.every(p=>p.intensity<.3));
});
test('R6: three touch verbs are range-bound and authorized, no portal or inventory is created',context=>{
  const {art}=sample(context);
  const ring=cloudStoneRingAnchor;
  assert.equal(art.inspect('ring','touch',ring,false).accepted,false);
  assert.equal(art.inspect('ring','view',{...ring,east:30},true).accepted,false);
  assert.equal(art.inspect('ring','listen',ring,true).accepted,true);
  assert.equal(art.inspect('ring','touch',ring,true).accepted,true);
  assert.equal(art.ring.touches,1);
  const supplies=terraceFurnishingLayout.supply;
  assert.equal(art.inspect('supplies','view',supplies,true).accepted,true);
  assert.equal(art.inspect('supplies','listen',supplies,true).accepted,true);
  assert.equal(art.inspect('supplies','touch',supplies,true).accepted,true);
  assert.equal(art.furnishings.inspections,3);
});
test('R7: D4 assembly coexists with original glacier, snow-wing, P8 cloud, cable and world collision',context=>{
  const owner=new Group(),assembly=mountMainSummitAssembly(owner,0),extras=mountMainSummitExtras(assembly);
  context.after(()=>{extras.dispose();assembly.dispose();});
  assert.ok(extras.cloudTerraceArt.group.parent===assembly.group);
  assert.ok(assembly.mountedParts().includes('P-8'));
  assert.ok(extras.glideRings.length>=3);
  assert.ok(extras.windGround.group.parent===assembly.group);
  for(const east of [0,8,14,20,27,34]){
    assert.equal(extras.blocked(east,-13.1,347,.27,1.75),false,
      `new stage cannot seal the cloud walking corridor E${east}`);
  }
  assert.equal(extras.blocked(-8,-15,347,.27,1.75),false);
});
