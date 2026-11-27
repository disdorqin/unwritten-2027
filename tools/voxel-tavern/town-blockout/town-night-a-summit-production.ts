import type {BufferGeometry,Group,Mesh} from 'three';
import type {MainSummitTrailPoint} from './main-summit-trail';
import type {SouthGround,SouthProtection} from './town-night-a-summit-landform';
import {mountSouthEarthworks} from './town-night-a-summit-road-earthworks';
import {mountSouthSector} from './town-night-a-summit-sector';

type CutSurface={covers(e:number,n:number):boolean;surfaceAt:SouthGround;dispose():void};
type Cut={mesh:Mesh;original:BufferGeometry;geometry:BufferGeometry;surface:CutSurface};
type Input={
 owner:Group;
 /** Final, uncut canonical near surface in summit-local EN metres. */
 groundAt:SouthGround;
 reserved:SouthProtection;
 /** C2's accepted profile and the exact A-owned interval, not a new EN alignment. */
 trail:readonly MainSummitTrailPoint[];
 first:number;last:number;
 nearTiles:readonly Mesh[];
 legacySouthVegetationExcluded:boolean;
 legacyTreadExcluded:boolean;
 /** Inject the actual accepted B cutter and CPU triangle index (533065a9).
  * No separate A height raster, color interpolation or collision algorithm. */
 cutTerrain:(source:BufferGeometry,tread:BufferGeometry)=>{geometry:BufferGeometry};
 createCutSurface:(geometry:BufferGeometry)=>CutSurface;
};

/** Stage a single southern sector on real canonical terrain. Transfer road
 * ownership only after every tread vertex has a genuine near-ground tile.
 * The D2 host owns the unmodified meshes, keeps cut collision data resident
 * across LOD changes, and must release this package before the terrain. */
export function mountSouthProduction(input:Input){
 if(!input.legacySouthVegetationExcluded||!input.legacyTreadExcluded)throw Error('South production requires exclusive asset ownership');
 if(input.owner.getObjectByName('night-a-south-sector'))throw Error('South sector already mounted');
 if(!input.nearTiles.length||new Set(input.nearTiles).size!==input.nearTiles.length)throw Error('Missing or duplicate canonical near tiles');
 const road=mountSouthEarthworks(input.trail,input.first,input.last,input.groundAt),cuts:Cut[]=[];
 let sector:ReturnType<typeof mountSouthSector>|undefined;
 let disposed=false;
 const restore=()=>{for(const c of cuts){if(c.mesh.geometry===c.geometry)c.mesh.geometry=c.original;c.surface.dispose();c.geometry.dispose();}cuts.length=0;};
 function groundAt(e:number,n:number){
  if(disposed)return;
  let covered=false,y:number|undefined;
  for(const cut of cuts){
   if(!cut.surface.covers(e,n))continue;
   covered=true;
   const h=cut.surface.surfaceAt(e,n);
   if(h===undefined||!Number.isFinite(h))return;
   y=y===undefined?h:Math.max(y,h);
  }
  return covered?y:input.groundAt(e,n);
 }
 try{
  road.cutTread.computeBoundingBox();
  const bounds=road.cutTread.boundingBox!;
  const coveredTiles:Mesh[]=[];
  for(const mesh of input.nearTiles){
   const original=mesh.geometry as BufferGeometry;
   if(!original.boundingBox)original.computeBoundingBox();
   const b=original.boundingBox!;
   if(b.max.x<bounds.min.x||b.min.x>bounds.max.x||b.max.z<bounds.min.z||b.min.z>bounds.max.z)continue;
   if(mesh.position.lengthSq()!==0||mesh.rotation.x!==0||mesh.rotation.y!==0||mesh.rotation.z!==0||mesh.scale.x!==1||mesh.scale.y!==1||mesh.scale.z!==1)throw Error('Unexpected near tile transform');
   const pos=original.getAttribute('position');
   if(!original.getIndex()||!pos)throw Error('Missing indexed canonical top tile');
   for(let i=0;i<pos.count;i++){
    const h=input.groundAt(pos.getX(i),-pos.getZ(i));
    if(h===undefined||!Number.isFinite(h)||Math.abs(h-pos.getY(i))>.001)throw Error('Near tile differs from final canonical ground');
   }
   coveredTiles.push(mesh);
   const cut=input.cutTerrain(original,road.cutTread);
   if(cut.geometry===original)continue;
   try{cuts.push({mesh,original,geometry:cut.geometry,surface:input.createCutSurface(cut.geometry)});}
   catch(error){cut.geometry.dispose();throw error;}
  }
  const tread=road.cutTread.getAttribute('position');
  for(let i=0;i<tread.count;i++){
   const e=tread.getX(i),z=tread.getZ(i);
   if(!coveredTiles.some(m=>{const b=m.geometry.boundingBox!;return e>=b.min.x-.001&&e<=b.max.x+.001&&z>=b.min.z-.001&&z<=b.max.z+.001;}))throw Error('South tread lacks canonical near tile coverage');
  }
  // A vertical retaining face may share the exact outer tread edge.
  // Check the actual clear walking band, including both shoulders,
  // rather than demanding the adjacent high wall disappear.
  for(let i=input.first+1;i<=input.last;i++){
   const a=input.trail[i-1]!,b=input.trail[i]!,prev=input.trail[i-2]!,next=input.trail[i+1]!;
   const side=(p:MainSummitTrailPoint,lo:MainSummitTrailPoint,hi:MainSummitTrailPoint,t:number)=>{
    const de=hi.east-lo.east,dn=hi.north-lo.north,l=Math.hypot(de,dn);
    return {e:p.east-dn/l*t,n:p.north+de/l*t};
   };
   for(const f of [.125,.5,.875])for(const t of [-1,0,1]){
    const u=side(a,prev,b,t),v=side(b,a,next,t);
    const e=u.e+(v.e-u.e)*f,n=u.n+(v.n-u.n)*f,h=groundAt(e,n),top=road.supportAt(e,n);
    if(h===undefined||top===undefined||!Number.isFinite(h)||h>top+.001)throw Error('Cut does not clear supported southern tread');
   }
  }
  // No new terrain or duplicate mesh. The existing host meshes are replaced
  // atomically only after the full cut/collision staging has succeeded.
  for(const c of cuts)c.mesh.geometry=c.geometry;
  sector=mountSouthSector({heightAt:groundAt,reserved:input.reserved,
   legacySouthVegetationExcluded:true,legacyTreadExcluded:true,earthworks:road,canonicalCutInstalled:true});
  input.owner.add(sector.group);
 }catch(error){sector?.dispose();if(!sector)road.dispose();restore();throw error;}
 const mounted=sector;
 return {sector:mounted,group:mounted.group,groundAt,cutChunks:cuts.length,
  supportAt(e:number,n:number){
   const h=groundAt(e,n);if(h===undefined)return;
   const tread=mounted.supportAt(e,n);return tread===undefined?h:Math.max(h,tread);
  },
  blocked(e:number,n:number,h:number,r=.27,body=1.8){return !disposed&&mounted.blocked(e,n,h,r,body);},
  updateView:mounted.updateView,setNight:mounted.setNight,
  dispose(){if(disposed)return;disposed=true;mounted.dispose();restore();}
 };
}
