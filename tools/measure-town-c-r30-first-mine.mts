/** Actual present host floor projection, independent rectangular union,
 * sequential increments without double-counting overlap. No safe/net/ore
 * claim: dynamic cart, furniture and authority masks are separate. */
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import {undergroundMineSpec} from './voxel-tavern/town-blockout/underground-domain-host.js';
import {firstMineDeepWorks} from '../src/shared/town-c-first-mine-deep-works.js';
import {firstMineShallowWorks} from '../src/shared/town-c-first-mine-shallow-works.js';
import {r30ThinWallRooms} from '../src/shared/town-c-r30-thin-wall-plan.js';
import {r30SupportAnnexRooms} from '../src/shared/town-c-r30-support-annex.js';
import {r30ReturnBay} from '../src/shared/town-c-r30-return-bay.js';
import {r30MainlineRooms} from '../src/shared/town-c-r30-mainline-plan.js';
type Rect={minX:number;maxX:number;minZ:number;maxZ:number};
const rect=(minX:number,maxX:number,minZ:number,maxZ:number):Rect=>({minX,maxX,minZ,maxZ});
const dry=[rect(-2,2,12,32),rect(-.6,.6,32,35),rect(-2,7,35,45),rect(-2,2,45,49),
 rect(-4.2,4.2,49,138.8),rect(-2,2,138.8,140),rect(-72,-4.2,71.6,81.1),
 rect(-100,-72,69.8,82.9),rect(4.2,72,88.7,99.15),rect(72,100,86.9,100.95),
 ...firstMineDeepWorks.rooms,...firstMineShallowWorks.rooms];
const wet=[rect(-3,3,0,4),rect(-2,2,4,12),rect(4.2,7.4,113.4,137)];
function union(rs:readonly Rect[]){
 const xs=[...new Set(rs.flatMap(r=>[r.minX,r.maxX]))].sort((a,b)=>a-b);let sum=0;
 for(let i=1;i<xs.length;i++){
  const middle=(xs[i]+xs[i-1])/2,rows=rs.filter(r=>r.minX<middle&&r.maxX>middle).map(r=>[r.minZ,r.maxZ]).sort((a,b)=>a[0]-b[0]);
  let covered=0,end=-Infinity;
  for(const [a,b] of rows){covered+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b)}
  sum+=covered*(xs[i]-xs[i-1]);
 }return sum;
}
function upward(mesh:Float32Array){
 let sum=0;for(let i=0;i<mesh.length;i+=9){
  const ny=(mesh[i+5]-mesh[i+2])*(mesh[i+6]-mesh[i])-(mesh[i+3]-mesh[i])*(mesh[i+8]-mesh[i+2]);if(ny>0)sum+=ny/2;
 }return sum;
}
const additions=[['thinWalls',r30ThinWallRooms],['supportAnnex',r30SupportAnnexRooms],
 ['returnBay',[r30ReturnBay]],['runningMainline',r30MainlineRooms]] as const;
const flags={thinWalls:false,supportAnnex:false,returnBay:false,runningMainline:false};
let rooms=[...dry,...wet],before=0;
const rows=[];
for(let i=-1;i<additions.length;i++){
 const name=i<0?'old-R30-base':additions[i][0];
 if(i>=0){const [key,rs]=additions[i];flags[key]=true;rooms.push(...rs)}
 const m=createUndergroundMineLayout({...undergroundMineSpec,camp:{...undergroundMineSpec.camp,...flags}});
 const mesh=upward(m.mesh.rock)+upward(m.mesh.rail),analytic=union(rooms),differencePct=Math.abs(mesh-analytic)/analytic*100;
 if(differencePct>=.1)throw Error('mesh/room union differs '+name+' '+differencePct);
 rows.push({name,meshProjection:mesh,analyticProjection:analytic,differencePct,addedUnique:i<0?0:analytic-before});
 before=analytic;
}
console.log(JSON.stringify({scope:'actual floor projection, not net accessible or safe area',waterProjection:union(wet),rows,
 finalDryProjection:before-union(wet),finalGrossProjection:before},null,2));
