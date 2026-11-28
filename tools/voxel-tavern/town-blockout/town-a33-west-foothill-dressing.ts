import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D} from 'three';
import {makeFrontRidgePixelTexture} from './town-front-ridge-surface';
import {a33WestTrailDistance} from './town-a33-west-foothill';
import type {Box} from './landmark-kit';
import type {SouthGround,SouthProtection} from './town-night-a-summit-landform';
type Part={box:Box;color:string};
const random=(i:number)=>{const v=Math.sin(i*71.37+19.1)*43758.5453;return v-Math.floor(v);};
const boxGap=(e:number,n:number,b:Box)=>Math.hypot(Math.max(b.min[0]!-e,e-b.max[0]!,0),Math.max(b.min[2]!+n,-n-b.max[2]!,0));
/** Real rooted trees, exposed rocks and resting points along the new
 * A-owned walking lane. Every solid is its exact visible box. No fake
 * ground or collision envelopes, no asset in B's crater or rail corridor. */
export function mountA33WestFoothillDressing(ground:SouthGround,protectedAt:SouthProtection,existing:readonly Box[]=[]){
 const group=new Group();group.name='a33-west-foothill-dressing';
 group.userData={owner:'A33-1-west-foothill-dressing',revision:1,bounds:{west:-218,east:-69,south:357,north:536},static:true};
 const chunks=new Map<number,Part[]>(),solids:Box[]=[],sites:{east:number;north:number;radius:number}[]=[];
 let trees=0,rocks=0,rests=0;
 function put(e:number,n:number,bottom:number,w:number,d:number,h:number,color:string){
  const box={min:[e-w/2,bottom,-n-d/2],max:[e+w/2,bottom+h,-n+d/2]};
  const k=Math.floor(n/48),list=chunks.get(k)??[];list.push({box,color});chunks.set(k,list);solids.push(box);
 }
 function seat(e:number,n:number,r:number,clearance:number,maxRelief:number){
  if(e-r< -218||e+r> -69||n-r<357||n+r>536||a33WestTrailDistance(e,n)<r+clearance)return;
  if(sites.some(p=>Math.hypot(e-p.east,n-p.north)<p.radius+r+.5))return;
  if(existing.some(b=>boxGap(e,n,b)<r+.5))return;
  const points=[...Array.from({length:8},(_,i)=>[e+Math.cos(i*Math.PI/4)*r,n+Math.sin(i*Math.PI/4)*r] as const),[e,n] as const];
  if(points.some(([x,z])=>protectedAt(x,z)))return;
  const hs=points.map(([x,z])=>ground(x,z));if(hs.some(h=>h===undefined||!Number.isFinite(h)))return;
  const low=Math.min(...hs as number[]),high=Math.max(...hs as number[]);if(high-low>maxRelief)return;
  sites.push({east:e,north:n,radius:r});return {low,high};
 }
 const greens=['#344638','#44503c','#52634a','#3d5546'];
 // Separated groves on the sheltered shoulders. No uniform scatter over
 // the whole snowfield; preserve the rocky ridge views from the trail.
 for(const [g,[ce,cn,re,rn]] of [[-141,388,31,25],[-174,461,30,40],[-128,505,22,20]].entries()){
  for(let i=0;i<58;i++){
   const seed=g*100+i,angle=random(seed*3+1)*Math.PI*2,rad=Math.sqrt(random(seed*3+2));
   const e=ce!+Math.cos(angle)*re!*rad,n=cn!+Math.sin(angle)*rn!*rad;
   const height=5.4+random(seed*3+3)*3.5,r=height*.31;
   const pad=seat(e,n,r,3.2,2.4);if(!pad)continue;
   const {low,high}=pad,trunk=.40+random(seed+400)*.22,top=high+height;
   put(e,n,low-.10,trunk,trunk,top-low+.1,'#5d4630');
   const start=high+2.35,dy=(top-start)/4;
   for(let t=0;t<4;t++){
    const w=height*(.53-.092*t),h=dy*.88,base=start+t*dy;
    put(e,n,base,w,w*.70,h,greens[(seed+t)%4]!);
    put(e,n,base,w*.70,w,h,greens[(seed+t+1)%4]!);
    put(e,n,base+h,w*.71,w*.66,.14,'#d4e1e5');
   }trees++;
  }
 }
 for(const [g,[ce,cn,re,rn]] of [[-192,416,21,42],[-159,479,22,35],[-118,437,10,35]].entries()){
  for(let i=0;i<40;i++){
   const seed=500+g*100+i,angle=random(seed*3)*Math.PI*2,rad=Math.sqrt(random(seed*3+1));
   const e=ce!+Math.cos(angle)*re!*rad,n=cn!+Math.sin(angle)*rn!*rad,w=.8+random(seed*3+2)*2.4,d=w*.69;
   const pad=seat(e,n,Math.hypot(w,d)*.55,2.6,1.8);if(!pad)continue;
   const rise=.5+random(seed+600)*1.1,h=pad.high-pad.low+rise,base=pad.low-.04;
   put(e,n,base,w,d,h*.52,'#695c4d');
   put(e+w*.025,n,base+h*.52,w*.91,d*.85,h*.31,'#a38b6c');
   put(e-w*.065,n+d*.06,base+h*.83,w*.70,d*.62,h*.17,'#7a7c76');
   put(e-w*.065,n+d*.06,base+h,w*.64,d*.55,.12,'#cbd8df');rocks++;
  }
 }
 // Grounded rest seats on the path's eastern side, outside the walking
 // envelope. Foundations span the actual low/high foot samples.
 for(const [e,n] of [[-85,374],[-95,425],[-77,508],[-77,526]]){
  const pad=seat(e!,n!,1.7,2.1,.48);if(!pad)continue;
  const h=pad.high+.52;
  for(const de of [-.86,.86])put(e!+de,n!,pad.low-.02,.21,.54,h-pad.low+.02,'#706a60');
  put(e!,n!,h,2.18,.63,.14,'#856444');
  put(e!,n!+.26,h+.14,2.18,.14,.55,'#5d4630');
  rests++;
 }
 const geometry=new BoxGeometry(),texture=makeFrontRidgePixelTexture(),material=new MeshLambertMaterial({map:texture});
 const transform=new Object3D(),color=new Color();
 for(const [k,parts] of chunks){
  const mesh=new InstancedMesh(geometry,material,parts.length);mesh.name='a33-west-foothill-dressing:'+k;
  mesh.userData={chunkId:'town/A/west-foothill/'+k,static:true};
  for(const [i,{box:b,color:t}] of parts.entries()){
   transform.position.set((b.min[0]!+b.max[0]!)/2,(b.min[1]!+b.max[1]!)/2,(b.min[2]!+b.max[2]!)/2);
   transform.scale.set(b.max[0]!-b.min[0]!,b.max[1]!-b.min[1]!,b.max[2]!-b.min[2]!);transform.updateMatrix();
   mesh.setMatrixAt(i,transform.matrix);mesh.setColorAt(i,color.set(t));
  }
  mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
 }
 group.userData.colliders=solids;
 let disposed=false;
 return {group,solids,stats:{trees,rocks,rests,parts:solids.length,chunks:chunks.size},dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const child of group.children)(child as InstancedMesh).dispose();group.clear();geometry.dispose();material.dispose();texture.dispose();solids.length=0;}};
}
