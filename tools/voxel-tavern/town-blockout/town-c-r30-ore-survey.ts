import {Group,Raycaster,Vector3} from 'three';
import {createUndergroundOreDistribution,type UndergroundOreAnchor,type UndergroundOrePoint,type UndergroundOrePosition} from '../../../src/shared/underground-ore-distribution.js';
import type {UndergroundMiningTargetView,UndergroundMiningPoint} from '../../../src/shared/underground-mining.js';
import {isMinePresenceFoot} from '../../../src/shared/underground-mine-presence-domain.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type Local=readonly [number,number,number];
type Support=(p:Point)=>boolean;
const layer='underground/mine';
/** Coordinates select accessible wall approaches, not synthetic rock faces.
 * Face position is measured against the actual mounted rock mesh. */
export const r30OreProbes=[
 {id:'workface-1',foot:[-9,-91,72.75],dir:-1},
 {id:'workface-2',foot:[-48,-91,79.95],dir:1},
 {id:'workface-3',foot:[-94,-91,81.75],dir:1},
 {id:'workface-4',foot:[46,-91,98],dir:1},
 {id:'workface-5',foot:[84.5,-91,88],dir:-1},
] as const;
const traceProbes=[
 {id:'trace-side',foot:[10,-91,126.1],dir:-1},
 {id:'trace-waterline',foot:[9.5,-91,135.9],dir:1},
] as const;
export function surveyR30Ore(root:Group,toWorld:(p:Local)=>Point,supports:Support){
 const rock=root.getObjectByName('underground-mine-rock');
 if(!rock)return {kind:'blocked' as const,reason:'missing-rock'};
 root.updateWorldMatrix(true,true);
 const v=(p:Point)=>new Vector3(p.east,p.height,-p.north);
 const world=(p:Vector3):Point=>({east:p.x,north:-p.z,height:p.y});
 const probes=[...r30OreProbes,...traceProbes];
 const surveyed=[];
 for(const probe of probes){
  const [x,y,z]=probe.foot,foot=toWorld(probe.foot),eye=toWorld([x,y+1.05,z]),towards=toWorld([x,y+1.05,z+probe.dir]);
  const direction=v(towards).sub(v(eye)).normalize();
  const hit=new Raycaster(v(eye),direction,0,1.6).intersectObject(rock)[0];
  if(!hit||hit.distance<.85||!supports(foot)||!isMinePresenceFoot(foot.east,foot.north,foot.height))
   return {kind:'blocked' as const,reason:'unsupported-face:'+probe.id};
  // Normal points into the walkable side. Shift 2 cm out so the vein
  // avoids coplanar rock pixels; actual face remains independently recorded.
  const normal=world(direction.clone().negate()),face=world(hit.point);
  const position=world(hit.point.clone().addScaledVector(direction,-.02));
  const coreAt={layer,...foot};
  if(!isMinePresenceFoot(position.east,position.north,position.height)||Math.hypot(position.east-foot.east,position.north-foot.north,position.height-foot.height)>2)
   return {kind:'blocked' as const,reason:'unreachable-face:'+probe.id};
  surveyed.push({id:probe.id,foot,face,normal,position,coreAt,trace:probe.id.startsWith('trace-')});
 }
 const anchors:UndergroundOreAnchor[]=[],points:UndergroundOrePoint[]=[];
 for(const s of surveyed.filter(s=>!s.trace)){
  const id='mine1/ore/'+s.id,anchorId='mine1/face/'+s.id;
  const position=[s.position.east,s.position.north,s.position.height] as const;
  anchors.push({id:anchorId,depth:-90,region:'mining-side-passage',evidence:'R30 actual rock-ray survey '+s.id,
   contains:p=>Math.hypot(p[0]-position[0],p[1]-position[1],p[2]-position[2])<.001});
  points.push({id,anchorId,depth:-90,position,amount:1,mineral:'ordinary-ore',grade:'scatter'});
 }
 const distribution=createUndergroundOreDistribution({anchors,points});
 const ordinary=surveyed.filter(s=>!s.trace).map(s=>{
  const id='mine1/ore/'+s.id,marker=distribution.availablePoint(id,new Set())!;
  const target:UndergroundMiningTargetView={id,kind:'ore',at:{layer,...s.position},surface:'rock',mineral:marker.mineral,strikes:3,hits:0,open:false};
  return {marker,layer,coreAt:s.coreAt,surface:'rock' as const,strikes:3 as const,target,normal:s.normal,face:s.face,foot:s.foot};
 });
 const trace=surveyed.filter(s=>s.trace);
 // A surveyed, physically grounded PROPOSAL only. The two end faces do not
 // independently certify the meteor fall trajectory or the first-find yield.
 // Do not include stardust in the installable ore list until total control
 // settles the 1–2-piece first-find vs per-strike fragments rule.
 return {kind:'ready' as const,ordinary,trace:{sites:trace,centreline:trace.map(s=>[s.position.east,s.position.north,s.position.height] as UndergroundOrePosition),
  radius:1.2,productionReady:false as const},distribution};
}
