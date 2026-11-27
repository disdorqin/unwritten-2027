import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {r30DeepFrames,r30LayerLocal,r30LayerWorld,type R30Point} from './town-c-r30-deep-layer-contract.js';
import type {R30DeepMouth} from './town-c-r30-deep-assembly.js';
const thickness=.18;
type Row={x:number;y:number;z:number;w:number;h:number;d:number;color:number;kind:'wood'|'iron'};
/** Reversible physical closure of the actual C2 mouth. The fixed sockets
 * remain C2-owned; the existing room registry alone decides opening. */
export function mountR30DepthStop(parent:Group,mouth:R30DeepMouth,id:string){
 const frame=r30DeepFrames[mouth.layer];
 const local={east:mouth.axis==='east'?mouth.at:mouth.centre,north:mouth.axis==='north'?mouth.at:mouth.centre,height:0};
 const at=r30LayerWorld(frame,local),group=new Group();
 group.name='r30-depth-stop/'+id;group.position.set(at.east,at.height,-at.north);
 group.rotation.y=frame.yaw+(mouth.axis==='east'?Math.PI/2:0);
 group.visible=false;parent.add(group);
 const rows:Row[]=[];
 const put=(kind:Row['kind'],x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>rows.push({kind,x,y,z,w,h,d,color});
 const half=mouth.width/2;
 // Continuous solid timber leaf; seams are engraved over a backing skin.
 put('wood',0,mouth.height/2,0,mouth.width,mouth.height,thickness,0x62503b);
 for(let i=0;i<11;i++){
  const w=mouth.width/11,x=-half+(i+.5)*w;
  for(const side of [-1,1])put('wood',x,mouth.height/2,side*(thickness/2+.012),w-.009,mouth.height,.024,i%3===0?0x826348:0x70563e);
 }
 for(const side of [-1,1]){
  for(const y of [.23,1.47,mouth.height-.23]){
   put('iron',0,y,side*.135,mouth.width,.12,.05,0x55483b);
   for(let i=0;i<9;i++)put('iron',-half+.17+i*(mouth.width-.34)/8,y,side*.17,.055,.055,.035,0x9d8060);
  }
  // Small sealed-door notice, riveted metal plate. No fictitious unlock prompt.
  put('iron',0,1.86,side*.16,.65,.32,.055,0x806244);
  for(const x of [-.22,0,.22])put('wood',x,1.86,side*.197,.08,.19,.018,0xb49b73);
 }
 const geo=new BoxGeometry(),cleanup:(()=>void)[]=[];
 const mtx=new Matrix4(),color=new Color();
 for(const kind of ['wood','iron'] as const){
  const parts=rows.filter(r=>r.kind===kind),map=makeCampGrain(kind),mat=new MeshLambertMaterial({map});
  const mesh=new InstancedMesh(geo,mat,parts.length);mesh.name='depth-stop-'+kind;
  parts.forEach((r,i)=>{mtx.makeScale(r.w,r.h,r.d).setPosition(r.x,r.y,r.z);mesh.setMatrixAt(i,mtx);mesh.setColorAt(i,color.setHex(r.color))});
  mesh.computeBoundingSphere();group.add(mesh);cleanup.push(()=>{mesh.dispose();mat.dispose();map.dispose()});
 }
 let disposed=false;
 function intersects(east:number,north:number,height:number,radius:number,bodyHeight:number){
  if(disposed||![east,north,height,radius,bodyHeight].every(Number.isFinite)||radius<=0||bodyHeight<=0)return false;
  const p=r30LayerLocal(frame,{east,north,height});
  if(p.height>=mouth.height||p.height+bodyHeight<=0)return false;
  const across=mouth.axis==='north'?p.east-mouth.centre:p.north-mouth.centre;
  const normal=mouth.axis==='north'?p.north-mouth.at:p.east-mouth.at;
  return Math.hypot(Math.max(0,Math.abs(across)-half),Math.max(0,Math.abs(normal)-.206))<radius;
 }
 return {group,intersects,parts:rows.length,dispose(){if(disposed)return;disposed=true;group.removeFromParent();cleanup.forEach(f=>f());geo.dispose();group.clear()}};
}
