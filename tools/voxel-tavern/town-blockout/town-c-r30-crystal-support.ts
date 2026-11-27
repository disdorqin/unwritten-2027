import {BufferGeometry,BufferAttribute,DoubleSide,Group,Mesh,MeshLambertMaterial,RepeatWrapping} from 'three';
import {crystalCavernR30Pieces,crystalCavernPlan,crystalCavernTrailEast,crystalCavernTrailHeight,crystalCavernToWorld,type CrystalCavernFrame,type CrystalCavernPoint} from './underground-crystal-cavern.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {r30GateSwitchBlocks} from './underground-crystal-gate.js';
export const r30CrystalDomain='underground/crystal';
export const r30CrystalMouth=Object.freeze({north:-10.5,threshold:-9.9,halfWidth:2});
export const r30CrystalReturnSwitch=Object.freeze({east:1.45,north:-7.8,height:crystalCavernPlan.entry.height});
const half=crystalCavernPlan.pathWidth/2,quayN=76,quayH=crystalCavernTrailHeight(quayN);
const quayLeft=crystalCavernTrailEast(quayN)+2,quayRight=34;
const width=(n:number)=>n<=-7?2:n>=-3?half:2+(half-2)*(n+7)/4;
// Exact strip used by both the rendered floor and the capsule query.
// Short local deviation passes the original attached light roots.
export const r30CrystalSideTrail=Object.freeze({minEast:-51.2,maxEast:10.2,halfWidth:1.65});
const sideKnots=Array.from({length:124},(_,i)=>{
 const e=r30CrystalSideTrail.minEast+(r30CrystalSideTrail.maxEast-r30CrystalSideTrail.minEast)*i/123;
 const centre=e>=-17?56:56+Math.sin((-17-e)/7)*1.3;
 const offset=e<=-26&&e>=-32?Math.min(1,Math.max(0,(-26-e)/1.9),Math.max(0,(e+32)/.75)):0;
 return {e,n:centre+offset};
});
export function crystalSideTrailNorth(e:number){
 if(!Number.isFinite(e)||e<r30CrystalSideTrail.minEast||e>r30CrystalSideTrail.maxEast)return;
 const t=(e-r30CrystalSideTrail.minEast)/(r30CrystalSideTrail.maxEast-r30CrystalSideTrail.minEast)*123,i=Math.min(122,Math.floor(t)),a=sideKnots[i],b=sideKnots[i+1];
 return a.n+(b.n-a.n)*(t-i);
}
export function crystalRouteFloor(e:number,n:number){
 if(![e,n].every(Number.isFinite))return;
 const main=n>=r30CrystalMouth.north&&n<=98.9&&Math.abs(e-crystalCavernTrailEast(n))<=width(n)?crystalCavernTrailHeight(n):undefined;
 const quay=e>=quayLeft&&e<=quayRight&&Math.abs(n-quayN)<=1.8?quayH:undefined;
 const sideCentre=crystalSideTrailNorth(e);
 const side=sideCentre!==undefined&&Math.abs(n-sideCentre)<=r30CrystalSideTrail.halfWidth?crystalCavernTrailHeight(n):undefined;
 const floors=[main,quay,side].filter((v):v is number=>v!==undefined);
 return floors.length?Math.max(...floors):undefined;
}
// Include the tall visible non-solid decorations too, not just the former
// structural colliders. Rotated crystals use conservative actual AABBs.
const solids=crystalCavernR30Pieces.filter(b=>b.solid||b.size[1]>=.45||b.name.includes('/socket-')).map(b=>{
 const [x,y,n]=b.center,[w,h,d]=b.size,c=Math.abs(Math.cos(b.rotationZ)),s=Math.abs(Math.sin(b.rotationZ));
 return {x,y,n,dx:(c*w+s*h)/2,dy:(s*w+c*h)/2,dz:d/2};
});
export function crystalRoutePassage(e:number,n:number,radius=.27,height=1.8){
 if(![e,n,radius,height].every(Number.isFinite)||radius<=0||height<=0||height>2.1)return;
 const floor=crystalRouteFloor(e,n);if(floor===undefined)return;
 for(let k=0;k<16;k++){
  const a=k*Math.PI/8,y=crystalRouteFloor(e+radius*Math.cos(a),n+radius*Math.sin(a));
  if(y===undefined||Math.abs(y-floor)>.12)return;
 }
 if(solids.some(b=>b.y+b.dy>floor+.04&&b.y-b.dy<floor+height&&
  Math.hypot(Math.max(0,Math.abs(e-b.x)-b.dx),Math.max(0,Math.abs(n-b.n)-b.dz))<radius))return;
 if(r30GateSwitchBlocks(e-r30CrystalReturnSwitch.east,floor-r30CrystalReturnSwitch.height,r30CrystalReturnSwitch.north-n,radius,height))return;
 return {floor,clearance:2.1,waterDepth:0,requiresCrouch:false,encounter:false,zone:'crystal-route' as const};
}
export function crystalLocal(frame:CrystalCavernFrame,p:CrystalCavernPoint){
 const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw),e=p.east-frame.east,n=p.north-frame.north;
 return {east:e*c+n*s,north:-e*s+n*c,height:p.height-frame.height};
}
export function makeR30CrystalFrame(toWorld:(local:readonly [number,number,number])=>CrystalCavernPoint|undefined,yaw:number):CrystalCavernFrame|undefined{
 const base=toWorld([0,-91,150.5]);
 if(!base||![base.east,base.north,base.height,yaw].every(Number.isFinite))return;
 return Object.freeze({...base,height:base.height-crystalCavernPlan.entry.height,yaw:yaw+Math.PI,domainId:r30CrystalDomain});
}
export function crystalThreshold(frame:CrystalCavernFrame){
 return crystalCavernToWorld(frame,[0,crystalCavernPlan.entry.height,r30CrystalMouth.threshold]);
}
export function mountR30CrystalSupport(parent:Group){
 const group=new Group();group.name='r30-crystal-continuous-spine';
 const vertices:number[]=[],uv:number[]=[],subgrade:number[]=[],subgradeUV:number[]=[];
 const depth=.72;
 function subQuad(a:number[],b:number[],c:number[],d:number[]){
  const len=(p:number[],q:number[])=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
  const u=len(a,b)/2,v=len(a,d)/2;
  subgrade.push(...a,...b,...c,...a,...c,...d);subgradeUV.push(0,0,u,0,u,v,0,0,u,v,0,v);
 }
 function quad(a:number[],b:number[],c:number[],d:number[]){
  for(const v of [a,b,c,a,c,d]){vertices.push(...v);uv.push(v[0]/2,-v[2]/2)}
 }
 const knots=[-10.5,-7,-3,1,23,40,55,73,98,98.9];
 for(let i=1;i<knots.length;i++){
  const a=knots[i-1],b=knots[i],x=crystalCavernTrailEast(a),z=crystalCavernTrailEast(b),h=crystalCavernTrailHeight(a),j=crystalCavernTrailHeight(b);
  quad([x-width(a),h,-a],[x+width(a),h,-a],[z+width(b),j,-b],[z-width(b),j,-b]);
 }
 quad([quayLeft,quayH,-(quayN-1.8)],[quayRight,quayH,-(quayN-1.8)],[quayRight,quayH,-(quayN+1.8)],[quayLeft,quayH,-(quayN+1.8)]);
 // Clip the branch before the actual west edge of the main spine.
 // Its union has a shared seam rather than overlapping coplanar faces.
 const joinE=6.5,branchKnots=[...sideKnots.filter(p=>p.e<joinE),{e:joinE,n:crystalSideTrailNorth(joinE)!}];
 for(let i=1;i<branchKnots.length;i++){
  const a=branchKnots[i-1],b=branchKnots[i],w=r30CrystalSideTrail.halfWidth;
  const an=a.n-w,ap=a.n+w,bn=b.n-w,bp=b.n+w;
  const A=[a.e,crystalCavernTrailHeight(an),-an],B=[b.e,crystalCavernTrailHeight(bn),-bn],C=[b.e,crystalCavernTrailHeight(bp),-bp],D=[a.e,crystalCavernTrailHeight(ap),-ap];
  quad(A,B,C,D);
  const low=(p:number[])=>[p[0],p[1]-depth,p[2]];
  subQuad(A,low(A),low(B),B);subQuad(D,C,low(C),low(D));
  subQuad(low(A),low(D),low(C),low(B));
  if(i===1)subQuad(A,D,low(D),low(A));
 }
 const joinN=[56-r30CrystalSideTrail.halfWidth,55,56+r30CrystalSideTrail.halfWidth];
 for(let i=1;i<joinN.length;i++){
  const a=joinN[i-1],b=joinN[i],y=crystalCavernTrailHeight(a),h=crystalCavernTrailHeight(b);
  const A=[joinE,y,-a],B=[crystalCavernTrailEast(a)-half,y,-a],C=[crystalCavernTrailEast(b)-half,h,-b],D=[joinE,h,-b],low=(p:number[])=>[p[0],p[1]-depth,p[2]];
  quad(A,B,C,D);subQuad(low(A),low(D),low(C),low(B));
  if(i===1)subQuad(A,low(A),low(B),B);
  if(i===joinN.length-1)subQuad(D,C,low(C),low(D));
 }
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(Float32Array.from(vertices),3));g.setAttribute('uv',new BufferAttribute(Float32Array.from(uv),2));g.computeVertexNormals();
 const map=makeCampGrain('rock');map.wrapS=map.wrapT=RepeatWrapping;
 const m=new MeshLambertMaterial({map,color:0x68625b,side:DoubleSide});
 const mesh=new Mesh(g,m);mesh.name='r30-crystal-route-floor';group.add(mesh);
 const sg=new BufferGeometry();sg.setAttribute('position',new BufferAttribute(Float32Array.from(subgrade),3));sg.setAttribute('uv',new BufferAttribute(Float32Array.from(subgradeUV),2));sg.computeVertexNormals();
 const sm=new MeshLambertMaterial({map,color:0x505550});
 const bed=new Mesh(sg,sm);bed.name='r30-crystal-side-trail-subgrade';group.add(bed);
 // Enclosed short mouth aligned with actual mine end. It opens into the
 // already modeled chamber, rather than leaving a hole into void.
 const walls:number[]=[],wallUV:number[]=[];
 for(const side of [-1,1]){
  const a=[side*2,crystalCavernPlan.entry.height,10.5],b=[side*2,crystalCavernPlan.entry.height,7],c=[side*2,crystalCavernPlan.entry.height+3.5,7],d=[side*2,crystalCavernPlan.entry.height+3.5,10.5];
  walls.push(...a,...b,...c,...a,...c,...d);wallUV.push(0,0,1,0,1,1,0,0,1,1,0,1);
 }
 const y=crystalCavernPlan.entry.height+3.5;
 walls.push(-2,y,10.5,2,y,10.5,2,y,7,-2,y,10.5,2,y,7,-2,y,7);wallUV.push(0,0,1,0,1,1,0,0,1,1,0,1);
 const wg=new BufferGeometry();wg.setAttribute('position',new BufferAttribute(Float32Array.from(walls),3));wg.setAttribute('uv',new BufferAttribute(Float32Array.from(wallUV),2));wg.computeVertexNormals();
 const wm=new MeshLambertMaterial({map,color:0x343940,side:DoubleSide});
 group.add(new Mesh(wg,wm));parent.add(group);
 return {group,mesh,dispose(){group.removeFromParent();g.dispose();sg.dispose();wg.dispose();m.dispose();sm.dispose();wm.dispose();map.dispose()}};
}
/** Remove the actual closing face only, never the existing gate leaf.
 * Refuses a different wall or any partially overlapping triangle. */
export function cutR30CrystalEndWall(source:Float32Array){
 let removed=0;const out:number[]=[];
 for(let i=0;i<source.length;i+=9){
  const t=Array.from(source.slice(i,i+9));
  if([t[2],t[5],t[8]].every(z=>Math.abs(z-140)<1e-5)&&
    [t[0],t[3],t[6]].every(x=>Math.abs(x)<=2.00001)&&
    [t[1],t[4],t[7]].every(y=>y>=-91.00001&&y<=-87.49999)){
   removed+=Math.abs((t[3]-t[0])*(t[7]-t[1])-(t[6]-t[0])*(t[4]-t[1]))/2;
  }else out.push(...t);
 }
 return Math.abs(removed-14)<.001?{kind:'ready' as const,vertices:Float32Array.from(out),removed}:{kind:'unsupported-wall' as const,removed};
}
