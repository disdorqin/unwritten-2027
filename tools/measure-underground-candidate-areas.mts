import {createWarriorCityCandidate} from './voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {warriorDistrictHouses} from '../src/shared/underground-warrior-district.js';
import {secondMineRooms} from '../src/shared/underground-second-mine-layout.js';
import {createSecondMineScene} from './voxel-tavern/town-blockout/underground-second-mine.js';
import {encounterPlacementPlan} from '../src/shared/underground-encounter-placement-plan.js';
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
 let gross=0,occupied=0,raw=0;
 for(const b of bounds){
   gross+=area(b);const mask=solids.map(s=>clip(s,b)).filter((s):s is Rect=>!!s);
   occupied+=union(mask);
   for(let x=b.x0+.25;x<b.x1;x+=.5)for(let n=b.n0+.25;n<b.n1;n+=.5)
     if(!mask.some(r=>x>=r.x0&&x<=r.x1&&n>=r.n0&&n<=r.n1))raw+=.25;
 }
 const net=gross-occupied;return {gross,occupied,net,rawGrid:raw,rawDiffPct:Math.abs(raw-net)/net*100};
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
 const mineArea=measure(secondMineRooms.filter(r=>!r.river),mine.solids.map(s=>rect(s.x,s.n,s.w,s.d)));
 const local=encounterPlacementPlan.filter(g=>g.candidate?.frame==='warrior-city-local-candidate'||g.candidate?.frame==='second-mine-local-candidate').map(g=>{
  const c=g.candidate!,p=c.at;
  const clear=c.frame==='warrior-city-local-candidate'?city.canStand(p.east,p.north):mine.canStand(p.east,p.north);
  return {id:g.id,frame:c.frame,east:p.east,north:p.north,clear};
 });
 console.log(JSON.stringify({scope:'local candidate geometry; no production authority, excludes sealed houses and known static boxes but not safety masks or capsule margin; no density claim',city:cityArea,secondMine:{...mineArea,river:secondMineRooms.filter(r=>r.river).reduce((a,r)=>a+area(r),0)},local,pending:'registered mineral masks, safety pocket union, 90 crystal, 190, official world anchors'},null,2));
}finally{city.dispose();mine.dispose()}
