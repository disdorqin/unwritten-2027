import {secondMineWorldFrame,secondMineRegisteredFeet,secondMineToWorld} from '../../../src/shared/underground-second-mine-presence-domain.js';

export type R30Point=Readonly<{east:number;north:number;height:number}>;
type Layer='minus140'|'minus165'|'minus190';
export type R30LayerFrame=Readonly<{layer:Layer;status:'c-certified';worldOffset:R30Point;yaw:number;certifiedBy:string}>;
const round=(v:number)=>Math.abs(v)<1e-10?0:v;
/** ENY north is -Three.z. Exactly the existing second-mine transform;
 * north MUST NOT be negated a second time in the C2 consumer. */
export function r30LayerWorld(frame:R30LayerFrame,p:R30Point):R30Point{
 const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw),o=frame.worldOffset;
 return {east:o.east+p.east*c-p.north*s,north:o.north+p.east*s+p.north*c,height:o.height+p.height};
}
export function r30LayerLocal(frame:R30LayerFrame,p:R30Point):R30Point{
 const c=Math.cos(frame.yaw),s=Math.sin(frame.yaw),o=frame.worldOffset,e=p.east-o.east,n=p.north-o.north;
 return {east:e*c+n*s,north:-e*s+n*c,height:p.height-o.height};
}
const certifiedBy='C-R04 geometry datum, integration f8380557 + registered -140; palace archived shell 9ab161e8';
function frame(layer:Layer,yaw:number,localEntry:R30Point,worldEntry:R30Point):R30LayerFrame{
 const c=Math.cos(yaw),s=Math.sin(yaw);
 return Object.freeze({layer,status:'c-certified',yaw,certifiedBy,worldOffset:Object.freeze({
  east:worldEntry.east-localEntry.east*c+localEntry.north*s,
  north:worldEntry.north-localEntry.east*s-localEntry.north*c,height:worldEntry.height-localEntry.height,
 })});
}
function advance(p:R30Point,e:number,n:number,d:number,height:number):R30Point{
 return Object.freeze({east:p.east+e*d,north:p.north+n*d,height});
}
const yaw=secondMineWorldFrame.yaw,forward={east:-Math.sin(yaw),north:Math.cos(yaw)};
const secondFrame=frame('minus140',yaw,{east:0,north:2,height:0},secondMineRegisteredFeet.entry);
export const r30DeepLocalFeet=Object.freeze({
 minus140:Object.freeze({entry:{east:0,north:2,height:0},exit:{east:0,north:196,height:0}}),
 minus165:Object.freeze({entry:{east:1,north:0,height:0},exit:{east:179,north:0,height:0}}),
 minus190:Object.freeze({
  // Archived original shell starts at N0, actual supported route starts N.5.
  // N105.7 is antechamber, not arrival. N125.8 is blocked at sealed vault.
  entry:{east:0,north:.5,height:0},antechamber:{east:0,north:105.7,height:-2.4},
  exit:{east:0,north:125.4,height:-2.4},
 }),
});
const cityEntry=advance(secondMineRegisteredFeet.exit,forward.east,forward.north,134,-165);
const cityFrame=frame('minus165',yaw+Math.PI/2,r30DeepLocalFeet.minus165.entry,cityEntry);
const cityExit=r30LayerWorld(cityFrame,r30DeepLocalFeet.minus165.exit);
// The -190 floor datum is -2.4; upper stair entry is -187.6. The
// connecting walk descends 22.6m, then the original stairs descend 2.4m.
const palaceEntry=advance(cityExit,forward.east,forward.north,120,-187.6);
const palaceFrame=frame('minus190',yaw,r30DeepLocalFeet.minus190.entry,palaceEntry);
export const r30DeepFrames=Object.freeze({minus140:secondFrame,minus165:cityFrame,minus190:palaceFrame});
export const r30DeepWorldFeet=Object.freeze({
 minus140:{entry:secondMineRegisteredFeet.entry,exit:secondMineRegisteredFeet.exit},
 minus165:{entry:r30LayerWorld(cityFrame,r30DeepLocalFeet.minus165.entry),exit:cityExit},
 minus190:{entry:r30LayerWorld(palaceFrame,r30DeepLocalFeet.minus190.entry),
 antechamber:r30LayerWorld(palaceFrame,r30DeepLocalFeet.minus190.antechamber),
 exit:r30LayerWorld(palaceFrame,r30DeepLocalFeet.minus190.exit)},
});
export type R30DepthLink=Readonly<{id:string;from:Layer;to:Layer;start:R30Point;end:R30Point;length:number;landingRun:number;width:number;clearance:number;grade:number}>;
function link(id:string,from:Layer,to:Layer,start:R30Point,end:R30Point):R30DepthLink{
 const length=Math.hypot(end.east-start.east,end.north-start.north),landingRun=2;
 return Object.freeze({id,from,to,start:Object.freeze({...start}),end:Object.freeze({...end}),length,
  landingRun,width:3.4,clearance:3.5,grade:Math.abs(end.height-start.height)/(length-2*landingRun)});
}
export const r30DepthLinks=Object.freeze([
 link('minus140-to-minus165','minus140','minus165',secondMineRegisteredFeet.exit,cityEntry),
 link('minus165-to-minus190','minus165','minus190',cityExit,palaceEntry),
]);
export function r30LinkFloor(link:R30DepthLink,along:number):number|undefined{
 if(!Number.isFinite(along)||along<0||along>link.length)return;
 const t=Math.max(0,Math.min(1,(along-link.landingRun)/(link.length-2*link.landingRun)));
 return link.start.height+(link.end.height-link.start.height)*t;
}
export function r30LinkPoint(link:R30DepthLink,along:number,lateral=0):R30Point|undefined{
 const h=r30LinkFloor(link,along);
 if(h===undefined||!Number.isFinite(lateral)||Math.abs(lateral)>link.width/2)return;
 const e=(link.end.east-link.start.east)/link.length,n=(link.end.north-link.start.north)/link.length;
 return {east:link.start.east+e*along-n*lateral,north:link.start.north+n*along+e*lateral,height:h};
}
/** Shared timber stations for the real corridor mesh and capsule query. */
export const r30RibProfile=Object.freeze({inset:.14,halfLength:.22,beamDepth:.26});
export function r30LinkRibs(link:R30DepthLink){
 const stations:number[]=[];
 for(let t=4;t<link.length-3;t+=7)stations.push(t);
 return stations;
}
/** The guide cage projects inward from its support only above 2.265m.
 * This exact envelope is shared by the visible mounting and tall queries. */
export const r30GuideLantern=Object.freeze({inset:.25,halfWidth:.105,halfLength:.17,bottom:2.265});
export function r30LinkLanternStations(link:R30DepthLink){
 return r30LinkRibs(link).filter((_,i)=>i%2===0).map((along,i)=>({along,side:i%2===0?1:-1}));
}
/** Collision query is same geometric support as the visible ramp. No room
 * membership, unlock, water phase, or transition is granted by this function. */
export function r30LinkPassage(link:R30DepthLink,east:number,north:number,radius=.27,height=1.8){
 // The overhead timber underside is .26m below the nominal roof.
 const clearance=link.clearance-r30RibProfile.beamDepth;
 if(![east,north,radius,height].every(Number.isFinite)||radius<=0||height<=0||height>clearance)return;
 const e=(link.end.east-link.start.east)/link.length,n=(link.end.north-link.start.north)/link.length;
 const dx=east-link.start.east,dn=north-link.start.north,along=dx*e+dn*n,lateral=-dx*n+dn*e;
 if(along< -1e-6||along>link.length+1e-6||Math.abs(lateral)+radius>link.width/2)return;
 // Timber feet and iron straps project 14cm into each side of the
 // tunnel. Test the capsule against the same along/lateral footprint.
 const sideGap=Math.max(0,link.width/2-r30RibProfile.inset-Math.abs(lateral));
 if(sideGap<radius&&r30LinkRibs(link).some(t=>Math.hypot(sideGap,Math.max(0,Math.abs(along-t)-r30RibProfile.halfLength))<radius))return;
 if(height>r30GuideLantern.bottom-.035&&r30LinkLanternStations(link).some(s=>{
  const center=s.side*(link.width/2-r30GuideLantern.inset);
  return Math.hypot(Math.max(0,Math.abs(lateral-center)-r30GuideLantern.halfWidth),Math.max(0,Math.abs(along-s.along)-r30GuideLantern.halfLength))<radius;
 }))return;
 const floor=r30LinkFloor(link,Math.max(0,Math.min(link.length,along)));
 return floor===undefined?undefined:{floor,clearance,along,lateral};
}
function bounds(frame:R30LayerFrame,local:{minE:number;maxE:number;minN:number;maxN:number;minH:number;maxH:number}){
 const corners=[local.minE,local.maxE].flatMap(e=>[local.minN,local.maxN].map(n=>r30LayerWorld(frame,{east:e,north:n,height:0})));
 const origin={east:Math.floor(Math.min(...corners.map(p=>p.east)))-2,north:Math.floor(Math.min(...corners.map(p=>p.north)))-2,height:local.minH};
 return {origin,bounds:{width:Math.ceil(Math.max(...corners.map(p=>p.east)))-origin.east+2,depth:Math.ceil(Math.max(...corners.map(p=>p.north)))-origin.north+2,height:local.maxH-local.minH}};
}
export const r30DeepRoomProposals=Object.freeze({
 minus165:bounds(cityFrame,{minE:0,maxE:180,minN:-32,maxN:32,minH:-178,maxH:-156}),
 minus190:bounds(palaceFrame,{minE:-22,maxE:22,minN:0,maxN:126,minH:-202,maxH:-179}),
});
/** The coordinates above are C's layout contract, not a live room grant.
 * C2 must use its real shell/collision and A must wire the sole authority.
 * This guard rejects any changed or missing source instead of guessing. */
export function validateR30DeepReceivingFeet(supports:(layer:Layer,local:R30Point)=>boolean){
 const f=r30DeepLocalFeet;
 return {
  minus140:supports('minus140',f.minus140.entry)&&supports('minus140',f.minus140.exit),
  minus165:supports('minus165',f.minus165.entry)&&supports('minus165',f.minus165.exit),
  minus190:supports('minus190',f.minus190.entry)&&supports('minus190',f.minus190.antechamber)&&supports('minus190',f.minus190.exit),
  productionReady:false as const,
 };
}
export function r30CheckExistingSecondFrame(){
 return ['entry','exit'].every(k=>{
  const local=r30DeepLocalFeet.minus140[k as 'entry'|'exit'],a=secondMineToWorld(local),b=r30LayerWorld(secondFrame,local);
  return round(Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height))===0;
 });
}
