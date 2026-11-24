import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import {encounterPlacementPlan} from '../src/shared/underground-encounter-placement-plan.js';
import {mountFirstMineWorkfaces} from '../tools/voxel-tavern/town-blockout/town-c-first-mine-workfaces.js';
import {undergroundMineSpec} from '../tools/fixtures/underground-first-mine-survey-spec.js';
test('five carts, support station and eight surveyed candidates share the mounted geometry',()=>{
 const mine=createUndergroundMineLayout(undergroundMineSpec),station=mine.supportStation!;
 assert.equal(mine.workfaces.length,5);assert.ok(station);
 const fixtures=[...mine.workfaces,station],scene=new Group(),art=mountFirstMineWorkfaces(scene,mine.workfaces,station);
 assert.ok(art.pieces>=1100);
 for(const site of fixtures){
  assert.equal(mine.queryPassage(site.x,site.z,.27,1.8,'open'),undefined);
  assert.ok(mine.queryPassage(site.foot[0],site.foot[2],.27,1.8,'open'),site.id);
 }
 // Every raised piece is contained by a shared physical box; inlays are flush.
 for(const p of art.parts){
  if(p.y+p.h/2<=-91+.025)continue;
  assert.ok(fixtures.some(s=>Math.abs(p.x-s.x)+p.w/2<=s.width/2+1e-8&&Math.abs(p.z-s.z)+p.d/2<=s.depth/2+1e-8&&p.y+p.h/2<=s.y+s.height+1e-8),'unrepresented solid '+JSON.stringify(p));
 }
 for(let z=45.5;z<138;z+=.25)assert.ok(mine.queryPassage(0,z,.27,1.8,'open'));
 const candidates=encounterPlacementPlan.filter(g=>g.candidate?.frame==='first-mine-local-plus-z-candidate');
 assert.equal(candidates.length,8);assert.equal(encounterPlacementPlan.length,36);
 for(const g of candidates){
  const p=g.candidate!.at,pass=mine.queryPassage(p.east,p.north,.27,1.8,'open');
  assert.ok(pass,g.id);assert.equal(pass.floor,p.height);
  for(const safe of [mine.anchors.campRecovery.position,station.foot])
    assert.ok(Math.hypot(p.east-safe[0],p.north-safe[2])>=30,g.id+' safety');
  if(g.family==='90-D')assert.ok(pass.waterDepth>0);
 }
 art.dispose();assert.equal(scene.children.length,0);
});
