import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Object3D} from 'three';
import {ridgeR30GullyAxis,type FrontRidgeR30Field} from './town-d-r30-front-ridge';
import {northRidgeCableAnchors,northRidgeNorthWall} from './north-ridge-350-terrain';
import {createRidgeSpatialIndex} from './town-d-r30-spatial';

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
 // Bound candidate checks to road segments in nearby spatial bins.
 const size=16,bins=new Map<string,{a:P;b:P}[]>();
 for(const points of routes)for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!;
  for(let x=Math.floor(Math.min(a.east,b.east)/size);x<=Math.floor(Math.max(a.east,b.east)/size);x++)
   for(let z=Math.floor(Math.min(a.north,b.north)/size);z<=Math.floor(Math.max(a.north,b.north)/size);z++){
    const k=x+','+z,list=bins.get(k)??[];list.push({a,b});bins.set(k,list);
   }
 }
 return (e,n,r)=>{
  const d=8+r;
  for(let x=Math.floor((e-d)/size);x<=Math.floor((e+d)/size);x++)
   for(let z=Math.floor((n-d)/size);z<=Math.floor((n+d)/size);z++)
    for(const s of bins.get(x+','+z)??[])if(distanceToSegment(e,n,s.a,s.b)<d)return false;
  return true;
 };
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
 // Streamside scree and low shrubs follow the actual two erosion axes.
 // Keep the trough open; obstacles stay at the margins and still use
 // the same ownership, corridor and collision checks.
 for(const side of ['west','east'] as const)for(let n=350;n<590;n+=9){
   const axis=ridgeR30GullyAxis(n,side);
   for(const sign of [-1,1]){
     const e=axis+sign*(13+rand()*12),z=n+(rand()-.5)*7;
     place(e,z,'rock',.55+rand()*.42);
     if(rand()>.35)place(e+sign*3.2,z+2,'shrub',.58+rand()*.32);
   }
 }
 return placements;
}
type Part={x:number;y:number;z:number;w:number;h:number;d:number;shade:string;yaw?:number;roll?:number};
const box=(x:number,y:number,z:number,w:number,h:number,d:number,shade:string,yaw=0,roll=0):Part=>({x,y,z,w,h,d,shade,yaw,roll});
function prototype(kind:Kind,variant:number,near:boolean):Part[]{
 const a:Part[]=[];
 if(kind==='pine'||kind==='flagpine'){
   const wind=kind==='flagpine'?.23:0,levels=kind==='pine'?5:4;
   const warm=variant===1,blue=variant===2;
   const dark=warm?'#3e523b':blue?'#314d49':'#2e4938';
   const needle=warm?'#5b6b46':blue?'#4c6864':'#48634b';
   const snow=blue?'#cfdee4':'#dce5e7';
   a.push(box(0,1.65,0,.43,3.3,.43,'#594637'));
   if(near){
     a.push(box(0,.47,0,.49,.90,.51,'#6b5040'));
     for(const s of [-1,1]){
       a.push(box(s*.16,.22,0,.17,.24,.79,'#554637'));
       a.push(box(s*.222,1.37,.08,.035,1.78,.06,'#342c25'));
     }
   }
   for(let j=0;j<levels;j++){
     const y=2.25+j*1.0,w=(2.25-j*.38)*(variant===1?1.04:.93),shift=j*wind;
     const twist=j*.31+variant*.18;
     a.push(box(shift,y,0,w*1.35,.62,w*.78,dark,twist));
     a.push(box(shift,y+.25,0,w*.78,.73,w*1.35,needle,twist));
     a.push(box(shift,y+.65,0,w*.67,.14,w*.73,snow,twist));
     if(near)for(let k=0;k<4;k++){
       const angle=k*Math.PI/2+twist,dirX=Math.cos(angle),dirZ=Math.sin(angle);
       const reach=w*(.53+.07*((j+k+variant)%3));
       const x=shift+dirX*reach,z=dirZ*reach;
       a.push(box(x,y-.13,z,w*.55,.28,w*.42,dark,-angle));
       a.push(box(x,y+.065,z,w*.47,.105,w*.34,snow,-angle));
       if((j+k+variant)%2===0)a.push(box(x+dirX*w*.12,y-.34,z+dirZ*w*.12,w*.22,.30,w*.22,needle,-angle));
     }
   }
   a.push(box(levels*wind,2.3+levels,0,.55,.94,.60,needle));
   if(near)a.push(box(levels*wind,2.78+levels,0,.38,.22,.40,snow));
 }else if(kind==='shrub'){
   a.push(box(0,.24,0,1.4,.46,1.2,'#536247',.3),box(.48,.51,.25,.8,.55,.9,'#667658',.2),box(-.36,.52,-.25,.75,.65,.75,'#475a44'),box(.46,.82,.25,.62,.10,.62,'#d1dadc'));
 }else{
   const tint=variant===0?'#737870':variant===1?'#8c7c6c':'#637179';
   a.push(box(0,.38,0,1.8,.92,1.6,tint,.35),box(.2,1.01,-.1,1.24,.43,1.1,'#969991',.35),box(-.61,.32,.37,.7,.66,.75,'#5d655e',-.3),box(.23,1.26,-.1,1.02,.13,.85,'#d2dce0',.35));
   if(near){
     a.push(box(.73,.22,-.47,.54,.48,.61,'#59636a',.67),box(-.28,.91,.37,.69,.16,.35,'#b0aaa0',.35));
     a.push(box(.58,.54,.57,.16,.73,.08,'#4c514d',.22,.17),box(.13,.83,-.49,.74,.065,.13,'#b8c5cb',.35));
   }
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
 const batches:InstancedMesh[]=[];
 const tiers:{near:InstancedMesh;far:InstancedMesh;east:number;north:number}[]=[];
 for(const [k,list] of chunks){
   const variant=(p:RidgeForestPlacement)=>Math.abs(Math.round(p.east*7+p.north*13))%3;
   function build(detail:boolean){
     const shapes=list.map(p=>prototype(p.kind,variant(p),detail));
     const count=shapes.reduce((s,p)=>s+p.length,0);
     const mesh=new InstancedMesh(geo,material,count);mesh.name='ridge-forest-'+k+(detail?'-near':'-far');let i=0;
     for(const [index,p] of list.entries()){
       tmp.position.set(p.east,p.height-.14,-p.north);tmp.rotation.set(0,p.yaw,0);tmp.scale.setScalar(p.scale);tmp.updateMatrix();parent.copy(tmp.matrix);
       for(const b of shapes[index]!){
         tmp.position.set(b.x,b.y,b.z);tmp.rotation.set(0,b.yaw??0,b.roll??0);tmp.scale.set(b.w,b.h,b.d);tmp.updateMatrix();matrix.multiplyMatrices(parent,tmp.matrix);
         mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,tint.set(b.shade));i++;
       }
     }
     mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);batches.push(mesh);return mesh;
   }
   const [cx,cn]=k.split(',').map(Number);
   const near=build(true),far=build(false);near.visible=false;
   tiers.push({near,far,east:cx!*64+32,north:cn!*64+32});
 }
 // Hysteresis prevents toggling as a player traverses a chunk boundary.
 function updateView(east:number,north:number){
   for(const t of tiers){const d=Math.hypot(east-t.east,north-t.north);
     t.near.visible=t.near.visible?d<114:d<90;t.far.visible=!t.near.visible;
   }
 }
 // Only trunk/rock cores obstruct; lower shrub and overhanging high canopy
 // are decorative. Certified paths are excluded by their full envelope.
 const colliders=placements.filter(p=>p.kind!=='shrub').map(p=>({...p,core:(p.kind==='rock'?.92:.30)*p.scale}));
 const collision=createRidgeSpatialIndex(colliders,p=>({west:p.east-p.core,east:p.east+p.core,south:p.north-p.core,north:p.north+p.core}));
 function blocked(e:number,n:number,feet:number,r=.27){
   return collision.some(e,n,r,p=>feet>=p.height-.6&&feet<p.height+(p.kind==='rock'?1.4:3.2)*p.scale&&Math.hypot(e-p.east,n-p.north)<p.core+r);
 }
 let disposed=false;return {group,placements,blocked,updateView,detailCounts:()=>({near:tiers.filter(t=>t.near.visible).length,far:tiers.filter(t=>t.far.visible).length}),dispose(){if(disposed)return;disposed=true;group.removeFromParent();batches.forEach(b=>b.dispose());group.clear();geo.dispose();material.dispose()}};
}
