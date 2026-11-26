import {BoxGeometry,BufferGeometry,DataTexture,Group,Mesh,MeshStandardMaterial,NearestFilter,Quaternion,SRGBColorSpace,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Box} from './landmark-kit';
type Point=Readonly<{east:number;north:number;height:number}>;
type EN=Readonly<{east:number;north:number}>;
type Segment=Readonly<EN&{yaw:number}>;
type Ground=(east:number,north:number)=>number|undefined;
type Tri=readonly [Point,Point,Point];
type Family='wood'|'endgrain'|'iron'|'rope'|'stone';
const palette:Record<Family,number>={wood:0x67503a,endgrain:0x957653,iron:0x554a42,rope:0x9c8968,stone:0x80786c};
function grain(f:Family){
 const rgb=palette[f],n=16,data=new Uint8Array(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  let t=1;
  if(f==='wood')t=.77+.19*Math.sin(x*1.5+.35*Math.sin(y*.46))+.12*(x%5!==0?1:0);
  else if(f==='endgrain')t=.78+.2*Math.sin(Math.hypot(x-4,y-9)*1.8)+.11;
  else if(f==='rope')t=(x+y)%5<2?.76:1.08;
  else if(f==='iron')t=.76+.19*((x*5+y*11)%13)/12+.10*(x%6===0?1:0);
  else t=.81+.22*((Math.floor(x/3)*5+Math.floor(y/4)*7)%9)/8;
  data.set([Math.min(255,(rgb>>16)*t),Math.min(255,(rgb>>8&255)*t),Math.min(255,(rgb&255)*t),255],(y*n+x)*4);
 }
 const map=new DataTexture(data,n,n);map.colorSpace=SRGBColorSpace;map.magFilter=map.minFilter=NearestFilter;map.generateMipmaps=false;map.needsUpdate=true;return map;
}
const forward=(p:Segment,u:number,v:number)=>({east:p.east+Math.sin(p.yaw)*u+Math.cos(p.yaw)*v,north:p.north+Math.cos(p.yaw)*u-Math.sin(p.yaw)*v});
const distance=(a:EN,b:EN)=>Math.hypot(a.east-b.east,a.north-b.north);
/** Canonical east-wall three-section model. Detached until A verifies an
 * actual site and consumes the first section's exact support triangles.
 * The remaining two fragments are never walk surfaces or inventory hosts. */
export function buildBR30HistoricWalkway(ground:Ground,plan:readonly [Segment,Segment,Segment]){
 if(plan.length!==3||plan.some(p=>![p.east,p.north,p.yaw].every(Number.isFinite)))throw Error('Invalid historical walkway plan');
 const lengths=[2.05,1.60,1.34],widths=[1.42,1.24,1.06];
 const radius=lengths.map((l,i)=>Math.hypot(l,widths[i])/2);
 const gap12=distance(plan[0],plan[1])-radius[0]-radius[1];
 const gap23=distance(plan[1],plan[2])-radius[1]-radius[2];
 if(gap12<1.25||gap23<1.0||gap12>4.5||gap23>4.5)throw Error('Historical break not preserved');
 const h=(p:EN)=>{const y=ground(p.east,p.north);if(y===undefined||!Number.isFinite(y))throw Error('Historical footing lacks actual ground');return y;};
 const tops=plan.map((p,i)=>{
  const samples=[-.5,0,.5].flatMap(u=>[-.5,0,.5].map(v=>h(forward(p,u*lengths[i],v*widths[i]))));
  if(Math.max(...samples)-Math.min(...samples)>2.1)throw Error('Historical footing slope too abrupt');
  return Math.max(...samples)+(i===0?.18:i===1?1.30:1.65);
 });
 const first=plan[0],start=forward(first,-lengths[0]/2-1.85,0),entryHeight=h(start);
 if(Math.abs(tops[0]-entryHeight)/1.85>.42)throw Error('Historical first-section access too steep');
 for(let j=0;j<=20;j++)for(const v of [-.55,0,.55]){
  const t=j/20,p=forward(first,-lengths[0]/2-1.85+1.85*t,v);
  if(h(p)>entryHeight+(tops[0]-entryHeight)*t+.04)throw Error('Historical ramp intersects real ground');
 }
 const group=new Group();group.name='b-r30-east-historic-walkway';
 const batches=new Map<Family,BufferGeometry[]>(),boxes:Box[]=[],support:Tri[]=[];
 const up=new Vector3(0,1,0);let pieces=0;
 function add(f:Family,g:BufferGeometry){const list=batches.get(f)??[];list.push(g);batches.set(f,list);pieces++;}
 function pos(p:Segment,u:number,v:number,y:number){const q=forward(p,u,v);return new Vector3(q.east,y,-q.north);}
 function worldPoint(p:Segment,u:number,v:number,y:number):Point{return {...forward(p,u,v),height:y};}
 function solid(f:Family,a:Vector3,b:Vector3,w:number,d:number,collide=false){
  const delta=b.clone().sub(a),length=delta.length();if(length<.001)return;
  const g=new BoxGeometry(w,length,d);g.applyQuaternion(new Quaternion().setFromUnitVectors(up,delta.normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());add(f,g);
  if(collide){g.computeBoundingBox();boxes.push({min:g.boundingBox!.min.toArray(),max:g.boundingBox!.max.toArray()});}
 }
 function block(f:Family,p:Segment,u:number,v:number,y:number,len:number,w:number,thick:number,tilt=0,collide=false){
  const g=new BoxGeometry(w,thick,len);g.rotateX(tilt);g.rotateY(-p.yaw);g.translate(...pos(p,u,v,y).toArray());add(f,g);
  if(collide){g.computeBoundingBox();boxes.push({min:g.boundingBox!.min.toArray(),max:g.boundingBox!.max.toArray()});}
 }
 function topQuad(p:Segment,a:number,b:number,w:number,ha:number,hb:number){
  const q0=worldPoint(p,a,-w/2,ha),q1=worldPoint(p,a,w/2,ha),q2=worldPoint(p,b,w/2,hb),q3=worldPoint(p,b,-w/2,hb);
  support.push([q0,q1,q2],[q0,q2,q3]);
 }
 function envelope(a:Vector3,b:Vector3,r:number):Box{return {min:[Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.min(a.z,b.z)-r],max:[Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r,Math.max(a.z,b.z)+r]};}
 // First section: actual plank tops and continuous solid ramp. No
 // support triangles span the two missing spans.
 const deck=tops[0],n=11,step=lengths[0]/n;
 for(let i=0;i<n;i++){
  const a=-lengths[0]/2+i*step,b=a+step;
  block(i%4===0?'endgrain':'wood',first,(a+b)/2,0,deck-.045,step-.012,widths[0],.09);
  topQuad(first,a+.006,b-.006,widths[0],deck,deck);
  for(const v of [-.51,.51])block('iron',first,(a+b)/2,v,deck+.004,.024,.024,.008);
 }
 const a0=-lengths[0]/2-1.85,b0=-lengths[0]/2,dy=deck-entryHeight,slope=Math.atan2(dy,1.85);
 // Each ramp slat is tilted along the exact top plane.
 for(let i=0;i<10;i++){
  const a=a0+1.85*i/10,b=a0+1.85*(i+1)/10,ha=entryHeight+dy*i/10,hb=entryHeight+dy*(i+1)/10;
  block('wood',first,(a+b)/2+.045*Math.sin(slope),0,(ha+hb)/2-.045*Math.cos(slope),Math.hypot(b-a,hb-ha),1.12,.09,slope);
  topQuad(first,a,b,1.12,ha,hb);
 }
 for(const v of [-.54,.54]){
  solid('wood',pos(first,a0,v,entryHeight-.1),pos(first,b0,v,deck-.10),.12,.12);
  solid('wood',pos(first,b0,v,deck-.16),pos(first,lengths[0]/2,v,deck-.16),.15,.17);
 }
 // Every leg ends below its surveyed ground. Upper fragments retain
 // bracing but their decks are tilted, missing boards and isolated.
 for(let j=0;j<3;j++){
  const p=plan[j],L=lengths[j],W=widths[j],y=tops[j];
  for(const u of [-L*.34,L*.34])for(const v of [-W*.36,W*.36]){
   const q=forward(p,u,v),base=h(q)-.10,head=y-.13-(j?Math.abs(u)*.24:0);
   const a=pos(p,u,v,base),b=pos(p,u,v,head);
   solid('wood',a,b,.15,.16);boxes.push(envelope(a,b,.09));
   block('stone',p,u,v,base+.12,.29,.29,.21);
   block('iron',p,u,v,head,.23,.22,.07);
  }
  for(const v of [-W*.36,W*.36]){
   const q=forward(p,-L*.34,v);
   solid('wood',pos(p,-L*.34,v,h(q)+.06),pos(p,L*.34,v,y-.22),.10,.11);
  }
  if(j){
   for(const v of [-W*.36,W*.36])solid('wood',pos(p,-L/2,v,y-.45),pos(p,L/2,v,y-.11),.14,.14);
   for(let i=0;i<6;i++){
    if((j===1&&i>=3)||(j===2&&i%2===0))continue;
    const u=-L/2+(i+.5)*L/6;
    block(i===0?'endgrain':'wood',p,u,0,y-.27+u*.25,L/6*.87,W*(i%2?.82:1),.09,.24,true);
   }
   // Only actual solid beam envelopes: no bridge across the break.
   for(const v of [-W*.36,W*.36])boxes.push(envelope(pos(p,-L/2,v,y-.45),pos(p,L/2,v,y-.11),.09));
  }
 }
 // Rope rails on the intact platform, leaving the approach open.
 for(const v of [-.65,.65]){
  for(const u of [-.78,.12,.84]){
   const a=pos(first,u,v,deck),b=pos(first,u,v,deck+.92);
   solid('wood',a,b,.095,.095);boxes.push(envelope(a,b,.06));
  }
  for(const [a,b] of [[-.78,.12],[.12,.84]]){
   const mid=(a+b)/2;
   solid('rope',pos(first,a,v,deck+.77),pos(first,mid,v,deck+.68),.025,.025);
   solid('rope',pos(first,mid,v,deck+.68),pos(first,b,v,deck+.77),.025,.025);
  }
  boxes.push(envelope(pos(first,-.78,v,deck+.68),pos(first,.84,v,deck+.77),.035));
 }
 // Broken end guard: two short splintered uprights, no hidden blockade.
 for(const v of [-.53,.53])solid('wood',pos(first,.94,v,deck),pos(first,.94,v,deck+.32),.085,.085);
 // Old tools exactly one of each: pickaxe, slatted basket, dark oil lamp.
 solid('wood',pos(first,.42,-.30,deck+.05),pos(first,.88,-.41,deck+.10),.045,.045);
 solid('iron',pos(first,.86,-.57,deck+.08),pos(first,.90,-.24,deck+.10),.055,.055);
 solid('iron',pos(first,.86,-.57,deck+.08),pos(first,.79,-.64,deck+.035),.036,.035);
 solid('iron',pos(first,.90,-.24,deck+.10),pos(first,.95,-.18,deck+.04),.038,.035);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,u=.57+.135*Math.cos(a),v=.36+.135*Math.sin(a);
  block('endgrain',first,u,v,deck+.13,.09,.075,.24);
  const b=(i+1)*Math.PI/4;solid('rope',pos(first,u,v,deck+.25),pos(first,.57+.135*Math.cos(b),.36+.135*Math.sin(b),deck+.25),.028,.028);
 }
 block('wood',first,.57,.36,deck+.035,.27,.27,.06);
 for(const [a,b] of [[-.135,0],[0,.135]])solid('rope',pos(first,.57+a,.36,deck+.25+(a===0?.15:0)),pos(first,.57+b,.36,deck+.25+(b===0?.15:0)),.022,.022);
 block('iron',first,.04,-.39,deck+.035,.16,.16,.07);
 solid('iron',pos(first,.04,-.39,deck+.04),pos(first,.04,-.39,deck+.21),.075,.075);
 block('iron',first,.04,-.39,deck+.21,.12,.12,.035);
 for(const u of [-.012,.092])for(const v of [-.442,-.338])solid('iron',pos(first,u,v,deck+.06),pos(first,u,v,deck+.20),.016,.016);
 solid('iron',pos(first,-.015,-.39,deck+.23),pos(first,.04,-.39,deck+.30),.018,.018);
 solid('iron',pos(first,.04,-.39,deck+.30),pos(first,.095,-.39,deck+.23),.018,.018);
 // Dangling snapped ladder, attached to second section only.
 const p=plan[1],y=tops[1];
 for(const v of [-.19,.19])solid('wood',pos(p,-.65,v,y-.18),pos(p,-1.02,v,y-1.08),.065,.065,true);
 for(const [u,z] of [[-.77,-.47],[-.90,-.77]] as const)solid('wood',pos(p,u,-.19,y+z),pos(p,u,.19,y+z),.055,.055,true);
 const materials=new Map<Family,MeshStandardMaterial>();
 for(const [f,list] of batches){
  const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());if(!geometry)throw Error('Historical mesh merge failed');
  const material=new MeshStandardMaterial({map:grain(f),roughness:1,flatShading:true});materials.set(f,material);
  const mesh=new Mesh(geometry,material);mesh.name='historic-walkway/'+f;group.add(mesh);
 }
 let disposed=false;
 return {group,plan,tops,gaps:[gap12,gap23] as const,entry:{...start,height:entryHeight},firstFoot:{...first,height:deck},support,boxes,pieces,
  productionReady:false as const,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});materials.forEach(m=>{m.map?.dispose();m.dispose();});}};
}
