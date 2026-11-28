import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D,Vector3} from 'three';
import {finishNightBAudit} from './town-night-b-audit-slices';
import {nightBWestBounds as b,westCableDistance,type WestReserve} from './town-night-b-summit-west-relief';

type Height=(e:number,n:number)=>number|undefined;
type Item={e:number,n:number,y:number,w:number,h:number,d:number,angle:number,color:string};
type Body={e:number,n:number,y:number,r:number,h:number,kind:'tree'|'rock'};
type Cell={e:number,n:number,items:Item[],bodies:Body[],mesh?:InstancedMesh};
const hash=(e:number,n:number,k:number)=>{const f=Math.sin(e*127.1+n*311.7+k*74.7)*43758.5453;return f-Math.floor(f)};
const colors={bark:['#5b4840','#615049','#70594b'],needle:['#28443d','#3d5950','#4c665a'],rock:['#65717a','#78818a','#4c5963'],snow:['#c4d2da','#dce5eb','#eef3f3']};
const pick=(v:string[],q:number)=>v[Math.min(v.length-1,Math.floor(q*v.length))]!;
const cellSize=96;
/** Grounded west-zone ecology. The host supplies the FINAL canonical height and
 * all route/facility reservations. No base terrain or overlapping east assets. */
export function* nightBWestDressingSteps(heightAt:Height,reserved:WestReserve){
 const root=new Group();root.name='night-b-west-forest-rock-snow';
 const geo=new BoxGeometry(1,1,1),material=new MeshLambertMaterial({color:0xffffff});
 const cells=new Map<string,Cell>(),bodies:Body[]=[];
 const get=(e:number,n:number)=>{const x=Math.floor(e/cellSize),z=Math.floor(n/cellSize),key=x+','+z;let c=cells.get(key);if(!c){c={e:(x+.5)*cellSize,n:(z+.5)*cellSize,items:[],bodies:[]};cells.set(key,c)}return c};
 const add=(c:Cell,e:number,n:number,y:number,w:number,h:number,d:number,angle:number,color:string)=>c.items.push({e,n,y,w,h,d,angle,color});
 const body=(c:Cell,v:Body)=>{c.bodies.push(v);bodies.push(v)};
 let trees=0,rocks=0,snow=0,excluded=0,probes=0,committed=false;
 try{
 for(let n=b.south+40;n<b.north-40;n+=13)for(let e=b.west+40;e<b.east-40;e+=13){
  if(probes++%16===0)yield;
  const x=e+(hash(e,n,1)-.5)*9,z=n+(hash(e,n,2)-.5)*9,y=heightAt(x,z);
  const a=heightAt(x+2,z),d=heightAt(x-2,z),u=heightAt(x,z+2),v=heightAt(x,z-2);
  if(y===undefined||a===undefined||d===undefined||u===undefined||v===undefined||![y,a,d,u,v].every(Number.isFinite))continue;
  if(westCableDistance(x,z)<25||reserved(x,z,8)){excluded++;continue;}
  const slope=Math.hypot((a-d)/4,(u-v)/4),q=hash(e,n,3);
  const forest=Math.max(0,Math.min(1,(500-y)/170))*(.38+.32*Math.sin(x*.014+z*.009)**2);
  const c=get(x,z);
  if(y<510&&slope<.72&&q<forest){
   const h=4.5+hash(e,n,4)*5.8,w=.38+hash(e,n,5)*.34,rot=hash(e,n,6)*Math.PI;
   add(c,x,z,y+h*.5-.18,w,h+.36,w,rot,pick(colors.bark,q));
   for(let tier=0;tier<4;tier++){
    const r=h*(.25-tier*.043),cy=y+h*(.36+tier*.16);
    add(c,x,z,cy,r*2,h*.21,r*2,rot,pick(colors.needle,hash(e,n,7+tier)));
    add(c,x,z,cy+h*.08,r*1.42,h*.055,r*1.42,rot,pick(colors.snow,hash(e,n,12+tier)));
   }
   body(c,{e:x,n:z,y:y-.36,r:w*.71,h:h+.36,kind:'tree'});trees++;
  }else if(q<.26&&slope<1.2){
   const w=.9+hash(e,n,18)*2.7,h=.6+hash(e,n,19)*1.6,deep=.18+slope*w*.8,angle=hash(e,n,20)*Math.PI;
   add(c,x,z,y+(h-deep)*.5,w,h+deep,w*.77,angle,pick(colors.rock,hash(e,n,21)));
   add(c,x,z,y+h*.88,w*.72,h*.27,w*.59,angle,pick(colors.snow,hash(e,n,22)));
   body(c,{e:x,n:z,y:y-deep,r:w*.65,h:h+deep,kind:'rock'});rocks++;
  }else if(y>=380&&slope<.45&&q<.64){
   // Embedded low snow boulders: no floating planes, no false walk surface.
   const w=1+hash(e,n,23)*1.8,h=.13+slope*w;
   add(c,x,z,y-h*.38,w,h,w*.68,hash(e,n,24)*Math.PI,pick(colors.snow,hash(e,n,25)));snow++;
  }
 }
 const dummy=new Object3D(),color=new Color();
 let instances=0;
 for(const [key,c] of cells){yield;if(!c.items.length){cells.delete(key);continue}const m=new InstancedMesh(geo,material,c.items.length);m.name='west-dressing-'+key;
  c.items.forEach((p,i)=>{dummy.position.set(p.e,p.y,-p.n);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,color.set(p.color))});
  m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();c.mesh=m;root.add(m);instances+=c.items.length;
 }
 let disposed=false;const eye=new Vector3();
 function updateView(e:number,n:number,radius=700){if(disposed||![e,n,radius].every(Number.isFinite)||radius<0)return;eye.set(e,0,-n);for(const c of cells.values())if(c.mesh)c.mesh.visible=Math.hypot(c.e-eye.x,c.n+eye.z)<=radius+cellSize*Math.SQRT2*.5;}
 function blocked(e:number,n:number,foot:number,radius=.32,height=1.8){
  if(![e,n,foot,radius,height].every(Number.isFinite)||radius<0||height<=0)return false;
  const pad=radius+4;
  for(let z=Math.floor((n-pad)/cellSize);z<=Math.floor((n+pad)/cellSize);z++)for(let x=Math.floor((e-pad)/cellSize);x<=Math.floor((e+pad)/cellSize);x++)for(const v of cells.get(x+','+z)?.bodies??[])if(Math.hypot(e-v.e,n-v.n)<v.r+radius&&foot+height>v.y&&foot<v.y+v.h)return true;return false;
 }
 committed=true;
 return {group:root,stats:{trees,rocks,snow,excluded,instances,cells:cells.size,triangles:instances*12},bodies,updateView,blocked,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const c of cells.values())c.mesh?.dispose();root.clear();cells.clear();geo.dispose();material.dispose();}};
 }finally{if(!committed){root.removeFromParent();for(const c of cells.values())c.mesh?.dispose();root.clear();cells.clear();geo.dispose();material.dispose();}}
}
export function createNightBWestDressing(heightAt:Height,reserved:WestReserve){return finishNightBAudit(nightBWestDressingSteps(heightAt,reserved));}
