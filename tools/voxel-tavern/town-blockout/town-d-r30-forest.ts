import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Object3D} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {northRidgeCableAnchors,northRidgeNorthWall} from './north-ridge-350-terrain';

type P={east:number;north:number};
type Kind='pine'|'flagpine'|'shrub'|'rock';
export type RidgeForestPlacement=P&{height:number;kind:Kind;scale:number;yaw:number;radius:number};
type Clearance=(e:number,n:number,radius:number)=>boolean;
const seedHash=(i:number)=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)};
const cable=northRidgeCableAnchors;
function distanceToSegment(e:number,n:number,a:P,b:P){
 const dx=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((e-a.east)*dx+(n-a.north)*dn)/(dx*dx+dn*dn||1)));
 return Math.hypot(e-a.east-t*dx,n-a.north-t*dn);
}
export function ridgeForestRouteClearance(routes:readonly (readonly P[])[]):Clearance{
 return (e,n,r)=>routes.every(points=>points.every((a,i)=>i===0||distanceToSegment(e,n,points[i-1]!,a)>=8+r));
}
const pads=[{east:526,north:329,w:19,d:16},{east:440,north:520,w:20,d:17},{east:336,north:640,w:36,d:34}];
/** Same support field as the R01 mesh. Caller supplies a certified route/
 * land-use exclusion; no default that silently ignores protected paths. */
export function planRidgeForest(field:FrontRidgeR30Field,clear:Clearance){
 const placements:RidgeForestPlacement[]=[];
 let seed=0;const rand=()=>seedHash(++seed);
 const spacing=new Map<string,RidgeForestPlacement[]>();
 const cell=8,cellKey=(e:number,n:number)=>Math.floor(e/cell)+','+Math.floor(n/cell);
 function place(e:number,n:number,kind:Kind,scale:number){
   const height=field.heightAt(e,n);if(height===undefined||height<22)return;
   const radius=(kind==='pine'?2.8:kind==='flagpine'?2.5:kind==='shrub'?1.3:1.5)*scale;
   if(e-radius<2||e+radius>638||n-radius<272||n+radius>798)return;
   if(pads.some(p=>Math.abs(e-p.east)<p.w+radius&&Math.abs(n-p.north)<p.d+radius))return;
   if(e>northRidgeNorthWall.west-radius&&e<northRidgeNorthWall.east+radius&&n>northRidgeNorthWall.south-radius&&n<northRidgeNorthWall.north+radius)return;
   if(cable.slice(1).some((b,i)=>distanceToSegment(e,n,{east:cable[i]![0],north:cable[i]![1]},{east:b[0],north:b[1]})<10+radius))return;
   if(!clear(e,n,radius))return;
   if(kind==='pine'&&height>=125||kind==='flagpine'&&(height<100||height>=205)||kind==='shrub'&&height>=228)return;
   const gx=Math.round(e),gn=Math.round(n),index=(gn-270)*field.width+gx;
   if(field.weights[index]!<.30)return;
   const offsets=[[radius,0],[-radius,0],[0,radius],[0,-radius]] as const;
   const slope=Math.max(...offsets.map(([dx,dn])=>Math.abs((field.heightAt(e+dx,n+dn)??Infinity)-height)/radius));
   if(slope>(kind==='rock'?.92:kind==='shrub'?.65:.60))return;
   const cx=Math.floor(e/cell),cn=Math.floor(n/cell);
   for(let dx=-2;dx<=2;dx++)for(let dn=-2;dn<=2;dn++)for(const p of spacing.get((cx+dx)+','+(cn+dn))??[]){
     if(Math.hypot(e-p.east,n-p.north)<(p.radius+radius)*.85)return;
   }
   const p={east:e,north:n,height,kind,scale,yaw:rand()*Math.PI*2,radius};
   placements.push(p);const k=cellKey(e,n),list=spacing.get(k)??[];list.push(p);spacing.set(k,list);
 }
 // Clusters are chosen by the actual terrain's elevation and slope, not
 // by a radial projection on the obsolete elliptical cone.
 for(let i=0;i<1250;i++){
   const ce=30+rand()*580,cn=305+rand()*465,h=field.heightAt(ce,cn)??0;
   const kind:Kind=h<112?'pine':h<192?'flagpine':h<225?'shrub':'rock';
   const count=kind==='pine'?15:kind==='flagpine'?9:kind==='shrub'?6:3;
   const spread=kind==='pine'?24:kind==='flagpine'?18:12;
   for(let j=0;j<count;j++){
     const a=rand()*Math.PI*2,r=Math.sqrt(rand())*spread;
     place(ce+Math.cos(a)*r,cn+Math.sin(a)*r,kind,.65+rand()*.65);
   }
 }
 return placements;
}
type Part={x:number;y:number;z:number;w:number;h:number;d:number;shade:string;yaw?:number};
const box=(x:number,y:number,z:number,w:number,h:number,d:number,shade:string,yaw=0):Part=>({x,y,z,w,h,d,shade,yaw});
function prototype(kind:Kind):Part[]{
 const a:Part[]=[];
 if(kind==='pine'||kind==='flagpine'){
   const wind=kind==='flagpine'?.23:0,levels=kind==='pine'?5:4;
   a.push(box(0,1.65,0,.43,3.3,.43,'#594637'));
   for(let j=0;j<levels;j++){
     const y=2.25+j*1.0,w=2.25-j*.38,shift=j*wind;
     a.push(box(shift,y,0,w*1.35,.62,w*.78,j%2?'#425841':'#354b37',j*.3));
     a.push(box(shift,y+.25,0,w*.78,.73,w*1.35,'#526449',j*.3));
     for(const side of [-1,1]){
       a.push(box(shift+side*w*.60,y-.17,0,w*.50,.32,w*.55,'#3c503b'));
       a.push(box(shift+side*w*.60,y+.012,0,w*.40,.08,w*.43,'#c4d4d8'));
     }
     a.push(box(shift,y+.64,0,w*.63,.09,w*.70,'#d1dce0',j*.3));
   }
   a.push(box(levels*wind,2.3+levels,0,.55,.94,.60,'#53644e'));
 }else if(kind==='shrub'){
   a.push(box(0,.24,0,1.4,.46,1.2,'#536247',.3),box(.48,.51,.25,.8,.55,.9,'#667658',.2),box(-.36,.52,-.25,.75,.65,.75,'#475a44'),box(.46,.82,.25,.62,.10,.62,'#d1dadc'));
 }else{
   a.push(box(0,.38,0,1.8,.92,1.6,'#737870',.35),box(.2,1.01,-.1,1.24,.43,1.1,'#969991',.35),box(-.61,.32,.37,.7,.66,.75,'#5d655e',-.3),box(.23,1.26,-.1,1.02,.13,.85,'#d2dce0',.35));
 }
 return a;
}
/** Shared geometry/material, spatial 64m instance batches. Only the scene
 * host decides when the placements and conservative footprint collision
 * are enabled; no authority or terrain is mutated. */
export function mountRidgeForest(field:FrontRidgeR30Field,clear:Clearance){
 const placements=planRidgeForest(field,clear),group=new Group();group.name='town-d-r30-forest';
 const geo=new BoxGeometry(),material=new MeshLambertMaterial({color:'#ffffff'}),tmp=new Object3D(),parent=new Matrix4(),matrix=new Matrix4(),tint=new Color();
 const chunks=new Map<string,RidgeForestPlacement[]>();
 for(const p of placements){const k=Math.floor(p.east/64)+','+Math.floor(p.north/64);const list=chunks.get(k)??[];list.push(p);chunks.set(k,list)}
 const shapes={pine:prototype('pine'),flagpine:prototype('flagpine'),shrub:prototype('shrub'),rock:prototype('rock')};
 const batches:InstancedMesh[]=[];
 for(const [k,list] of chunks){
   const count=list.reduce((s,p)=>s+shapes[p.kind].length,0);
   const mesh=new InstancedMesh(geo,material,count);mesh.name='ridge-forest-'+k;let i=0;
   for(const p of list){
     tmp.position.set(p.east,p.height-.14,-p.north);tmp.rotation.set(0,p.yaw,0);tmp.scale.setScalar(p.scale);tmp.updateMatrix();parent.copy(tmp.matrix);
     for(const b of shapes[p.kind]){
       tmp.position.set(b.x,b.y,b.z);tmp.rotation.set(0,b.yaw??0,0);tmp.scale.set(b.w,b.h,b.d);tmp.updateMatrix();matrix.multiplyMatrices(parent,tmp.matrix);
       mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,tint.set(b.shade));i++;
     }
   }
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);batches.push(mesh);
 }
 // Only trunk/rock cores obstruct; lower shrub and overhanging high canopy
 // are decorative. Certified paths are excluded by their full envelope.
 function blocked(e:number,n:number,feet:number,r=.27){
   const cx=Math.floor(e/64),cn=Math.floor(n/64),near:RidgeForestPlacement[]=[];
   for(let dx=-1;dx<=1;dx++)for(let dn=-1;dn<=1;dn++)near.push(...(chunks.get((cx+dx)+','+(cn+dn))??[]));
   return near.some(p=>{const core=(p.kind==='pine'||p.kind==='flagpine'?.30:p.kind==='rock'?.92:0)*p.scale;
     return core>0&&feet>=p.height-.6&&feet<p.height+(p.kind==='rock'?1.4:3.2)*p.scale&&Math.hypot(e-p.east,n-p.north)<core+r});
 }
 let disposed=false;return {group,placements,blocked,dispose(){if(disposed)return;disposed=true;group.removeFromParent();batches.forEach(b=>b.dispose());group.clear();geo.dispose();material.dispose()}};
}
