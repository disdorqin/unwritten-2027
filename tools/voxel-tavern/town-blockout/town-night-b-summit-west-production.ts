import {type BufferGeometry,Group,type Mesh} from 'three';
import {finishNightBAudit,finishNightBAuditAsync,type NightBAuditSliceOptions} from './town-night-b-audit-slices';
import {prepareA32CutCache} from './town-a32-cut-preload';
import {createNightBWestSector,nightBWestSectorSteps} from './town-night-b-summit-west-sector';
import {cutNightBWestTerrain,createNightBWestCutSurface} from './town-night-b-summit-west-cut';
import type {WestReserve} from './town-night-b-summit-west-relief';
import type {MainSummitTrailPoint} from './main-summit-trail';
type Height=(e:number,n:number)=>number|undefined;
type Cut={mesh:Mesh;original:BufferGeometry;geometry:BufferGeometry;surface:ReturnType<typeof createNightBWestCutSurface>};
type Input={
 owner:Group;
 /** Final canonical collision before road excavation, not an analytic approximation. */
 groundAt:Height;
 trail:readonly MainSummitTrailPoint[];
 reserve?:WestReserve;
 /** All canonical near TOP tiles, in the summit local frame. Never far or skirts. */
 nearTiles:readonly Mesh[];
 /** Owner has excluded the replaced legacy west road/pavilion/vegetation. */
 legacyWestExcluded:boolean;
};
/** Actual geometry replacement in the caller's existing terrain group.
 * No additional ground mesh. The caller owns original meshes/geometries;
 * dispose this package before disposing the terrain. */
function* westProductionSteps(input:Input,prepared?:ReturnType<typeof createNightBWestSector>,cutTerrain:(source:BufferGeometry,tread:BufferGeometry)=>{geometry:BufferGeometry}=cutNightBWestTerrain){
 if(!input.legacyWestExcluded)throw Error('West production requires exclusive asset ownership');
 if(input.owner.getObjectByName('night-b-west-sector'))throw Error('West sector already mounted');
 if(!input.nearTiles.length||new Set(input.nearTiles).size!==input.nearTiles.length)throw Error('Missing or duplicate canonical near tiles');
 const sector=prepared??(yield* nightBWestSectorSteps(input.groundAt,input.trail,input.reserve)),cuts:Cut[]=[];
 try{
  for(const mesh of input.nearTiles){
   yield;
   const original=mesh.geometry as BufferGeometry;
   if(!original.boundingBox)original.computeBoundingBox();
   if(!original.boundingBox!.intersectsBox(sector.cutTread.boundingBox!))continue;
   // Positions are already expressed in canonical local metres. Refuse a
   // shifted, scaled, uncomposed or lower-resolution surrogate.
   if(mesh.position.lengthSq()!==0||mesh.rotation.x!==0||mesh.rotation.y!==0||mesh.rotation.z!==0||mesh.scale.x!==1||mesh.scale.y!==1||mesh.scale.z!==1)throw Error('Unexpected near tile transform');
   const pos=original.getAttribute('position');
   for(let i=0;i<pos.count;i++){
    if(i%128===0)yield;
    const h=input.groundAt(pos.getX(i),-pos.getZ(i));
    if(h===undefined||Math.abs(h-pos.getY(i))>.001)throw Error('Near tile differs from final canonical ground');
   }
   const cut=cutTerrain(original,sector.cutTread);
   if(cut.geometry===original)continue;
   try{cuts.push({mesh,original,geometry:cut.geometry,surface:createNightBWestCutSurface(cut.geometry)});}
   catch(e){cut.geometry.dispose();throw e;}
  }
  // Every tread vertex must be represented by a supplied near tile.
  const tread=sector.cutTread.getAttribute('position');
  for(let i=0;i<tread.count;i++){
   if(i%64===0)yield;
   const e=tread.getX(i),z=tread.getZ(i);
   if(!input.nearTiles.some(m=>{const b=m.geometry.boundingBox!;return e>=b.min.x-.001&&e<=b.max.x+.001&&z>=b.min.z-.001&&z<=b.max.z+.001;}))throw Error('West tread lacks canonical near tile coverage');
  }
  for(const c of cuts)c.mesh.geometry=c.geometry;
  input.owner.add(sector.group);
 }catch(e){for(const c of cuts){if(c.mesh.geometry===c.geometry)c.mesh.geometry=c.original;c.surface.dispose();c.geometry.dispose();}sector.dispose();throw e;}
 let disposed=false;
 function groundAt(e:number,n:number){
  if(disposed)return;
  const covered=cuts.filter(c=>c.surface.covers(e,n));
  if(!covered.length)return input.groundAt(e,n);
  const heights=covered.map(c=>c.surface.surfaceAt(e,n));
  if(heights.some(h=>h===undefined))return;
  return Math.max(...heights as number[]);
 }
 return {sector,group:sector.group,groundAt,cutChunks:cuts.length,
  coversCut(e:number,n:number){return !disposed&&cuts.some(c=>c.surface.covers(e,n));},
  cutGroundAt(e:number,n:number){return !disposed&&cuts.some(c=>c.surface.covers(e,n))?groundAt(e,n):undefined;},
  deckAt(e:number,n:number,r=.27){return disposed?undefined:sector.supportAt(e,n,r);},
  supportAt(e:number,n:number,r=.27){
   if(disposed)return;
   const ground=groundAt(e,n);if(ground===undefined)return;
   const deck=sector.supportAt(e,n,r);return deck===undefined?ground:Math.max(ground,deck);
  },
  blocked(e:number,n:number,h:number,r=.27,body=1.8){return disposed||sector.blocked(e,n,h,r,body);},
  updateView:sector.updateView,setNight:sector.setNight,
  dispose(){if(disposed)return;disposed=true;sector.dispose();for(const c of cuts){if(c.mesh.geometry===c.geometry)c.mesh.geometry=c.original;c.surface.dispose();c.geometry.dispose();}}
 };
}
export function mountNightBWestProduction(input:Input){return finishNightBAudit(westProductionSteps(input));}
export async function mountNightBWestProductionAsync(input:Input,options:NightBAuditSliceOptions={}){
 const sector=await finishNightBAuditAsync(nightBWestSectorSteps(input.groundAt,input.trail,input.reserve),options);
 try{
  let cache:Awaited<ReturnType<typeof prepareA32CutCache>>;
  try{cache=await prepareA32CutCache(input.nearTiles,sector.cutTread,options.signal??new AbortController().signal);}catch(error){if(options.signal?.aborted||options.valid?.()===false)throw error;}
  const result=await finishNightBAuditAsync(westProductionSteps(input,sector,cache?.cut??cutNightBWestTerrain),options);
  result.group.userData.cutPreparation=cache?.stats??{mode:'sync'};return result;
 }catch(error){sector.dispose();throw error;}
}
