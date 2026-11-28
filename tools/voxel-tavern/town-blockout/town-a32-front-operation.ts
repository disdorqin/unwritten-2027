import {prepareNightBPublicFrontCableAsync} from './town-night-b-public-front-cable';
import type {NightBAuditSliceOptions} from './town-night-b-audit-slices';
import {auditNightBCableWalkRoutes} from './town-night-b-cable-walk-route';
import type {RepairAnchors} from './town-cable-repair-host';
type Input=Parameters<typeof prepareNightBPublicFrontCableAsync>[0];
type Foot={east:number;north:number;height:number};
export type FrontRoads=readonly (readonly Foot[])[];
/** Full B sweep and actual repair props; routes rooted at real roads/terrace. */
export async function installA32FrontOperation(input:Omit<Input,'certifyRoutes'> & {
 roads:FrontRoads;groundAt:(e:number,n:number)=>number|undefined;allowsUphill:(a:Foot,b:Foot)=>boolean;
},options:NightBAuditSliceOptions={}){
 const {roads,groundAt,allowsUphill,supportAt,blocked}=input;
 let routeAudit:unknown;
 const result=await prepareNightBPublicFrontCableAsync({...input,certifyRoutes(docks,anchors,walkClear){
  const lowRoad=roads.at(-1),middleRoad=roads[0];if(!lowRoad?.length||!middleRoad?.length)return false;
  const goals=(station:string)=>docks.filter(d=>d.station===station).flatMap(d=>(['board','approach'] as const).map(k=>({id:station+'-'+d.cabin+'-'+k,foot:d[k]})));
  const repair=(key:keyof RepairAnchors)=>{const a=anchors[key],height=supportAt(a.east,a.north);return height===undefined?undefined:{id:key,foot:{...a,height},reach:2.2,accept:walkClear};};
  const brake=repair('brake'),wheel=repair('cableWheel'),tower=repair('weightTower'),frame=repair('weightFrame');
  if(!brake||!wheel||!tower||!frame)return false;
  const wheelIndex=lowRoad.reduce((best,p,i)=>Math.hypot(p.east-wheel.foot.east,p.north-wheel.foot.north)<Math.hypot(lowRoad[best]!.east-wheel.foot.east,lowRoad[best]!.north-wheel.foot.north)?i:best,0),wheelStart=lowRoad[wheelIndex]!;
  const clear=(e:number,n:number,h:number,r:number,b:number)=>blocked(e,n,h,r,b)||!walkClear({east:e,north:n,height:h});
  const step=(a:Foot,b:Foot)=>(a.height>(groundAt(a.east,a.north)??Infinity)+.04||b.height>(groundAt(b.east,b.north)??Infinity)+.04)&&allowsUphill(a,b)&&allowsUphill(b,a);
  const common={supportAt,blocked:clear,allowsSupportedStep:step};
  const audits=[
   auditNightBCableWalkRoutes({...common,start:lowRoad[0]!,goals:[...goals('base'),brake],bounds:{west:498,east:552,south:312,north:375},maxHeightDrift:12}),
   auditNightBCableWalkRoutes({...common,start:middleRoad[0]!,goals:[...goals('middle'),tower,frame],bounds:{west:420,east:460,south:500,north:540},maxHeightDrift:12}),
   auditNightBCableWalkRoutes({...common,start:{east:324,north:655,height:347},goals:goals('summit'),bounds:{west:284,east:354,south:628,north:665},maxHeightDrift:.15}),
   auditNightBCableWalkRoutes({...common,start:wheelStart,goals:[wheel],bounds:{west:Math.floor(Math.min(wheelStart.east,wheel.foot.east)-12),east:Math.ceil(Math.max(wheelStart.east,wheel.foot.east)+12),south:Math.floor(Math.min(wheelStart.north,wheel.foot.north)-12),north:Math.ceil(Math.max(wheelStart.north,wheel.foot.north)+12)},maxHeightDrift:30,step:.5})];
  let roadFailure:Foot|undefined,roadSamples=0;
  for(let i=0;i<wheelIndex&&!roadFailure;i++){
   const a=lowRoad[i]!,b=lowRoad[i+1]!,count=Math.max(1,Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.25));
   for(let j=0;j<=count;j++){const t=j/count,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t,h=supportAt(e,n);roadSamples++;
    if(h===undefined||Math.abs(h-(a.height+(b.height-a.height)*t))>.25||clear(e,n,h,.27,1.8)){roadFailure={east:e,north:n,height:h??NaN};break;}}
  }
  routeAudit={roadSamples,roadFailure,audits:audits.map(a=>({ready:a.ready,samples:a.samples,visited:a.visited,reasons:a.reasons,routes:a.routes.map(({path,...p})=>({...p,points:path?.length}))}))};
  return !roadFailure&&audits.every(a=>a.ready);
 }},options);
 return {...result,routeAudit};
}
