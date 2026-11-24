import {execFileSync} from 'node:child_process';
import {Group} from 'three';
import {crystalCavernArchitecture, mountUndergroundCrystalCavern} from './voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {createUndergroundPalaceShell} from './fixtures/underground-palace-d-shell-snapshot.js';
import {encounterPlacementPlan} from '../src/shared/underground-encounter-placement-plan.js';
const pinned='9ab161e8691ea32662f389527ebb57f1d3fe0947';
const blob=execFileSync('git',['rev-parse','origin/lane-d:tools/voxel-tavern/town-blockout/underground-palace-shell.ts'],{encoding:'utf8'}).trim();
if(blob!==pinned)throw Error('D shell changed; resurvey before registering.');
const {pieces}=crystalCavernArchitecture;
type Rect={x0:number;x1:number;n0:number;n1:number};
const footprint=(p:(typeof pieces)[number]):Rect=>({x0:p.center[0]-p.size[0]/2,x1:p.center[0]+p.size[0]/2,n0:p.center[2]-p.size[2]/2,n1:p.center[2]+p.size[2]/2});
function union(rects:Rect[]){
 const xs=[...new Set(rects.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);let sum=0;
 for(let i=1;i<xs.length;i++){const x=(xs[i-1]+xs[i])/2,ns=rects.filter(r=>r.x0<x&&r.x1>x).map(r=>[r.n0,r.n1]).sort((a,b)=>a[0]-b[0]);let length=0,end=-Infinity;
  for(const [lo,hi] of ns){length+=Math.max(0,hi-Math.max(lo,end));end=Math.max(end,hi)}
  sum+=(xs[i]-xs[i-1])*length;
 }
 return sum;
}
function clip(a:Rect,b:Rect){const c={x0:Math.max(a.x0,b.x0),x1:Math.min(a.x1,b.x1),n0:Math.max(a.n0,b.n0),n1:Math.min(a.n1,b.n1)};return c.x1>c.x0&&c.n1>c.n0?c:undefined;}
const base=pieces.filter(p=>p.name.startsWith('u3/floor/rock-tile-')).map(footprint),wet=pieces.filter(p=>p.name.startsWith('u3/river/cell-')).map(footprint);
const path=pieces.filter(p=>p.name.startsWith('u3/trail/slab-')||p.name.startsWith('u3/quay/dry-masonry-')).map(footprint);
const gross=union([...base,...path]),coveredWater=union(wet.flatMap(w=>[...base,...path].flatMap(b=>{const c=clip(w,b);return c?[c]:[]})));
const waterUnion=union(wet);
// Independently rasterize actual projected rectangles into 0.5m cells.
// Interior cells have exact 0.25m²; crossing cells preserve fractional coverage
// rather than misclassifying a centre landing in a 1cm masonry joint.
function weightedGrid(rects:Rect[]){
 const cells=new Map<string,Rect[]>();
 for(const r of rects)for(let x=Math.floor(r.x0*2);x<Math.ceil(r.x1*2);x++)for(let n=Math.floor(r.n0*2);n<Math.ceil(r.n1*2);n++){
   const c=clip(r,{x0:x/2,x1:(x+1)/2,n0:n/2,n1:(n+1)/2});if(!c)continue;
   const key=x+','+n,arr=cells.get(key)??[];arr.push(c);cells.set(key,arr);
 }
 return [...cells.values()].reduce((sum,rs)=>sum+union(rs),0);
}
const weightedGross=weightedGrid([...base,...path]);
const weightedWet=weightedGrid(wet.flatMap(w=>[...base,...path].flatMap(b=>{const c=clip(w,b);return c?[c]:[]})));
let raw=0,rawWet=0;
for(let e=-92+.25;e<93;e+=.5)for(let n=-12+.25;n<113;n+=.5){
 const has=(rs:Rect[])=>rs.some(r=>e>=r.x0&&e<=r.x1&&n>=r.n0&&n<=r.n1);
 if(has(base)||has(path)){raw+=.25;if(has(wet))rawWet+=.25}
}
const cavern=mountUndergroundCrystalCavern({parent:new Group(),frame:{domainId:'survey-only',east:0,north:0,height:0,yaw:0},acceptsCavern:()=>true,supportsFoot:()=>true,acceptsCollider:()=>true,readLightBudget:()=>0});
if(cavern.kind!=='ready')throw Error(cavern.kind);
const palace=createUndergroundPalaceShell();
try{
 // 190 gross analytic from D exact room rectangles and half-disk,
 // subtract the overlap between its last corridor and the arena.
 const rects=[[-4,4,0,16],[-8,8,16,52],[3,14,48,52],[10,14,48,66],[0,14,62,68],[-15,15,66,96],[-4,4,96,108]].map(([x0,x1,n0,n1])=>({x0,x1,n0,n1}));
 const circleOverlap=2*(.5*(4*Math.sqrt(22**2-4**2)+22**2*Math.asin(4/22))-18*4);
 const gross190=union(rects)+Math.PI*22**2/2-circleOverlap;
 let raw190=0,net190=0;
 for(let e=-22+.25;e<22;e+=.5)for(let n=.25;n<126;n+=.5){
   if(palace.floorAt(e,n)!==undefined){raw190+=.25;if(palace.canStand(e,n,0))net190+=.25}
 }
 const selected=encounterPlacementPlan.filter(g=>g.candidate?.frame==='first-mine-crystal-local-candidate'||g.candidate?.frame==='palace-shell-local-candidate').map(g=>{
  const p=g.candidate!.at as {east:number;north:number;height:number};
  let pass=false,source='';
  if(g.family==='crystal-A'){
   const crown=pieces.find(q=>q.name.startsWith('u3/vault/crown-')&&Math.abs(q.center[2]-p.north)<1e-7);
   pass=!!crown&&Math.abs(crown.center[1]-crown.size[1]/2-p.height-.7)<1e-7;source=crown?.name??'missing';
  }else if(g.family==='crystal-B'){
   const tile=pieces.find(q=>q.name.startsWith('u3/floor/rock-tile-')&&Math.hypot(q.center[0]-p.east,q.center[2]-p.north)<1e-6);
   pass=!!tile&&Math.abs(tile.center[1]+tile.size[1]/2-p.height)<1e-6&&cavern.isClearLocal([p.east,p.height,p.north]);source=tile?.name??'missing';
  }else{pass=palace.canStand(p.east,p.north)&&palace.floorAt(p.east,p.north)===p.height&&p.north<104;source=pinned;}
  if(!pass)throw Error('Unverified anchor '+g.id);
  return {id:g.id,...p,source,pass};
 });
 console.log(JSON.stringify({scope:'source geometry projection only; not live spawnable area',crystal:{baseTiles:base.length,pathAndQuayTiles:path.length,waterTiles:wet.length,gross,waterUnion,coveredWater,dryProjection:gross-coveredWater,rawGrid:raw,rawWet,rawDiffPct:Math.abs(raw-gross)/gross*100,weightedGross,weightedWet,weightedDiffPct:Math.abs(weightedGross-gross)/gross*100},palace:{source:pinned,gross:gross190,rawGrid:raw190,rawNetSample:net190,rawDiffPct:Math.abs(gross190-raw190)/gross190*100,arenaArea:Math.PI*22**2/2},selected,pending:'registered support surfaces, ore/safety masks, authoritative occupancy; palace vault excluded; crystal no live terrain authority'},null,2));
}finally{cavern.dispose();palace.dispose()}
