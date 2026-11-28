import {createMeteorCrater,meteorCraterFixturePlan,meteorCraterFloorRadius} from './meteor-crater';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
import {supportFootprintOverlaps,type OrientedSupportBox} from './town-a-r30-oriented-support';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
type Foot={east:number;north:number;height:number;t:number};
/** Survey actual mounted geometry with a conservative .36m sled footprint.
 * No movement, authority or collision bypass; report legacy and new hits. */
export function auditBR32CraterTraversal(road:Road,rail:Rail,radius=.36){
 const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw),fixture=createMeteorCrater(meteorCraterFixturePlan);
 const boxes=[...road.group.userData.colliders,...rail.group.userData.colliders,...road.group.userData.floors,...rail.group.userData.floors] as OrientedSupportBox[];
 const point=(t:number,off=0):Foot=>{
  const p=fixture.mainTrailPoint(Math.min(1,t)),r=Math.hypot(p.east,p.north),scale=t<=1?(r+off)/r:(meteorCraterFloorRadius-2*(t-1)/.01+off)/r;
  const e=p.east*scale,n=p.north*scale,east=a.east+e*c+n*s,north=a.north+n*c-e*s;
  const height=road.heightAt(east,north);
  if(height===undefined||!Number.isFinite(height))throw Error('Missing actual crater support '+t);
  return {east,north,height,t};
 };
 const stations=Array.from({length:8401},(_,i)=>i/8400).concat(Array.from({length:20},(_,i)=>1+(i+1)*.0005));
 let probes=0,maxStep=0,maxGrade=0,length=0,fenceHits=0,bodyHits=0,first:unknown;const hits=new Map<number,number>();
 let prev:Foot|undefined;
 for(const t of stations){
  const p=point(t);
  if(prev){const d=Math.hypot(p.east-prev.east,p.north-prev.north);length+=d;maxStep=Math.max(maxStep,Math.abs(p.height-prev.height));maxGrade=Math.max(maxGrade,Math.abs(p.height-prev.height)/d);}
  prev=p;
  for(const off of [0,-.3,.3]){
   const q=point(t,off);probes++;
   const fence=road.fenceBlocks(q.east,q.north,q.height,radius);if(fence)fenceHits++;
   let blocked=false;
   for(let i=0;i<boxes.length;i++){const b=boxes[i]!;
    if(q.height+.025>=b.max[1]!||q.height+1.775<=b.min[1]!||!supportFootprintOverlaps(q.east,q.north,b,radius))continue;
    blocked=true;hits.set(i,(hits.get(i)??0)+1);first??={q,off,box:b,index:i};
   }
   if(blocked)bodyHits++;
  }
 }
 return {scope:'mounted road and rail geometric sweep, not native sled or guard permission',length,probes,maxStep,maxGrade,bodyHits,fenceHits,first,hitBoxes:[...hits].map(([i,count])=>({box:boxes[i],count})),floor:point(1.01),point};
}
