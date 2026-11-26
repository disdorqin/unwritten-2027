import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
import {supportFootprintOverlaps,type OrientedSupportBox} from './town-a-r30-oriented-support';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
type Foot={east:number;north:number;height:number};
type EN=Pick<Foot,'east'|'north'>;
const distance=(a:EN,b:EN)=>Math.hypot(a.east-b.east,a.north-b.north);
function segmentDistance(e:number,n:number,a:EN,b:EN){
 const x=b.east-a.east,z=b.north-a.north,t=Math.max(0,Math.min(1,((e-a.east)*x+(n-a.north)*z)/(x*x+z*z||1)));
 return Math.hypot(e-a.east-t*x,n-a.north-t*z);
}
/** Survey only actual western floor, rail decks and collision bodies.
 * No new support mesh, terrain edits or movement/entry authorization. */
export function createAR30RimAccessSurvey(road:Road,rail:Rail,radius=.30){
 if(radius<.27||radius>.40)throw Error('Unsupported rim survey radius');
 const floors=[...road.group.userData.floors,...rail.group.userData.floors] as OrientedSupportBox[];
 const walls=[...road.group.userData.colliders,...rail.group.userData.colliders] as OrientedSupportBox[];
 const tracks=[rail.samples,rail.narrowSamples,rail.sidingSamples];
 const crosses=[rail.crossings.filter(c=>['north-tower-road','south-industrial-road','instrument-road'].includes(c.id)),rail.crossings.filter(c=>['supply-and-smelter-road','yard-road'].includes(c.id)),rail.crossings.filter(c=>['north-freight-road','freight-loading-road'].includes(c.id))];
 const minE=-78,maxE=-39,minN=127,maxN=199,cell=4;
 const key=(e:number,n:number)=>Math.floor(e/cell)+','+Math.floor(n/cell);
 type Bucket={floors:OrientedSupportBox[];walls:OrientedSupportBox[];tracks:{track:number;a:EN;b:EN}[]};
 const bins=new Map<string,Bucket>();
 function bucket(k:string){let b=bins.get(k);if(!b){b={floors:[],walls:[],tracks:[]};bins.set(k,b);}return b;}
 function index(x0:number,x1:number,n0:number,n1:number,add:(b:Bucket)=>void){
  if(x1<minE||x0>maxE||n1<minN||n0>maxN)return;
  for(let e=Math.floor(x0/cell);e<=Math.floor(x1/cell);e++)for(let n=Math.floor(n0/cell);n<=Math.floor(n1/cell);n++)add(bucket(e+','+n));
 }
 for(const [kind,boxes] of [['floors',floors],['walls',walls]] as const)for(const b of boxes)
  index(b.min[0]!-.4,b.max[0]!+.4,-b.max[2]!-.4,-b.min[2]!+.4,c=>c[kind].push(b));
 for(const [track,points]of tracks.entries())for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!;
  index(Math.min(a.east,b.east)-1.7,Math.max(a.east,b.east)+1.7,Math.min(a.north,b.north)-1.7,Math.max(a.north,b.north)+1.7,q=>q.tracks.push({track,a,b}));
 }
 // The default includes a 3cm player clearance margin; larger values
 // can be used for conservative corridor search, not larger avatars.
 function step(e:number,n:number,prev:number):Foot|undefined{
  if(e<minE||e>maxE||n<minN||n>maxN||!road.terrainReadyAt(e,n))return;
  const ground=road.heightAt(e,n);if(ground===undefined)return;
  const q=bins.get(key(e,n)),fs=q?.floors??[],ws=q?.walls??[];
  let h=ground;
  for(const b of fs)if(b.max[1]!<=prev+.43&&supportFootprintOverlaps(e,n,b,radius))h=Math.max(h,b.max[1]!);
  for(const b of ws)if(b.max[1]!<=prev+.025&&supportFootprintOverlaps(e,n,b,radius))h=Math.max(h,b.max[1]!);
  if(Math.abs(h-prev)>.43001||road.fenceBlocks(e,n,h,radius))return;
  if([...fs,...ws].some(b=>h+.025<b.max[1]!&&h+1.775>b.min[1]!&&supportFootprintOverlaps(e,n,b,radius)))return;
  // Restrict every near-rail traverse to the already built crossing
  // surface on that particular rail, not an arbitrary gap in sleepers.
  for(const s of q?.tracks??[])if(segmentDistance(e,n,s.a,s.b)<1.3&&!crosses[s.track]!.some(c=>c.floors.some(f=>supportFootprintOverlaps(e,n,f,radius))))return;
  return {east:e,north:n,height:h};
 }
 function line(a:Foot,b:EN){
  const d=distance(a,b),count=Math.max(1,Math.ceil(d/.08));let p=a;
  for(let j=1;j<=count;j++){const t=j/count,q=step(a.east+t*(b.east-a.east),a.north+t*(b.north-a.north),p.height);if(!q)return;p=q;}
  return p;
 }
 function check(points:readonly Foot[]){
  for(const path of [points,[...points].reverse()]){
   let p=path[0]!;
   for(const b of path.slice(1)){
    const q=line(p,b);if(!q||Math.abs(q.height-b.height)>.04)throw Error('Rim route obstructed at '+JSON.stringify({from:p,to:b}));
    p=q;
   }
  }
  return true;
 }
 function search(start:EN,end:EN){
  const h=road.heightAt(start.east,start.north);if(h===undefined)throw Error('Missing start');
  const first=step(start.east,start.north,h);if(!first)throw Error('Blocked start');
  const lattice=.5,states=[{i:0,j:0,p:first,parent:-1}],seen=new Set(['0,0,'+Math.round(first.height*100)]);let terminal=-1,last:Foot|undefined;
  for(let k=0;k<states.length;k++){
   const s=states[k]!;
   if(distance(s.p,end)<.8){const q=line(s.p,end);if(q){terminal=k;last=q;break;}}
   for(const [di,dj]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const){
    const i=s.i+di,j=s.j+dj,e=start.east+i*lattice,n=start.north+j*lattice;
    const q=line(s.p,{east:e,north:n});if(!q)continue;
    const k0=i+','+j+','+Math.round(q.height*100);
    if(seen.has(k0))continue;seen.add(k0);states.push({i,j,p:q,parent:k});
   }
  }
  if(terminal<0||!last)throw Error('No supported public crossing route; states='+states.length);
  const raw=[last];for(let k=terminal;k>=0;k=states[k]!.parent)raw.push(states[k]!.p);raw.reverse();
  const points=[raw[0]!];
  for(let i=0;i<raw.length-1;){
   let j=raw.length-1;
   while(j>i+1){const q=line(raw[i]!,raw[j]!);if(q&&Math.abs(q.height-raw[j]!.height)<.02){const rev=line(q,raw[i]!);if(rev&&Math.abs(rev.height-raw[i]!.height)<.02)break;}j--;}
   points.push(raw[j]!);i=j;
  }
  check(points);
  return {points,states:states.length,rawPoints:raw.length,length:points.slice(1).reduce((s,p,i)=>s+distance(points[i]!,p),0)};
 }
 function trace(plan:readonly (readonly [number,number])[]){
  const [e,n]=plan[0]!,h=road.heightAt(e,n);
  if(h===undefined)throw Error('Missing rim approach start');
  const start=step(e,n,h);if(!start)throw Error('Rim approach start obstructed');
  const points=[start];
  for(const [east,north]of plan.slice(1)){
   const p=line(points.at(-1)!,{east,north});
   if(!p)throw Error('Rim approach invalidated '+east+'/'+north);
   points.push(p);
  }
  check(points);
  return {points,length:points.slice(1).reduce((s,p,i)=>s+distance(points[i]!,p),0)};
 }
 return {search,check,trace};
}
