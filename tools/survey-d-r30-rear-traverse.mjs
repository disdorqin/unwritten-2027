import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain.ts';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway.ts';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.ts';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension.ts';
import {createAR30RidgeOwnership} from '../tools/voxel-tavern/town-blockout/town-a-r30-ridge-ownership.ts';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge.ts';
import {buildMiddleEastRoadbed,lowerEastServiceControls,middleEastNorthControls,middleSouthRoadControls} from '../tools/voxel-tavern/town-blockout/town-d-r30-upper-roadbed.ts';
const g=createTerrainGrid(),r=createTownRailway(g,()=>0),b=buildCraterRailExtension(g,mountWestCraterRoad(worldBounds.depth,n=>g.groundHeightAt(0,n)),r.route.points),o=createAR30RidgeOwnership({loop:r.route.points,branch:b.samples,cloudApron:true}),natural=buildFrontRidgeR30Field(g.groundHeightAt,o.weight),allowed=(e,n)=>o.distance(e,n)>0;
const field=buildMiddleEastRoadbed(buildMiddleEastRoadbed(natural,allowed,middleSouthRoadControls).field,allowed,middleEastNorthControls).field;
// Reproduce the accepted rear traverse independently of later route additions.
// Search is offline; the actual grid solver is the final geometry gate.
const start={east:516,north:720,height:field.heightAt(516,720)};
const prefixEnd=lowerEastServiceControls.findIndex(p=>p.east===start.east&&p.north===start.north);
if(prefixEnd<0)throw Error('Missing certified 465m approach');
const prefix=lowerEastServiceControls.slice(0,prefixEnd+1);
function solve(direction,step,cap,grade,penalty){
 let states=[{...start,cost:0,dn:6,prev:null}],best=states;
 for(let e=start.east+step*direction;e>=294&&e<=620;e+=step*direction){
  const next=new Map(),cache=new Map();
  for(const p of states)for(let dn=-8;dn<=8;dn+=2){
   const n=p.north+dn;if(n<698||n>785||Math.abs(dn-p.dn)>8)continue;
   const de=step*direction,len=Math.hypot(de,dn),key=p.north+','+dn;
   let rows=cache.get(key);
   if(rows===undefined){
    rows=[];
    for(const t of [0,.25,.5,.75,1]){let lo=-Infinity,hi=Infinity,mean=0;
     for(const off of [-2.8,0,2.8]){
      const x=p.east+de*t-dn/len*off,z=p.north+dn*t+de/len*off,h=field.heightAt(x,z);
      if(!allowed(x,z)||!Number.isFinite(h)){lo=Infinity;break}lo=Math.max(lo,h-cap);hi=Math.min(hi,h+cap);mean+=h/3;
     }
     if(lo>hi){rows=null;break}rows.push({t,lo,hi,mean});
    }cache.set(key,rows);
   }
   if(!rows)continue;let lo=p.height-grade*len,hi=p.height+grade*len;
   for(const q of rows){if(!q.t){if(p.height<q.lo||p.height>q.hi){lo=Infinity;break}}else{lo=Math.max(lo,(q.lo-(1-q.t)*p.height)/q.t);hi=Math.min(hi,(q.hi-(1-q.t)*p.height)/q.t)}}
   for(let h=Math.ceil(lo*2)/2;h<=hi;h+=.5){
    const cost=p.cost+len+.8*Math.abs(dn-p.dn)+rows.reduce((sum,q)=>sum+Math.abs(q.mean-(p.height+(h-p.height)*q.t)),0)*.15-penalty*(h-p.height);
    const k=n+','+dn+','+h;if(cost<(next.get(k)?.cost??Infinity))next.set(k,{east:e,north:n,height:h,cost,dn,prev:p});
   }
  }
  if(!next.size)break;states=[...next.values()].sort((a,b)=>a.cost-b.cost).slice(0,2500);best=states;
 }
 return best;
}
let best=null;
for(const [step,cap,grade,penalty] of [[6,7.5,.105,4],[6,7.8,.11,10],[6,7.8,.11,1],[4,7.8,.11,4],[8,7.8,.11,4]]){
 const ends=solve(-1,step,cap,grade,penalty);console.log('ends',step,ends.length,ends[0]?.east,ends[0]?.height);
 for(const node of ends.sort((a,b)=>b.height-a.height||a.cost-b.cost).slice(0,18)){
  let path=[];for(let p=node;p;p=p.prev)path.push(p);path.reverse();
  for(let k=path.length;k>=4;k--){
   const end=path[k-1],controls=[...prefix,...path.slice(1,k).map(({east,north})=>({east,north}))];
   for(const endHeight of [end.height,undefined]){
    const q=buildMiddleEastRoadbed(field,allowed,controls,{startHeight:26,endHeight});
    if(q.ok&&end.east<=300&&(!best||q.route.at(-1).height>best.endHeight)){best={step,cap,grade,penalty,length:q.route.at(-1).cum,end:[end.east,end.north],endHeight:q.route.at(-1).height,added:path.slice(1,k).map(p=>[p.east,p.north]),audit:q.audit};console.log('BEST',JSON.stringify(best));}
    if(q.ok)break;
   }
   if(best?.end[0]<=end.east)break;
  }
 }
}
if(!best)throw Error('No certified rear traverse');
console.log('FINAL',JSON.stringify(best));

