import {BoxGeometry,CanvasTexture,Group,Mesh,MeshLambertMaterial,MeshBasicMaterial,PlaneGeometry,NearestFilter,SRGBColorSpace,DoubleSide,InstancedMesh,Matrix4,Quaternion,Vector3,Color} from 'three';
import {firstMineShallowWorks as plan} from '../../../src/shared/town-c-first-mine-shallow-works.js';
import type {mountR30ShallowGallery} from './town-c-r30-shallow-gallery.js';
type Gallery=ReturnType<typeof mountR30ShallowGallery>;
type Support=(x:number,z:number,r:number,h:number)=>boolean;
const floor=-91;
/** In-world wayfinding. Every return arrow points along the reverse of
 * the surveyed walk route, not at the shortest straight line through rock. */
export function mountR30ShallowWayfinding(parent:Group,gallery:Gallery,support:Support){
 const group=new Group();group.name='r30-shallow-physical-wayfinding';parent.add(group);
 const markers:{x:number;z:number;dx:number;dz:number;segment:number}[]=[],boards:{x:number;z:number;label:string}[]=[];
 const arrowParts:{x:number;z:number;w:number;d:number;yaw:number;color:number}[]=[];
 // Route distances give sparse wear marks rather than a videogame GPS strip.
 for(let i=0;i<plan.path.length-1;i++){
  const a=plan.path[i],b=plan.path[i+1];
  if(i>=9)break; // only this shallow gallery; the mid gallery has its own route
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(a[0]-b[0])/length,dz=(a[1]-b[1])/length;
  const distances=length<12?[length*.5]:Array.from({length:Math.ceil(length/15)},(_,k)=>(k+.5)*length/Math.ceil(length/15));
  for(const t of distances){
   const x=a[0]-dx*t,z=a[1]-dz*t;
   if(!support(x,z,.60,.025))continue;
   markers.push({x,z,dx,dz,segment:i});
   const yaw=Math.atan2(dx,dz);
   const add=(side:number,along:number,w:number,d:number,angle=0,color=0xa18d68)=>{
    arrowParts.push({x:x+dz*side+dx*along,z:z-dx*side+dz*along,w,d,yaw:yaw+angle,color})
   };
   add(0,-.12,.13,.53);
   add(-.12,.13,.11,.32,Math.PI/4);add(.12,.13,.11,.32,-Math.PI/4);
   for(const s of [-1,1])add(s*.37,-.13,.09,.18,0,0x706651);
  }
 }
 const geo=new BoxGeometry(),paint=new MeshLambertMaterial(),mesh=new InstancedMesh(geo,paint,arrowParts.length);
 const matrix=new Matrix4(),q=new Quaternion(),c=new Color();
 arrowParts.forEach((p,i)=>{matrix.compose(new Vector3(p.x,floor+.009,p.z),q.setFromAxisAngle(new Vector3(0,1,0),p.yaw),new Vector3(p.w,.018,p.d));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,c.setHex(p.color))});
 mesh.computeBoundingSphere();group.add(mesh);
 const boardGeo=new BoxGeometry(.96,.40,.095),boardMat=new MeshLambertMaterial({color:0x594735});
 const signGeo=new PlaneGeometry(.90,.34),signs:Mesh[]=[],signMats:MeshBasicMaterial[]=[],maps:CanvasTexture[]=[];
 const frameGeo=new BoxGeometry(.045,.31,.065),frameMat=new MeshLambertMaterial({color:0x80563d});
 const tags=[{x:-12,z:52,label:'支巷 一'},{x:-92,z:52,label:'转弯 · 慢行'},{x:-78,z:59.25,label:'支巷 二'},{x:-42,z:66,label:'支巷 三'},{x:-59,z:66,label:'回主巷 · 顺箭头'}];
 for(const t of tags){
  if(!gallery.frames.some(f=>f.x===t.x&&f.z===t.z))continue;
  boards.push(t);
  const pivot=new Group();pivot.position.set(t.x,floor+3.54,t.z);pivot.rotation.y=Math.PI/2;group.add(pivot);
  const board=new Mesh(boardGeo,boardMat);pivot.add(board);
  for(const x of [-.31,.31]){const bar=new Mesh(frameGeo,frameMat);bar.position.set(x,.28,0);pivot.add(bar)}
  if(typeof document==='undefined')continue;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;const ctx=canvas.getContext('2d');if(!ctx)continue;
  ctx.fillStyle='#4e3e2e';ctx.fillRect(0,0,512,192);ctx.strokeStyle='#b39b70';ctx.lineWidth=8;ctx.strokeRect(8,8,496,176);
  ctx.fillStyle='#dac69e';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=t.label.length>6?'bold 56px Microsoft YaHei,sans-serif':'bold 72px Microsoft YaHei,sans-serif';ctx.fillText(t.label,256,96);
  const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;maps.push(map);
  const mat=new MeshBasicMaterial({map,side:DoubleSide});signMats.push(mat);
  for(const side of [-1,1]){const sign=new Mesh(signGeo,mat);sign.position.z=side*.049;if(side<0)sign.rotation.y=Math.PI;pivot.add(sign);signs.push(sign)}
 }
 return {group,markers,boards,parts:arrowParts.length+boards.length*3,dispose(){group.removeFromParent();mesh.dispose();geo.dispose();paint.dispose();boardGeo.dispose();boardMat.dispose();frameGeo.dispose();frameMat.dispose();signGeo.dispose();signMats.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());group.clear()}};
}
