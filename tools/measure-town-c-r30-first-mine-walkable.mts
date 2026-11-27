/**
 * Actual host capsule footprint and connectivity, not a geometric exact
 * area integral. The independent geometric projection is measured by
 * measure-town-c-r30-first-mine.mts. This script reports convergence of
 * two raw centre-sample resolutions and counts only actual query support.
 */
import {Group} from 'three';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from './voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import type {UndergroundMiningTargetView} from '../src/shared/underground-mining.js';
import {r30OreProbes} from './voxel-tavern/town-blockout/town-c-r30-ore-survey.js';
import {firstMineShallowWorks} from '../src/shared/town-c-first-mine-shallow-works.js';
let walls:UndergroundMiningTargetView[]=[];
const parent=new Group(),host=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedMiningTargets:()=>walls});
if(host.kind!=='ready'||host.oreSurvey.kind!=='ready')throw Error('mine or ore survey unavailable');
const mine=createUndergroundMineLayout(undergroundMineSpec),toWorld=(x:number,z:number)=>host.mounted.toWorld([x,-91,z])!;
const safety=[host.campFireWorld,...(mine.supportStation?[host.mounted.toWorld([mine.supportStation.x,mine.supportStation.y,mine.supportStation.z])!]:[])];
const ore=host.oreSurvey.ordinary.map(s=>s.target.at);
const groups=host.encounterSurvey?.groups??[];
const query=(x:number,z:number)=>{
 // Cheap exact-layout prefilter avoids scanning furnishings outside the shell.
 const candidate=mine.queryPassage(x,z,.27,1.1,'closed',new Set(walls.filter(w=>w.open).map(w=>w.id)));
 if(!candidate)return;
 const p=toWorld(x,z),stand=host.passageAt(p.east,p.north,'standing'),q=stand??host.passageAt(p.east,p.north,'crouching');
 if(q)return {q,stand:!!stand,p};
};
function run(step:number){
 const xmin=-100,xmax=100,zmin=0,zmax=140,nx=Math.round((xmax-xmin)/step),nz=Math.round((zmax-zmin)/step);
 const size=nx*nz,ok=new Uint8Array(size),seen=new Uint8Array(size),safe=new Uint8Array(size),nearOre=new Uint8Array(size),floors=new Float32Array(size);
 const local=(i:number)=>[xmin+(i%nx+.5)*step,zmin+(Math.floor(i/nx)+.5)*step] as const;
 const index=(x:number,z:number)=>Math.floor((z-zmin)/step)*nx+Math.floor((x-xmin)/step);
 let standing=0,crouch=0,wet=0,safeDry=0,ore15=0;
 for(let i=0;i<size;i++){
  const [x,z]=local(i),a=query(x,z);if(!a)continue;
  const {q,stand,p}=a;
  ok[i]=q.waterDepth>0?3:stand?1:2;floors[i]=q.floor;
  safe[i]=safety.some(s=>Math.hypot(s.east-p.east,s.north-p.north)<30)?1:0;
  nearOre[i]=ore.some(o=>Math.hypot(o.east-p.east,o.north-p.north)<15)?1:0;
  if(ok[i]===3)wet++;else{if(ok[i]===1)standing++;else crouch++;safeDry+=safe[i];ore15+=nearOre[i]}
 }
 const seed=index(0,12.3);if(!ok[seed])throw Error('shore seed blocked');
 const q=[seed];seen[seed]=1;let reachableDry=0,reachableWet=0,reachableCrouch=0,reachableSafe=0,reachableOutsideOreAndSafety=0;
 for(let j=0;j<q.length;j++){
  const i=q[j],[x,z]=local(i);
  if(ok[i]===3)reachableWet++;else {reachableDry++;reachableCrouch+=Number(ok[i]===2);reachableSafe+=safe[i];reachableOutsideOreAndSafety+=Number(!safe[i]&&!nearOre[i])}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const ix=i%nx+dx,iz=Math.floor(i/nx)+dz;if(ix<0||ix>=nx||iz<0||iz>=nz)continue;
   const ni=iz*nx+ix;if(!ok[ni]||seen[ni]||Math.abs(floors[ni]-floors[i])>.22)continue;
   const [xx,zz]=local(ni),mid=query((xx+x)/2,(zz+z)/2);
   if(!mid||Math.abs(mid.q.floor-floors[i])>.22||Math.abs(mid.q.floor-floors[ni])>.22)continue;
   seen[ni]=1;q.push(ni);
  }
 }
 const area=(n:number)=>n*step*step;
 const notReached=[...ok].reduce((s,a,i)=>s+Number(a!==0&&!seen[i]),0);
 const islands=[] as {area:number;bounds:{minX:number;maxX:number;minZ:number;maxZ:number}}[];
 // Diagnostic components of unsampled connectivity, not teleport fixes.
 const classified=seen.slice();
 for(let i=0;i<size;i++){
  if(!ok[i]||classified[i])continue;
  const list=[i];classified[i]=1;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let k=0;k<list.length;k++){
   const j=list[k],[x,z]=local(j);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const ix=j%nx+dx,iz=Math.floor(j/nx)+dz;if(ix<0||ix>=nx||iz<0||iz>=nz)continue;
    const n=iz*nx+ix;if(!ok[n]||classified[n]||Math.abs(floors[n]-floors[j])>.22)continue;
    const [xx,zz]=local(n),mid=query((xx+x)/2,(zz+z)/2);
    if(!mid||Math.abs(mid.q.floor-floors[j])>.22||Math.abs(mid.q.floor-floors[n])>.22)continue;
    classified[n]=1;list.push(n);
   }
  }
  islands.push({area:area(list.length),bounds:{minX,maxX,minZ,maxZ}});
 }
 islands.sort((a,b)=>b.area-a.area);
 return {step,standingDry:area(standing),crouchOnlyDry:area(crouch),wet:area(wet),dryNet:area(standing+crouch),
  safeDry:area(safeDry),ore15Dry:area(ore15),reachableDry:area(reachableDry),reachableWet:area(reachableWet),reachableCrouch:area(reachableCrouch),
  reachableSafeDry:area(reachableSafe),reachableOutsideSafeAndOre15:area(reachableOutsideOreAndSafety),
  disconnected:area(notReached),islands:islands.slice(0,12),islandCount:islands.length,
  reachableOreApproaches:r30OreProbes.map(s=>({id:s.id,cellReachable:!!seen[index(s.foot[0],s.foot[2])]})),
  shallowNests:firstMineShallowWorks.nests.map(s=>!!seen[index(s.east,s.north)]),
  surveyedGroups:groups.length};
}
try{
 const closed=[run(.5),run(.25)];
 walls=host.thinWalls.sites.map(s=>({...s,surface:'rock' as const,hits:s.strikes,open:true}));host.mounted.sync();
 const opened=run(.5);
 const [a,b]=closed;
 const difference=(x:number,y:number)=>Math.abs(x-y)/Math.max(1,y)*100;
 console.log(JSON.stringify({scope:'static host query, no live cart, crystal gate closed; thin-wall open is a fixture receipt; safety and ore buffers are planning masks, not spawn authority',closed,opened,
  convergencePct:{dryNet:difference(a.dryNet,b.dryNet),reachableDry:difference(a.reachableDry,b.reachableDry),safeDry:difference(a.safeDry,b.safeDry)}},null,2));
}finally{host.mounted.dispose()}
