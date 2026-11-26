import {Box3,BoxGeometry,CylinderGeometry,Group,Mesh,MeshStandardMaterial,BufferGeometry,DataTexture,NearestFilter,SRGBColorSpace,Vector3,Quaternion} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import {firstMineConnectionDatum as datum} from '../../../src/shared/underground-second-mine-presence-domain.js';
import {townC2CraterCentralMoundProtectedSites as protectedSites} from './town-c2-crater-central-mound';
import {craterFloorWorklightSites,craterFloorLampRockBufferM} from './meteor-crater-floor-worklight-sites';
type Road=Pick<ReturnType<typeof mountWestCraterRoad>,'anchor'|'heightAt'|'group'|'winch'>;
type EN={east:number;north:number};
export const bR30ReturnAxis=Object.freeze({east:-124.5,north:177});
const yaw=datum.yaw,c=Math.cos(yaw),s=Math.sin(yaw),radius=2.35;
const point=(x:number,z:number)=>({east:bR30ReturnAxis.east+c*x+s*z,north:bR30ReturnAxis.north+s*x-c*z});
const gap=(p:EN,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,p.east-b.max[0],0),Math.max(b.min[2]+p.north,-p.north-b.max[2],0));
export function surveyBR30ReturnHeadframe(road:Road){
 const h=road.heightAt(bR30ReturnAxis.east,bR30ReturnAxis.north),bend=road.winch?.survey.descentApproach[1];
 if(h===undefined||!bend||Math.abs(h-(road.anchor.rimHeight-35))>.01||Math.abs(road.anchor.yaw-yaw)>1e-7)
  throw Error('Return candidate axis not on certified crater floor/frame');
 const walls=road.group.userData.colliders as Box[];
 if(!Array.isArray(walls))throw Error('Return candidate requires complete west solids');
 const a=road.anchor,cs=Math.cos(a.yaw),sn=Math.sin(a.yaw);
 const reserves=[...Object.values(protectedSites),...craterFloorWorklightSites.map(v=>({east:a.east+v.east*cs+v.north*sn,north:a.north+v.north*cs-v.east*sn,radius:craterFloorLampRockBufferM})),road.winch!.survey.snakeStoneReservation];
 const reservationGap=Math.min(...reserves.map(p=>Math.hypot(p.east-bR30ReturnAxis.east,p.north-bR30ReturnAxis.north)-p.radius));
 const solidGap=Math.min(...walls.filter(b=>b.min[1]<h+3.9&&b.max[1]>h-.05).map(b=>gap(bR30ReturnAxis,b)));
 if(Math.min(reservationGap,solidGap)<radius)throw Error('Return candidate reservation no longer clear');
 let low=h,high=h,count=0;
 for(let i=-20;i<=20;i++)for(let j=-20;j<=20;j++){
  if(Math.hypot(i,j)>20)continue;
  const p=point(i*radius/20,j*radius/20),y=road.heightAt(p.east,p.north);
  if(y===undefined||!Number.isFinite(y))throw Error('Return candidate missing roof surface');
  low=Math.min(low,y);high=Math.max(high,y);count++;
 }
 if(high-low>.025)throw Error('Return candidate roof not flat');
 const d=Math.hypot(bend.east-bR30ReturnAxis.east,bend.north-bR30ReturnAxis.north);
 const approach={east:bR30ReturnAxis.east+(bend.east-bR30ReturnAxis.east)*1.95/d,north:bR30ReturnAxis.north+(bend.north-bR30ReturnAxis.north)*1.95/d,height:h};
 let routeGap=Infinity,grade=0,prev=h;
 const n=Math.ceil((d-1.95)/.08);
 for(let i=0;i<=n;i++){
  const t=i/n,p={east:approach.east+(bend.east-approach.east)*t,north:approach.north+(bend.north-approach.north)*t};
  const y=road.heightAt(p.east,p.north);
  if(y===undefined||!Number.isFinite(y))throw Error('Return candidate approach missing support');
  if(i)grade=Math.max(grade,Math.abs(y-prev)/((d-1.95)/n));prev=y;
  for(const b of walls)if(b.min[1]<y+1.8&&b.max[1]>y+.015)routeGap=Math.min(routeGap,gap(p,b));
 }
 if(routeGap<.35||grade>.10)throw Error('Return candidate approach is obstructed');
 const dx=bR30ReturnAxis.east-datum.landing.east,dn=bR30ReturnAxis.north-datum.landing.north;
 const localX=datum.localPool[0]+dx*c+dn*s,localZ=datum.localPool[2]+dx*s-dn*c;
 // C a1e5e397 uses the original 5% return-bay floor extended to the new axis.
 const dockHeight=-90-(localZ-12)*.05;
 return {axis:{...bR30ReturnAxis,height:h},yaw,radius,apertureSide:2.2,roofSpan:high-low,roofSamples:count,low,high,solidGap,reservationGap,
  approach,bend,routeGap,grade,localX,localZ,dockHeight,verticalSpan:h-dockHeight,productionReady:false as const};
}
type Family='stone'|'timber'|'iron'|'rust'|'brass';
const colors:Record<Family,number>={stone:0x756b5d,timber:0x795538,iron:0x45474a,rust:0x88513a,brass:0xb79b5a};
function material(f:Family){
 const color=colors[f],size=16,bytes=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const grain=f==='timber'?Math.sin(y*1.7+Math.sin(x*.37)):.65*Math.sin(x*.5+y*.27);
  const v=.88+.10*grain+(x===0||y===0?-.06:0);
  bytes.set([Math.round((color>>16&255)*v),Math.round((color>>8&255)*v),Math.round((color&255)*v),255],(y*size+x)*4);
 }
 const map=new DataTexture(bytes,size,size);map.colorSpace=SRGBColorSpace;map.magFilter=map.minFilter=NearestFilter;map.needsUpdate=true;
 return new MeshStandardMaterial({map,roughness:.96,metalness:f==='iron'?.16:0});
}
/** Review-only, sealed surface counterpart to C's relocated return chamber.
 * No live cut, no floor replacement, no action or lift authority. Caller
 * must keep this detached from production until total controller approval. */
export function buildBR30ReturnHeadframe(road:Road){
 const survey=surveyBR30ReturnHeadframe(road),group=new Group();
 group.name='b-r30-return-headframe-sealed-candidate';
 group.position.set(survey.axis.east,survey.axis.height,-survey.axis.north);group.rotation.y=yaw;
 const mats=Object.fromEntries(Object.keys(colors).map(f=>[f,material(f as Family)])) as Record<Family,MeshStandardMaterial>;
 const batches=new Map<Family,BufferGeometry[]>(),localBoxes:Box[]=[];
 let parts=0;
 function part(f:Family,src:BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0){
  const g=src.index?src.toNonIndexed():src;if(g!==src)src.dispose();
  g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x,y,z);
  const list=batches.get(f)??[];list.push(g);batches.set(f,list);parts++;
 }
 function box(f:Family,x:number,y:number,z:number,w:number,h:number,d:number){part(f,new BoxGeometry(w,h,d),x,y,z)}
 function solid(x:number,y:number,z:number,w:number,h:number,d:number){
  localBoxes.push({min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2]});
 }
 function beam(f:Family,a:Vector3,b:Vector3,w:number,d:number){
  const v=b.clone().sub(a),g=new BoxGeometry(w,v.length(),d),mid=a.clone().add(b).multiplyScalar(.5);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),v.normalize()));
  part(f,g,mid.x,mid.y,mid.z);
 }
 // The cover is continuous solid iron on top of existing uncut ground.
 // Four stone curb strips and two half doors with a visible bolted seam.
 box('iron',0,.095,0,2.20,.14,2.20);solid(0,.15,0,2.48,.34,2.48);
 for(const x of [-1.17,1.17])box('stone',x,.09,0,.14,.18,2.48);
 for(const z of [-1.17,1.17])box('stone',0,.09,z,2.20,.18,.14);
 for(const z of [-.55,0,.55])box('rust',0,.175,z,2.10,.035,.06);
 for(const x of [-.95,.95])for(let z=-.9;z<=.91;z+=.3)box('brass',x,.18,z,.055,.055,.055);
 for(const x of [-.27,.27]){
  box('rust',x,.19,0,.24,.07,.055);
  for(const s of [-1,1])box('iron',x+s*.095,.235,0,.05,.12,.05);
  box('iron',x,.29,0,.24,.055,.055);
 }
 // Two pairs of timber/iron legs with independently fitted stone feet.
 for(const x of [-1.22,.91])for(const z of [-1.32,1.32]){
  const p=point(x,z),y=road.heightAt(p.east,p.north)!-survey.axis.height;
  box('stone',x,y+.12,z,.36,.26,.36);solid(x,y+.12,z,.36,.26,.36);
  box('timber',x,1.60,z,.20,2.96,.22);solid(x,1.60,z,.30,2.96,.29);
  for(const h of [.35,1.7,2.88]){
   box('iron',x,h,z,.25,.11,.27);
   for(const a of [-1,1])box('brass',x+a*.136,h,z,.022,.05,.05);
  }
 }
 for(const z of [-1.32,1.32]){
  box('timber',-.155,3.12,z,2.48,.28,.27);
  box('iron',-.155,3.28,z,2.54,.07,.31);
  beam('timber',new Vector3(-1.22,2.16,z),new Vector3(-.44,2.98,z),.12,.13);
  beam('timber',new Vector3(.91,2.16,z),new Vector3(.15,2.98,z),.12,.13);
  // Side bracing stays outside the 2.2m opening; front side remains open.
  box('rust',-.155,.76,z,2.10,.10,.13);solid(-.155,.76,z,2.10,.10,.13);
 }
 box('timber',-.155,3.20,0,.28,.30,2.94);
 box('iron',-.155,3.37,0,.34,.075,2.94);
 // Existing transport owner will eventually supply motion; static parked
 // drum, gearbox and retained cable end are only the sealed prefab art.
 part('iron',new CylinderGeometry(.16,.16,1.28,12),-.30,3.57,0,Math.PI/2);
 for(const z of [-.48,.48])part('rust',new CylinderGeometry(.34,.34,.095,12),-.30,3.57,z,Math.PI/2);
 for(let i=0;i<8;i++)part('brass',new CylinderGeometry(.235,.235,.055,12),-.30,3.57,-.25+i*.07,Math.PI/2);
 box('iron',-.30,3.52,-.82,.55,.58,.42);
 box('rust',-.30,3.52,-1.065,.43,.43,.065);
 box('iron',-.30,3.17,0,.05,.32,.05);
 // Rear guard prevents approaching the sealed shaft from the wrong side.
 box('timber',-1.29,.85,0,.12,.13,2.42);solid(-1.29,.85,0,.12,.13,2.42);
 box('timber',-1.29,.42,0,.12,.11,2.42);solid(-1.29,.42,0,.12,.11,2.42);
 for(const [f,geos] of batches){
  const g=mergeGeometries(geos);geos.forEach(p=>p.dispose());
  if(!g)throw Error('Return prefab batch failed');g.computeBoundingSphere();
  group.add(new Mesh(g,mats[f]));
 }
 group.updateMatrixWorld(true);
 const worldBoxes:Box[]=localBoxes.map(b=>{
  const bb=new Box3(new Vector3().fromArray(b.min),new Vector3().fromArray(b.max)).applyMatrix4(group.matrixWorld);
  return {min:bb.min.toArray(),max:bb.max.toArray()};
 });
 // Keep this model inside the previously surveyed cylindrical reservation.
 let extent=0;
 group.traverse(o=>{if(o instanceof Mesh){const p=o.geometry.getAttribute('position');for(let i=0;i<p.count;i++)extent=Math.max(extent,Math.hypot(p.getX(i),p.getZ(i)));}});
 if(extent>radius)throw Error('Return prefab exceeded surveyed footprint');
 let candidateGap=Infinity;
 const length=Math.hypot(survey.bend.east-survey.approach.east,survey.bend.north-survey.approach.north);
 for(let i=0;i<=Math.ceil(length/.08);i++){
  const t=i/Math.ceil(length/.08),p={east:survey.approach.east+(survey.bend.east-survey.approach.east)*t,north:survey.approach.north+(survey.bend.north-survey.approach.north)*t};
  candidateGap=Math.min(candidateGap,...worldBoxes.filter(b=>b.min[1]<survey.axis.height+1.8&&b.max[1]>survey.axis.height+.015).map(b=>gap(p,b)));
 }
 if(candidateGap<.35)throw Error('Return prefab narrows its own approach '+candidateGap);
 return {group,survey,worldBoxes,parts,extent,candidateGap,dispose(){
  group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose()});
  for(const m of Object.values(mats)){m.map?.dispose();m.dispose();}
 }};
}
