import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {firstMineDeepWorks as plan} from '../../../src/shared/town-c-first-mine-deep-works.js';
type Local=readonly[number,number];
type Supports=(x:number,z:number,r:number,h:number)=>boolean;
const floor=-91;
/** Paths are the real B01 dry arms, surveyed against static host
 * geometry (cart/rider are dynamic and may occupy the crossing).
 * Signs do not grant immunity to encounters or a movement route. */
export function mountR30DeepRetreat(parent:Group,support:Supports,enabled:boolean){
 const root=new Group();root.name='r30-deep-retreat-dry-trail';parent.add(root);
 const routes=[{id:'west',points:plan.westPath},{id:'east',points:plan.eastDryPath}] as const;
 const trails:{id:string;points:readonly Local[];length:number}[]=[],markers:{id:string;x:number;z:number;dx:number;dz:number}[]=[];
 const parts:{x:number;z:number;w:number;d:number;yaw:number;color:number}[]=[];
 const valid=(path:readonly Local[])=>path.slice(1).every((b,i)=>{
  const a=path[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.08);
  return Array.from({length:n+1},(_,k)=>support(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n,.27,1.8)).every(Boolean);
 });
 if(enabled)for(const r of routes){
  if(!valid(r.points))continue;
  let total=0;
  for(const [i,b] of r.points.slice(1).entries()){
   const a=r.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(a[0]-b[0])/length,dz=(a[1]-b[1])/length;
   total+=length;
   const count=Math.max(1,Math.ceil(length/8));
   for(let k=0;k<count;k++){
    const t=(k+.5)*length/count,x=a[0]-dx*t,z=a[1]-dz*t;
    if(!support(x,z,.55,.04))continue;
    markers.push({id:r.id,x,z,dx,dz});
    const yaw=Math.atan2(dx,dz);
    const put=(side:number,along:number,w:number,d:number,rot:number,color:number)=>{
     parts.push({x:x+dz*side+dx*along,z:z-dx*side+dz*along,w,d,yaw:yaw+rot,color});
    };
    put(0,-.10,.13,.48,0,0xa99a72);
    put(-.115,.115,.10,.31,Math.PI/4,0xa99a72);put(.115,.115,.10,.31,-Math.PI/4,0xa99a72);
    for(const s of [-1,1])put(s*.35,-.13,.085,.19,0,0x6c6655);
   }
  }
  trails.push({id:r.id,points:r.points,length:total});
 }
 const geo=new BoxGeometry(),mat=new MeshLambertMaterial(),mesh=new InstancedMesh(geo,mat,parts.length);
 const m=new Matrix4(),q=new Quaternion(),c=new Color(),axis=new Vector3(0,1,0);
 parts.forEach((p,i)=>{m.compose(new Vector3(p.x,floor+.008,p.z),q.setFromAxisAngle(axis,p.yaw),new Vector3(p.w,.016,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
 mesh.computeBoundingSphere();root.add(mesh);
 return {group:root,trails,markers,parts:parts.length,dispose(){root.removeFromParent();mesh.dispose();geo.dispose();mat.dispose();root.clear()}};
}
