import {BoxGeometry,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3,Color} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {surveyR30Ore} from './town-c-r30-ore-survey.js';
type Survey=Extract<ReturnType<typeof surveyR30Ore>,{kind:'ready'}>;
/** Physical rock-wall scars, not ore points, no mining affordance.
 * All pieces project <=4 cm beyond the surveyed rock plane. */
export function mountR30OreWallArt(parent:Group,survey:Survey){
 const group=new Group();group.name='r30-workface-rock-scars';parent.add(group);
 parent.updateWorldMatrix(true,true);
 const inv=parent.matrixWorld.clone().invert(),g=new BoxGeometry(),map=makeCampGrain('rock'),mat=new MeshLambertMaterial({map});
 const meshes:InstancedMesh[]=[];let parts=0;
 const worldPoint=(p:{east:number;north:number;height:number})=>new Vector3(p.east,p.height,-p.north);
 for(const [i,s] of survey.ordinary.entries()){
  const pivot=new Group();pivot.name='r30-chiselled-face/'+s.target.id;
  pivot.position.copy(worldPoint(s.face).applyMatrix4(inv));pivot.quaternion.setFromUnitVectors(new Vector3(0,0,1),worldPoint(s.normal).transformDirection(inv));group.add(pivot);
  const rows:{x:number;y:number;z:number;w:number;h:number;d:number;angle:number;color:number}[]=[];
  const add=(x:number,y:number,z:number,w:number,h:number,d:number,angle:number,color:number)=>rows.push({x,y,z,w,h,d,angle,color});
  for(let k=0;k<34;k++){
   const a=k*2.399963+i*.63,r=.36+((k*11+i*13)%17)*.024;
   const x=Math.cos(a)*r*1.24,y=Math.sin(a)*r*.71;
   add(x,y,.009+(k%3)*.004,.09+(k%5)*.026,.065+(k%4)*.026,.022,.19*Math.sin(a),[0x454749,0x51504b,0x615b52,0x47454a][(k+i)%4]);
  }
  // short irregular dark pick marks above and beside the vein, never
  // a uniform border or a second highlighted collectible.
  for(let k=0;k<18;k++){
   const x=-.67+(k%6)*.263+Math.sin(k+i)*.027,y=.30+Math.floor(k/6)*.13;
   if(Math.abs(x)<.24&&y<.40)continue;
   add(x,y,.022,.025,.09+((k*7+i)%5)*.021,.009,-.45+Math.sin(k*2+i)*.21,0x303338);
   add(x+.027,y+.01,.016,.016,.074,.009,-.45+Math.sin(k*2+i)*.21,0x777066);
  }
  const mesh=new InstancedMesh(g,mat,rows.length),m=new Matrix4(),q=new Quaternion(),c=new Color();
  rows.forEach((p,j)=>{m.compose(new Vector3(p.x,p.y,p.z),q.setFromAxisAngle(new Vector3(0,0,1),p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(j,m);mesh.setColorAt(j,c.setHex(p.color))});
  mesh.computeBoundingSphere();pivot.add(mesh);meshes.push(mesh);parts+=rows.length;
 }
 return {group,parts,dispose(){group.removeFromParent();meshes.forEach(m=>m.dispose());mat.dispose();map.dispose();g.dispose();group.clear()}};
}
