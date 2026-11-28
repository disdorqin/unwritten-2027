import {createSledRide} from './sled-ride';
import {auditBR32CraterTraversal} from './town-b-r32-crater-traversal';
import {supportFootprintOverlaps,type OrientedSupportBox} from './town-a-r30-oriented-support';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
/** Real mounted west geometry, native sled physics, deterministic steering.
 * This does not drive the browser, bypass guard permissions or set player poses. */
export function auditBR32CraterSled(road:Road,rail:Rail){
 const audit=auditBR32CraterTraversal(road,rail),radius=.36;
 const solids=[...road.group.userData.colliders,...rail.group.userData.colliders] as OrientedSupportBox[];
 const floors=[...road.group.userData.floors,...rail.group.userData.floors] as OrientedSupportBox[];
 const cell=4,bins=new Map<string,{solid:OrientedSupportBox[];floor:OrientedSupportBox[]}>();
 const key=(e:number,n:number)=>Math.floor(e/cell)+','+Math.floor(n/cell);
 for(const [kind,boxes] of [['solid',solids],['floor',floors]] as const)for(const b of boxes){
  for(let e=Math.floor((b.min[0]!-radius)/cell);e<=Math.floor((b.max[0]!+radius)/cell);e++)for(let n=Math.floor((-b.max[2]!-radius)/cell);n<=Math.floor((-b.min[2]!+radius)/cell);n++){
   const k=e+','+n,bucket=bins.get(k)??{solid:[],floor:[]};bucket[kind].push(b);bins.set(k,bucket);
  }
 }
 function height(e:number,n:number){let h=road.heightAt(e,n)??NaN;for(const b of bins.get(key(e,n))?.floor??[])if(supportFootprintOverlaps(e,n,b,radius))h=Math.max(h,b.max[1]!);return h;}
 let hits=0;
 function blocked(e:number,n:number,h:number){
  const bucket=bins.get(key(e,n)),intersects=(b:OrientedSupportBox)=>h+.025<b.max[1]!&&h+1.775>b.min[1]!&&supportFootprintOverlaps(e,n,b,radius);
  const hit=road.fenceBlocks(e,n,h,radius)||!!bucket?.solid.some(intersects)||!!bucket?.floor.some(intersects);
  if(hit)hits++;return hit;
 }
 const ride=createSledRide({height,blocked,surface:()=>({surface:0,deepSnow:false}),snow(){},stopped(){}});
 const spiral=Array.from({length:4201},(_,i)=>audit.point(i/4200));
 const bottom=Array.from({length:21},(_,i)=>audit.point(1+i/2000));
 const dt=1/60,actor=ride;
 const first=spiral[0]!,next=spiral[1]!;
 if(!actor.mount(first.east,first.north,first.height,Math.atan2(next.east-first.east,next.north-first.north)))throw Error('No actual sled mount foot');
 // Stop at the actual hairpin before turning into the bottom apron. Keep
 // the same physical sled and mount throughout both directions.
 function leg(route:typeof spiral){
  const last=route.at(-1)!;
  let cursor=0,maxError=0,peakSpeed=0,maxHeightError=0,recoveries=0,priorRecovery=false,frames=0,distance=0;
  for(;frames<60*480;frames++){
   const p=actor.spot;
   const d=(i:number)=>Math.hypot(route[i]!.east-p.x,route[i]!.north-p.n);
   let nearest=cursor;
   for(let i=Math.max(0,cursor-15);i<=Math.min(route.length-1,cursor+80);i++)if(d(i)<d(nearest))nearest=i;
   cursor=nearest;
   maxError=Math.max(maxError,d(cursor));peakSpeed=Math.max(peakSpeed,actor.speed());maxHeightError=Math.max(maxHeightError,Math.abs(p.y-height(p.x,p.n)));
   if(cursor>route.length-40&&d(route.length-1)<.35&&actor.speed()<.12)break;
   if(d(cursor)>2.0)break;
   let ahead=cursor;while(ahead<route.length-1&&d(ahead)<Math.max(1.5,actor.speed()*.35))ahead++;
   const q=route[ahead]!,desired=Math.atan2(q.east-p.x,q.north-p.n),delta=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));
   const remaining=d(route.length-1),atEnd=cursor>route.length-40;
   const target=atEnd?Math.min(4.5,Math.sqrt(2*1.25*Math.max(0,remaining-.25))):4.5;
   const speed=actor.speed(),x=p.x,n=p.n;
   const turning=Math.abs(delta)>.55,stop=atEnd&&remaining<.35;
   actor.step(dt,{forward:!turning&&!stop&&speed<target?1:0,turn:stop?0:Math.max(-1,Math.min(1,delta*3)),brake:turning||stop||speed>target+.12});
   actor.finishFrame(dt);
   distance+=Math.hypot(p.x-x,p.n-n);
   const recovering=actor.recovering();if(recovering&&!priorRecovery)recoveries++;priorRecovery=recovering;
  }
  const finish={...actor.spot},complete=cursor>route.length-40&&Math.hypot(finish.x-last.east,finish.n-last.north)<.35&&actor.speed()<.12;
  return {complete,frames,seconds:frames*dt,progress:cursor/(route.length-1),distance,maxError,peakSpeed,maxHeightError,recoveries,mounted:actor.active(),finish};
 }
 const down=leg(spiral),arrival=down.complete?leg(bottom):undefined;
 const upStart=arrival?.complete?leg([...bottom].reverse()):undefined;
 const up=upStart?.complete?leg([...spiral].reverse()):undefined;
 const left=actor.leave(),parked=actor.parked(),remounted=!!parked&&actor.remount(parked.x,parked.n,parked.y);
 return {scope:'mounted terrain native sled physics replay, one continuous mount; not browser or legal gate',hits,down,arrival,upStart,up,left,remounted};
}
