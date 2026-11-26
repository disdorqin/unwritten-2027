import {BoxGeometry,CylinderGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshStandardMaterial,NearestFilter,Quaternion,SRGBColorSpace,Vector3} from 'three';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import {moundCentre,slopeTreeCount,summitTreeCount,windFlagCount} from './town-mound-planting';
import {townC2CraterCentralMoundProtectedSites as protectedSites} from './town-c2-crater-central-mound';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import {craterFloorWorklightSites,craterFloorLampRockBufferM} from './meteor-crater-floor-worklight-sites';
import {bR30ReturnAxis} from './town-b-r30-return-headframe';

type Road=ReturnType<typeof mountWestCraterRoad>;
type EN=Readonly<{east:number;north:number}>;
type Point=EN&Readonly<{height:number}>;
type Site=Point&Readonly<{kind:'charred-tree'|'wind-flag';ring:'slope'|'summit'|'flags';scale:number;angle:number;supportSpan:number}>;
const fixture=createMeteorCrater(meteorCraterFixturePlan);
const gap=(p:EN,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,p.east-b.max[0],0),Math.max(b.min[2]+p.north,-p.north-b.max[2],0));
function segmentGap(p:EN,a:EN,b:EN){
 const e=b.east-a.east,n=b.north-a.north,t=Math.min(1,Math.max(0,((p.east-a.east)*e+(p.north-a.north)*n)/(e*e+n*n||1)));
 return Math.hypot(p.east-a.east-e*t,p.north-a.north-n*t);
}
const proposedRoute=[[-137.62417573244022,194.45454545454544],[-134.12417573244022,189.95454545454544],[-117.62417573244022,175.45454545454544],[-111.12417573244022,181.95454545454544],[-110.62417573244022,185.95454545454544],[-112.12417573244022,189.45454545454544],[-120,196]] as const;
const distanceTo=(p:EN,points:readonly EN[])=>Math.min(...points.slice(1).map((q,i)=>segmentGap(p,points[i],q)));
function seeded(seed:number){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
/** A ground survey, not a new support surface. The steep path is a
 * candidate for subsequent native climb verification, not a new
 * movement/route authorization. Trees and flags may not occupy it. */
export function surveyBR30MoundPlanting(road:Road){
 const existing=road.group.userData.colliders as Box[];
 if(!Array.isArray(existing))throw Error('Mound planting requires west collision channel');
 const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw),floor=a.rimHeight-35;
 const trail=Array.from({length:1601},(_,i)=>{
  const q=fixture.mainTrailPoint(i/1600);return {east:a.east+q.east*c+q.north*s,north:a.north+q.north*c-q.east*s};
 });
 const returnRoute=[bR30ReturnAxis,{east:-126.57198654264897,north:187.09021359751603}];
 const reserves=[...Object.values(protectedSites),
  ...craterFloorWorklightSites.map(q=>({east:a.east+q.east*c+q.north*s,north:a.north+q.north*c-q.east*s,radius:craterFloorLampRockBufferM})),
  {...bR30ReturnAxis,radius:2.35},...(road.winch?[road.winch.survey.snakeStoneReservation]:[])];
 const route=proposedRoute.map(([east,north])=>{
  const height=road.heightAt(east,north);if(height===undefined||!Number.isFinite(height))throw Error('Missing mound climb support');
  return {east,north,height};
 });
 function routeAudit(boxes:readonly Box[]){
  let length=0,maxGrade=0,bodyGap=Infinity,samples=0;
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i],d=Math.hypot(b.east-a.east,b.north-a.north),n=Math.max(1,Math.ceil(d/.08));length+=d;
   let last=a.height;
   for(let j=0;j<=n;j++){
    const t=j/n,p={east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t};
    const h=road.heightAt(p.east,p.north);if(h===undefined||!Number.isFinite(h))throw Error('Mound climb support missing');
    if(j)maxGrade=Math.max(maxGrade,Math.abs(h-last)/(d/n));last=h;samples++;
    for(const b of boxes)if(b.min[1]<h+1.8&&b.max[1]>h+.025)bodyGap=Math.min(bodyGap,gap(p,b));
   }
  }
  if(bodyGap<.40||maxGrade>.62)throw Error('Mound climb candidate is obstructed '+bodyGap+'/'+maxGrade);
  return {length,maxGrade,bodyGap,samples};
 }
 const originalRoute=routeAudit(existing),sites:Site[]=[],random=seeded(0xb3636);
 const old=road.moundPlanting.placements;
 function candidate(east:number,north:number,ring:Site['ring'],scale:number,angle:number):Site|undefined{
  const p={east,north},r=Math.hypot(east-moundCentre.east,north-moundCentre.north),height=road.heightAt(east,north);
  const extent=ring==='flags'?.78:.92*scale;
  if(height===undefined||!Number.isFinite(height)||height-floor<(ring==='slope'?.65:4.6))return;
  if(ring==='slope'?(r<8.5||r>18.5):(r<4.3||r>(ring==='flags'?7.8:6.8)))return;
  // The mound body, not an adjacent steep wall, must support the forest.
  if(road.centralMound.model.surfaceHeightAtWorld(east,north)<(ring==='slope'?.35:4.2))return;
  if(reserves.some(q=>Math.hypot(q.east-east,q.north-north)<q.radius+extent+.20))return;
  if(Math.min(distanceTo(p,trail)-1.75,distanceTo(p,route)-.72,distanceTo(p,returnRoute)-.72)<extent)return;
  if(sites.some(q=>Math.hypot(q.east-east,q.north-north)<extent+(q.ring==='flags'?.78:.92*q.scale)+.18))return;
  if(existing.some(b=>b.min[1]<height+3.5&&b.max[1]>height-.15&&gap(p,b)<extent+.15))return;
  const samples=[-.4,0,.4].flatMap(e=>[-.4,0,.4].map(n=>road.heightAt(east+e,north+n)));
  if(samples.some(h=>h===undefined||!Number.isFinite(h)))return;
  const supportSpan=Math.max(...samples as number[])-Math.min(...samples as number[]);
  if(supportSpan>.68)return;
  return {east,north,height,ring,kind:ring==='flags'?'wind-flag':'charred-tree',scale,angle,supportSpan};
 }
 // Reserve the summit first, reusing the actual old points when safe.
 // Failed old placements move only within their own ring; no extra
 // decoration is spawned. Low-discrepancy search is deterministic.
 for(const [ring,count] of [['summit',summitTreeCount],['flags',windFlagCount],['slope',slopeTreeCount]] as const){
  const previous=old.filter(p=>p.ring===ring);
  for(let i=0;i<count;i++){
   const scale=ring==='flags'?1:(ring==='summit'?.72+random()*.18:.82+random()*.32),angle=random()*2*Math.PI;
   let found=previous[i]?candidate(previous[i].east,previous[i].north,ring,scale,angle):undefined;
   for(let j=0;!found&&j<2400;j++){
    const theta=(i*.61803398875+j*.38196601125+random()*.11)*Math.PI*2;
    const lo=ring==='slope'?8.8:4.35,hi=ring==='slope'?18.35:ring==='flags'?7.6:6.65;
    const radius=lo+(hi-lo)*((j*.754877666+i*.317+random()*.08)%1);
    found=candidate(moundCentre.east+Math.sin(theta)*radius,moundCentre.north+Math.cos(theta)*radius,ring,scale,angle);
   }
   if(!found)throw Error('Cannot place all canonical mound '+ring+' '+i);
   sites.push(found);
  }
 }
 return {sites,route,originalRoute,routeAudit};
}

type Family='bark'|'scar'|'iron'|'cloth'|'stone';
type Part={family:Family;shape:'block'|'trunk';at:Vector3;size:Vector3;q:Quaternion;color:number};
const palette:Record<Family,number>={bark:0x382d28,scar:0x69513d,iron:0x55514b,cloth:0x925944,stone:0x73675b};
function surface(family:Family){
 const size=16,rgba=new Uint8Array(size*size*4),rgb=palette[family];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const grain=family==='bark'||family==='scar'?Math.sin(x*2.1+.2*Math.sin(y*.5)):.55*Math.sin(x*.7+y*.37);
  const v=.88+.12*grain+((x*11+y*7)%31===0?.07:0);
  rgba.set([Math.round((rgb>>16&255)*v),Math.round((rgb>>8&255)*v),Math.round((rgb&255)*v),255],(y*size+x)*4);
 }
 const map=new DataTexture(rgba,size,size);map.colorSpace=SRGBColorSpace;map.magFilter=map.minFilter=NearestFilter;map.generateMipmaps=false;map.needsUpdate=true;
 return new MeshStandardMaterial({map,roughness:.98,flatShading:true,vertexColors:false,side:family==='cloth'?2:0});
}
/** Replace the old cone-only trees and bare poles inside the same LOD
 * group. No flag interaction, weather clock or new story authority. */
export function installBR30MoundPlanting(road:Road){
 const oldGroup=road.moundPlanting.group;
 if(oldGroup.getObjectByName('b-r30-mound-planting'))throw Error('Mound replacement already mounted');
 const survey=surveyBR30MoundPlanting(road);
 const group=new Group();group.name='b-r30-mound-planting';
 const parts:Part[]=[],boxes:Box[]=[],random=seeded(0xb1234),up=new Vector3(0,1,0);
 const unit=new BoxGeometry(1,1,1),taper=new CylinderGeometry(.65,1,1,6);
 const resources:{mesh:InstancedMesh;material:MeshStandardMaterial}[]=[];
 function beam(family:Family,shape:Part['shape'],a:Vector3,b:Vector3,w:number,d:number,color=0xffffff){
  const dir=b.clone().sub(a),q=new Quaternion().setFromUnitVectors(up,dir.clone().normalize()),at=a.clone().add(b).multiplyScalar(.5);
  parts.push({family,shape,at,size:new Vector3(w,dir.length(),d),q,color});
 }
 function block(family:Family,p:Vector3,w:number,h:number,d:number,yaw=0,color=0xffffff){
  parts.push({family,shape:'block',at:p,size:new Vector3(w,h,d),q:new Quaternion().setFromAxisAngle(up,yaw),color});
 }
 for(const s of survey.sites){
  const x=s.east,z=-s.north,h=s.height,k=s.scale,angle=s.angle;
  const base=new Vector3(x,h,z);
  if(s.kind==='charred-tree'){
   const ht=(1.95+random()*1.15)*k,r=(.115+random()*.045)*k;
   const dir=new Vector3(Math.cos(angle),0,Math.sin(angle));
   const pos=(y:number,offset:number)=>base.clone().addScaledVector(dir,offset*k).add(new Vector3(0,y*k,0));
   const root=pos(-.16/k,0),mid=pos(ht/k*.43,.055),upper=pos(ht/k*.79,.15),tip=pos(ht/k,.21);
   beam('bark','trunk',root,mid,r,r,0xded8d5);
   beam('bark','trunk',mid,upper,r*.78,r*.78,0xf2e6df);
   beam('bark','trunk',upper,tip,r*.51,r*.51);
   // Exposed roots follow each real support sample; their lower ends
   // remain embedded, never hang horizontally above the slope.
   for(let i=0;i<3;i++){
    const a=angle+i*2.094+.20*random(),reach=(.28+random()*.12)*k,e=x+Math.cos(a)*reach,n=s.north-Math.sin(a)*reach;
    const ground=road.heightAt(e,n);if(ground===undefined)throw Error('Mound root support disappeared');
    beam('bark','trunk',base.clone().add(new Vector3(0,.16*k,0)),new Vector3(e,ground-.06,-n),.074*k,.064*k);
   }
   // Angular, asymmetrical snapped branches; no evergreen cone or foliage.
   for(let j=0;j<3;j++){
    const t=.48+j*.18,a=angle+(j%2?-1:1)*(1.2+j*.56),root=pos(ht/k*t,.04+t*.16),reach=(.35+random()*.18)*k;
    const end=root.clone().add(new Vector3(Math.cos(a)*reach,(.16+random()*.14)*k,Math.sin(a)*reach));
    beam('bark','trunk',root,end,.068*k*(1-j*.16),.068*k*(1-j*.16),0xd6c5b8);
    const tip=end.clone().add(new Vector3(Math.cos(a+.4)*.14*k,.15*k,Math.sin(a+.4)*.14*k));
    beam('scar','trunk',end,tip,.036*k,.032*k,0xe7dccd);
   }
   // Small pale split at the broken crown and one bark scar.
   beam('scar','block',upper.clone().addScaledVector(dir,.055*k),tip.clone().addScaledVector(dir,.025*k),.045*k,.045*k,0xbfc0bb);
   // Exact trunk-sized conservative box, not a tree-crown air wall.
   const maxLean=.22*k,rad=r+maxLean;
   boxes.push({min:[x-rad,h-.12,z-rad],max:[x+rad,h+ht,z+rad]});
  }else{
   const top=base.clone().add(new Vector3(0,2.0,0));
   block('stone',base.clone().add(new Vector3(0,.04,0)),.32,.22,.32,angle);
   beam('iron','block',base.clone().add(new Vector3(0,-.08,0)),top,.075,.075);
   block('iron',top,.12,.10,.12,angle);
   // Three real folded cloth panels form a readable torn pennant.
   // All flags face the same artistic prevailing bearing, not live wind.
   const a=.7,d=new Vector3(Math.cos(a),0,Math.sin(a));
   for(let j=0;j<3;j++){
    const p=top.clone().addScaledVector(d,.135+j*.22);
    p.y-=.22+j*.025;
    block('cloth',p,.255,.37-j*.055,.035,-a+(j%2?.12:-.10),j===2?0xb5a898:0xffffff);
   }
   for(const y of [1.63,1.88])block('iron',base.clone().add(new Vector3(0,y,0)),.105,.06,.105,angle);
   boxes.push({min:[x-.19,h-.10,z-.19],max:[x+.19,h+2.06,z+.19]});
  }
 }
 const audit=survey.routeAudit([...road.group.userData.colliders,...boxes]);
 const materials=new Map<Family,MeshStandardMaterial>();
 for(const family of Object.keys(palette) as Family[])for(const shape of ['block','trunk'] as const){
  const items=parts.filter(p=>p.family===family&&p.shape===shape);if(!items.length)continue;
  let material=materials.get(family);if(!material){material=surface(family);materials.set(family,material);}
  const mesh=new InstancedMesh(shape==='block'?unit:taper,material,items.length),m=new Matrix4(),col=new Color();
  mesh.name='b-r30-mound/'+family+'/'+shape;
  items.forEach((p,i)=>{m.compose(p.at,p.q,p.size);mesh.setMatrixAt(i,m);mesh.setColorAt(i,col.setHex(p.color));});
  mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,material});
 }
 const children=oldGroup.children.map(child=>({child,visible:child.visible}));
 const before=road.group.userData.colliders as Box[];
 for(const p of children)p.child.visible=false;
 oldGroup.add(group);road.group.userData.colliders=[...before,...boxes];
 let disposed=false;
 return {group,sites:survey.sites,route:survey.route,audit,parts:parts.length,boxes,dispose(){
  if(disposed)return;disposed=true;group.removeFromParent();for(const p of children)p.child.visible=p.visible;
  road.group.userData.colliders=(road.group.userData.colliders as Box[]).filter(b=>!boxes.includes(b));
  resources.forEach(r=>r.mesh.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});unit.dispose();taper.dispose();
 }};
}
