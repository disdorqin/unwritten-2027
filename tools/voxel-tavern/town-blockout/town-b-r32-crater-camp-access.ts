import {auditNightBCableWalkRoutes} from './town-night-b-cable-walk-route';
import {supportFootprintOverlaps,type OrientedSupportBox} from './town-a-r30-oriented-support';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
import type {CraterCampPlacement} from './town-crater-colliders';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
type Foot={east:number;north:number;height:number};
/** Read only the mounted camp and final west body list. A route is to a
 * clear standing point beside each physical relic, not its occupied centre. */
export function auditBR32CraterCampAccess(road:Road,rail:Rail){
 const root=road.group.getObjectByName('za31-crater-camp');
 const sites=(root?.userData.placements as CraterCampPlacement[]|undefined)?.filter(s=>s.kind==='camp');
 if(!sites||sites.length!==4||sites.some(s=>!s.colliders?.length))throw Error('Missing actual camp bodies');
 const a=road.anchor,p=createMeteorCrater(meteorCraterFixturePlan).mainTrailPoint(1),c=Math.cos(a.yaw),s=Math.sin(a.yaw);
 const east=a.east+.9*(p.east*c+p.north*s),north=a.north+.9*(p.north*c-p.east*s),height=road.heightAt(east,north);
 if(height===undefined)throw Error('Missing crater bottom approach');
 const start={east,north,height};
 const boxes=[...road.group.userData.colliders,...rail.group.userData.colliders,...road.group.userData.floors,...rail.group.userData.floors] as OrientedSupportBox[];
 const radius=.27,indexMargin=.36,cell=2,bins=new Map<string,OrientedSupportBox[]>();
 for(const b of boxes)for(let x=Math.floor((b.min[0]!-indexMargin)/cell);x<=Math.floor((b.max[0]!+indexMargin)/cell);x++)for(let z=Math.floor((-b.max[2]!-indexMargin)/cell);z<=Math.floor((-b.min[2]!+indexMargin)/cell);z++){
  const k=x+','+z,bin=bins.get(k)??[];bin.push(b);bins.set(k,bin);
 }
 function blocked(e:number,n:number,h:number,r:number,b:number){
  return road.fenceBlocks(e,n,h,r)||(bins.get(Math.floor(e/cell)+','+Math.floor(n/cell))??[]).some(q=>h+.025<q.max[1]!&&h+b-.025>q.min[1]!&&supportFootprintOverlaps(e,n,q,r));
 }
 const supportAt=(e:number,n:number)=>road.heightAt(e,n);
 const result=auditNightBCableWalkRoutes({start,goals:sites.map(site=>({id:site.id,foot:{east:site.east,north:site.north,height:site.height},reach:2.2,accept:(f:Foot)=>!blocked(f.east,f.north,f.height,.27,1.8)})),
  bounds:{west:a.east-21,east:a.east+21,south:a.north-21,north:a.north+21},supportAt,blocked,maxHeightDrift:9,maxGrade:.85,step:.25});
 // The same supported edges are valid in reverse. Independently resample
 // every reported path both ways at .08m, not just BFS lattice points.
 let reverseSamples=0,reverseFailure:Foot|undefined;
 for(const route of result.routes)if(route.reachable){
  const path=[...route.path].reverse();
  for(let i=1;i<path.length&&!reverseFailure;i++){
   const from=path[i-1]!,to=path[i]!,d=Math.hypot(to.east-from.east,to.north-from.north),steps=Math.max(1,Math.ceil(d/.08));let prev=from;
   for(let j=1;j<=steps;j++){
    const t=j/steps,e=from.east+(to.east-from.east)*t,n=from.north+(to.north-from.north)*t,h=supportAt(e,n);reverseSamples++;
    if(h===undefined||blocked(e,n,h,radius,1.8)||Math.abs(h-prev.height)>.85*d/steps+.005){reverseFailure={east:e,north:n,height:h??NaN};break;}
    prev={east:e,north:n,height:h};
   }
  }
 }
 // Compact the actual route for manual or native-input replay. Every
 // straight chord is re-certified in both directions before replacing
 // the dense lattice subpath; no teleport or untested shortcut.
 function clearLine(from:Foot,to:Foot){
  const d=Math.hypot(to.east-from.east,to.north-from.north),steps=Math.max(1,Math.ceil(d/.08));let prev=from.height;
  for(let i=0;i<=steps;i++){
   const t=i/steps,e=from.east+(to.east-from.east)*t,n=from.north+(to.north-from.north)*t,h=supportAt(e,n);
   if(h===undefined||blocked(e,n,h,.36,1.8)||(i>0&&Math.abs(h-prev)>.85*d/steps+.005))return false;
   for(const [x,z] of [[.27,0],[-.27,0],[0,.27],[0,-.27]]){
    const q=supportAt(e+x!,n+z!);if(q===undefined||Math.abs(q-h)>.25)return false;
   }
   prev=h;
  }
  return true;
 }
 const routes=result.routes.map(r=>{
  if(!r.reachable)return r;
  const path=r.path,knots=[path[0]!];
  for(let i=0;i<path.length-1;){
   let j=path.length-1;
   while(j>i+1&&(!clearLine(path[i]!,path[j]!)||!clearLine(path[j]!,path[i]!)))j--;
   // Original BFS allows .27m radius; do not claim a widened chord
   // when even its adjacent lattice edge lacks the extra clearance.
   if(!clearLine(path[i]!,path[j]!)||!clearLine(path[j]!,path[i]!))return {...r,knots:undefined};
   knots.push(path[j]!);i=j;
  }
  return {...r,knots};
 });
 return {...result,routes,ready:result.ready&&!reverseFailure,reverseSamples,reverseFailure,siteBodies:sites.map(s=>({id:s.id,boxes:s.colliders!.length}))};
}
