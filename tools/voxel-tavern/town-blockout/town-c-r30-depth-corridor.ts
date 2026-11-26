import {BufferGeometry,BufferAttribute,DoubleSide,Group,Mesh,MeshLambertMaterial,BoxGeometry,InstancedMesh,Matrix4,Color,Vector3,Quaternion,RepeatWrapping} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {r30LinkPoint,r30LinkPassage,type R30DepthLink} from './town-c-r30-deep-layer-contract.js';
/** Continuous enclosed sloping tunnel from the C-owned receiving-foot
 * contract. Mount only after the host has validated both endpoint shells.
 * No automatic teleport, new movement rule, or water clock. */
export function mountR30DepthCorridor(parent:Group,link:R30DepthLink,acceptsEndpoints:()=>boolean){
 if(!acceptsEndpoints())return {kind:'unregistered-endpoints'} as const;
 const group=new Group();group.name='r30-depth-corridor/'+link.id;
 const coords:number[]=[0,link.landingRun];
 for(let t=link.landingRun+2;t<link.length-link.landingRun;t+=2)coords.push(t);
 coords.push(link.length-link.landingRun,link.length);
 const arrays={floor:[] as number[],rock:[] as number[]},uvs={floor:[] as number[],rock:[] as number[]};
 const half=link.width/2;
 function p(t:number,l:number,y=0){const w=r30LinkPoint(link,t,l)!;return [w.east-link.start.east,w.height-link.start.height+y,-w.north+link.start.north] as const;}
 function quad(key:keyof typeof arrays,a:readonly number[],b:readonly number[],c:readonly number[],d:readonly number[],u0:number,u1:number,v0:number,v1:number){
  arrays[key].push(...a,...b,...c,...a,...c,...d);
  uvs[key].push(u0,v0,u0,v1,u1,v1,u0,v0,u1,v1,u1,v0);
 }
 for(let i=1;i<coords.length;i++){
  const a=coords[i-1],b=coords[i];
  quad('floor',p(a,-half),p(b,-half),p(b,half),p(a,half),0,link.width/2,a/2,b/2);
  quad('rock',p(a,-half,-.25),p(b,-half,-.25),p(b,-half,link.clearance),p(a,-half,link.clearance),0,2,a/2,b/2);
  quad('rock',p(a,half,link.clearance),p(b,half,link.clearance),p(b,half,-.25),p(a,half,-.25),0,2,a/2,b/2);
  quad('rock',p(a,half,link.clearance),p(b,half,link.clearance),p(b,-half,link.clearance),p(a,-half,link.clearance),0,link.width/2,a/2,b/2);
  quad('rock',p(a,half,-.25),p(b,half,-.25),p(b,-half,-.25),p(a,-half,-.25),0,link.width/2,a/2,b/2);
 }
 const resources:(()=>void)[]=[];
 for(const key of ['floor','rock'] as const){
  const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(Float32Array.from(arrays[key]),3));g.setAttribute('uv',new BufferAttribute(Float32Array.from(uvs[key]),2));g.computeVertexNormals();
  const map=makeCampGrain('rock');map.wrapS=map.wrapT=RepeatWrapping;
  const m=new MeshLambertMaterial({map,color:key==='floor'?0x65676b:0x343940,side:DoubleSide});
  const mesh=new Mesh(g,m);mesh.name='depth-link-'+key;group.add(mesh);
  resources.push(()=>{g.dispose();m.dispose();map.dispose()});
 }
 // Sparse ribbed timber/iron frames are overhead or flush with the sides,
 // so the support query's full standing width stays honest.
 const braces:{pos:readonly [number,number,number];size:readonly [number,number,number];color:number}[]=[];
 const e=(link.end.east-link.start.east)/link.length,n=(link.end.north-link.start.north)/link.length;
 for(let t=4;t<link.length-3;t+=7){
  const h=link.clearance;
  braces.push({pos:p(t,0,h-.13),size:[link.width,.26,.22],color:0x70543e});
  for(const s of [-1,1])braces.push({pos:p(t,s*(half-.055),h-.34),size:[.10,.46,.25],color:0x80563d});
 }
 const box=new BoxGeometry(),map=makeCampGrain('wood'),mat=new MeshLambertMaterial({map}),batch=new InstancedMesh(box,mat,braces.length);
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.atan2(-n,e)+Math.PI/2);
 const mx=new Matrix4(),color=new Color();
 braces.forEach((b,i)=>{mx.compose(new Vector3(...b.pos),q,new Vector3(...b.size));batch.setMatrixAt(i,mx);batch.setColorAt(i,color.setHex(b.color))});
 batch.computeBoundingSphere();group.add(batch);
 group.position.set(link.start.east,link.start.height,-link.start.north);
 parent.add(group);let disposed=false;
 return {kind:'ready',group,link,passageAt:(east:number,north:number,radius=.27,height=1.8)=>disposed?undefined:r30LinkPassage(link,east,north,radius,height),
  dispose(){if(disposed)return;disposed=true;group.removeFromParent();resources.forEach(f=>f());batch.dispose();box.dispose();map.dispose();mat.dispose();}} as const;
}
