import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import type {RidgeRoadPoint} from './town-d-r30-road-survey';
import {ridgeRoadProject} from './town-d-r30-roadbed';

type Allowed=(e:number,n:number)=>boolean;
type Wall={east:number;north:number;bottom:number;top:number;length:number;width:number;yaw:number};
const halfWidth=.42,margin=2.05;
function section(route:readonly RidgeRoadPoint[],m:number){
 let i=1;while(i<route.length-1&&route[i]!.cum<m)i++;
 const a=route[i-1]!,b=route[i]!,len=b.cum-a.cum,t=Math.max(0,Math.min(1,(m-a.cum)/len));
 return {east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t,de:(b.east-a.east)/len,dn:(b.north-a.north)/len};
}
/** Build retaining masonry only at actual excavated banks. Every wall
 * footprint must be in approved land, outside the complete walking lane.
 * Ground is unchanged; masonry follows the graded surface, not an offset
 * road mesh or an invented floor. */
export function mountRidgeRetainingBanks(field:FrontRidgeR30Field,route:readonly RidgeRoadPoint[],allowed:Allowed){
 const group=new Group();group.name='d-r30-road-retaining-banks';
 const geometry=new BoxGeometry(),material=new MeshLambertMaterial({color:'#ffffff'}),tmp=new Object3D(),tint=new Color();
 const walls:Wall[]=[];
 type Part={matrix:import('three').Matrix4;shade:string};
 const chunks=new Map<string,{near:Part[];far:Part[];east:number;north:number}>();
 let brickCount=0;
 const shade=['#7d8586','#91978f','#696f72','#a2a49b','#89918e'];
 const total=route.at(-1)?.cum??0;
 let highest=0;
 const local=(w:Wall,x:number,z:number)=>({e:w.east+Math.cos(w.yaw)*x+Math.sin(w.yaw)*z,n:w.north+Math.sin(w.yaw)*x-Math.cos(w.yaw)*z});
 function brick(w:Wall,x:number,z:number,y:number,l:number,d:number,h:number,shade:string,structural=false){
  const p=local(w,x,z);tmp.position.set(p.e,y,-p.n);tmp.rotation.set(0,w.yaw,0);tmp.scale.set(l,h,d);tmp.updateMatrix();
  const cx=Math.floor(w.east/32),cn=Math.floor(w.north/32),key=cx+','+cn;
  const chunk=chunks.get(key)??{near:[],far:[],east:cx*32+16,north:cn*32+16};chunks.set(key,chunk);
  const part={matrix:tmp.matrix.clone(),shade};chunk.near.push(part);brickCount++;
  if(structural)chunk.far.push(part);
 }
 for(let m=5;m<total-5;m+=1.6){
  const p=section(route,m);
  for(const side of [-1,1]){
   const e=p.east-p.dn*side*3.05,n=p.north+p.de*side*3.05;
   const center=field.heightAt(p.east,p.north),bank=field.heightAt(p.east-p.dn*side*4.75,p.north+p.de*side*4.75);
   if(center===undefined||bank===undefined||bank-center<.8)continue;
   const w:Wall={east:e,north:n,bottom:0,top:0,length:1.60,width:halfWidth*2,yaw:Math.atan2(p.dn,p.de)};
   const probes=[];let valid=true;
   for(const x of [-.84,0,.84])for(const z of [-.48,0,.48]){
    const q=local(w,x,z),h=field.heightAt(q.e,q.n);
    if(h===undefined||!allowed(q.e,q.n)||(ridgeRoadProject(route,q.e,q.n)?.distance??0)<margin){valid=false;break}
    probes.push(h);
   }
   if(!valid||!probes.length)continue;
   w.bottom=Math.min(...probes)-.12;w.top=Math.min(bank+.12,w.bottom+3.2);
   if(w.top-Math.max(...probes)<.22)continue;
   walls.push(w);highest=Math.max(highest,w.top-w.bottom);
   // Structural core is continuous. Brick courses are shallow exposed
   // relief, not collision gaps, and the coping overlaps the core.
   brick(w,0,0,(w.top+w.bottom)/2,w.length,w.width,w.top-w.bottom,'#747e80',true);
   const courses=Math.max(1,Math.ceil((w.top-w.bottom)/.32)),dh=(w.top-w.bottom)/courses;
   for(let j=0;j<courses;j++){
    const count=j%2?4:3;
    for(let k=0;k<count;k++){
     const l=w.length/count,x=-w.length/2+l*(k+.5),y=w.bottom+dh*(j+.5);
     brick(w,x,side*.43,y,l-.028,.075,dh-.024,shade[(Math.round(m)+j+k)%shade.length]!);
     brick(w,x,-side*.43,y,l-.028,.075,dh-.024,shade[(Math.round(m)+j+k+2)%shade.length]!);
    }
   }
   brick(w,0,0,w.top+.055,w.length+.035,.96,.11,'#b4bcbc',true);
   if(Math.round(m*10)%4===0)brick(w,0,0,w.top+.125,w.length*.73,.63,.05,'#d8e2e6',true);
  }
 }
 const batches:{near:InstancedMesh;far:InstancedMesh;east:number;north:number}[]=[];
 function batch(parts:Part[]){const mesh=new InstancedMesh(geometry,material,parts.length);parts.forEach((p,i)=>{mesh.setMatrixAt(i,p.matrix);mesh.setColorAt(i,tint.set(p.shade))});mesh.computeBoundingSphere();group.add(mesh);return mesh}
 for(const c of chunks.values()){const near=batch(c.near),far=batch(c.far);near.visible=false;batches.push({near,far,east:c.east,north:c.north})}
 function updateView(e:number,n:number){for(const c of batches){const d=Math.hypot(e-c.east,n-c.north);c.near.visible=c.near.visible?d<80:d<64;c.far.visible=!c.near.visible}}
 return {group,walls,highest,brickCount,updateView,visibleInstances:()=>batches.reduce((n,c)=>n+(c.near.visible?c.near.count:c.far.count),0),blocked(e:number,n:number,y:number,r=.27){
  return walls.some(w=>{const dx=e-w.east,dn=n-w.north,c=Math.cos(w.yaw),s=Math.sin(w.yaw),x=c*dx+s*dn,z=s*dx-c*dn;
   return y+1.8>w.bottom&&y<w.top+.16&&Math.hypot(Math.max(0,Math.abs(x)-w.length/2-.018),Math.max(0,Math.abs(z)-.48))<r});
 },dispose(){group.removeFromParent();batches.forEach(c=>{c.near.dispose();c.far.dispose()});geometry.dispose();material.dispose()}};
}
