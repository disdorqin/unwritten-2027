type Foot=Readonly<{east:number;north:number;height:number}>;
type Support=(east:number,north:number,height:number)=>number|undefined;
// Actual surveyed overlap E298..302 / N666.5..669.  The 4m gate's
// body clearance leaves 1.73m either side of its centre.
export const a31GateNorth=668;
export const a31GateHalfWidth=1.73;
export function a31GateFoot(p:Foot){
 return [p.east,p.north,p.height].every(Number.isFinite)&&Math.abs(p.east-300)<=a31GateHalfWidth&&p.north>=667&&p.north<=669&&Math.abs(p.height-347)<=.08;
}
export function a31GateCrossing(active:boolean,from:Foot,to:Foot){
 if(![from.east,from.north,from.height,to.east,to.north,to.height].every(Number.isFinite))return false;
 // Ignore low front-ridge routes running underneath the cloud apron.
 if(Math.abs(from.height-347)>.43||Math.abs(to.height-347)>.43)return false;
 if(Math.abs(from.east-300)>3||Math.abs(to.east-300)>3)return false;
 return active?from.north>=a31GateNorth&&to.north<a31GateNorth:from.north<a31GateNorth&&to.north>=a31GateNorth;
}
export function a31GateEligible(certified:boolean,from:Foot,to:Foot,front:Support,rear:Support){
 if(!certified||!a31GateFoot(from)||!a31GateFoot(to))return false;
 // Check both actual body footprints at each end plus midpoint. Never
 // accept a nearest-spawn fallback or a fabricated common height.
 for(const p of [from,{east:(from.east+to.east)/2,north:(from.north+to.north)/2,height:(from.height+to.height)/2},to]){
  const a=front(p.east,p.north,p.height),b=rear(p.east,p.north,p.height);
  if(a===undefined||b===undefined||![a,b].every(Number.isFinite)||Math.abs(a-p.height)>.08||Math.abs(b-p.height)>.08||Math.abs(a-b)>.08)return false;
 }
 return Math.hypot(to.east-from.east,to.north-from.north)<=.45;
}
