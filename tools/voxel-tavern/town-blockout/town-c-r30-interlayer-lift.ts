import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,MeshBasicMaterial,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {firstMineDownFoot,firstMineDownFootLocal,secondMineRegisteredFeet,secondMineWorldFrame,secondMineDomainId} from '../../../src/shared/underground-second-mine-presence-domain.js';
import type {R30Point} from './town-c-r30-deep-layer-contract.js';
const top=firstMineDownFoot,bottom=secondMineRegisteredFeet.entry;
const yaw=secondMineWorldFrame.yaw,c=Math.cos(yaw),s=Math.sin(yaw);
const upper='underground/mine',lower=secondMineDomainId;
export const r30InterlayerLiftSite=Object.freeze({
 id:'mine1-mine2-lift',upper:{domainId:upper,foot:top,local:firstMineDownFootLocal},
 lower:{domainId:lower,foot:bottom,local:{east:0,north:2,height:0}},
 depth:top.height-bottom.height,yaw,
 aperture:{upper:{minX:-14.1,maxX:-11.9,minZ:132.9,maxZ:135.1,height:-91},
 lower:{minE:-1.1,maxE:1.1,minN:.9,maxN:3.1,ceiling:5}},
 approach:{upper:{east:top.east+2.3*s,north:top.north-2.3*c,height:top.height},
 lower:{east:bottom.east-2.3*s,north:bottom.north+2.3*c,height:bottom.height}},
});
type Part={family:'rock'|'wood'|'iron'|'glow';at:readonly [number,number,number];size:readonly [number,number,number];color:number};
function batch(parent:Group,name:string,parts:Part[]){
 const g=new Group();g.name=name;parent.add(g);const geometry=new BoxGeometry(),cleanup:(()=>void)[]=[];
 for(const family of ['rock','wood','iron','glow'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=family==='glow'?undefined:makeCampGrain(family);
  const m=family==='glow'?new MeshBasicMaterial():new MeshLambertMaterial({map});
  const mesh=new InstancedMesh(geometry,m,rows.length),mat=new Matrix4(),color=new Color();
  rows.forEach((p,i)=>{mat.makeScale(...p.size).setPosition(...p.at);mesh.setMatrixAt(i,mat);mesh.setColorAt(i,color.setHex(p.color))});
  mesh.computeBoundingSphere();g.add(mesh);cleanup.push(()=>{mesh.dispose();m.dispose();map?.dispose()});
 }
 return {group:g,count:parts.length,dispose(){g.removeFromParent();cleanup.forEach(f=>f());geometry.dispose()}};
}
type Rect=Readonly<{minX:number;maxX:number;minZ:number;maxZ:number}>;
/** Shared floor/ceiling aperture geometry. Outer boundaries remain unchanged. */
export function splitR30LiftAperture(rect:Rect,hole:Rect):Rect[]{
 const l=Math.max(rect.minX,hole.minX),r=Math.min(rect.maxX,hole.maxX),
       a=Math.max(rect.minZ,hole.minZ),b=Math.min(rect.maxZ,hole.maxZ);
 if(l>=r||a>=b)return [rect];
 return [{minX:rect.minX,maxX:l,minZ:rect.minZ,maxZ:rect.maxZ},
 {minX:r,maxX:rect.maxX,minZ:rect.minZ,maxZ:rect.maxZ},
 {minX:l,maxX:r,minZ:rect.minZ,maxZ:a},{minX:l,maxX:r,minZ:b,maxZ:rect.maxZ}]
 .filter(v=>v.maxX>v.minX&&v.maxZ>v.minZ);
}
/** Already accepted transport receipt; no client-side trip allocation or clock. */
export type R30InterlayerRide=Readonly<{
 id:number;linkId:'mine1-mine2-lift';riderId:string;fromDomain:string;toDomain:string;
 departedAt:number;travelMs:number;
}>;
export function sampleR30InterlayerRide(ride:R30InterlayerRide,now:number){
 const down=ride.fromDomain===upper&&ride.toDomain===lower,up=ride.fromDomain===lower&&ride.toDomain===upper;
 if(ride.linkId!==r30InterlayerLiftSite.id||!ride.riderId||!Number.isSafeInteger(ride.id)||ride.id<=0||
 ![ride.departedAt,ride.travelMs,now].every(Number.isFinite)||ride.travelMs<20000||ride.travelMs>30000||
 now<ride.departedAt||(!down&&!up))return;
 const progress=Math.min(1,(now-ride.departedAt)/ride.travelMs),smooth=progress*progress*(3-2*progress);
 const h=down?top.height+(bottom.height-top.height)*smooth:bottom.height+(top.height-bottom.height)*smooth;
 return {progress,height:h,eye:{east:top.east,north:top.north,height:h+1.6},arrived:progress===1};
}
function stationParts(isUpper:boolean){
 const rows:Part[]=[];
 const put=(family:Part['family'],x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>rows.push({family,at:[x,y,z],size:[w,h,d],color});
 const closedZ=isUpper?-1.12:1.12;
 for(const x of [-1.2,1.2])for(const z of [-1.12,1.12]){
  put('rock',x,.14,z,.34,.28,.34,0x505258);
  put('iron',x,1.25,z,.12,2.5,.12,0x6c665d);
  put('iron',x,2.38,z,.25,.23,.23,0x9b794d);
 }
 for(const z of [-1.12,1.12]){
  put('wood',0,2.55,z,2.63,.23,.22,0x604735);
  for(const x of [-.9,.9])put('iron',x,2.55,z,.15,.26,.25,0x8e6544);
 }
 // Crossbeam, suspension drum with faceted wheel rim and a physical
 // counterweight channel over the fenced side. All above head clearance.
 for(const x of [-1.2,1.2]){
  put('iron',x,2.69,0,.18,.22,2.48,0x80563d);
  for(let k=0;k<5;k++)put('iron',x,2.79,-.9+k*.45,.25,.07,.12,0x9b794d);
 }
 put('wood',0,2.77,0,2.6,.28,.38,0x604735);
 for(const x of [-.33,.33]){
  for(let k=0;k<16;k++){
   const a=k*Math.PI/8;
   put('iron',x,3.15+.25*Math.cos(a),.25*Math.sin(a),.10,.125,.125,0x80563d);
  }
  put('iron',x,3.15,0,.13,.19,.19,0x947346);
 }
 put('iron',0,3.15,0,.69,.12,.12,0x505258);
 if(isUpper){
  put('iron',0,2.94,0,.06,.46,.06,0x80563d);
  for(let k=0;k<5;k++)put('iron',0,2.85+k*.07,.065,.12,.035,.04,0x947346);
 }
 for(const x of [-1.2,1.2]){
  put('iron',x,1.08,0,.08,.15,2.18,0x80563d);
  for(let i=0;i<5;i++)put('iron',x,.65,-.88+i*.44,.05,1.25,.05,0x47494c);
 }
 put('iron',0,1.08,closedZ,2.28,.15,.08,0x80563d);
 for(let i=0;i<9;i++)put('iron',-.96+i*.24,.65,closedZ,.05,1.25,.05,0x47494c);
 // A flush closed plate preserves the existing floor until both openings
 // and the accepted transport are installed.
 for(let i=0;i<7;i++)put('iron',(i-3)*.29,.006,0,.28,.012,2.06,i%2?0x4e4e4c:0x6b635a);
 for(const x of [-1.12,1.12]){
  put('glow',x,1.9,closedZ,.13,.16,.1,0xd8a15b);
  put('iron',x,1.70,closedZ,.24,.15,.18,0x80563d);
 }
 put('wood',1.2,1.12,0,.18,.48,.22,0x604735);
 put('iron',1.08,1.2,0,.24,.07,.10,0x947346);
 return rows;
}
function localAt(p:R30Point){
 const dx=p.east-top.east,dn=p.north-top.north;
 return {x:dx*c+dn*s,z:dx*s-dn*c};
}
/** Render geometry only. Existing floor/roof stay sealed until real shell
 * owners consume the aperture. Present only host-accepted rides. */
export function mountR30InterlayerLift(parent:Group){
 const root=new Group();root.name='r30-interlayer-lift';
 root.rotation.y=-parent.rotation.y;root.position.copy(parent.position).negate().applyAxisAngle(new Vector3(0,1,0),-parent.rotation.y);parent.add(root);
 const worldRoot=new Group();worldRoot.position.set(top.east,top.height,-top.north);worldRoot.rotation.y=yaw;root.add(worldRoot);
 const a=batch(worldRoot,'r30-lift-upper-station',stationParts(true));
 const b=batch(worldRoot,'r30-lift-lower-station',stationParts(false));b.group.position.y=-r30InterlayerLiftSite.depth;b.group.visible=false;
 const boreRows:Part[]=[];
 for(let d=.8;d<r30InterlayerLiftSite.depth-.5;d+=1.6){
  for(const x of [-1.25,1.25])boreRows.push({family:'rock',at:[x,-d,0],size:[.3,1.64,2.8],color:Math.floor(d)%3?0x41464b:0x505258});
  for(const z of [-1.25,1.25])boreRows.push({family:'rock',at:[0,-d,z],size:[2.2,1.64,.3],color:0x343940});
  for(const x of [-.99,.99])boreRows.push({family:'iron',at:[x,-d,.8],size:[.09,1.64,.1],color:0x80563d});
  if(Math.floor(d)%5===0)for(const x of [-1.05,1.05])boreRows.push({family:'wood',at:[x,-d,0],size:[.18,.21,2.3],color:0x70543e});
 }
 const bore=batch(worldRoot,'r30-lift-49m-lined-bore',boreRows);bore.group.visible=false;
 const cabinRows:Part[]=[];
 for(let i=0;i<7;i++)cabinRows.push({family:'wood',at:[(i-3)*.24,.06,0],size:[.235,.12,1.76],color:0x70543e});
 for(const x of [-.86,.86])for(const z of [-.86,.86])cabinRows.push({family:'iron',at:[x,1.1,z],size:[.10,2.2,.10],color:0x80563d});
 for(const z of [-.86,.86])for(let i=0;i<8;i++)cabinRows.push({family:'iron',at:[-.77+i*.22,1.06,z],size:[.046,1.78,.05],color:0x505258});
 for(const x of [-.86,.86]){
  for(let i=0;i<8;i++)cabinRows.push({family:'iron',at:[x,1.06,-.77+i*.22],size:[.05,1.78,.046],color:0x505258});
  cabinRows.push({family:'wood',at:[x,2.15,0],size:[.12,.15,1.85],color:0x604735});
 }
 for(const z of [-.78,.78])cabinRows.push({family:'iron',at:[0,2.15,z],size:[1.85,.15,.12],color:0x80563d});
 for(let i=0;i<7;i++)cabinRows.push({family:'wood',at:[(i-3)*.24,2.24,0],size:[.23,.095,1.78],color:0x604735});
 cabinRows.push({family:'iron',at:[0,2.42,0],size:[.11,.28,.11],color:0x947346},{family:'glow',at:[.74,1.87,.74],size:[.14,.17,.14],color:0xe5a45d});
 const cabin=batch(worldRoot,'r30-lift-traveling-cage',cabinRows);cabin.group.visible=false;
 let disposed=false;
 return {root,upper:a.group,lower:b.group,bore:bore.group,cage:cabin.group,parts:a.count+b.count+bore.count+cabin.count,
  showDomain(domain:string|undefined){if(disposed)return;a.group.visible=domain!==lower;b.group.visible=domain===lower},
  blocks(domain:string,p:R30Point,radius=.27){
   if(disposed||![p.east,p.north,p.height,radius].every(Number.isFinite)||radius<=0)return false;
   if(domain!==upper&&domain!==lower)return false;
   const target=domain===upper?top:bottom;if(Math.abs(p.height-target.height)>.6)return false;
   const {x,z}=localAt(p),closed=domain===upper?-1.12:1.12;
   return (Math.abs(z)<1.31+radius&&Math.abs(Math.abs(x)-1.2)<.17+radius)||
    (Math.abs(x)<1.14+radius&&Math.abs(z-closed)<.06+radius);
  },
  present(ride:R30InterlayerRide|undefined,now:number,openingsCertified:boolean){
   if(disposed)return;
   const cue=openingsCertified&&ride?sampleR30InterlayerRide(ride,now):undefined;
   bore.group.visible=cabin.group.visible=!!cue&&!cue.arrived;
   if(cue)cabin.group.position.y=cue.height-top.height;
   return cue;
  },
  dispose(){if(disposed)return;disposed=true;a.dispose();b.dispose();bore.dispose();cabin.dispose();root.removeFromParent()},
 } as const;
}
