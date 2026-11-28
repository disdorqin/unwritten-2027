import {BufferGeometry,Float32BufferAttribute,Group,type Mesh,type Object3D} from 'three';
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
 extension?:Readonly<{trail:readonly MainSummitTrailPoint[];first:number;last:number;cap:number}>;
 nearTiles:readonly Mesh[];
 legacySouthVegetationExcluded:boolean;
 legacyTreadExcluded:boolean;
 /** Inject the actual accepted B cutter and CPU triangle index (533065a9).
  * No separate A height raster, color interpolation or collision algorithm. */
 cutTerrain:(source:BufferGeometry,tread:BufferGeometry)=>{geometry:BufferGeometry};
 createCutSurface:(geometry:BufferGeometry)=>CutSurface;
};

/** Both strips share one cut buffer and one sector. No second terrain owner. */
function combineSouthRoads(a:ReturnType<typeof mountSouthEarthworks>,b:ReturnType<typeof mountSouthEarthworks>){
 const group=new Group();group.name='night-a-south-road-combined';group.add(a.group,b.group);
 const vertices:number[]=[],indices:number[]=[];
 for(const leaf of [a,b]){
  const pos=leaf.cutTread.getAttribute('position'),idx=leaf.cutTread.getIndex()!,offset=vertices.length/3;
  for(let i=0;i<pos.count;i++)vertices.push(pos.getX(i),pos.getY(i),pos.getZ(i));
  for(let i=0;i<idx.count;i++)indices.push(idx.getX(i)+offset);
 }
 const cutTread=new BufferGeometry();cutTread.setAttribute('position',new Float32BufferAttribute(vertices,3));cutTread.setIndex(indices);cutTread.computeVertexNormals();
 const stats={length:a.stats.length+b.stats.length,maxGrade:Math.max(a.stats.maxGrade,b.stats.maxGrade),maxCut:Math.max(a.stats.maxCut,b.stats.maxCut),maxFill:Math.max(a.stats.maxFill,b.stats.maxFill),railMetres:a.stats.railMetres+b.stats.railMetres,railPosts:a.stats.railPosts+b.stats.railPosts,draws:a.stats.draws+b.stats.draws,treadTriangles:a.stats.treadTriangles+b.stats.treadTriangles,triangles:a.stats.triangles+b.stats.triangles};
 return {group,cutTread,stats,supportAt(e:number,n:number){const x=a.supportAt(e,n),y=b.supportAt(e,n);return x===undefined?y:y===undefined?x:Math.max(x,y);},blocked(e:number,n:number,h:number,r=.27,body=1.8){return a.blocked(e,n,h,r,body)||b.blocked(e,n,h,r,body);},dispose(){a.dispose();b.dispose();cutTread.dispose();group.removeFromParent();group.clear();}};
}

/** Stage a single southern sector on real canonical terrain. Transfer road
 * ownership only after every tread vertex has a genuine near-ground tile.
 * The D2 host owns the unmodified meshes, keeps cut collision data resident
 * across LOD changes, and must release this package before the terrain. */
export function mountSouthProduction(input:Input){
 if(!input.legacySouthVegetationExcluded||!input.legacyTreadExcluded)throw Error('South production requires exclusive asset ownership');
 if(input.owner.getObjectByName('night-a-south-sector'))throw Error('South sector already mounted');
 if(!input.nearTiles.length||new Set(input.nearTiles).size!==input.nearTiles.length)throw Error('Missing or duplicate canonical near tiles');
 // Meshes and every intermediate parent must use the exact owner-local
 // EN frame. A translated LOD container would silently cut the wrong hill.
 for(const tile of input.nearTiles){
  let node:Object3D|null=tile;
  while(node&&node!==input.owner){
   if(node.position.lengthSq()!==0||node.rotation.x!==0||node.rotation.y!==0||node.rotation.z!==0||node.scale.x!==1||node.scale.y!==1||node.scale.z!==1)throw Error('Unexpected near tile transform');
   node=node.parent;
  }
  if(node!==input.owner)throw Error('Canonical near tile not owned by host');
 }
 const base=mountSouthEarthworks(input.trail,input.first,input.last,input.groundAt),cuts:Cut[]=[];
 let extra:ReturnType<typeof mountSouthEarthworks>|undefined;
 try{if(input.extension)extra=mountSouthEarthworks(input.extension.trail,input.extension.first,input.extension.last,input.groundAt,input.extension.cap);}
 catch(error){base.dispose();throw error;}
 const road=extra?combineSouthRoads(base,extra):base;
 const strips=[{trail:input.trail,first:input.first,last:input.last},...(input.extension?[input.extension]:[])];
 let sector:ReturnType<typeof mountSouthSector>|undefined;
 let disposed=false;
 const restore=()=>{for(const c of cuts){if(c.mesh.geometry===c.geometry)c.mesh.geometry=c.original;c.surface.dispose();c.geometry.dispose();}cuts.length=0;};
 function coversCut(e:number,n:number){return !disposed&&cuts.some(c=>c.surface.covers(e,n));}
 function cutGroundAt(e:number,n:number){
  if(disposed)return;
  let y:number|undefined;
  for(const cut of cuts){
   if(!cut.surface.covers(e,n))continue;
   const h=cut.surface.surfaceAt(e,n);
   if(h===undefined||!Number.isFinite(h))return;
   y=y===undefined?h:Math.max(y,h);
  }
  return y;
 }
 function groundAt(e:number,n:number){return disposed?undefined:coversCut(e,n)?cutGroundAt(e,n):input.groundAt(e,n);}
 try{
  road.cutTread.computeBoundingBox();
  const bounds=road.cutTread.boundingBox!;
  const coveredTiles:Mesh[]=[];
  for(const mesh of input.nearTiles){
   const original=mesh.geometry as BufferGeometry;
   if(!original.boundingBox)original.computeBoundingBox();
   const b=original.boundingBox!;
   if(b.max.x<bounds.min.x||b.min.x>bounds.max.x||b.max.z<bounds.min.z||b.min.z>bounds.max.z)continue;
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
  for(const strip of strips)for(let i=strip.first+1;i<=strip.last;i++){
   const a=strip.trail[i-1]!,b=strip.trail[i]!,prev=strip.trail[i-2]!,next=strip.trail[i+1]!;
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
 const live=()=>!disposed&&mounted.group.parent===input.owner;
 return {sector:mounted,group:mounted.group,groundAt:(e:number,n:number)=>live()?groundAt(e,n):undefined,cutChunks:cuts.length,
  // D2 must prefer the final cut face inside a changed tile even when
  // lower than the original raster. Undefined within coverage is a hole,
  // not permission to restore an invisible uncut collision layer.
  coversCut:(e:number,n:number)=>live()&&coversCut(e,n),
  cutGroundAt:(e:number,n:number)=>live()?cutGroundAt(e,n):undefined,
  deckAt:(e:number,n:number)=>live()?mounted.supportAt(e,n):undefined,
  cutTiles:()=>live()?cuts.map(c=>c.mesh):[],
  supportAt(e:number,n:number){
   if(!live())return;
   const h=groundAt(e,n);if(h===undefined)return;
   const tread=mounted.supportAt(e,n);return tread===undefined?h:Math.max(h,tread);
  },
  blocked(e:number,n:number,h:number,r=.27,body=1.8){return live()&&mounted.blocked(e,n,h,r,body);},
  updateView(e:number,n:number){if(live())mounted.updateView(e,n);},
  setNight(night:boolean){if(live())mounted.setNight(night);},
  updateSnow(...args:Parameters<typeof mounted.updateSnow>){if(live())mounted.updateSnow(...args);},
  dispose(){if(disposed)return;disposed=true;mounted.dispose();restore();}
 };
}
