import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {crystalCavernR30Pieces,crystalCavernTrailHeight} from './underground-crystal-cavern.js';
import {crystalSideTrailNorth,r30CrystalSideTrail} from './town-c-r30-crystal-support.js';
type Part={e:number;n:number;y:number;w:number;h:number;d:number;color:number;angle:number};
const palette=[0x5c625e,0x505650,0x646965,0x444c4e,0x6c716b];
/** Actual dry-stone branch shoulders and end stop. No ore/mirror mechanics. */
export function mountR30CrystalSideArt(parent:Group){
 const group=new Group();group.name='r30-crystal-side-trail-rockwork';parent.add(group);
 const parts:Part[]=[],bounds:Part[]=[];
 const add=(e:number,n:number,y:number,w:number,h:number,d:number,color:number,angle=0,solid=true)=>{
  const p={e,n,y,w,h,d,color,angle};parts.push(p);if(solid)bounds.push(p);
 };
 const min=r30CrystalSideTrail.minEast,max=6.65,w=r30CrystalSideTrail.halfWidth;
 const intervals=Math.ceil((max-min)/1.36);
 for(let i=0;i<intervals;i++){
  const a=min+i*(max-min)/intervals,b=min+(i+1)*(max-min)/intervals;
  const e=(a+b)/2,na=crystalSideTrailNorth(a)!,nb=crystalSideTrailNorth(b)!;
  const n=crystalSideTrailNorth(e)!,angle=Math.atan2(nb-na,b-a),length=Math.hypot(b-a,nb-na);
  for(const side of [-1,1]){
   // Offset outside the actual route; the original light root can
   // interrupt the dressing, but not the continuous supported strip.
   const ne=n+side*(w+.09),y=crystalCavernTrailHeight(ne);
   add(e,ne,y+.085,length+.035,.22,.20,palette[(i+side+5)%5],angle);
   if(i%3===0)add(e+.13,ne,y+.235,.62,.12,.18,palette[(i+2)%5],angle);
  }
 }
 const terminal=crystalSideTrailNorth(min)!;
 for(let i=0;i<5;i++){
  const n=terminal+(i-2)*.66,y=crystalCavernTrailHeight(n);
  add(min-.18,n,y+.40,.4,.8,.72,palette[i%5]);
  add(min-.24,n,y+.86,.35,.20,.64,palette[(i+1)%5]);
 }
 // Terminate the dry trail as a real moonstone observation alcove,
 // not a working mirror or reward trigger. The end stop stays solid.
 // Tall stone shoulders are supported on the existing branch banks;
 // the centre aperture retains an uninterrupted view of the mineral face.
 const alcove:Part[]=[];
 for(const s of [-1,1]){
  const e=min-.24,n=terminal+s*1.47,y=crystalCavernTrailHeight(n);
  for(let k=0;k<4;k++){
   add(e-.03*k,n+s*.03*k,y+.98+k*.34,.48-k*.055,.36,.43,palette[(k+5+s)%5]);alcove.push(parts.at(-1)!);
   add(e+.24-.03*k,n+s*.03*k,y+.98+k*.34,.055,.21,.28,k%2?0x87908a:0x9aa6a1);alcove.push(parts.at(-1)!);
  }
  add(e-.11,n+s*.05,y+2.23,.55,.17,.55,0x777b72);alcove.push(parts.at(-1)!);
 }
 // The displaced decorative group keeps its original count, tilt and
 // root sockets. Add low rock beneath each socket rather than floating
 // roots above the coarse historical ground tiles.
 const sockets=crystalCavernR30Pieces.filter(p=>p.name.startsWith('u3/crystals/48/socket-'));
 for(const [i,p] of sockets.entries()){
  const [e,y,n]=p.center;
  add(e,n,y-.34,.83,.48,.80,palette[i%5],0,false);
  add(e+.08,n+.05,y-.52,.99,.19,.92,palette[(i+2)%5],0,false);
 }
 // Inset mineral veins follow the original rock-bank faces, not a
 // fictitious new partition. Short uneven raised strips break up the
 // regular tiled look without narrowing the surveyed centreline.
 for(const bay of [1,4,7,11,14,18,22]){
  for(const side of [-1,1]){
   const p=crystalCavernR30Pieces.find(p=>p.name==='u3/moonstone-spur/bank-'+bay+'-'+side+'-1');
   if(!p)continue;
   const [e,y,n]=p.center,face=n-side*(p.size[2]/2+.025);
   for(let k=0;k<4;k++){
    const x=e-.48+k*.29,yy=y+(k-1.5)*.095;
    add(x,face,yy,.32,.065+(k%2)*.03,.085,k%2?0x9da6a1:0x7e8b86);
    if(k===1||k===3)add(x,face-side*.013,yy+.22,.075,.37,.075,0x798984);
   }
  }
 }
 const geo=new BoxGeometry(),map=makeCampGrain('rock'),material=new MeshLambertMaterial({map});
 const batches:InstancedMesh[]=[];
 for(let start=-53;start<9;start+=16){
  const list=parts.filter(p=>p.e>=start&&p.e<start+16);if(!list.length)continue;
  const mesh=new InstancedMesh(geo,material,list.length),matrix=new Matrix4(),q=new Quaternion(),col=new Color(),axis=new Vector3(0,1,0);
  list.forEach((p,i)=>{matrix.compose(new Vector3(p.e,p.y,-p.n),q.setFromAxisAngle(axis,p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,col.setHex(p.color))});
  mesh.computeBoundingSphere();group.add(mesh);batches.push(mesh);
 }
 function blocks(e:number,n:number,y:number,r:number,h:number){
  return bounds.some(p=>{
   const de=e-p.e,dn=n-p.n,c=Math.cos(p.angle),s=Math.sin(p.angle),x=de*c+dn*s,z=-de*s+dn*c;
   return p.y+p.h/2>y+.025&&p.y-p.h/2<y+h&&Math.hypot(Math.max(0,Math.abs(x)-p.w/2),Math.max(0,Math.abs(z)-p.d/2))<r;
  });
 }
 return {group,parts,bounds,alcove,blocks,dispose(){group.removeFromParent();batches.forEach(m=>m.dispose());geo.dispose();map.dispose();material.dispose();group.clear()}};
}
