import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {sampleTownD2R30Height} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {composeNightBWestHeight,buildNightBWestReliefPreview} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {createTownD2R30Collision} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {createNightBWestSector} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-sector';
import {cutNightBWestTerrain} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-cut';
import {buildTownD2R30ChunkGeometry} from '../tools/voxel-tavern/town-blockout/town-d2-r30-massif';
import {townD2R30ChunkList} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import {inNightBWest} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-relief';
import {Mesh,Group} from 'three';
import {mountNightBWestProduction} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-west-production';
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
 assert.ok(refined>0&&lowered>0);
 // Use the actual canonical chunk geometry, not a preview grid with
 // different chunk boundaries. Register only the modified terrain.
 const owner=new Group(),nearTiles:Mesh[]=[];
 for(const chunk of townD2R30ChunkList){
  const bounds=s.cutTread.boundingBox!;
  if(chunk.east<bounds.min.x||chunk.west>bounds.max.x||chunk.north< -bounds.max.z||chunk.south> -bounds.min.z)continue;
  const source=buildTownD2R30ChunkGeometry(chunk,8,347),pos=source.getAttribute('position');
  for(let i=0;i<pos.count;i++)pos.setY(i,height(pos.getX(i),-pos.getZ(i))!);
  source.computeVertexNormals();source.computeBoundingBox();source.computeBoundingSphere();
  const mesh=new Mesh(source);owner.add(mesh);nearTiles.push(mesh);
 }
 const originals=nearTiles.map(m=>m.geometry);
 const args={owner,groundAt:collision.surfaceAt,trail:trail.points,nearTiles,legacyWestExcluded:true};
 assert.throws(()=>mountNightBWestProduction({...args,legacyWestExcluded:false}),/exclusive/);
 assert.throws(()=>mountNightBWestProduction({...args,nearTiles:[]}),/near tiles/);
 const production=mountNightBWestProduction(args);
 t.after(()=>{production.dispose();for(const g of originals)g.dispose();for(const m of nearTiles){if(!Array.isArray(m.material))m.material.dispose();}});
 assert.ok(production.cutChunks>0);assert.equal(production.group.parent,owner);assert.throws(()=>mountNightBWestProduction(args),/already mounted/);
 assert.equal(nearTiles.filter((m,i)=>m.geometry!==originals[i]).length,production.cutChunks);
 let probes=0,cutProbes=0,largestCorrection=0,failures=0,firstFailure:unknown;const kinds:Record<string,number>={};
 for(let i=1;i<trail.points.length;i++){
  const a=trail.points[i-1]!,b=trail.points[i]!,de=b.east-a.east,dn=b.north-a.north,len=Math.hypot(de,dn);if(len<.001)continue;
  const count=Math.ceil(len/.25);
  for(let j=0;j<count;j++)for(const off of [-1,-.5,0,.5,1]){
   const f=j/count,e=a.east+de*f-dn/len*off,n=a.north+dn*f+de/len*off;if(!inNightBWest(e,n))continue;
   const road=s.road.surfaceAt(e,n);if(road===undefined)continue;
   const ground=collision.surfaceAt(e,n)!;
   const actual=production.groundAt(e,n)??-Infinity;
   if(ground-actual>.001){cutProbes++;largestCorrection=Math.max(largestCorrection,ground-actual);}
   if(!Number.isFinite(actual)||actual>road+.003||s.blocked(e,n,road,.27)){failures++;const k=[actual>road+.003?'terrain':'',s.road.blocked(e,n,road,.27)?'rail':'',s.pavilion.blocked(e,n,road,.27)?'pavilion':'',s.dressing.blocked(e,n,road,.27)?'dressing':'',!Number.isFinite(actual)?'hole':''].filter(Boolean).join('+');kinds[k]=(kinds[k]??0)+1;firstFailure??={e,n,road,ground,actual,off,k};}
   probes++;
  }
 }
 console.log(JSON.stringify({pavilion:p,road:s.road.stats,dressing:s.dressing.stats,refined,lowered,cutChunks:production.cutChunks,probes,cutProbes,largestCorrection,failures,kinds,firstFailure}));
 assert.ok(probes>5000&&cutProbes>0);assert.equal(failures,0,JSON.stringify(firstFailure));
 production.dispose();assert.equal(production.group.parent,null);assert.ok(nearTiles.every((m,i)=>m.geometry===originals[i]));assert.equal(production.groundAt(-400,700),undefined);
});
