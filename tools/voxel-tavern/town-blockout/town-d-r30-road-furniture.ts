import {BoxGeometry,CanvasTexture,Color,Group,InstancedMesh,Mesh,MeshBasicMaterial,MeshLambertMaterial,Object3D,PlaneGeometry,SRGBColorSpace,Vector3} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import type {RidgeRoadPoint} from './town-d-r30-road-survey';
import {createRidgeRoadProximity,createRidgeSpatialIndex} from './town-d-r30-spatial';

type P={east:number;north:number;height:number};
type Barrier={a:P;b:P;radius:number;bottom:number;top:number};
export function mountRidgeRoadFurniture(field:FrontRidgeR30Field,route:readonly RidgeRoadPoint[],allowed:(e:number,n:number)=>boolean,terminal?:{title:string;returnTo:string}){
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
 const total=route.at(-1)?.cum??0,nearRoad=createRidgeRoadProximity(route);
 function at(m:number){let i=1;while(i<route.length-1&&route[i]!.cum<m)i++;const a=route[i-1]!,b=route[i]!,len=b.cum-a.cum,t=Math.max(0,Math.min(1,(m-a.cum)/len));return {east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t,de:(b.east-a.east)/len,dn:(b.north-a.north)/len}}
 const railPosts:P[][]=[[],[]];let postCount=0,railCount=0,lanternCount=0;
 for(const [sideIndex,side]of [-1,1].entries()){
  let previous:P|undefined;
  for(let m=5;m<total-5;m+=4){
   const p=at(m),e=p.east-p.dn*side*2.25,n=p.north+p.de*side*2.25;
   const y=field.heightAt(e,n),out=field.heightAt(e-p.dn*side*2.7,n+p.de*side*2.7),center=field.heightAt(p.east,p.north);
   if(y===undefined||out===undefined||center===undefined||!allowed(e,n)||nearRoad(e,n,2.02,false)){previous=undefined;continue}
   // Only exposed outside shoulders need a rail; inside banks stay open.
   if(center-out<.72){previous=undefined;continue}
   const ground={east:e,north:n,height:y};
   box(e,n,y-.10,.36,.36,.36,'#68747a');
   box(e,n,y+.52,.15,.15,1.13,'#5f4736');
   box(e,n,y+1.10,.22,.22,.12,'#a98a61');
   railPosts[sideIndex]!.push(ground);postCount++;
   barriers.push({a:ground,b:ground,radius:.13,bottom:y-.1,top:y+1.15});
   if(previous&&Math.hypot(e-previous.east,n-previous.north)<4.8&&[.25,.5,.75].every(t=>!nearRoad(previous!.east+(e-previous!.east)*t,previous!.north+(n-previous!.north)*t,1.98,false))){
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
 let terminalSign:{east:number;north:number;height:number;title:string;returnTo:string}|undefined;
 const signs:{geometry:PlaneGeometry;material:MeshBasicMaterial;texture:CanvasTexture}[]=[];
 if(terminal&&total>8){
  const p=at(total-1.5),tip=route.at(-1)!;
  // Use a stable shoulder, outside both the walking strip and its
  // player radius. The original final waypoint stays traversable.
  for(const side of [1,-1])for(const offset of [3.4,4,4.6]){
   if(terminalSign)continue;
   const e=p.east-p.dn*side*offset,n=p.north+p.de*side*offset,y=field.heightAt(e,n);
   if(y===undefined||!allowed(e,n)||nearRoad(e,n,2.9)||Math.abs(y-tip.height)>1.5)continue;
   if(![-.5,.5].every(d=>Math.abs((field.heightAt(e+d,n)??Infinity)-y)<.6))continue;
   terminalSign={east:e,north:n,height:y,...terminal};
   box(e,n,y+.7,.18,.18,1.6,'#5f4736');
   barriers.push({a:{east:e,north:n,height:y},b:{east:e,north:n,height:y},radius:.75,bottom:y,top:y+2.1});
   if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=320;const c=canvas.getContext('2d');
    if(c){
     c.fillStyle='#3e4949';c.fillRect(0,0,768,320);c.strokeStyle='#d9a866';c.lineWidth=12;c.strokeRect(9,9,750,302);
     c.fillStyle='#ffe5b7';c.textAlign='center';c.font='bold 58px sans-serif';c.fillText(terminal.title,384,85,716);
     c.fillStyle='#ffffff';c.font='40px sans-serif';c.fillText('前方工程未贯通',384,172);
     c.fillText('请原路返回'+terminal.returnTo,384,250,716);
     const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
     const geometry=new PlaneGeometry(1.8,.75),material=new MeshBasicMaterial({map:texture});
     const board=new Mesh(geometry,material);board.position.set(e,y+1.55,-n);board.rotation.y=Math.atan2(-p.de,p.dn);group.add(board);signs.push({geometry,material,texture});
    }
   }
  }
 }
 const batches:InstancedMesh[]=[];
 for(const [material,list]of [[mat,parts],[glow,lights]] as const){
  if(!list.length)continue;
  const batch=new InstancedMesh(geo,material,list.length);list.forEach((p,i)=>{batch.setMatrixAt(i,p.matrix);if(material===mat)batch.setColorAt(i,tint.set(p.color))});
  batch.computeBoundingSphere();group.add(batch);batches.push(batch);
 }
 const collision=createRidgeSpatialIndex(barriers,b=>({west:Math.min(b.a.east,b.b.east)-b.radius,east:Math.max(b.a.east,b.b.east)+b.radius,south:Math.min(b.a.north,b.b.north)-b.radius,north:Math.max(b.a.north,b.b.north)+b.radius}));
 return {group,postCount,railCount,lanternCount,terminalSign,blocked(e:number,n:number,y:number,r=.27){
  return collision.some(e,n,r,b=>{const dx=b.b.east-b.a.east,dn=b.b.north-b.a.north,t=Math.max(0,Math.min(1,((e-b.a.east)*dx+(n-b.a.north)*dn)/(dx*dx+dn*dn||1)));return y+1.8>b.bottom&&y<b.top&&Math.hypot(e-b.a.east-dx*t,n-b.a.north-dn*t)<r+b.radius});
 },setNight(night:boolean){glow.emissive.set(night?'#ecc283':'#000000');glow.emissiveIntensity=night?.75:0},
 dispose(){group.removeFromParent();batches.forEach(b=>b.dispose());signs.forEach(s=>{s.geometry.dispose();s.material.dispose();s.texture.dispose()});geo.dispose();mat.dispose();glow.dispose()}};
}
