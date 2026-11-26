import type {CraterPlay,CraterPlayContext,CraterPlayAuthority} from './town-a-r30-crater-play';
import type {mountWestCraterRoad,AR30StoryLifecycle} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
import {supportFootprintOverlaps,type OrientedSupportBox} from './town-a-r30-oriented-support';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
type Foot=Readonly<{east:number;north:number;height:number}>;
type Track=readonly Readonly<{east:number;north:number}>[];
type Route=Readonly<{id:string;points:readonly Foot[]}>;
const dist=(a:Foot,b:Foot)=>Math.hypot(a.east-b.east,a.north-b.north);
const finiteFoot=(p:Foot)=>!!p&&[p.east,p.north,p.height].every(Number.isFinite);
const validBox=(b:OrientedSupportBox)=>Array.isArray(b.min)&&Array.isArray(b.max)&&b.min.length===3&&b.max.length===3&&b.min.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.max[i])&&v<=b.max[i]!)&&(!b.footprint||[b.footprint.yaw,b.footprint.halfX,b.footprint.halfZ].every(Number.isFinite)&&b.footprint.halfX>0&&b.footprint.halfZ>0);
function segmentGap(e:number,n:number,a:{east:number;north:number},b:{east:number;north:number}){
 const de=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((e-a.east)*de+(n-a.north)*dn)/(de*de+dn*dn||1)));
 return Math.hypot(e-a.east-t*de,n-a.north-t*dn);
}
export function ar30HostRoutes(road:Road,rail:Rail):Route[]{
 return [...road.outerWorks.industrialRoutes,...road.outerWorks.landscapeRoutes,...road.mouthWorks.assemblyRoutes,...road.mouthWorks.guardShedRoutes,...rail.stationWalkRoutes];
}
export function ar30HostTracks(rail:Rail){return [rail.samples,rail.narrowSamples,rail.sidingSamples] as const;}
/** The actual deck and four stairs at each end, not the old ground-only
 * four-point shortcut. Use the viewer's body/step/solid rules. */
export function surveyAR30InscriptionAccess(road:Road,rail:Rail){
 const route=rail.stationWalkRoutes.find(r=>r.id==='inscription-access'),dock=rail.stationWalkRoutes.find(r=>r.id==='transfer-dock');
 if(!route||!dock||route.points.length<2||dock.points.length<2||!route.points.every(finiteFoot)||!dock.points.every(finiteFoot))throw Error('Missing or invalid real dock or inscription support route');
 const start=route.points[0]!,end=route.points.at(-1)!,foot=road.inscription.layout.useFoot;
 if(!finiteFoot(foot)||dist(end,foot)>.015||Math.abs(end.height-foot.height)>.02)throw Error('Inscription foot moved');
 if(!dock.points.slice(1).some((p,i)=>segmentGap(start.east,start.north,dock.points[i]!,p)<.02&&Math.abs(start.height-dock.points[i]!.height)<.03))throw Error('Transfer dock anchor moved');
 const tracks=ar30HostTracks(rail);
 if(tracks.some(t=>t.length<2||t.some(p=>![p.east,p.north].every(Number.isFinite))))throw Error('Missing or invalid actual three rails');
 const segments=tracks.flatMap(t=>t.slice(1).map((p,i)=>[t[i]!,p] as const));
 const arrays=[road.group.userData.floors,rail.group.userData.floors,road.group.userData.colliders,rail.group.userData.colliders];
 if(arrays.some(x=>!Array.isArray(x)||!x.length||!x.every(validBox)))throw Error('Missing or invalid actual floor/collision channels');
 const floors=[...arrays[0],...arrays[1]] as OrientedSupportBox[];
 const solids=[...arrays[2],...arrays[3]] as OrientedSupportBox[];
 let length=0,trackGap=Infinity,bodyGap=Infinity,steps=0,maxStep=0;
 for(let i=1;i<route.points.length;i++)length+=dist(route.points[i-1]!,route.points[i]!);
 for(const points of [route.points,[...route.points].reverse()]){
  let h=points[0]!.height;
  for(let i=1;i<points.length;i++){
   const a=points[i-1]!,b=points[i]!,d=dist(a,b),count=Math.max(1,Math.ceil(d/.035));
   const x0=Math.min(a.east,b.east)-2,x1=Math.max(a.east,b.east)+2,z0=-Math.max(a.north,b.north)-2,z1=-Math.min(a.north,b.north)+2;
   const near=(q:OrientedSupportBox)=>q.min[0]!<=x1&&q.max[0]!>=x0&&q.min[2]!<=z1&&q.max[2]!>=z0;
   const fs=floors.filter(near),ss=solids.filter(near),all=[...fs,...ss];
   for(let j=1;j<=count;j++){
    const t=j/count,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
    let y=road.heightAt(e,n);
    if(y===undefined||!road.terrainReadyAt(e,n))throw Error('Missing inscription ground');
    for(const f of fs)if(f.max[1]!<=h+.43&&supportFootprintOverlaps(e,n,f,.27))y=Math.max(y,f.max[1]!);
    for(const q of ss)if(q.max[1]!<=h+.025&&supportFootprintOverlaps(e,n,q,.27))y=Math.max(y,q.max[1]!);
    maxStep=Math.max(maxStep,Math.abs(y-h));steps++;
    if(Math.abs(y-h)>.43001)throw Error('Inscription step exceeds host movement '+JSON.stringify({i,e,n,h,y}));
    for(const q of all)if(y+.025<q.max[1]!&&y+1.775>q.min[1]!){
     if(supportFootprintOverlaps(e,n,q,.27))throw Error('Inscription body blocked '+JSON.stringify({i,e,n,y,q}));
     if(!supportFootprintOverlaps(e,n,q,Math.min(bodyGap,2)))continue;
     let lo=.27,hi=Math.min(bodyGap,2);
     for(let k=0;k<12;k++){const m=(lo+hi)/2;if(supportFootprintOverlaps(e,n,q,m))hi=m;else lo=m;}
     bodyGap=Math.min(bodyGap,lo);
    }
    for(const [p,q] of segments)trackGap=Math.min(trackGap,segmentGap(e,n,p,q));
    h=y;
   }
   if(Math.abs(h-b.height)>.27)throw Error('Inscription route support disagrees with waypoint '+JSON.stringify({i,h,b}));
  }
  if(Math.abs(h-points.at(-1)!.height)>.03)throw Error('Inscription terminal support changed');
 }
 if(![trackGap,bodyGap,length,maxStep,steps].every(Number.isFinite)||trackGap<1.30||bodyGap<.27||length<=0||steps<1)throw Error('Invalid or unsafe inscription route');
 return {points:route.points,length,steps,maxStep,bodyGap,trackGap,routeId:route.id};
}
/** Optional surface geometry port, not a gameplay/transport authority.
 * Empty in the frozen default host until controller accepts B's exact
 * source package. Candidate overlay supplies the real same-module port. */
export type AR30SurfaceAssembly={historic:{supportedHeight(east:number,north:number):number|undefined;route:readonly Foot[]};productionReady:false;dispose():void};
export type AR30SurfacePort={story:AR30StoryLifecycle;attach(road:Road,rail:Rail):AR30SurfaceAssembly;createPlay?(assembly:AR30SurfaceAssembly,ctx:CraterPlayContext):CraterPlay;readAuthority?():CraterPlayAuthority|undefined};
/** A's production entry refuses a half-mounted B surface. A standalone
 * B review can still use its own explicit test fixture; this gate belongs
 * only to the actual public host. */
export function assertAR30SurfaceLifecycle(road:Road,port:AR30SurfacePort|undefined){
 const ground=road.group.getObjectByName('meteor-crater-walk-mesh');
 const unified=ground?.userData.bR30UnifiedRelief===true;
 if(unified!==!!port)throw Error('Unified crater ground and reviewed surface port must be installed together');
 if(port&&(road.group.getObjectByName('za36-dressing-terrace:plate')||!Array.isArray(road.group.userData.aR30SettledSupports)))throw Error('Unified story retirement/refit incomplete');
}
export function assertAR30SurfaceAttachment(road:Road,rail:Rail){
 const expected=['b-r30-pit-workface','b-r30-crater-workstations','b-r30-melt-columns','b-r30-mound-planting','b-r30-east-historic-walkway','mound-old-work-flag','b-r30-rubbing-transfer'];
 const counts=new Map<string,number>();
 road.group.traverse(o=>{if(expected.includes(o.name))counts.set(o.name,(counts.get(o.name)??0)+1);});
 if(expected.some(n=>counts.get(n)!==1))throw Error('Incomplete or duplicate crater geometry: '+JSON.stringify([...counts]));
 const boxes=[...road.group.userData.colliders,...rail.group.userData.colliders];
 if(new Set(boxes).size!==boxes.length)throw Error('Duplicate crater collision registration');
}
export function ar30HistoricSupport(assembly:AR30SurfaceAssembly|undefined,east:number,north:number,limit:number){
 const h=assembly?.historic.supportedHeight(east,north);
 return h!==undefined&&Number.isFinite(h)&&h<=limit?h:undefined;
}
