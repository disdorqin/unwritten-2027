import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCraterMouthWorks } from '../tools/voxel-tavern/town-blockout/town-crater-mouth-works';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

const anchor = { east: -120, north: 185, rimHeight: 12, yaw: 1.364 };

test('ZA-36: all four real E actions are located at the existing worksite props and ground', () => {
  const mouth = buildCraterMouthWorks({anchor, heightAt: () => 12});
  const spots = mouth.interactions;
  assert.deepEqual(spots.map(s=>s.id).sort(), [
    'crater-ground-telescope','crater-guard-firewood',
    'crater-registration','crater-supply-map',
  ]);
  const byId=(id:string)=>spots.find(spot=>spot.id===id)!;
  const sites=new Map(mouth.sites.map(s=>[s.id,s]));
  const supply=sites.get('supply-station')!;
  const assembly=sites.get('assembly-ground')!;
  const guard=sites.get('guard-shed')!;
  const scope=byId('crater-ground-telescope');
  assert.ok(Math.hypot(scope.east-supply.east,scope.north-supply.north)>5.7,
    'ground tripod must be outside, not behind the station roof / window');
  assert.ok(Math.hypot(scope.east-supply.east,scope.north-supply.north)<11,
    'scope should still be recognizable as part of the supply station');
  assert.ok(Math.hypot(byId('crater-supply-map').east-supply.east,
    byId('crater-supply-map').north-supply.north)<3);
  assert.ok(Math.hypot(byId('crater-registration').east-assembly.east,
    byId('crater-registration').north-assembly.north)<6);
  assert.ok(Math.hypot(byId('crater-guard-firewood').east-guard.east,
    byId('crater-guard-firewood').north-guard.north)<2);
  for(const p of spots){
    assert.equal(p.height,12);
    assert.equal(mouth.actionAt(p.east,p.north,p.height)?.id,p.id);
    assert.equal(mouth.actionAt(p.east,p.north,p.height+2.1),undefined,
      'E prompt must not operate through another floor / roof');
    assert.ok(Math.hypot(p.east-anchor.east,p.north-anchor.north)>55,
      'no new prompt should be hidden under the crater bowl');
  }
  assert.equal(mouth.actionAt(0,0,0),undefined);
});

test('ZA-36: guard shed firewood brightens only its existing brazier, not all town lights', () => {
  const works=buildCraterMouthWorks({anchor,heightAt:()=>12});
  const lights: Array<{intensity:number}> = [];
  works.group.traverse(node=>{if((node as {isLight?:boolean}).isLight)
    lights.push(node as unknown as {intensity:number});});
  assert.equal(lights.length,3,'reuse three existing mouth lights');
  const before=lights.map(light=>light.intensity);
  assert.equal(works.feedFirewood(),true);
  assert.deepEqual(lights.slice(0,2).map(light=>light.intensity),before.slice(0,2));
  assert.ok(lights.some((light,i)=>light.intensity>before[i]));
  assert.equal(works.feedFirewood(),false);
  assert.deepEqual(lights.map(light=>light.intensity),before);
});

test('ZA-36: default live west crater exposes the SAME mouth scene actions, without a second duplicate building',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const mouth=road.group.getObjectByName('crater-mouth-works');
  assert.ok(mouth);
  assert.equal(mouth,road.mouthWorks.group,'return the one and only mounted site');
  assert.equal(road.group.children.filter(child=>child.name===mouth.name).length,1);
  assert.equal(road.mouthWorks.interactions.length,4);
  for(const p of road.mouthWorks.interactions){
    assert.ok(Number.isFinite(p.height));
    assert.ok(Math.abs(p.height-road.heightAt(p.east,p.north)!)<.001,
      'E hotspot must sample real terrain height');
    assert.equal(road.mouthWorks.actionAt(p.east,p.north,p.height)?.id,p.id);
  }
});
