import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh,MeshLambertMaterial} from 'three';
import {mountSkyCity} from '../tools/voxel-tavern/town-blockout/sky-city';
import {skyCityPlaqueCopy} from '../tools/voxel-tavern/town-blockout/sky-city-inscribed-plate';
import {buildStarportCarryMountainRoute,mountStarportCarryFormation,sampleStarportCarryRoute} from '../tools/voxel-tavern/town-blockout/starport-cooperation-procession';
import {buildSwitchbackCenterline} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import {createCombineFlags} from '../src/shared/town-combine-flags';
test('ZD05 hall is physically reachable and has canonical three plaques; reserved lighting never changes physical geometry',()=>{
 const city=mountSkyCity(new Group());city.show('full');const m=city.footModel()!;
 try{
  assert.ok(m.group.getObjectByName('sky-city-observatory-main-hall'));
  for(const [id,copy]of Object.entries(skyCityPlaqueCopy))assert.equal(m.group.getObjectByName('sky-city-inscription-'+id)?.userData.text,copy);
  let p={x:-14,y:0,z:37.4};
  const route=[[-14,31],[8,29],[15,20],[15,12],[15,7],[16,1],[16,-4],[16,-6]];
  for(const [x,z]of route){const next=m.step(p,x!,z!);assert.ok(next);p=next!}
  assert.equal(m.obstructs(16,-6,0,.28),false);
  assert.equal(m.obstructs(16,-10,0,.28),true);
  const window=m.group.getObjectByName('sky-city-dormitory-dream-windows')!;
  const lamps=m.group.getObjectByName('sky-city-dream-street-lanterns')!;
  assert.equal(window.visible,false);assert.equal(lamps.visible,false);
  m.dreamPresentation(true);assert.equal(window.visible,true);assert.equal(lamps.visible,true);
  assert.equal(m.obstructs(16,-10,0,.28),true);
  m.dreamPresentation(false);assert.equal(window.visible,false);assert.equal(lamps.visible,false);
  for(const [x,z]of route.slice(0,-1).reverse()){const next=m.step(p,x!,z!);assert.ok(next);p=next!}
 }finally{city.dispose()}
});
test('B91 carries on the canonical switchback survey, and only first forged flag renders formation',()=>{
 const line=buildSwitchbackCenterline(),route=buildStarportCarryMountainRoute();
 assert.deepEqual(route.slice(0,line.length),line);
 assert.deepEqual(route.at(-1)&&[route.at(-1)!.east,route.at(-1)!.north,route.at(-1)!.height],[324,655,347]);
 assert.ok(route.every((p,i)=>i===0||p.cum>route[i-1]!.cum));
 assert.equal(sampleStarportCarryRoute(route,Number.NaN),undefined);
 const flag=createCombineFlags({scheduleAt:()=>({beaconAt:0}),hasStoryKey:()=>true});
 const formation=mountStarportCarryFormation(new Group());
 try{
  assert.equal(formation.apply(flag.snapshot(0),100,0),false);assert.equal(formation.group.visible,false);
  assert.equal(flag.forgeCompleted().handsEvent,true);
  assert.equal(formation.apply(flag.snapshot(0),route.at(-1)!.cum-6,1),true);
  assert.equal(formation.group.visible,true);
  assert.equal(formation.group.getObjectByName('starport-carried-booster-display')!.position.y,348.16);
  assert.ok(flag.assemblyCompleted());assert.equal(formation.apply(flag.snapshot(0),100,0),false);
  assert.ok(flag.ignite(0));assert.equal(formation.apply(flag.snapshot(0),100,0),false);
 }finally{formation.dispose()}
});
