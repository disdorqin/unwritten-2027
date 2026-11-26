import {BoxGeometry,BufferGeometry,Color,Float32BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {firstMineConnectionDatum} from '../../../src/shared/underground-second-mine-presence-domain.js';
import {isMinePresenceFoot} from '../../../src/shared/underground-mine-presence-domain.js';
import {r30ReturnBay,r30ReturnBayBlocks,r30ReturnBayFloor} from '../../../src/shared/town-c-r30-return-bay.js';
import {mountR30ReturnBay} from './town-c-r30-return-bay.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type Local=readonly [number,number,number];
type Rect=Readonly<{minX:number;maxX:number;minZ:number;maxZ:number}>;
type Box=Readonly<{x:number;z:number;w:number;d:number;h:number}>;
const surfaceAxis=Object.freeze({east:-124.5,north:177});
const {yaw,landing,localPool}=firstMineConnectionDatum,c=Math.cos(yaw),s=Math.sin(yaw);
const toWorld=([x,y,z]:Local):Point=>({east:landing.east+c*(x-localPool[0])+s*(z-localPool[2]),north:landing.north+s*(x-localPool[0])-c*(z-localPool[2]),height:landing.height+y-localPool[1]});
const localX=c*(surfaceAxis.east-landing.east)+s*(surfaceAxis.north-landing.north)+localPool[0];
const localZ=s*(surfaceAxis.east-landing.east)-c*(surfaceAxis.north-landing.north)+localPool[2];
const dx=localX-r30ReturnBay.dock.x,dz=localZ-r30ReturnBay.dock.z,dy=-.05*dz;
const turnX=localX+3.0,half=1.35;
const newBay={minX:r30ReturnBay.minX+dx,maxX:r30ReturnBay.maxX+dx,minZ:r30ReturnBay.minZ+dz,maxZ:r30ReturnBay.maxZ+dz};
const originalBay={minX:r30ReturnBay.minX,maxX:r30ReturnBay.maxX,minZ:r30ReturnBay.minZ,maxZ:r30ReturnBay.maxZ};
/** Actual union of the former station chamber, proposed tunnel and
 * relocated original prefab. Only candidate geometry, no live wall cut. */
export const r30ReturnRelocationCandidate=Object.freeze({
 surfaceAxis,oldBay:originalBay,newBay,offset:[dx,dy,dz] as Local,
 dock:[localX,r30ReturnBayFloor(localZ),localZ] as Local,
 approach:[r30ReturnBay.call.x+dx,r30ReturnBayFloor(r30ReturnBay.call.z+dz),r30ReturnBay.call.z+dz] as Local,
 rooms:[originalBay,
  {minX:turnX-half,maxX:originalBay.minX,minZ:originalBay.minZ,maxZ:originalBay.maxZ},
  {minX:turnX-half,maxX:turnX+half,minZ:newBay.minZ,maxZ:originalBay.maxZ},
  newBay] as readonly Rect[],
 path:[[r30ReturnBay.dock.x,r30ReturnBay.dock.z],[turnX,r30ReturnBay.dock.z],[turnX,localZ],[localX,localZ]] as readonly (readonly [number,number])[],
 ceiling:3.5,grade:.05,productionReady:false as const,
 required:['B-certified-surface-axis-and-roof','A-public-collision-and-entry-transfer','retire-original-return-station-fixtures','approved-real-west-wall-cut','single-original-lift-authority'] as const,
});
const plan=r30ReturnRelocationCandidate;
const contains=(x:number,z:number)=>plan.rooms.some(r=>x>=r.minX-1e-8&&x<=r.maxX+1e-8&&z>=r.minZ-1e-8&&z<=r.maxZ+1e-8);
const corners=(r:Rect)=>[r.minX,r.maxX].flatMap(x=>[r.minZ,r.maxZ].map(z=>toWorld([x,r30ReturnBayFloor(z),z])));
export function surveyR30ReturnRelocation(){
 const world=toWorld(plan.dock),call=toWorld(plan.approach),previous=toWorld([r30ReturnBay.dock.x,r30ReturnBayFloor(r30ReturnBay.dock.z),r30ReturnBay.dock.z]);
 const path=plan.path.map(([x,z])=>toWorld([x,r30ReturnBayFloor(z),z]));
 return {world,call,previous,path,planarOffset:Math.hypot(world.east-previous.east,world.north-previous.north),
  routeLength:path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.east-path[i].east,p.north-path[i].north,p.height-path[i].height),0),
  allFeetWithinPresence:plan.rooms.flatMap(corners).every(p=>isMinePresenceFoot(p.east,p.north,p.height)),
  axisError:Math.hypot(world.east-surfaceAxis.east,world.north-surfaceAxis.north),productionReady:false as const};
}
/** Standalone sealed candidate model. It must never be mounted as a
 * production duplicate of the current bay. No opening in the upper roof,
 * including above the proposed dock, before independent certification. */
export function mountR30ReturnRelocationCandidate(parent:Group){
 const group=new Group();group.name='r30-return-relocation-sealed-candidate';parent.add(group);
 const vertices:number[]=[],uv:number[]=[];
 const xs=[...new Set(plan.rooms.flatMap(r=>[r.minX,r.maxX]))].sort((a,b)=>a-b),zs=[...new Set(plan.rooms.flatMap(r=>[r.minZ,r.maxZ]))].sort((a,b)=>a-b);
 const cells=zs.slice(0,-1).map((z,j)=>xs.slice(0,-1).map((x,i)=>contains((x+xs[i+1])/2,(z+zs[j+1])/2)));
 const quad=(a:Local,b:Local,c:Local,d:Local)=>{
  vertices.push(...a,...b,...c,...a,...c,...d);
  const len=(a:Local,b:Local)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const u=len(a,b)*.5,v=len(a,d)*.5;uv.push(0,0,u,0,u,v,0,0,u,v,0,v);
 };
 for(let j=0;j<cells.length;j++)for(let i=0;i<cells[j].length;i++){
  if(!cells[j][i])continue;
  const a=xs[i],b=xs[i+1],z=zs[j],n=zs[j+1],f=r30ReturnBayFloor(z),g=r30ReturnBayFloor(n),h=plan.ceiling;
  quad([a,f,z],[a,g,n],[b,g,n],[b,f,z]);
  quad([a,f+h,z],[b,f+h,z],[b,g+h,n],[a,g+h,n]);
  if(!cells[j][i-1])quad([a,f,z],[a,f+h,z],[a,g+h,n],[a,g,n]);
  if(!cells[j][i+1])quad([b,f,z],[b,g,n],[b,g+h,n],[b,f+h,z]);
  if(!cells[j-1]?.[i])quad([a,f,z],[b,f,z],[b,f+h,z],[a,f+h,z]);
  if(!cells[j+1]?.[i])quad([a,g,n],[a,g+h,n],[b,g+h,n],[b,g,n]);
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
 const rockMap=makeCampGrain('rock'),rock=new MeshLambertMaterial({map:rockMap,color:0x54565a}),shell=new Mesh(geometry,rock);shell.name='r30-return-relocation-sealed-rock';group.add(shell);
 const stationParent=new Group();stationParent.name='r30-return-relocated-original-bay';stationParent.position.set(dx,dy,dz);group.add(stationParent);
 const station=mountR30ReturnBay(stationParent,true,([x,y,z])=>toWorld([x+dx,y+dy,z+dz]));
 // Only the proposed new bay owns the relocated station props. Original
 // fixture retirement is explicitly required before a production opening.
 const feet:Box[]=[],parts:{x:number;y:number;z:number;w:number;h:number;d:number;family:'wood'|'iron'|'rock';color:number}[]=[];
 const put=(family:'wood'|'iron'|'rock',x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>parts.push({family,x,y:r30ReturnBayFloor(z)+y,z,w,h,d,color});
 for(let z=localZ+3.2;z<14.0;z+=3.2){
  for(const side of [-1,1]){
   const x=turnX+side*1.14;
   const f={x,z,w:.35,d:.39,h:3.25};
   if(![-f.w/2,f.w/2].every(a=>[-f.d/2,f.d/2].every(b=>contains(x+a,z+b))))continue;
   feet.push(f);
   put('rock',x,.13,z,.34,.26,.38,0x53504b);
   put('wood',x,1.68,z,.23,2.84,.26,0x70543e);
   for(const y of [.37,1.5,2.98]){
    put('iron',x,y,z,.29,.13,.33,0x80563d);
    for(const d of [-.17,.17])put('iron',x,y,z+d,.055,.055,.035,0x9b8260);
   }
  }
  put('wood',turnX,3.25,z,2.57,.30,.37,0x604735);
  for(const x of [turnX-1.14,turnX,turnX+1.14])put('iron',x,3.25,z,.14,.34,.41,0x80563d);
 }
 // Low-cost, legible route dressing: iron-caged amber lenses hang from
 // the actual roof, and worn floor chevrons point along each straight leg.
 // No dynamic lights, no transport activation and no extra floor support.
 const arrows:{x:number;z:number;dx:number;dz:number}[]=[];
 for(let i=1;i<plan.path.length;i++){
  const a=plan.path[i-1],b=plan.path[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const ux=(b[0]-a[0])/len,uz=(b[1]-a[1])/len;
  for(let d=2;d<len-1.25;d+=3.8){
   const x=a[0]+d*ux,z=a[1]+d*uz;
   arrows.push({x,z,dx:ux,dz:uz});
   for(let k=0;k<4;k++)for(const side of (k===0?[1]:[-1,1])){
    const back=k*.10,wide=k*.09*side;
    put('iron',x-back*ux-wide*uz,.007,z-back*uz+wide*ux,.09,.014,.09,0x987547);
   }
  }
 }
 const lamps:{x:number;z:number}[]=[];
 for(const z of [localZ+4.8,localZ+11.2,localZ+16.0]){
  const x=turnX;if(!contains(x,z))continue;
  lamps.push({x,z});
  put('iron',x,3.36,z,.23,.28,.22,0x565050);
  put('iron',x,3.13,z,.07,.27,.07,0x80563d);
  put('iron',x,2.93,z,.31,.08,.30,0x604535);
  put('iron',x,2.76,z,.22,.26,.22,0xb99359);
  put('iron',x,2.59,z,.31,.08,.30,0x604535);
  for(const u of [-1,1])for(const v of [-1,1])put('iron',x+u*.13,2.76,z+v*.13,.045,.30,.045,0x614b38);
 }
 const block=new BoxGeometry(),resources:{mesh:InstancedMesh;material:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=makeCampGrain(family),material=new MeshLambertMaterial({map}),mesh=new InstancedMesh(block,material,rows.length),m=new Matrix4(),q=new Quaternion(),col=new Color();
  rows.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),q,new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,col.setHex(p.color))});
  mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,material,map});
 }
 function passageAt(x:number,z:number,r=.27,h=1.8){
  if(![x,z,r,h].every(Number.isFinite)||r<0||h<=0||h+2*r*.05>plan.ceiling)return;
  for(const ox of [-r,0,r])for(const oz of [-r,0,r])if(!contains(x+ox,z+oz))return;
  // Rect union is exact on all internal edges; reject footprint holes by
  // including every internal cell edge crossing the square footprint.
  const xe=[x-r,...xs.filter(v=>v>x-r&&v<x+r),x+r],ze=[z-r,...zs.filter(v=>v>z-r&&v<z+r),z+r];
  for(let i=1;i<xe.length;i++)for(let j=1;j<ze.length;j++)if(!contains((xe[i-1]+xe[i])/2,(ze[j-1]+ze[j])/2))return;
  const floor=r30ReturnBayFloor(z);
  if(r30ReturnBayBlocks(x-dx,z-dz,r,h,floor-dy))return;
  let clearance=plan.ceiling-2*r*.05;
  // Use actual piece envelopes for overhead braces/lamps, not merely
  // nominal roof height. Low decorative inlays are not support surfaces.
  for(const p of parts){
   if(p.y+p.h/2-r30ReturnBayFloor(p.z)<=.025||Math.hypot(Math.max(0,Math.abs(x-p.x)-p.w/2),Math.max(0,Math.abs(z-p.z)-p.d/2))>=r)continue;
   const bottom=p.y-p.h/2,top=p.y+p.h/2;
   if(top<=floor+.025)continue;
   if(bottom<=floor+.025)return;
   clearance=Math.min(clearance,bottom-floor);
  }
  if(clearance<h)return;
  return {floor,clearance,requiresCrouch:false,waterDepth:0};
 }
 return {group,shell,station,parts:parts.length+station.parts.length,feet,arrows,lamps,passageAt,survey:surveyR30ReturnRelocation(),
 dispose(){group.removeFromParent();station.dispose();resources.forEach(r=>{r.mesh.dispose();r.material.dispose();r.map.dispose()});block.dispose();geometry.dispose();rock.dispose();rockMap.dispose();group.clear()}};
}
