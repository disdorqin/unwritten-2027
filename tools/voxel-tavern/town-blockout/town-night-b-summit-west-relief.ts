import {BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import {sampleTownD2R30Height,townD2R30GridAxis} from './town-d2-r30-domain';
import {createMainSummitCable} from './main-summit-cable';
export const nightBWestBounds=Object.freeze({west:-1100,east:-300,south:480,north:1790,blend:32,area:1048000});
export const nightBWestPeak=Object.freeze({east:-550,north:900,height:560});
type Height=(east:number,north:number)=>number|undefined;
export type WestReserve=(east:number,north:number,radius:number)=>boolean;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
const bell=(x:number)=>Math.exp(-x*x);
export function inNightBWest(e:number,n:number){return Number.isFinite(e)&&Number.isFinite(n)&&e>=-1100&&e< -300&&n>=480&&n<=1790;}
/** The existing two-rope surveyed alignment is protected, not moved by
 * relief. A/D2 may supply additional C2 trail and facility protection. */
const cable=createMainSummitCable(0,10000,347);
const ropeSpans=cable.ropes.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i]!,b})));
export function westCableDistance(e:number,n:number){
 let d=Infinity;for(const {a,b} of ropeSpans){const dx=b.east-a.east,dn=b.north-a.north,t=clamp(((e-a.east)*dx+(n-a.north)*dn)/(dx*dx+dn*dn));d=Math.min(d,Math.hypot(e-a.east-dx*t,n-a.north-dn*t));}return d;
}
/** West gully runs out from the existing western valley; its channel bends,
 * broad glacial shoulders and small asymmetric ribs blend into that base.
 * The sole canonical owner composes this additive delta BEFORE mesh,
 * normal, LOD and collision generation. Never overlay a second land surface. */
/** The reservation callback must be monotone in radius (physical footprint
 * intersection). Hold the first 12m unchanged, then blend across 32m. */
export function nightBWestReserveWeight(e:number,n:number,reserved?:WestReserve){
 if(!reserved)return 1;
 if(reserved(e,n,12))return 0;
 if(!reserved(e,n,44))return 1;
 let lo=12,hi=44;
 for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(reserved(e,n,mid))hi=mid;else lo=mid;}
 return smooth(((lo+hi)/2-12)/32);
}
function westDelta(e:number,n:number,h:number|undefined,reserved?:WestReserve){
 if(!inNightBWest(e,n)||h===undefined||!Number.isFinite(h))return 0;
 const b=nightBWestBounds,edge=Math.min(e-b.west,b.east-e,n-b.south,b.north-n);
 const seam=smooth(edge/32);if(seam===0)return 0;
 const reserve=nightBWestReserveWeight(e,n,reserved);if(reserve===0)return 0;
 const peakDistance=Math.hypot(e-nightBWestPeak.east,n-nightBWestPeak.north);
 const protect=smooth((peakDistance-24)/64)*smooth((westCableDistance(e,n)-18)/32);
 const along=(n-520)/770,channelEast=-760-95*Math.sin(clamp(along)*Math.PI)+54*clamp(along);
 const across=e-channelEast,channelWeight=smooth((n-490)/90)*(1-smooth((n-1270)/240));
 const incision=-17*bell(across/31)*channelWeight-7*bell(across/94)*channelWeight;
 const shoulder=8*(bell((across-89)/55)+.62*bell((across+110)/76))*channelWeight;
 const rib=5.5*Math.sin((e+600)*.024+n*.009)*Math.sin(n*.016-e*.006)*
  bell((e+645)/360)*bell((n-1040)/490);
 const lee=6*bell((e+885)/145)*bell((n-1420)/180);
 if(protect===0)return 0;
 const raw=(incision+shoulder+rib+lee)*seam*protect*reserve;
 // Preserve the existing floor/peak limits; no new independent summit.
 return Math.max(150-h,Math.min(800-h,raw));
}
export function nightBWestHeightDelta(e:number,n:number,base:Height,reserved?:WestReserve){
 if(!inNightBWest(e,n))return 0;
 return westDelta(e,n,base(e,n),reserved);
}
export function composeNightBWestHeight(base:Height,reserved?:WestReserve):Height{
 return (e,n)=>{const h=base(e,n);return h===undefined?undefined:h+westDelta(e,n,h,reserved);};
}
const forestTint=new Color('#36564b'),woodlandTint=new Color('#647561'),rockTint=new Color('#8a8378'),warmRockTint=new Color('#a98a56'),bedTint=new Color('#5d4630'),snowTint=new Color('#dfe8ed');
/** Continuous west-sector biome palette, feathered into the unmodified
 * neighbour's actual vertex color. Use final canonical height and slope. */
export function tintNightBWestSurface(e:number,n:number,h:number,slope:number,base:Color){
 if(!inNightBWest(e,n)||![h,slope].every(Number.isFinite))return base;
 const b=nightBWestBounds,seam=smooth(Math.min(e-b.west,b.east-e,n-b.south,b.north-n)/b.blend);
 if(seam<=0)return base;
 const grain=Math.sin(e*.019+n*.011)*Math.cos(n*.013-e*.008),micro=Math.sin(e*.093+n*.071)*Math.cos(n*.047);
 const shifted=h+grain*24;
 const c=forestTint.clone().lerp(woodlandTint,smooth((shifted-220)/100));
 const bedding=.5+.5*Math.sin((h+.055*e-.032*n)*.22);
 const exposure=smooth((slope-.09)/.42);
 const rockWeight=Math.max(smooth((shifted-300)/150)*(.35+.65*exposure),exposure*.79);
 const rock=rockTint.clone().lerp(warmRockTint,.28+.23*grain).lerp(bedTint,.37*bedding*exposure);
 c.lerp(rock,rockWeight);
 const snowWeight=smooth((shifted-380)/180)*(1-.85*smooth((slope-.25)/.62));
 c.lerp(snowTint,snowWeight).multiplyScalar(1+.045*micro);
 return base.lerp(c,seam);
}
/** Independent actual mesh fixture of the exact 8m canonical vertices.
 * Only for local preview / inspection; production D2 uses the delta above,
 * not this overlapping ground. */
export function buildNightBWestReliefPreview(base:Height=(e,n)=>sampleTownD2R30Height(e,n),reserved?:WestReserve){
 const heightAt=composeNightBWestHeight(base,reserved),group=new Group();group.name='night-b-west-relief-preview-only';
 const material=new MeshLambertMaterial({vertexColors:true}),geometries:BufferGeometry[]=[];
 const rock=new Color('#67747a'),snow=new Color('#d5e0e4'),pine=new Color('#456054'),c=new Color();
 let vertices=0,triangles=0,maxCut=0,maxFill=0;
 for(let n=480;n<1790;n+=256)for(let e=-1100;e< -300;e+=256){
  const clip=(axis:readonly number[],lo:number,hi:number)=>[lo,...axis.filter(v=>v>lo&&v<hi),hi];
  const es=clip(townD2R30GridAxis(-1100,1100,8),e,Math.min(e+256,-300)),ns=clip(townD2R30GridAxis(-10,1790,8),n,Math.min(n+256,1790)),p:number[]=[],rgb:number[]=[],ids:number[]=[];
  for(let j=0;j<ns.length;j++)for(let i=0;i<es.length;i++){
   const x=es[i]!,z=ns[j]!,h=heightAt(x,z)!;if(!Number.isFinite(h))throw Error('Missing canonical west surface');
   p.push(x,h,-z);const delta=h-base(x,z)!;maxCut=Math.max(maxCut,-delta);maxFill=Math.max(maxFill,delta);
   const dx=(heightAt(Math.min(-300,x+2),z)!-heightAt(Math.max(-1100,x-2),z)!)/Math.max(2,Math.min(-300,x+2)-Math.max(-1100,x-2));
   const dn=(heightAt(x,Math.min(1790,z+2))!-heightAt(x,Math.max(480,z-2))!)/Math.max(2,Math.min(1790,z+2)-Math.max(480,z-2));
   const slope=Math.hypot(dx,dn),snowWeight=smooth((h-355)/115)*(1-.8*smooth((slope-.3)/.8));
   c.copy(h<340?pine:rock).lerp(snow,snowWeight).multiplyScalar(.94+.06*Math.sin(x*.16+z*.11));rgb.push(c.r,c.g,c.b);
   if(i+1<es.length&&j+1<ns.length){const k=j*es.length+i;ids.push(k,k+1,k+es.length,k+1,k+es.length+1,k+es.length);}
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(rgb,3));g.setIndex(ids);g.computeVertexNormals();g.computeBoundingSphere();geometries.push(g);const mesh=new Mesh(g,material);mesh.name='west-relief-'+e+'-'+n;group.add(mesh);vertices+=p.length/3;triangles+=ids.length/3;
 }
 return {group,heightAt,stats:{vertices,triangles,chunks:geometries.length,maxCut,maxFill},dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());material.dispose();group.clear();}};
}
