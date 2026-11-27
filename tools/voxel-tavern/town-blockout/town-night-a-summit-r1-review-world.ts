/** Independent R1 review assembly; D2 still owns the production terrain. */
import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import {createMainSummitBlock,mainSummitLayout} from './main-summit-block';
import {createMainSummitTrail} from './main-summit-trail';
import {createMainSummitCable} from './main-summit-cable';
import {mountMainSummitCableStations} from './main-summit-cable-stations';
import {sampleNorthRidge350} from './north-ridge-350-terrain';
import {sampleTownD2R30Height} from './town-d2-r30-domain';
import {createTownD2R30Collision} from './town-d2-r30-collision';
import {createSouthReservation} from './town-night-a-summit-reservation';
import {createSouthHeightDelta,southComposedCandidate} from './town-night-a-summit-landform';
import {mountSouthEntry} from './town-night-a-summit-entry';
import {mountSouthGully} from './town-night-a-summit-gully';
export function buildSouthReviewWorld(){
 const group=new Group(),block=createMainSummitBlock(mainSummitLayout,347,100);
 const trail=createMainSummitTrail(block.heightAt,347),cable=createMainSummitCable(0,10000,347);
 const protectedAt=createSouthReservation([{points:trail.points,radius:18},...cable.ropes.map(r=>({points:r.points,radius:40}))],[{west:-42,east:42,south:-10,north:55}]);
 const delta=createSouthHeightDelta(protectedAt),candidate=southComposedCandidate(sampleTownD2R30Height,protectedAt);
 const collision=createTownD2R30Collision({heightAt:candidate});
 const terrain=new Group(),mat=new MeshLambertMaterial({vertexColors:true});
 const ice=new Color('#cbd9df'),grass=new Color('#849080'),stone=new Color('#747d83'),tint=new Color();
 let changed=0,min=0,max=0,triangles=0;
 // Exact canonical 8m grid, including read-only northern context.
 for(let n0=-10;n0<1790;n0+=256)for(let e0=-1100;e0<1100;e0+=256){
  const n1=Math.min(n0+256,1790),e1=Math.min(e0+256,1100),cols=(e1-e0)/8+1;
  const p:number[]=[],c:number[]=[],idx:number[]=[];
  for(let n=n0;n<=n1;n+=8)for(let e=e0;e<=e1;e+=8){
   const h=collision.surfaceAt(e,n)!;p.push(e,h,-n);
   const d=delta(e,n);if(Math.abs(d)>.1){changed++;min=Math.min(min,d);max=Math.max(max,d);}
   const slope=Math.hypot((collision.surfaceAt(Math.min(e+8,1100),n)??h)-h,(collision.surfaceAt(e,Math.min(n+8,1790))??h)-h)/8;
   tint.copy(grass).lerp(ice,Math.min(.95,.33+Math.max(0,h-240)/480)).lerp(stone,Math.min(.8,Math.max(0,slope-.22)*1.2));
   tint.multiplyScalar(.96+.04*Math.cos(e*.045+n*.028));c.push(tint.r,tint.g,tint.b);
   if(e<e1&&n<n1){const i=(n-n0)/8*cols+(e-e0)/8;idx.push(i,i+1,i+cols,i+1,i+cols+1,i+cols);}
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();terrain.add(new Mesh(g,mat));triangles+=idx.length/3;
 }
 // Existing cloud terrace approach is read-only, not invented geometry.
 const p:number[]=[],idx:number[]=[],c:number[]=[];
 for(let n=-30;n<=-10;n++)for(let e=-32;e<=32;e++){
  p.push(e,sampleNorthRidge350(e+300,n+676),-n);c.push(.71,.77,.81);
  if(n<-10&&e<32){const i=(n+30)*65+e+32;idx.push(i,i+1,i+65,i+1,i+66,i+65);}
 }
 const apron=new BufferGeometry();apron.setAttribute('position',new Float32BufferAttribute(p,3));apron.setAttribute('color',new Float32BufferAttribute(c,3));apron.setIndex(idx);apron.computeVertexNormals();terrain.add(new Mesh(apron,mat));
 group.add(terrain);
 const station=mountMainSummitCableStations(group,cable,{heightAt:collision.surfaceAt,enter:owner=>block.enter(owner),leave:block.leave});
 const entry=mountSouthEntry(collision.surfaceAt),gully=mountSouthGully(collision.surfaceAt,protectedAt);group.add(entry.group,gully.group);
 const ground=(e:number,n:number)=>n< -10&&n>=-30&&Math.abs(e)<=32?sampleNorthRidge350(e+300,n+676):collision.surfaceAt(e,n);
 return {group,collision,ground,protectedAt,delta,entry,gully,station,trail,stats:{changed,min,max,triangles,gully:gully.triangles,entryMeshes:entry.group.children.length},blocked:(e:number,n:number,h:number)=>entry.blocked(e,n,h)||station.blocked(e,n,h),dispose(){entry.dispose();gully.dispose();station.dispose();block.dispose();collision.dispose();terrain.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});mat.dispose();group.clear();}};
}
