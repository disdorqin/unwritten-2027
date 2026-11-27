import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {composeNightBWestHeight,buildNightBWestReliefPreview} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {createTownD2R30Collision} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {createNightBWestSector} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-sector';
import {cutNightBWestTerrain} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-cut';
import {Mesh} from 'three';
test('west sector combines final raster support, road and pavilion with no entrance obstruction',t=>{
 const block=createMainSummitBlock(mainSummitLayout,347,100);t.after(block.dispose);
 const trail=createMainSummitTrail(block.heightAt,347),height=composeNightBWestHeight(sampleTownD2R30Height);
 const collision=createTownD2R30Collision({heightAt:height});t.after(collision.dispose);
 const s=createNightBWestSector(collision.surfaceAt,trail.points);t.after(s.dispose);
 const p=s.pavilion.site;assert.equal(s.group.children.length,3);
 for(let i=0;i<=95;i++){const d=i/10,e=p.approach.east+p.viewEast*d,n=p.approach.north+p.viewNorth*d,h=s.supportAt(e,n);assert.ok(h!==undefined);assert.ok(Math.abs(h-p.height)<.14);assert.equal(s.blocked(e,n,h),false,'entrance '+d);}
 for(const x of trail.points.filter(v=>Math.hypot(v.east-p.approach.east,v.north-p.approach.north)<=4)){const h=s.supportAt(x.east,x.north);assert.ok(h!==undefined);assert.equal(s.blocked(x.east,x.north,h),false,'original road at pavilion');}
 for(const v of s.dressing.bodies)assert.equal(s.road.reserved(v.e,v.n,8),false);
 assert.equal(s.cutTread.getIndex()!.count,s.road.stats.treadTris*3);
 const relief=buildNightBWestReliefPreview(sampleTownD2R30Height);t.after(relief.dispose);
 let refined=0,lowered=0;
 for(const m of relief.group.children as Mesh[]){if(!m.geometry.boundingBox)m.geometry.computeBoundingBox();if(!m.geometry.boundingBox!.intersectsBox(s.cutTread.boundingBox!))continue;const result=cutNightBWestTerrain(m.geometry,s.cutTread);refined+=result.refinedTriangles;lowered+=result.loweredVertices;if(result.geometry!==m.geometry){const color=result.geometry.getAttribute('color');assert.equal(color.count,result.geometry.getAttribute('position').count);assert.ok([...color.array].every(Number.isFinite));result.geometry.dispose();}}
 assert.ok(refined>0&&lowered>0);console.log(JSON.stringify({pavilion:p,road:s.road.stats,dressing:s.dressing.stats,refined,lowered}));
});
