import {auditNightBCableWalkRoutes} from './town-night-b-cable-walk-route';
import {repairReachM,type RepairAnchors} from './town-cable-repair-host';
type Foot=Readonly<{east:number;north:number;height:number}>;
type Dock=Readonly<{station:'cloud-deck'|'summit';cabin:0|1;board:Foot;approach:Foot}>;
type Input={docks:readonly Dock[];repair:RepairAnchors;supportAt:(e:number,n:number)=>number|undefined;blocked:(e:number,n:number,h:number,r:number,b:number)=>boolean;repairFootClear:(foot:Foot)=>boolean;gate:Foot;summitLanding:Foot};
/** The host supplies the actual shared gate and actual surveyed trail end
 * in summit-local metres. This checks terminal-area links, NOT the entire
 * summit trail or front/back domain transition. Use the real installed
 * support and collider functions, never a height-only fallback. */
export function auditNightBRearCableAccess(i:Input){
 const low=i.docks.filter(d=>d.station==='cloud-deck'),high=i.docks.filter(d=>d.station==='summit');
 if(low.length!==2||high.length!==2||new Set(low.map(d=>d.cabin)).size!==2||new Set(high.map(d=>d.cabin)).size!==2)throw Error('Incomplete rear cable terminal survey');
 const goals=(d:readonly Dock[])=>d.flatMap(x=>(['board','approach'] as const).map(k=>({id:x.station+'-'+x.cabin+'-'+k,foot:x[k]})));
 const l=auditNightBCableWalkRoutes({start:i.gate,goals:[...goals(low),...Object.entries(i.repair).map(([id,p])=>({id,foot:{...p,height:i.gate.height+.065},reach:repairReachM,accept:i.repairFootClear}))],bounds:{west:-40,east:20,south:-10,north:40},supportAt:i.supportAt,blocked:i.blocked});
 const u=auditNightBCableWalkRoutes({start:i.summitLanding,goals:goals(high),bounds:{west:0,east:55,south:970,north:1025},supportAt:i.supportAt,blocked:i.blocked});
 return {ready:l.ready&&u.ready,lower:l,upper:u};
}
