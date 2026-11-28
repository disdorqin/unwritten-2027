import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {composeNightBWestHeight,inNightBWest} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {createNightBWestPavilion,findNightBWestPavilionSite} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-pavilion';
test('west pavilion replaces upper-cloud at a surveyed trail point with continuous supported approach',()=>{
 const block=createMainSummitBlock(mainSummitLayout,347,100),trail=createMainSummitTrail(block.heightAt,347),h=composeNightBWestHeight(sampleTownD2R30Height);
 const site=findNightBWestPavilionSite(trail.points,h);assert.ok(site);assert.ok(inNightBWest(site.east,site.north));assert.ok(site.height>=380&&site.height<=560);
 assert.ok(trail.points.some(p=>p.east===site.approach.east&&p.north===site.approach.north&&p.height===site.height));
 assert.equal(findNightBWestPavilionSite(trail.points,h,()=>true),undefined);
 const pavilion=createNightBWestPavilion(site,h);
 try{assert.equal(pavilion.replaces,'upper-cloud');assert.equal(pavilion.group.userData.roofTiers,2);
  assert.ok(pavilion.group.children.filter(c=>c.name==='west-pavilion-footing').length>=4);
  for(let distance=0;distance<=9.5;distance+=.1){const e:number=site.approach.east+site.viewEast*distance,n:number=site.approach.north+site.viewNorth*distance;assert.equal(pavilion.supportAt(e,n),site.height);assert.equal(pavilion.blocked(e,n,site.height),false);}
  // Entrance is reversible on the same floor; the exposed opposite edge is now a physical guard.
  for(let distance=9.5;distance>=0;distance-=.1){const e:number=site.approach.east+site.viewEast*distance,n:number=site.approach.north+site.viewNorth*distance;assert.equal(pavilion.supportAt(e,n),site.height);assert.equal(pavilion.blocked(e,n,site.height),false);}
  const edge=9.5+3.27;assert.equal(pavilion.blocked(site.approach.east+site.viewEast*edge,site.approach.north+site.viewNorth*edge,site.height),true);
  const mid=site.approach;assert.ok(pavilion.blocked(mid.east+site.viewEast*3-site.viewNorth*.94,mid.north+site.viewNorth*3+site.viewEast*.94,site.height));
  console.log(JSON.stringify(site));
 }finally{pavilion.dispose();}
});
