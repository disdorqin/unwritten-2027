import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D,Vector3} from 'three';
import {makeFrontRidgePixelTexture} from './town-front-ridge-surface';
import {finishNightBAudit} from './town-night-b-audit-slices';
import {nightBWestBounds as b,westCableDistance,type WestReserve} from './town-night-b-summit-west-relief';

type Height=(e:number,n:number)=>number|undefined;
type Item={e:number,n:number,y:number,w:number,h:number,d:number,angle:number,color:string;solid:boolean};
type Body={e:number,n:number,y:number,r:number,h:number,kind:'tree'|'rock'};
type Cell={e:number,n:number,items:Item[],bodies:Body[],mesh?:InstancedMesh};
const hash=(e:number,n:number,k:number)=>{const f=Math.sin(e*127.1+n*311.7+k*74.7)*43758.5453;return f-Math.floor(f)};
const colors={bark:['#5b4840','#615049','#70594b'],needle:['#28443d','#3d5950','#4c665a'],rock:['#8a8378','#7a7264','#5d4630','#a98a56'],snow:['#c4d2da','#dce5eb','#eef3f3']};
const pick=(v:string[],q:number)=>v[Math.min(v.length-1,Math.floor(q*v.length))]!;
const cellSize=96;
/** Grounded west-zone ecology. The host supplies the FINAL canonical height and
 * all route/facility reservations. No base terrain or overlapping east assets. */
export function* nightBWestDressingSteps(heightAt:Height,reserved:WestReserve){
 const root=new Group();root.name='night-b-west-forest-rock-snow';root.userData.owner='B';root.userData.revision='B33-2';root.userData.static=true;
 const geo=new BoxGeometry(1,1,1),texture=makeFrontRidgePixelTexture(),material=new MeshLambertMaterial({color:0xffffff,map:texture});
 // The same 32px/2m texture as front terrain, projected in world metres.
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 b33World;\nvarying vec3 b33Normal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 b33wp=vec4(position,1.0);\nvec3 b33wn=normal;\n#ifdef USE_INSTANCING\nb33wp=instanceMatrix*b33wp;b33wn=mat3(instanceMatrix)*b33wn;\n#endif\nb33World=(modelMatrix*b33wp).xyz;b33Normal=normalize(mat3(modelMatrix)*b33wn);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 b33World;\nvarying vec3 b33Normal;').replace('#include <map_fragment>','#ifdef USE_MAP\nvec3 b33weights=abs(normalize(b33Normal));b33weights/=max(0.0001,b33weights.x+b33weights.y+b33weights.z);\nvec3 b33detail=texture2D(map,b33World.yz*0.5).rgb*b33weights.x+texture2D(map,b33World.xz*0.5).rgb*b33weights.y+texture2D(map,b33World.xy*0.5).rgb*b33weights.z;\ndiffuseColor.rgb*=b33detail;\n#endif');
 };
 const cells=new Map<string,Cell>(),bodies:Body[]=[];
 const get=(e:number,n:number)=>{const x=Math.floor(e/cellSize),z=Math.floor(n/cellSize),key=x+','+z;let c=cells.get(key);if(!c){c={e:(x+.5)*cellSize,n:(z+.5)*cellSize,items:[],bodies:[]};cells.set(key,c)}return c};
 const add=(c:Cell,e:number,n:number,y:number,w:number,h:number,d:number,angle:number,color:string,solid=true)=>c.items.push({e,n,y,w,h,d,angle,color,solid});
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
  const grove=.5+.5*Math.sin(x*.022+z*.013+1.7*Math.sin(z*.015));
  const forest=Math.max(0,Math.min(1,(510-y)/175))*(.20+.70*grove*grove);
  const c=get(x,z);
  const along=Math.max(0,Math.min(1,(z-520)/770)),channel=-760-95*Math.sin(along*Math.PI)+54*along;
  const shoulder=Math.exp(-Math.pow((Math.abs(x-channel)-76)/54,2));
  const bedding=.5+.5*Math.sin((y+.055*x-.032*z)*.22);
  const scree=(.14+.28*shoulder)*bedding*Math.min(1,slope/.45);
  if(y<510&&slope<.72&&q<forest){
   const h=4.5+hash(e,n,4)*5.8,w=.38+hash(e,n,5)*.34,rot=hash(e,n,6)*Math.PI;
   add(c,x,z,y+h*.5-.18,w,h+.36,w,rot,pick(colors.bark,q));
   for(let tier=0;tier<5;tier++){
    const r=h*(.24-tier*.039),cy=y+h*(.48+tier*.108),branch=h*.145,yaw=rot+(tier%2)*Math.PI/4,depth=r*1.62;
    add(c,x,z,cy,r*2,branch,depth,yaw,pick(colors.needle,hash(e,n,7+tier)));
    const side=(tier%2?1:-1)*r*.34,ex=x+Math.cos(yaw)*side,nz=z+Math.sin(yaw)*side;
    add(c,ex,nz,cy+branch*.12,r*1.15,branch*.82,r*1.15,yaw,pick(colors.needle,hash(e,n,17+tier)));
    add(c,x,z,cy+branch/2+.025,r*(.82+.28*hash(e,n,12+tier)),.05,depth*.68,yaw,pick(colors.snow,hash(e,n,22+tier)));
   }
   body(c,{e:x,n:z,y:y-.36,r:w*.71,h:h+.36,kind:'tree'});trees++;
  }else if(q<.26+scree&&slope<1.2){
   const w=.9+hash(e,n,18)*2.7,h=.6+hash(e,n,19)*1.6,angle=hash(e,n,20)*Math.PI;
   const support=[-1,0,1].flatMap(i=>[-1,0,1].map(j=>heightAt(x+i*w/2*Math.cos(angle)+j*w*.385*Math.sin(angle),z+i*w/2*Math.sin(angle)-j*w*.385*Math.cos(angle))));
   if(support.some(v=>v===undefined||!Number.isFinite(v)))continue;
   const deep=Math.max(.18,y-Math.min(...support as number[])+.18);
   add(c,x,z,y+(h-deep)*.5,w,h+deep,w*.77,angle,pick(colors.rock,hash(e,n,21)));
   add(c,x,z,y+h+h*.07,w*.73,h*.14,w*.59,angle,pick(colors.snow,hash(e,n,22)));
   const side=w*.14;
   add(c,x+Math.cos(angle)*side,z+Math.sin(angle)*side,y+h*.52,w*.66,h*.20,w*.63,angle,pick(colors.rock,hash(e,n,25)));
   body(c,{e:x,n:z,y:y-deep,r:w*.65,h:h+deep,kind:'rock'});rocks++;
  }else if(y>=380&&slope<.45&&q<.64){
   // Embedded low snow boulders: no floating planes, no false walk surface.
   const w=1+hash(e,n,23)*1.8,angle=hash(e,n,24)*Math.PI;
   const hs=[-1,0,1].flatMap(i=>[-1,0,1].map(j=>heightAt(x+i*w/2*Math.cos(angle)+j*w*.34*Math.sin(angle),z+i*w/2*Math.sin(angle)-j*w*.34*Math.cos(angle))));
   if(hs.some(h=>h===undefined||!Number.isFinite(h)))continue;
   const low=Math.min(...hs as number[]);
   // A thin embedded snow patch is not a hidden obstacle.
   add(c,x,z,low+.02,w,.14,w*.68,angle,pick(colors.snow,hash(e,n,25)),false);snow++;
  }
 }
 const dummy=new Object3D(),color=new Color();
 let instances=0;
 for(const [key,c] of cells){yield;if(!c.items.length){cells.delete(key);continue}const m=new InstancedMesh(geo,material,c.items.length);m.name='west-dressing-'+key;m.userData.owner='B';m.userData.chunkId='rear/B/forest/'+key;m.userData.static=true;
  c.items.forEach((p,i)=>{dummy.position.set(p.e,p.y,-p.n);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);m.setColorAt(i,color.set(p.color))});
  m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();m.computeBoundingBox();m.userData.bounds=m.boundingBox?.clone();c.mesh=m;root.add(m);instances+=c.items.length;
 }
 let disposed=false;const eye=new Vector3();
 function updateView(e:number,n:number,radius=700){if(disposed||![e,n,radius].every(Number.isFinite)||radius<0)return;eye.set(e,0,-n);for(const c of cells.values())if(c.mesh)c.mesh.visible=Math.hypot(c.e-eye.x,c.n+eye.z)<=radius+cellSize*Math.SQRT2*.5;}
 function blocked(e:number,n:number,foot:number,radius=.32,height=1.8){
  if(![e,n,foot,radius,height].every(Number.isFinite)||radius<0||height<=0)return false;
  const pad=radius+6;
  for(let z=Math.floor((n-pad)/cellSize);z<=Math.floor((n+pad)/cellSize);z++)for(let x=Math.floor((e-pad)/cellSize);x<=Math.floor((e+pad)/cellSize);x++)for(const v of cells.get(x+','+z)?.items??[]){
   if(!v.solid||foot+height<=v.y-v.h/2||foot>=v.y+v.h/2)continue;
   const dx=e-v.e,dn=n-v.n,c=Math.cos(v.angle),s=Math.sin(v.angle),lx=dx*c+dn*s,lz=dx*s-dn*c;
   if(Math.hypot(Math.max(0,Math.abs(lx)-v.w/2),Math.max(0,Math.abs(lz)-v.d/2))<radius)return true;
  }return false;
 }
 committed=true;
 return {group:root,stats:{trees,rocks,snow,excluded,instances,cells:cells.size,triangles:instances*12},bodies,updateView,blocked,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const c of cells.values())c.mesh?.dispose();root.clear();cells.clear();geo.dispose();material.dispose();texture.dispose();}};
 }finally{if(!committed){root.removeFromParent();for(const c of cells.values())c.mesh?.dispose();root.clear();cells.clear();geo.dispose();material.dispose();texture.dispose();}}
}
export function createNightBWestDressing(heightAt:Height,reserved:WestReserve){return finishNightBAudit(nightBWestDressingSteps(heightAt,reserved));}
