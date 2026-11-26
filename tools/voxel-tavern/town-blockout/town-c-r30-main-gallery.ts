import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {createUndergroundMineLayout} from './underground-mine-layout.js';
type Mine=ReturnType<typeof createUndergroundMineLayout>;
type Family='rock'|'wood'|'iron';
type Part=Readonly<{family:Family;x:number;y:number;z:number;w:number;h:number;d:number;angle:number;color:number}>;
const axis=new Vector3(1,0,0);
export function mountR30MainGallery(parent:Group,mine:Mine){
 const group=new Group();group.name='r30-main-gallery-industrial-remains';
 const parts:Part[]=[],frames:number[]=[];
 const add=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0)=>parts.push({family,x,y,z,w,h,d,angle,color});
 const canonical=mine.expansion?.deepWorks===true&&mine.crouchInterval[0]===31.73;
 if(canonical){
  // All the low sleepers are flush inlays, not a new grade or rail authority.
  for(const [from,to] of [[12.4,31.5],[45.4,138.1]])for(let z=from;z<=to;z+=.72){
   if(mine.expansion?.hasRunningMainline&&z>=48.2&&(z<=68||z>=111&&z<=137.3))continue;
   const p=mine.queryPassage(0,z,.27,1.8,'open');if(!p)continue;
   const h=p.floor,grade=z<32?-.05:0;
   add('wood',0,h-.005,z,1.65,.024,.20,0x594536,Math.atan(-grade));
   for(const x of [-.5,.5]){
    add('iron',x,h+.005,z,.15,.018,.19,0x80563d);
    for(const d of [-.068,.068])add('iron',x+.06,h+.014,z+d,.045,.018,.046,0x947346);
   }
   for(const side of [-1,1])for(let k=0;k<3;k++){
    const x=side*(1.05+k*.16),n=z+(k-1)*.14;
    add('rock',x,h-.008,n,.16,.026,.18,k===1?0x5e5851:0x41464b);
   }
  }
  // Crossbeams and rock ledges follow the actual overhead envelope.
  // Side posts deliberately omit branch entrances, water and gate socket.
  const arch=(z:number,half:number,ceiling:number)=>{
   const p=mine.queryPassage(0,z,.27,1.8,'open');if(!p)return;
   const f=p.floor;frames.push(z);
   for(const s of [-1,1]){
    const x=s*(half-.17);
    add('rock',x,f+.15,z,.31,.30,.55,0x53504b);
    add('wood',x,f+(ceiling-.30)/2,z,.21,ceiling-.30,.27,0x70543e);
    for(const y of [.35,ceiling-.5]){
     add('iron',x,f+y,z,.265,.13,.32,0x80563d);
     for(const dz of [-.17,.17])add('iron',x,f+y,z+dz,.05,.055,.035,0xa08866);
    }
    for(let j=0;j<4;j++)add('rock',s*(half-.18-j*.12),f+ceiling-.52+j*.10,z,.32,.20,.56,j%2?0x41464b:0x505258);
    add('iron',s*(half-.44),f+ceiling-.39,z,.29,.22,.34,0x80563d);
   }
   add('wood',0,f+ceiling-.18,z,2*half-.15,.30,.36,0x604735);
   for(const x of [-half+.55,0,half-.55]){
    add('iron',x,f+ceiling-.18,z,.12,.34,.41,0x80563d);
    for(const dz of [-.22,.22])add('iron',x,f+ceiling-.17,z+dz,.044,.049,.04,0x947346);
   }
  };
  for(const z of [13.2,17.8,22.4,27,30.4])arch(z,2,3.5);
  for(const z of [46.8])arch(z,2,3.5);
  for(const z of [67,83,87,103,115,119,123])arch(z,4.2,7.2);
  // Crushed sill around the narrow opening. No model crosses the original
  // 1.2m slot; keep its exact 1.3m roof and crouching affordance.
  for(const z of [31.62,35.38])for(const side of [-1,1]){
   for(let k=0;k<6;k++){
    const x=side*(.86+(k%3)*.28),f=-91;
    add('rock',x,f+.14+Math.floor(k/3)*.26,z,.23,.25,.31,k%2?0x615d55:0x41464b);
   }
   add('wood',side*1.18,-90.18,z,.18,1.62,.16,0x70543e);
   for(let k=0;k<6;k++)add('iron',side*1.18,-90.4+k*.16,z+.09,.22,.045,.035,0x947346);
  }
  // Worn, unlit cable mounts indicate human engineering; no fresh light.
  for(let z=13;z<=30;z+=1.5){
   const p=mine.queryPassage(0,z,.27,1.8,'open');if(!p)continue;
   add('iron',-1.85,p.floor+2.42,z,.12,.055,1.48,0x505258,Math.atan(.05));
   add('iron',-1.81,p.floor+2.42,z,.20,.15,.09,0x80563d);
  }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron'] as const){
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map});
  for(let from=0;from<140;from+=28){
   const rows=parts.filter(p=>p.family===family&&p.z>=from&&p.z<from+28);if(!rows.length)continue;
   const mesh=new InstancedMesh(geo,mat,rows.length),matrix=new Matrix4(),q=new Quaternion(),color=new Color();
   mesh.name='r30-main-gallery/'+family+'/'+from;
   rows.forEach((p,i)=>{matrix.compose(new Vector3(p.x,p.y,p.z),q.setFromAxisAngle(axis,p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,color.setHex(p.color))});
   mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
  }
  if(!resources.some(r=>r.mat===mat)){mat.dispose();map.dispose()}
 }
 // Exact conservative transformed box extents. Very low inlays are not a
 // blocker; the same visible posts and beams reject the walking capsule.
 const boxes=parts.filter(p=>p.h>.055).map(p=>{const c=Math.abs(Math.cos(p.angle)),s=Math.abs(Math.sin(p.angle));
 return {...p,hy:(c*p.h+s*p.d)/2,hz:(s*p.h+c*p.d)/2}});
 function blocks(x:number,z:number,floor:number,radius:number,height:number){
  return boxes.some(p=>p.y+p.hy>floor+.025&&p.y-p.hy<floor+height&&
   Math.hypot(Math.max(0,Math.abs(x-p.x)-p.w/2),Math.max(0,Math.abs(z-p.z)-p.hz))<radius);
 }
 parent.add(group);return {group,parts,frames,blocks,dispose(){group.removeFromParent();
  for(const r of resources)r.mesh.dispose();for(const m of new Set(resources.map(r=>r.mat)))m.dispose();for(const m of new Set(resources.map(r=>r.map)))m.dispose();geo.dispose()}};
}
