import type {createNightBFrontService} from './town-night-b-summit-front-service';
import type {createNightBLine2Service} from './town-night-b-summit-line2-service';
import type {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import type {mountRidgeCableFacilities} from './town-d-r30-cable-facilities';
type Foot={east:number;north:number;height:number};
type Cabin=0|1;
type Front=ReturnType<typeof createNightBFrontService>;
type Upper=ReturnType<typeof createNightBLine2Service>;
export type CableRideFrame=Readonly<{line:1|2;cabin:Cabin;feet:Foot;whiteout:boolean;station:string|null;synchronized:boolean}>;
type Ride={line:1|2;cabin:Cabin};
type Input={
 front?:Front;frontFacilities?:ReturnType<typeof mountRidgeCableFacilities>;
 upper?:Upper;upperRopeway?:ReturnType<typeof createTownD2R30Ropeway>;
 /** Actual D2 assembly world origin; never infer it from player position. */
 upperOrigin:Readonly<{east:number;north:number}>;
 /** Active room / scene and actual ground transfer must agree. */
 domain:()=> 'town'|'summit'|undefined;
 /** Host obtains the final supported landing, including external collisions. */
 acceptLanding:(line:1|2,feet:Foot,station:string)=>boolean;
};
/** One ride per local player, no second timetable or position integration.
 * Input adapters supply the authoritative epochs; all world poses derive from
 * the same actual rendered car. The public owner controls movement locking,
 * avatar publication and domain transfers. */
export function createNightBCableRideHost(input:Input){
 let ride:Ride|undefined,last:CableRideFrame|undefined;
 const local=(p:Foot)=>({...p,east:p.east-input.upperOrigin.east,north:p.north-input.upperOrigin.north});
 const world=(p:Foot)=>({...p,east:p.east+input.upperOrigin.east,north:p.north+input.upperOrigin.north});
 const finite=(p:Foot)=>[p.east,p.north,p.height].every(Number.isFinite);
 // A parked facility has immutable static car colliders: the caller MUST
 // supply a certified open variant, not move the closed production model.
 const frontGroups=input.frontFacilities&&[-1,1].map(side=>input.frontFacilities!.group.getObjectByName('d-r30-cable-cabin-'+side));
 const frontBound=!!input.front?.physical&&!!frontGroups?.every(g=>g?.parent===input.frontFacilities!.group&&!g.getObjectByName('ridge-cable-parked-car-batch'));
 function updateVisuals(){
  if(frontBound&&input.front){const states=input.front.present();states.forEach((s,i)=>{const g=frontGroups![i]!;g.position.set(s.feet.east,s.feet.height,-s.feet.north)});}
  if(input.upper?.physical&&input.upperRopeway)input.upper.present();
 }
 function pose():CableRideFrame|undefined{
  if(!ride)return;
  if(ride.line===1){const p=input.front?.ridePose({cabin:ride.cabin});if(p)last={line:1,cabin:ride.cabin,feet:{...p.feet},whiteout:false,station:p.station,synchronized:true};}
  else {const p=input.upper?.ridePose({cabinIndex:ride.cabin});if(p)last={line:2,cabin:ride.cabin,feet:world(p.feet),whiteout:p.whiteout,station:p.station,synchronized:true};}
  // During a network gap, keep the last valid location and lock walking.
  // No local wall-clock extrapolation and no teleport to a station.
  const current=ride.line===1?input.front?.cabinStates():input.upper?.cabinStates();
  return last&&{...last,feet:{...last.feet},synchronized:!!current};
 }
 function boardCandidate(feet:Foot,line:1|2,cabin:Cabin){
  if(ride||!finite(feet)||(cabin!==0&&cabin!==1))return false;
  if(line===1)return input.domain()==='town'&&frontBound&&!!input.front?.board(feet,cabin);
  return input.domain()==='summit'&&!!input.upperRopeway&&!!input.upper?.board(local(feet),cabin);
 }
 function board(feet:Foot,line:1|2,cabin:Cabin){
  if(!boardCandidate(feet,line,cabin))return false;
  ride={line,cabin};last=undefined;const p=pose();if(!p?.synchronized){ride=undefined;last=undefined;return false;}return true;
 }
 function exit(){
  if(!ride)return;const p=pose();if(!p?.synchronized||!p.station)return;
  const candidate=ride.line===1?input.front?.exit({cabin:ride.cabin}):input.upper?.exit({cabinIndex:ride.cabin});
  if(!candidate)return;const foot=ride.line===1?candidate:world(candidate);
  if(!finite(foot)||!input.acceptLanding(ride.line,foot,p.station))return;
  ride=undefined;last=undefined;return foot;
 }
 return {updateVisuals,pose,boardCandidate,board,exit,riding:()=>!!ride,frontBound,upperBound:!!input.upper?.physical&&!!input.upperRopeway};
}
