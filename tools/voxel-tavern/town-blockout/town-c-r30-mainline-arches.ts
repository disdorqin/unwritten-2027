import {BoxGeometry,Group,Color,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3,CanvasTexture,PlaneGeometry,MeshBasicMaterial,Mesh,NearestFilter,SRGBColorSpace,DoubleSide} from 'three';
import type {createUndergroundMainlineTrack,UndergroundMainlinePoint as Point} from '../../../src/shared/underground-mainline-track.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Route=ReturnType<typeof createUndergroundMainlineTrack>;
type Obstruction={p:Point;r:number;h:number};
type Family='wood'|'iron'|'rock'|'neutral';
type Part={m:number;p:Point;y:number;size:[number,number,number];yaw:number;family:Family;color:number};
export function mountR30MainlineArches(parent:Group,route:Route,supports:(p:Point,r:number,h:number)=>boolean,existing:readonly Obstruction[]){
 const root=new Group();root.name='r30-mainline-arches-and-warnings';parent.add(root);
 const parts:Part[]=[],obstructions:Obstruction[]=[],frames:number[]=[],warnings:number[]=[],signs:Mesh<PlaneGeometry,MeshBasicMaterial>[]=[];
 const points=Array.from({length:Math.ceil(route.length/.20)+1},(_,i)=>route.sample(Math.min(route.length,i*.20)).position);
 const clear=(p:Point,r:number,h:number)=>supports(p,r,h)&&[...existing,...obstructions].every(b=>Math.hypot(p.east-b.p.east,p.north-b.p.north)>r+b.r+.15)&&points.every(q=>Math.hypot(q.east-p.east,q.north-p.north)>r+route.clearanceRadius+.15);
 const at=(m:number,side:number,along=0)=>{
  const a=route.sample(m),p=a.position,c=Math.cos(a.heading),s=Math.sin(a.heading);
  return {east:p.east+c*side-s*along,north:p.north+s*side+c*along,height:p.height};
 };
 const put=(m:number,side:number,along:number,y:number,size:Part['size'],family:Family,color:number)=>parts.push({m,p:at(m,side,along),y,size,family,color,yaw:route.sample(m).heading});
 for(const target of [27,35,43,53,61,69,77,87,94]){
  let chosen:{m:number;left:number;right:number}|undefined;
  for(const m of [target,target-1,target+1,target-2,target+2]){
   if(frames.some(f=>Math.abs(f-m)<4))continue;
   for(const left of [2.1,2.45,2.8]){
    for(const right of [2.1,2.45,2.8]){
     if(!clear(at(m,-left),.34,4.1)||!clear(at(m,right),.34,4.1))continue;
     let beamClear=true;
     for(let x=-left;x<=right;x+=.20)if(!supports(at(m,x),.20,4.1)){beamClear=false;break}
     if(beamClear){chosen={m,left,right};break}
    }if(chosen)break;
   }if(chosen)break;
  }
  if(!chosen)continue;
  const {m,left,right}=chosen;frames.push(m);
  for(const side of [-left,right]){
   const p=at(m,side);obstructions.push({p,r:.34,h:3.85});
   put(m,side,0,.16,[.47,.32,.44],'rock',0x57534d);
   put(m,side,0,2.04,[.27,3.46,.29],'wood',0x6b5038);
   for(const y of [.40,1.85,3.57]){
    put(m,side,0,y,[.32,.12,.34],'iron',0x785842);
    for(const z of [-.18,.18])put(m,side,z,y,[.045,.055,.035],'iron',0xa58a62);
   }
   for(const s of [-1,1])for(let i=0;i<3;i++)put(m,side,s*(.18+i*.025),3.52+i*.10,[.30,.09,.13],'iron',0x806347);
  }
  put(m,(right-left)/2,0,3.93,[left+right+.27,.29,.42],'wood',0x594431);
  for(const x of [-left,0,right]){
   put(m,x,0,3.93,[.16,.32,.46],'iron',0x80563d);
   for(const z of [-.24,.24])put(m,x,z,3.93,[.05,.05,.04],'iron',0xa58a62);
  }
  // Overhead braces are above the cart/rider clearance; no low crossbar.
  for(const side of [-1,1])for(let j=0;j<5;j++){
   const x=side*(side<0?left:right)-side*(j+.5)*.16;
   put(m,x,0,3.22+j*.13,[.20,.18,.26],'wood',0x604735);
  }
  for(let j=0;j<12;j++){
   const x=-left+(j+.5)*(left+right)/12;
   put(m,x,.22,4.08,[.21,.045,.08],'iron',0x505258);
  }
 }
 // Actual bends are densely spaced on the surveyed polyline: place one
 // warning before each separated cluster, not 27 obstructive signs.
 for(const bend of route.bends){
  const m=Math.max(2,bend.chainage-4.2);
  if(warnings.some(n=>Math.abs(n-m)<10))continue;
  let side:number|undefined;
  for(const s of [1.95,-1.95,2.45,-2.45])if(clear(at(m,s),.50,2.1)){side=s;break}
  if(side===undefined)continue;
  warnings.push(m);obstructions.push({p:at(m,side),r:.50,h:2.1});
  put(m,side,0,.12,[.30,.24,.32],'rock',0x57534d);
  put(m,side,0,.92,[.14,1.6,.18],'wood',0x604735);
  put(m,side,0,1.76,[.86,.46,.10],'iron',0x68543e);
  for(let i=0;i<5;i++)put(m,side-.32+i*.16,.062,1.76,[.075,.29,.024],'neutral',i%2?0x38332b:0xc39a56);
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=384;canvas.height=192;const c=canvas.getContext('2d');
   if(c){
    c.fillStyle='#4d3e2c';c.fillRect(0,0,384,192);c.strokeStyle='#d2a466';c.lineWidth=9;c.strokeRect(5,5,374,182);
    c.fillStyle='#e5c693';c.textAlign='center';c.textBaseline='middle';c.font='bold 57px Microsoft YaHei,sans-serif';c.fillText('弯前减速',192,68);
    c.font='bold 31px Microsoft YaHei,sans-serif';c.fillText('握闸 · 慢行',192,137);
    const map=new CanvasTexture(canvas);map.minFilter=map.magFilter=NearestFilter;map.colorSpace=SRGBColorSpace;
    const mesh=new Mesh(new PlaneGeometry(.84,.42),new MeshBasicMaterial({map,side:DoubleSide})),p=at(m,side,-.065);
    mesh.position.set(p.east,p.height+1.76,-p.north);mesh.rotation.y=route.sample(m).heading;root.add(mesh);signs.push(mesh);
   }
  }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron','neutral'] as const){
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map});
  for(let start=0;start<route.length;start+=24){
   // batch by nearest chainage, not world axis
   const rows=parts.filter(p=>p.family===family&&p.m>=start&&p.m<start+24);if(!rows.length)continue;
   const mesh=new InstancedMesh(geo,mat,rows.length),m=new Matrix4(),c=new Color();
   rows.forEach((p,i)=>{m.compose(new Vector3(p.p.east,p.p.height+p.y,-p.p.north),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.yaw),new Vector3(...p.size));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
   mesh.computeBoundingSphere();root.add(mesh);resources.push({mesh,mat,map});
  }
  if(!resources.some(r=>r.mat===mat)){mat.dispose();map.dispose()}
 }
 return {group:root,parts:parts.length,frames,warnings,obstructions,
  blocks(e:number,n:number,y:number,r:number,h:number){return obstructions.some(b=>y+h>b.p.height&&y<b.p.height+b.h&&Math.hypot(e-b.p.east,n-b.p.north)<r+b.r)},
  dispose(){root.removeFromParent();for(const r of resources)r.mesh.dispose();for(const m of new Set(resources.map(r=>r.mat)))m.dispose();for(const m of new Set(resources.map(r=>r.map)))m.dispose();for(const s of signs){s.material.map?.dispose();s.material.dispose();s.geometry.dispose()}geo.dispose();root.clear()}};
}
