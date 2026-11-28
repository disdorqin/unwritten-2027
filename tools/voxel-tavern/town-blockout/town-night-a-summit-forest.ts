import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D} from 'three';
import {finishNightBAudit} from './town-night-b-audit-slices';
import {southGullyNorth,type SouthGround,type SouthProtection} from './town-night-a-summit-landform';
import {createSouthSnowAppearance,type SouthSnowVisualSample} from './town-night-a-summit-snow-appearance';
type Body={east:number;north:number;bottom:number;top:number;radius:number;kind:'pine'|'rock'};
type Piece={e:number;n:number;y:number;w:number;h:number;d:number;yaw:number;color:string;snow:boolean};
type Cell={items:Piece[];bodies:Body[];mesh?:InstancedMesh;east:number;north:number};
const hash=(e:number,n:number,k:number)=>{const f=Math.sin(e*127.1+n*311.7+k*74.7)*43758.5453;return f-Math.floor(f);};
const size=96;
/** South-only forest and rock slopes. Final shared 8m support supplied by host.
 * No overlapping legacy forest: caller must exclude its south-sector placements. */
export function* southForestSteps(heightAt:SouthGround,reserved:SouthProtection){
 const root=new Group();root.name='night-a-south-forest';
 const geometry=new BoxGeometry(1,1,1),material=new MeshLambertMaterial({color:0xffffff}),cells=new Map<string,Cell>(),bodies:Body[]=[];
 const key=(e:number,n:number)=>Math.floor(e/size)+','+Math.floor(n/size);
 const cell=(e:number,n:number)=>{const k=key(e,n);let c=cells.get(k);if(!c){c={items:[],bodies:[],east:(Math.floor(e/size)+.5)*size,north:(Math.floor(n/size)+.5)*size};cells.set(k,c);}return c;};
 const add=(c:Cell,e:number,n:number,y:number,w:number,h:number,d:number,yaw:number,color:string,snow=false)=>c.items.push({e,n,y,w,h,d,yaw,color,snow});
 const push=(c:Cell,b:Body)=>{c.bodies.push(b);bodies.push(b);};
 root.userData={owner:'A33-2-south-forest',revision:2,bounds:{west:-1100,east:1100,south:-10,north:448},static:true};
 const palette=['#344638','#44503c','#52634a','#3d5546'],snow=['#c4d3dc','#e0e7e9','#d2dfe5'];
 let trees=0,rocks=0,excluded=0,probes=0,accepted=false;
 try{
 for(let n=30;n<440;n+=12)for(let e=-1060;e<1060;e+=12){
  if(probes++%16===0)yield;
  const x=e+(hash(e,n,1)-.5)*8,z=n+(hash(e,n,2)-.5)*8;
  const h=heightAt(x,z),hs=[[2,0],[-2,0],[0,2],[0,-2]].map(([dx,dn])=>heightAt(x+dx!,z+dn!));
  if(h===undefined||!Number.isFinite(h)||hs.some(v=>v===undefined||!Number.isFinite(v)))continue;
  // Test the full canopy envelope, not just the trunk. Keep the entry
  // plaza and gully banks clear even if the supplied route list changes.
  if(Math.abs(x)<44&&z<60||Math.abs(z-southGullyNorth(x))<24&&x>-640&&x<140||[[0,0],[6,0],[-6,0],[0,6],[0,-6],[4.3,4.3],[-4.3,4.3],[4.3,-4.3],[-4.3,-4.3]].some(([dx,dn])=>reserved(x+dx!,z+dn!))){excluded++;continue;}
  const slope=Math.hypot(hs[0]!-hs[1]!,hs[2]!-hs[3]!)/4;
  const cluster=.5+.5*Math.sin(x*.019+z*.025)*Math.cos(x*.011-z*.037);
  const density=Math.max(0,Math.min(.9,(475-h)/160))*(.18+.82*cluster**2),q=hash(e,n,3);
  const yaw=hash(e,n,4)*Math.PI;
  if(q<density&&slope<.58){
   const c=cell(x,z),tall=5.5+hash(e,n,5)*5.5,diam=.4+hash(e,n,6)*.35;
   // Raise the lowest bough above the surveyed uphill canopy footprint,
   // not merely above the trunk centre. Maintain the same instance budget.
   const envelope=tall*.235*Math.SQRT2*1.12+.35;
   const heights=[h,...hs.map(v=>v!)];
   for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,foot=heightAt(x+Math.cos(angle)*envelope,z+Math.sin(angle)*envelope);
    if(foot!==undefined&&Number.isFinite(foot))heights.push(foot);
   }
   const base=Math.min(h,...hs.map(v=>v!))-.12,canopyStart=Math.max(h+2.8,Math.max(...heights)+2.1);
   const top=Math.max(h+tall,canopyStart+1.6),tierHeight=(top-canopyStart)/4;
   add(c,x,z,(base+top)*.5,diam,top-base,diam,yaw,'#665143');
   // Unequal branch shelves and off-centre snow caps give each spruce a
   // recognisable stepped silhouette without spawning separate meshes.
   for(let tier=0;tier<4;tier++){
    const r=tall*(.235-tier*.044),cy=canopyStart+tier*tierHeight;
    const thick=tierHeight+.22,angle=yaw+tier*.15;
    const lean=(hash(e,n,30+tier)-.5)*r*.24,shift=(hash(e,n,40+tier)-.5)*r*.24;
    const width=r*(1.76+.24*hash(e,n,50+tier)),depth=r*(1.68+.30*hash(e,n,60+tier));
    const green=palette[Math.floor(hash(e,n,7+tier)*4)]!;
    // Three staggered solid bough shelves form a stepped, tapered
    // silhouette; all remain inside the old surveyed canopy envelope.
    add(c,x+lean,z+shift,cy+thick*.27,width,thick*.54,depth*.78,angle,green);
    add(c,x+lean,z+shift,cy+thick*.27,width*.78,thick*.54,depth,angle,green);
    add(c,x+lean,z+shift,cy+thick*.77,width*.77,thick*.46,depth*.77,angle,green);
    const sx=(hash(e,n,70+tier)-.5)*width*.14,sz=(hash(e,n,80+tier)-.5)*depth*.14;
    add(c,x+lean+sx,z+shift+sz,cy+thick-.02,width*.76,.19,depth*.73,angle,snow[Math.floor(hash(e,n,12+tier)*3)]!,true);
   }
   push(c,{east:x,north:z,bottom:base,top,radius:diam*Math.SQRT2/2,kind:'pine'});trees++;
  }else if(q<.23&&slope<.82){
   const c=cell(x,z),w=1.2+hash(e,n,16)*2.2,tall=.6+hash(e,n,17)*1.15;
   const base=Math.min(h,...hs.map(v=>v!))-.12;
   const rise=h+tall-base;
   // Broken layered rock: keep the original physical footprint, and
   // stagger three bands inside it instead of one featureless cuboid.
   add(c,x,z,base+rise*.22,w,rise*.44,w*.8,yaw,'#635b51');
   add(c,x,z,base+rise*.59,w*.94,rise*.30,w*.76,yaw,'#93806a');
   add(c,x,z,base+rise*.87,w*.86,rise*.26,w*.72,yaw,'#737b79');
   add(c,x,z,h+tall-.05,w*.80,.25,w*.66,yaw,'#c9d7df',true);
   push(c,{east:x,north:z,bottom:base,top:h+tall+.08,radius:w*.65,kind:'rock'});rocks++;
  }
 }
 const obj=new Object3D(),color=new Color();let instances=0;
 const snowAppearance:ReturnType<typeof createSouthSnowAppearance>[]=[];
 for(const [k,c] of cells){
  yield;
  const m=new InstancedMesh(geometry,material,c.items.length);m.name='south-forest:'+k;
  for(const [i,p] of c.items.entries()){obj.position.set(p.e,p.y,-p.n);obj.rotation.set(0,p.yaw,0);obj.scale.set(p.w,p.h,p.d);obj.updateMatrix();m.setMatrixAt(i,obj.matrix);m.setColorAt(i,color.set(p.color));}
  m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();c.mesh=m;root.add(m);instances+=c.items.length;
  const caps=c.items.map((p,i)=>({p,i})).filter(({p})=>p.snow);
  const anchor=c.bodies[0]!;
  if(caps.length&&anchor)snowAppearance.push(createSouthSnowAppearance(anchor.east,anchor.north,anchor.bottom,cover=>{
   const thickness=.22+.78*cover,width=.68+.32*cover;
   for(const {p,i} of caps){
    obj.position.set(p.e,p.y-p.h*(1-thickness)/2,-p.n);obj.rotation.set(0,p.yaw,0);
    obj.scale.set(p.w*width,p.h*thickness,p.d*width);obj.updateMatrix();m.setMatrixAt(i,obj.matrix);
   }
   m.instanceMatrix.needsUpdate=true;
  }));
 }
 accepted=true;
 let disposed=false;
 function blocked(e:number,n:number,h:number,r=.27,body=1.8){
  for(let x=Math.floor((e-r-3)/size);x<=Math.floor((e+r+3)/size);x++)for(let z=Math.floor((n-r-3)/size);z<=Math.floor((n+r+3)/size);z++)
   if(cells.get(x+','+z)?.bodies.some(b=>h+body-.025>b.bottom&&h+.025<b.top&&Math.hypot(e-b.east,n-b.north)<r+b.radius))return true;
  return false;
 }
 return {group:root,bodies,stats:{trees,rocks,excluded,cells:cells.size,instances,triangles:instances*12},blocked,
 updateSnow(dt:number,sample:SouthSnowVisualSample){if(!disposed)for(const appearance of snowAppearance)appearance.update(dt,sample);},
 updateView(e:number,n:number,radius=900){for(const c of cells.values())if(c.mesh)c.mesh.visible=Math.hypot(e-c.east,n-c.north)<=radius+size*.72;},
 dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const c of cells.values())c.mesh?.dispose();root.clear();cells.clear();snowAppearance.length=0;geometry.dispose();material.dispose();}};
 }finally{if(!accepted){root.removeFromParent();for(const c of cells.values())c.mesh?.dispose();root.clear();cells.clear();geometry.dispose();material.dispose();}}
}
export function mountSouthForest(heightAt:SouthGround,reserved:SouthProtection){return finishNightBAudit(southForestSteps(heightAt,reserved));}
