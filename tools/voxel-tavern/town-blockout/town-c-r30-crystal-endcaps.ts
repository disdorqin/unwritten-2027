import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {crystalCavernPlan,crystalCavernTrailHeight} from './underground-crystal-cavern.js';
import {r30CrystalMouth} from './town-c-r30-crystal-support.js';
type Block={e:number;n:number;y:number;w:number;h:number;d:number;color:number};
const entryFloor=crystalCavernPlan.entry.height;
const palette=[0x41464b,0x4c514f,0x555855,0x565956,0x393f43];
/** Solid end walls. The only near-wall opening is the original 4×3.5m mouth. */
export function mountR30CrystalEndcaps(parent:Group){
 const group=new Group();group.name='r30-crystal-rock-endcaps';parent.add(group);
 const blocks:Block[]=[],boundary:Block[]=[];
 const put=(list:Block[],e:number,n:number,y:number,w:number,h:number,d:number,color:number)=>list.push({e,n,y,w,h,d,color});
 const back=108.35,front=r30CrystalMouth.north,depth=2.5;
 const fill=(e0:number,e1:number,y0:number,y1:number,n:number,seed:number)=>{
  const columns=Math.ceil((e1-e0)/6.8),rows=Math.ceil((y1-y0)/3.4);
  for(let j=0;j<rows;j++){
   const y=y0+(j+.5)*(y1-y0)/rows,h=(y1-y0)/rows;
   const edge=[e0,...Array.from({length:columns-1},(_,i)=>e0+(i+1)*(e1-e0)/columns+(j%2?.54:-.36)),e1];
   for(let i=0;i<edge.length-1;i++){
    const a=edge[i],b=edge[i+1];
    put(blocks,(a+b)/2,n,y,b-a,h,depth,palette[(i+3*j+seed)%palette.length]);
   }
  }
 };
 fill(-90,-2,-4.5,33.5,front-depth/2,1);
 fill(2,90,-4.5,33.5,front-depth/2,3);
 fill(-2,2,entryFloor+3.5,33.5,front-depth/2,0);
 fill(-2,2,-4.5,entryFloor,front-depth/2,2);
 fill(-90,90,-4.5,33.5,back+depth/2,4);
 for(const side of [-1,1])for(let k=0;k<18;k++){
  const e=side*(6+k*4.55),y=3.2+(k%4)*2.1;
  put(blocks,e,front+.23,y,3.9+(k%3)*.3,1.25+(k%2)*.45,.62,palette[k%5]);
  put(blocks,e,front+.5,y+.6,2.6,.19,.73,palette[(k+2)%5]);
  put(blocks,e,back-.31,y+2.1,3.6+(k%4)*.25,1.6,.76,palette[(k+1)%5]);
 }
 // Visible terminal and quay edges, without extending the supported floor.
 const endY=crystalCavernTrailHeight(98.9);
 for(let i=0;i<7;i++){
  const e=8.7+(i-3)*.93;
  put(boundary,e,99.26,endY+.38,.98,.82,.65,palette[i%5]);
  put(boundary,e+.08,99.63,endY+.9+(i%3)*.14,.84,.66,.58,palette[(i+2)%5]);
 }
 const quayY=crystalCavernTrailHeight(76);
 for(const n of [74.24,77.76])for(let i=0;i<19;i++){
  const e=11.6+i*1.19;if(e<12.7)continue;
  put(boundary,e,n,quayY+.30,1.22,.65,.30,palette[(i+(n<76?1:3))%5]);
  put(boundary,e,n,quayY+.675,1.16,.14,.35,palette[(i+2)%5]);
 }
 for(let i=0;i<3;i++){
  const n=74.78+i*1.22;
  put(boundary,34.19,n,quayY+.3,.38,.65,1.25,palette[i%5]);
  put(boundary,34.19,n,quayY+.675,.42,.14,1.19,palette[(i+1)%5]);
 }
 // Archaeological quay furniture: two low stone survey benches built
 // into the northern parapet. No pickup, ore or new traversal authority.
 const quayFurniture:Block[]=[];
 const qput=(e:number,n:number,y:number,w:number,h:number,d:number,color:number)=>put(quayFurniture,e,n,quayY+y,w,h,d,color);
 for(const e of [18.8,26.2]){
  for(const x of [-.58,.58]){
   qput(e+x,77.24,.12,.42,.24,.58,0x53534d);
   qput(e+x,77.24,.34,.30,.25,.44,0x77746b);
  }
  qput(e,77.24,.54,1.58,.19,.65,0x817b70);
  qput(e,77.29,.65,1.43,.075,.45,0x646965);
  for(let k=0;k<5;k++){
   const x=e-.51+k*.24;
   qput(x,77.38,.71,.16,.075+(k%3)*.037,.15,k%2?0x758c88:0x9aa7a1);
   qput(x,77.39,.77+(k%3)*.018,.10,.055,.11,0x829c95);
  }
  for(const x of [-.63,.63])qput(e+x,77.0,.59,.10,.09,.12,0x9c8a6e);
 }
 // Terminal masonry retains the end stop; an uneven capped stele and
 // stepped shoulders make it a deliberate archaeological destination.
 const terminalArt:Block[]=[];
 const tput=(e:number,n:number,y:number,w:number,h:number,d:number,color:number)=>put(terminalArt,e,n,endY+y,w,h,d,color);
 for(const s of [-1,1])for(let tier=0;tier<4;tier++){
  tput(8.7+s*(1.72-tier*.12),99.72,1.10+tier*.34,.85-tier*.09,.35,.59,palette[(tier+5+s)%5]);
 }
 tput(8.7,99.78,1.35,1.78,.30,.70,0x555855);
 tput(8.7,99.81,2.18,1.28,1.38,.58,0x77746b);
 tput(8.7,99.49,2.18,1.09,1.18,.08,0x515956);
 for(let j=0;j<7;j++){
  const w=.20+Math.min(j,6-j)*.19;
  tput(8.7,99.435,1.77+j*.13,w,.075,.07,j%2?0x7c938e:0x9ca8a0);
 }
 tput(8.7,99.80,2.94,1.53,.19,.68,0x656b65);
 boundary.push(...quayFurniture,...terminalArt);
 const all=[...blocks,...boundary],geo=new BoxGeometry(),map=makeCampGrain('rock'),mat=new MeshLambertMaterial({map});
 const batches:InstancedMesh[]=[];
 for(const [a,b] of [[-20,0],[70,90],[90,115]]){
  const list=all.filter(p=>p.n>=a&&p.n<b);
  const mesh=new InstancedMesh(geo,mat,list.length),matrix=new Matrix4(),q=new Quaternion(),color=new Color();
  list.forEach((p,i)=>{matrix.compose(new Vector3(p.e,p.y,-p.n),q,new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color.setHex(p.color))});
  mesh.computeBoundingSphere();group.add(mesh);batches.push(mesh);
 }
 function blocksFoot(e:number,n:number,y:number,r:number,h:number){
  return boundary.some(p=>p.y+p.h/2>y+.025&&p.y-p.h/2<y+h&&Math.hypot(Math.max(0,Math.abs(e-p.e)-p.w/2),Math.max(0,Math.abs(n-p.n)-p.d/2))<r);
 }
 return {group,parts:all,boundary,quayFurniture,terminalArt,blocks:blocksFoot,front,back,dispose(){group.removeFromParent();batches.forEach(m=>m.dispose());geo.dispose();map.dispose();mat.dispose();group.clear()}};
}
