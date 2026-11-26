import {buildBR30HistoricWalkway} from './town-b-r30-east-historic-walkway';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {Box} from './landmark-kit';
type Road=ReturnType<typeof mountWestCraterRoad>;
type EN=Readonly<{east:number;north:number}>;
type Foot=EN&Readonly<{height:number}>;
const fixture=createMeteorCrater(meteorCraterFixturePlan);
export const historicEastWallPlan=[
 {east:-87.06903120936144,north:190.82089398427362,yaw:3.5342917352885173},
 {east:-88.48495990911228,north:187.40253971398187,yaw:3.5342917352885173},
 {east:-89.20679410057195,north:183.7736341764899,yaw:3.3379421944391554},
] as const;
const dist=(a:EN,b:EN)=>Math.hypot(a.east-b.east,a.north-b.north);
const gap=(p:EN,b:Box)=>Math.hypot(Math.max(b.min[0]-p.east,p.east-b.max[0],0),Math.max(b.min[2]+p.north,-p.north-b.max[2],0));
const overlaps=(a:Box,b:Box)=>a.min.every((v,i)=>v<b.max[i]&&a.max[i]>b.min[i]);
function segmentGap(p:EN,a:EN,b:EN){
 const e=b.east-a.east,n=b.north-a.north,t=Math.max(0,Math.min(1,((p.east-a.east)*e+(p.north-a.north)*n)/(e*e+n*n||1)));
 return Math.hypot(p.east-a.east-e*t,p.north-a.north-n*t);
}
/** Actual east wall assembly. Host must provide its own real rail lines
 * and collision index, consume the exported support, and separately
 * certify production movement. Never modifies terrain or rail authority. */
export function installBR30HistoricEastWall(road:Road,railTracks:readonly (readonly EN[])[],railBoxes:readonly Box[]=[]){
 if(road.group.getObjectByName('b-r30-east-historic-walkway'))throw Error('Historic walkway already attached');
 if(railTracks.length<2||railTracks.some(t=>t.length<2))throw Error('Historic walkway requires real rail lines');
 const old=road.group.userData.colliders as Box[];
 if(!Array.isArray(old))throw Error('Historic walkway requires real collision channel');
 const model=buildBR30HistoricWalkway(road.heightAt,historicEastWallPlan);
 try{
  const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  const trail=Array.from({length:1001},(_,i)=>{const q=fixture.mainTrailPoint(i/1000);return {east:a.east+q.east*c+q.north*s,north:a.north+q.north*c-q.east*s};});
  const main=trail[538],ground=(p:EN)=>{const h=road.heightAt(p.east,p.north);if(h===undefined||!Number.isFinite(h))throw Error('Missing real walkway ground');return h;};
  const approach={...main,height:ground(main)},p=historicEastWallPlan[0];
  if(dist(approach,model.entry)>1.25||Math.abs(approach.height-model.entry.height)>.18)throw Error('Historic walkway no longer connects to mine road');
  const solids=[...old,...railBoxes];
  if(model.boxes.some(b=>solids.some(q=>overlaps(b,q))))throw Error('Historic walkway overlaps existing solid');
  const trailGap=Math.min(...model.boxes.flatMap(b=>trail.map(q=>gap(q,b))));
  if(trailGap<1.35)throw Error('Historic walkway intrudes mine road');
  const trackSegments=railTracks.flatMap(t=>t.slice(1).map((b,i)=>[t[i],b] as const));
  const trackGap=Math.min(...model.boxes.flatMap(b=>{
   const q={east:(b.min[0]+b.max[0])/2,north:-(b.min[2]+b.max[2])/2};
   const radius=Math.hypot(b.max[0]-b.min[0],b.max[2]-b.min[2])/2;
   return trackSegments.map(([x,z])=>segmentGap(q,x,z)-radius);
  }));
  if(trackGap<1.30)throw Error('Historic walkway intrudes railway');
  const deck=model.firstFoot.height;
  // Thin plank gaps are physical; a .27m body can bridge 12mm
  // seams. This sampler only queries the actual first-section
  // triangles, not a rectangular proxy or either broken section.
  function supportedHeight(east:number,north:number){
   const dx=east-p.east,dn0=north-p.north,u=dx*Math.sin(p.yaw)+dn0*Math.cos(p.yaw),v=dx*Math.cos(p.yaw)-dn0*Math.sin(p.yaw);
   if(u< -2.875-1e-7||u>1.025+1e-7||Math.abs(v)>(u< -1.025?.56:.71)+1e-7)return;
   let top:number|undefined;
   const offsets=u< -1.025? [0]:[0,-.015,.015];
   for(const de of offsets)for(const dn of offsets){
    for(const [a,b,c] of model.support){
     const x=east+de-a.east,y=north+dn-a.north,ex=b.east-a.east,ey=b.north-a.north,fx=c.east-a.east,fy=c.north-a.north;
     const det=ex*fy-ey*fx;if(Math.abs(det)<1e-10)continue;
     const u=(x*fy-y*fx)/det,v=(ex*y-ey*x)/det;
     if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8){
      const h=a.height+u*(b.height-a.height)+v*(c.height-a.height);
      top=top===undefined?h:Math.max(top,h);
     }
    }
   }
   return top;
  }
  const route:Foot[]=[approach,model.entry,model.firstFoot];
  let minBody=Infinity,maxGrade=0,samples=0;
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i],d=dist(a,b),N=Math.ceil(d/.05);let last=a.height;
   for(let j=0;j<=N;j++){
    const t=j/N,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
    const terrain=ground({east:e,north:n}),h=Math.max(terrain,supportedHeight(e,n)??-Infinity);
    if(j)maxGrade=Math.max(maxGrade,Math.abs(h-last)/(d/N));last=h;samples++;
    for(const box of [...solids,...model.boxes])if(box.min[1]<h+1.8&&box.max[1]>h+.025)minBody=Math.min(minBody,gap({east:e,north:n},box));
   }
  }
  if(minBody<.30||maxGrade>.50)throw Error('Historic first-section passage blocked '+minBody+'/'+maxGrade);
  if(supportedHeight(model.firstFoot.east,model.firstFoot.north)===undefined||Math.abs(supportedHeight(model.firstFoot.east,model.firstFoot.north)!-deck)>.015||
   historicEastWallPlan.slice(1).some(q=>supportedHeight(q.east,q.north)!==undefined))throw Error('Wrong historic support ownership');
  road.group.add(model.group);road.group.userData.colliders=[...old,...model.boxes];
  let disposed=false;
  return {...model,approach,route,supportedHeight,audit:{trailGap,trackGap,minBody,maxGrade,samples,railLines:railTracks.length},dispose(){
   if(disposed)return;disposed=true;road.group.userData.colliders=(road.group.userData.colliders as Box[]).filter(b=>!model.boxes.includes(b));model.dispose();
  }};
 }catch(e){model.dispose();throw e;}
}
