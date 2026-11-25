/** Batch 91: proposed -140 layout, in local metres. No world/domain registration.
 * Hydrology is supplied by the existing authority; this is not a night clock. */
import {secondMineDryWings} from './underground-second-mine-dry-wings.js';
export type MineRiverState = 'high'|'middle'|'low';
export type MineLocalPoint = Readonly<{east:number;north:number}>;
type Room = Readonly<{id:string;x0:number;x1:number;n0:number;n1:number;ceiling:number;river?:boolean}>;
export const secondMineRooms: readonly Room[] = Object.freeze([
  {id:'entry',x0:-6,x1:6,n0:0,n1:24,ceiling:5},
  {id:'iron-gallery',x0:-4,x1:4,n0:24,n1:96,ceiling:4.5},
  {id:'near-shore',x0:-48,x1:48,n0:96,n1:128,ceiling:12},
  {id:'dark-river',x0:-48,x1:48,n0:128,n1:146,ceiling:12,river:true},
  {id:'far-shore',x0:-48,x1:48,n0:146,n1:182,ceiling:12},
  {id:'dry-bypass',x0:48,x1:55,n0:112,n1:164,ceiling:7},
  {id:'exit',x0:-6,x1:6,n0:182,n1:198,ceiling:5},
  ...secondMineDryWings,
]);
export const secondMineAnchors = Object.freeze({
  entry:{east:0,north:2}, supportCamp:{east:-3.5,north:10},
  nearPier:{east:0,north:126}, farPier:{east:0,north:148},
  riverCamp:{east:-12,north:150}, exit:{east:0,north:196},
  bypass:[{east:0,north:112},{east:51.5,north:112.8},{east:51.5,north:159},{east:0,north:159}],
});
export const secondMineRiver = Object.freeze({x0:-48,x1:48,n0:128,n1:146,bed:-.7});
export function secondMineRoomAt(e:number,n:number) {
  return secondMineRooms.find(r=>e>=r.x0&&e<=r.x1&&n>=r.n0&&n<=r.n1);
}
export function secondMineBed(n:number) {
  return secondMineRiver.bed*Math.max(0,Math.min(1,(n-128)/4,(146-n)/4));
}
export function secondMineFloor(e:number,n:number,state:MineRiverState) {
  const room=secondMineRoomAt(e,n);
  if(!room)return undefined;
  if(room.river)return state==='low'?secondMineBed(n):undefined;
  return 0;
}
/** Entire circle must be supported and the step must fit; no teleport or boat authority. */
export function canStandSecondMine(e:number,n:number,state:MineRiverState,r=.27) {
  if(!Number.isFinite(e)||!Number.isFinite(n)||!Number.isFinite(r)||r<0)return false;
  const base=secondMineFloor(e,n,state);
  if(base===undefined)return false;
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    const y=secondMineFloor(e+r*Math.cos(a),n+r*Math.sin(a),state);
    if(y===undefined||Math.abs(y-base)>.22)return false;
  }
  return true;
}
export const secondMineLocalFrame = {depth:-140, status:'candidate-unregistered'} as const;
