import {createWarriorCityCandidate} from './voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {warriorDistrictHouses} from '../src/shared/underground-warrior-district.js';
import {secondMineRooms} from '../src/shared/underground-second-mine-layout.js';
import {createSecondMineScene} from './voxel-tavern/town-blockout/underground-second-mine.js';
import {encounterPlacementPlan} from '../src/shared/underground-encounter-placement-plan.js';
import {warriorSafetyPocket} from '../src/shared/town-c-warrior-safety-pocket.js';
type Rect={x0:number;x1:number;n0:number;n1:number};
const rect=(x:number,n:number,w:number,d:number):Rect=>({x0:x-w/2,x1:x+w/2,n0:n-d/2,n1:n+d/2});
const area=(r:Rect)=>(r.x1-r.x0)*(r.n1-r.n0);
function clip(r:Rect,b:Rect):Rect|undefined{
 const c={x0:Math.max(r.x0,b.x0),x1:Math.min(r.x1,b.x1),n0:Math.max(r.n0,b.n0),n1:Math.min(r.n1,b.n1)};
 return c.x1>c.x0&&c.n1>c.n0?c:undefined;
}
function union(rects:Rect[]){
 const xs=[...new Set(rects.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);let sum=0;
 for(let i=1;i<xs.length;i++){
  const x=(xs[i-1]+xs[i])/2,intervals=rects.filter(r=>r.x0<x&&r.x1>x).map(r=>[r.n0,r.n1]).sort((a,b)=>a[0]-b[0]);
  let l=0,end=-Infinity;for(const [a,b] of intervals){l+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b)}
  sum+=(xs[i]-xs[i-1])*l;
 }
 return sum;
}
function measure(bounds:Rect[],solids:Rect[]){
 let gross=0,occupied=0,raw=0,weightedGrid=0;
 for(const b of bounds){
   gross+=area(b);const mask=solids.map(s=>clip(s,b)).filter((s):s is Rect=>!!s);
   occupied+=union(mask);
   for(let i=Math.floor(b.x0*2);i<Math.ceil(b.x1*2);i++)for(let j=Math.floor(b.n0*2);j<Math.ceil(b.n1*2);j++){
     const x=(i+.5)/2,n=(j+.5)/2;
     if(x>=b.x0&&x<b.x1&&n>=b.n0&&n<b.n1&&!mask.some(r=>x>=r.x0&&x<=r.x1&&n>=r.n0&&n<=r.n1))raw+=.25;
     const cell=clip(b,{x0:i/2,x1:(i+1)/2,n0:j/2,n1:(j+1)/2});if(!cell)continue;
     const blocked=mask.map(r=>clip(r,cell)).filter((r):r is Rect=>!!r);
     weightedGrid+=area(cell)-union(blocked);
   }
 }
 const net=gross-occupied;return {gross,occupied,net,rawGrid:raw,rawDiffPct:Math.abs(raw-net)/net*100,weightedGrid,weightedDiffPct:Math.abs(weightedGrid-net)/net*100};
}
const city=createWarriorCityCandidate(),mine=createSecondMineScene();
try{
 const cityBounds={x0:0,x1:180,n0:-30,n1:30};
 const sealed=warriorDistrictHouses.filter(h=>!h.accessible).map(h=>{
  const i=warriorDistrictHouses.indexOf(h),w=i%3===0?7.3:i%3===1?7.7:8.1;
  return rect(h.localEntrance[0],h.side==='north'?12.35:-12.35,w,8.55);
 });
 const cityMasks=[...city.shell.solids.filter(p=>p.y+p.h/2>.025&&p.y-p.h/2<1.8).map(p=>rect(p.e,p.n,p.w,p.d)),
  ...city.colliders.filter(b=>b.max[1]>.025&&b.min[1]<1.8).map(b=>({x0:b.min[0],x1:b.max[0],n0:-b.max[2],n1:-b.min[2]})),...sealed];
 const cityArea=measure([cityBounds],cityMasks);
 const safePocket=measure([...warriorSafetyPocket.rectangles],cityMasks);
 // Measured building footprints from the actual U10 house dimensions and
 // the separately built tavern and forge; arcade/wall remain separate.
 const homes=warriorDistrictHouses.map((h,i)=>rect(h.localEntrance[0],h.side==='north'?12.35:-12.35,i%3===0?7.3:i%3===1?7.7:8.1,8.55));
 const buildingRects=[...homes,{x0:119.55,x1:130.45,n0:14.4,n1:24.55},{x0:136.8,x1:147.2,n0:4.5,n1:14.9}];
 const building=measure(buildingRects,cityMasks);
 if(safePocket.weightedDiffPct>=.1||cityArea.weightedDiffPct>=.1||building.weightedDiffPct>=.1)throw Error('City dual-method geometry exceeds gate');
 const mineArea=measure(secondMineRooms.filter(r=>!r.river),mine.solids.map(s=>rect(s.x,s.n,s.w,s.d)));
 const local=encounterPlacementPlan.filter(g=>g.candidate?.frame==='warrior-city-local-candidate'||g.candidate?.frame==='second-mine-local-candidate').map(g=>{
  const c=g.candidate!,p=c.at;
  const clear=c.frame==='warrior-city-local-candidate'?city.canStand(p.east,p.north):mine.canStand(p.east,p.north);
  return {id:g.id,frame:c.frame,east:p.east,north:p.north,clear};
 });
 console.log(JSON.stringify({scope:'local candidate geometry; excludes sealed houses and known static boxes; city proposed safety pocket reported separately; no registered safety authority, capsule margin or density claim',city:{...cityArea,safePocket,netOutsideCandidatePocket:cityArea.net-safePocket.net,building,openAndOtherNet:cityArea.net-building.net},secondMine:{...mineArea,river:secondMineRooms.filter(r=>r.river).reduce((a,r)=>a+area(r),0)},local,pending:'registered mineral masks, authority approval of candidate city pocket, actual reach and official world anchors'},null,2));
}finally{city.dispose();mine.dispose()}
