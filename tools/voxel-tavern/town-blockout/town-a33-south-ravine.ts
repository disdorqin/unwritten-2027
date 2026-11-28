import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D} from 'three';
import {makeFrontRidgePixelTexture} from './town-front-ridge-surface';
import {southGullyNorth,type SouthGround,type SouthProtection} from './town-night-a-summit-landform';
import {finishNightBAudit} from './town-night-b-audit-slices';
type Piece={e:number;n:number;y:number;w:number;d:number;h:number;yaw:number;color:string};
const random=(i:number)=>{const x=Math.sin(i*79.13+17.4)*43758.5453;return x-Math.floor(x);};
const width=(e:number)=>8+2.8*Math.sin(e*.034)+1.5*Math.sin(e*.071);
/** Solid fractured shelves on the OUTSIDE of the frozen bed. The D2 ground
 * remains the only terrain; each ledge's body is exactly the rendered rotated
 * box. No synthetic ground, invented support or change to any road datum. */
export function* southRavineSteps(ground:SouthGround,reserved:SouthProtection){
 const group=new Group();group.name='a33-south-ravine-rocks';
 group.userData={owner:'A33-2-ravine-rocks',revision:1,bounds:{west:-620,east:124,south:182,north:448},static:true};
 const bins=new Map<string,Piece[]>(),sites:{e:number;n:number;r:number}[]=[];
 const pieces:Piece[]=[];let ledges=0,chips=0;
 function accept(e:number,n:number,w:number,d:number,yaw:number,rise:number,major:boolean){
  const r=Math.hypot(w,d)/2+.25;
  if(e-r< -620||e+r>124||n-r<182||n+r>448||Math.abs(n-southGullyNorth(e))<width(e)+3+r)return false;
  if(sites.some(s=>Math.hypot(s.e-e,s.n-n)<s.r+r+.65))return false;
  const samples=[...Array.from({length:16},(_,i)=>[e+r*Math.cos(i*Math.PI/8),n+r*Math.sin(i*Math.PI/8)] as const),[e,n] as const];
  if(samples.some(([x,z])=>reserved(x,z)||Math.abs(z-southGullyNorth(x))>23.5))return false;
  const hs=samples.map(([x,z])=>ground(x,z));if(hs.some(h=>h===undefined||!Number.isFinite(h)))return false;
  const low=Math.min(...hs as number[]),high=Math.max(...hs as number[]);
  if(high-low>(major?4.8:1.4))return false;
  const h=high-low+rise,base=low-.08,k=Math.floor(e/96)+','+Math.floor(n/96),bin=bins.get(k)??[];bins.set(k,bin);
  function add(de:number,dn:number,bottom:number,ww:number,dd:number,hh:number,color:string){
   const q={e:e+de*Math.cos(yaw)-dn*Math.sin(yaw),n:n+de*Math.sin(yaw)+dn*Math.cos(yaw),y:bottom,w:ww,d:dd,h:hh,yaw,color};
   bin.push(q);pieces.push(q);
  }
  add(0,0,base,w,d,h*.52,'#6c6256');
  add(w*.018,0,base+h*.52,w*.91,d*.84,h*.26,'#a28b70');
  add(-w*.055,d*.045,base+h*.78,w*.70,d*.72,h*.22,'#777d7b');
  add(-w*.055,d*.045,base+h,w*.64,d*.66,.13,'#cbd9df');
  sites.push({e,n,r});if(major)ledges++;else chips++;return true;
 }
 // Outcrops occur in separated exposed bank lenses, never evenly spaced
 // along both banks. Preserve the real ice trough and road reservations.
 for(let e=-606;e<111;e+=5){
  yield;
  for(const side of [-1,1]){
   const i=e*3+side,cluster=.5+.5*Math.sin(e*.021+side*1.7);
   if(random(i)>.35+.58*cluster)continue;
   const major=random(i+1)>.42,n=southGullyNorth(e)+side*(width(e)+7.8+random(i+2)*3.1);
   const w=major?2.2+2.4*random(i+3):.65+random(i+3),d=w*(.52+.22*random(i+4));
   accept(e,n,w,d,.2+.55*Math.sin(e*.05+side),major?.8+1.6*random(i+5):.35+.55*random(i+5),major);
  }
 }
 const geo=new BoxGeometry(),texture=makeFrontRidgePixelTexture(),mat=new MeshLambertMaterial({map:texture});
 const obj=new Object3D(),color=new Color();
 let done=false;
 try{
 for(const [k,items] of bins){
  yield;
  const mesh=new InstancedMesh(geo,mat,items.length);mesh.name='south-ravine:'+k;
  mesh.userData={chunkId:'summit/A/ravine/'+k,static:true};
  items.forEach((q,i)=>{obj.position.set(q.e,q.y+q.h/2,-q.n);obj.rotation.set(0,q.yaw,0);obj.scale.set(q.w,q.h,q.d);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,color.set(q.color));});
  mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
 }
 done=true;
 }finally{if(!done){group.clear();geo.dispose();texture.dispose();mat.dispose();}}
 let disposed=false;
 function blocked(e:number,n:number,feet:number,r=.27,body=1.8){
  if(disposed)return false;
  const ex=Math.floor(e/96),nn=Math.floor(n/96);
  for(let x=ex-1;x<=ex+1;x++)for(let z=nn-1;z<=nn+1;z++)for(const q of bins.get(x+','+z)??[]){
   if(feet+.025>=q.y+q.h||feet+body-.025<=q.y)continue;
   const de=e-q.e,dn=n-q.n,c=Math.cos(q.yaw),s=Math.sin(q.yaw);
   const u=de*c+dn*s,v=-de*s+dn*c;
   if(Math.hypot(Math.max(0,Math.abs(u)-q.w/2),Math.max(0,Math.abs(v)-q.d/2))<r)return true;
  }
  return false;
 }
 return {group,pieces,stats:{ledges,chips,parts:pieces.length,chunks:bins.size},blocked,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const m of group.children)(m as InstancedMesh).dispose();group.clear();bins.clear();pieces.length=0;geo.dispose();texture.dispose();mat.dispose();}};
}
export function mountSouthRavine(ground:SouthGround,reserved:SouthProtection){return finishNightBAudit(southRavineSteps(ground,reserved));}
