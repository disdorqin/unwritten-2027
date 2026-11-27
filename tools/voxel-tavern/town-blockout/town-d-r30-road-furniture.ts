import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D,Vector3} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import type {RidgeRoadPoint} from './town-d-r30-road-survey';
import {ridgeRoadProject} from './town-d-r30-roadbed';

type P={east:number;north:number;height:number};
type Barrier={a:P;b:P;radius:number;bottom:number;top:number};
export function mountRidgeRoadFurniture(field:FrontRidgeR30Field,route:readonly RidgeRoadPoint[],allowed:(e:number,n:number)=>boolean){
 const group=new Group();group.name='d-r30-road-furniture';
 const geo=new BoxGeometry(),mat=new MeshLambertMaterial({color:'#ffffff'}),glow=new MeshLambertMaterial({color:'#ecc283'});
 const tmp=new Object3D(),tint=new Color(),parts:{matrix:import('three').Matrix4;color:string}[]=[],lights:typeof parts=[],barriers:Barrier[]=[];
 function box(e:number,n:number,y:number,w:number,d:number,h:number,color:string,lamp=false){
  tmp.position.set(e,y,-n);tmp.rotation.set(0,0,0);tmp.scale.set(w,h,d);tmp.updateMatrix();(lamp?lights:parts).push({matrix:tmp.matrix.clone(),color});
 }
 function beam(a:P,b:P,color:string,size:number){
  const x=new Vector3(a.east,a.height,-a.north),z=new Vector3(b.east,b.height,-b.north),d=z.clone().sub(x);
  tmp.position.copy(x).lerp(z,.5);tmp.quaternion.setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize());tmp.scale.set(size,d.length(),size);tmp.updateMatrix();parts.push({matrix:tmp.matrix.clone(),color});
 }
 const total=route.at(-1)?.cum??0;
 function at(m:number){let i=1;while(i<route.length-1&&route[i]!.cum<m)i++;const a=route[i-1]!,b=route[i]!,len=b.cum-a.cum,t=Math.max(0,Math.min(1,(m-a.cum)/len));return {east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t,de:(b.east-a.east)/len,dn:(b.north-a.north)/len}}
 const railPosts:P[][]=[[],[]];let postCount=0,railCount=0,lanternCount=0;
 for(const [sideIndex,side]of [-1,1].entries()){
  let previous:P|undefined;
  for(let m=5;m<total-5;m+=4){
   const p=at(m),e=p.east-p.dn*side*2.25,n=p.north+p.de*side*2.25;
   const y=field.heightAt(e,n),out=field.heightAt(e-p.dn*side*2.7,n+p.de*side*2.7),center=field.heightAt(p.east,p.north);
   if(y===undefined||out===undefined||center===undefined||!allowed(e,n)||(ridgeRoadProject(route,e,n)?.distance??0)<2.02){previous=undefined;continue}
   // Only exposed outside shoulders need a rail; inside banks stay open.
   if(center-out<.72){previous=undefined;continue}
   const ground={east:e,north:n,height:y};
   box(e,n,y-.10,.36,.36,.36,'#68747a');
   box(e,n,y+.52,.15,.15,1.13,'#5f4736');
   box(e,n,y+1.10,.22,.22,.12,'#a98a61');
   railPosts[sideIndex]!.push(ground);postCount++;
   barriers.push({a:ground,b:ground,radius:.13,bottom:y-.1,top:y+1.15});
   if(previous&&Math.hypot(e-previous.east,n-previous.north)<4.8&&[.25,.5,.75].every(t=>(ridgeRoadProject(route,previous!.east+(e-previous!.east)*t,previous!.north+(n-previous!.north)*t)?.distance??0)>=1.98)){
    for(const dh of [.43,.93])beam({...previous,height:previous.height+dh},{...ground,height:y+dh},'#72543d',.12);
    barriers.push({a:previous,b:ground,radius:.10,bottom:Math.min(y,previous.height)+.32,top:Math.max(y,previous.height)+1.02});railCount++;
   }
   if(sideIndex===0&&Math.round(m)%24===5){
    box(e,n,y+1.52,.11,.11,.84,'#46555c');
    box(e,n,y+1.93,.30,.30,.10,'#46555c');
    box(e,n,y+2.10,.21,.21,.26,'#ecc283',true);
    box(e,n,y+2.28,.34,.34,.12,'#46555c');
    for(const dx of [-.13,.13])for(const dz of [-.13,.13])box(e+dx,n+dz,y+2.10,.035,.035,.30,'#46555c');
    lanternCount++;
   }
   previous=ground;
  }
 }
 const batches:InstancedMesh[]=[];
 for(const [material,list]of [[mat,parts],[glow,lights]] as const){
  if(!list.length)continue;
  const batch=new InstancedMesh(geo,material,list.length);list.forEach((p,i)=>{batch.setMatrixAt(i,p.matrix);if(material===mat)batch.setColorAt(i,tint.set(p.color))});
  batch.computeBoundingSphere();group.add(batch);batches.push(batch);
 }
 return {group,postCount,railCount,lanternCount,blocked(e:number,n:number,y:number,r=.27){
  return barriers.some(b=>{const dx=b.b.east-b.a.east,dn=b.b.north-b.a.north,t=Math.max(0,Math.min(1,((e-b.a.east)*dx+(n-b.a.north)*dn)/(dx*dx+dn*dn||1)));return y+1.8>b.bottom&&y<b.top&&Math.hypot(e-b.a.east-dx*t,n-b.a.north-dn*t)<r+b.radius});
 },setNight(night:boolean){glow.emissive.set(night?'#ecc283':'#000000');glow.emissiveIntensity=night?.75:0},
 dispose(){group.removeFromParent();batches.forEach(b=>b.dispose());geo.dispose();mat.dispose();glow.dispose()}};
}
