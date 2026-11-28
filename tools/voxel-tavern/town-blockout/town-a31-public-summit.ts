import {AmbientLight,Color,DirectionalLight,Fog,Mesh,Scene,type Group} from 'three';
import type {createTownD2R30ProductionHost} from './town-d2-r30-production-host';
import {retireA31LegacySectorOverlays} from './town-a31-summit-visual-ownership';
import {summitAssemblyAnchor} from './main-summit-assembly';
import type {SouthSnowVisualSample} from './town-night-a-summit-snow-appearance';
import {a31GateFoot} from './town-a31-gate-handoff';

type Foot=Readonly<{east:number;north:number;height:number}>;
type Production=ReturnType<typeof createTownD2R30ProductionHost>;
type Status='idle'|'loading'|'ready'|'failed'|'disposed';
type Action={label:string;run():void};
type Input={town:Scene;skyline:Group;now():number;yieldFrame?:()=>Promise<void>;profile?:boolean};
const finite=(p:Foot)=>[p.east,p.north,p.height].every(Number.isFinite);
const local=(e:number,n:number)=>[e-summitAssemblyAnchor.east,n-summitAssemblyAnchor.north] as const;

/** The public renderer's single real rear-massif owner. The old ZA22
 * timetable/massif is not constructed here. The far silhouette is an LOD
 * presentation only: it and the live near assembly are mutually exclusive.
 * No query parameter or debug jump enables entry. The accepted transport/
 * pedestrian connection must supply a real room transfer in the next batch. */
export function createA31PublicSummitRoute(input:Input){
 const scene=new Scene();scene.background=new Color('#aebfd2');scene.fog=new Fog('#aebfd2',170,1400);
 scene.add(new AmbientLight('#d6e3f2',1.25));
 const sun=new DirectionalLight('#fff4df',1.7);sun.position.set(-80,120,50);scene.add(sun);
 let status:Status='idle',stage='idle',failure:string|undefined,night=false,active=false;
 let production:Production|undefined,load:Promise<boolean>|undefined;
 let audit:ReturnType<Production['sectorLiveCheck']>|undefined;
 let visual:ReturnType<typeof retireA31LegacySectorOverlays>|undefined;
 let assembly:Readonly<{group:Group;r30:Production['assembly'];summitSnowAt(e:number,n:number):number|undefined}>|undefined;
 let near=false,elapsedMs=0,cutTiles=0,draws=0,snowPending=0,duplicates:readonly string[]=[];
 const yieldFrame=input.yieldFrame??(()=>new Promise<void>(resolve=>{
  // The ordinary entry screen owns the expensive initial mesh build.
  // Yield between sectors so that the loading UI can repaint, without
  // relying on idle periods from a busy WebGL animation loop.
  if(typeof document!=='undefined'&&document.body.classList.contains('town-entry-pending'))setTimeout(resolve,0);
  else if(typeof requestIdleCallback==='function')requestIdleCallback(()=>resolve(),{timeout:1500});
  else setTimeout(resolve,0);
 }));
 function prepare(){
  if(load)return load;
  if(status==='disposed')return Promise.resolve(false);
  status='loading';
  load=(async()=>{
   let candidate:Production|undefined;
   const started=performance.now();
   try{
    stage='import';
    const [{createTownD2R30ProductionHost},{createSouthSectorInstaller,createWestSectorInstaller,createEastSectorInstaller}]=await Promise.all([
     import('./town-d2-r30-production-host'),import('./town-d2-r30-sector-installers')]);
    const check=()=>{if(status==='disposed')throw Error('Public summit disposed during staging');};
    await yieldFrame();check();stage='canonical';
    candidate=createTownD2R30ProductionHost({epochMs:input.now(),includeRopeway:false});
    await yieldFrame();check();stage='south';candidate.install('A',createSouthSectorInstaller());
    await yieldFrame();check();stage='west';candidate.install('B',createWestSectorInstaller());
    await yieldFrame();check();stage='east';candidate.install('C2',createEastSectorInstaller());
    await yieldFrame();check();stage='audit';
    audit=candidate.sectorLiveCheck();
    const mountStats=candidate.stats();cutTiles=mountStats.tiles.cut;duplicates=mountStats.duplicates;
    if(!audit.ready||duplicates.length||candidate.cableState().boardable)throw Error('Four-sector public mount refused');
    visual=retireA31LegacySectorOverlays(candidate.group);
    candidate.group.position.set(summitAssemblyAnchor.east,0,-summitAssemblyAnchor.north);
    candidate.group.visible=false;
    if(input.profile)candidate.group.traverse(node=>{
     if(node instanceof Mesh){const before=node.onAfterRender;node.onAfterRender=function(...args){before.apply(this,args);draws++;};}
    });
    // Retain one group identity for the future certified domain handoff.
    input.town.add(candidate.group);candidate.setNight(night);if(night)visual.afterNightChange();
    production=candidate;assembly={group:candidate.group,r30:candidate.assembly,
     // No legacy block-derived depth on the new terrain. Ground snow depth
     // remains unmeasured until its real canonical field is delivered.
     summitSnowAt:()=>undefined};
    status='ready';stage='mounted';elapsedMs=performance.now()-started;return true;
   }catch(error){
    candidate?.dispose();production=undefined;assembly=undefined;
    if((status as Status)!=='disposed'){status='failed';failure=error instanceof Error?error.message:String(error);}
    input.skyline.visible=true;return false;
   }
  })();
  return load;
 }
 function update(position:Foot){
  draws=0;
  if(!finite(position)||status==='disposed')return;
  if(status==='idle')void prepare();
  if(!production)return;
  // From the low front ridge the complete massif's vertical south
  // closure is an inappropriate near view (it would show a cliff wall).
  // The accepted distant skyline starts well behind this closure.
  // Only the surveyed high cloud apron, or a certified rear domain,
  // sees the complete production body. No overlapping town collisions.
  near=active||position.east>=286.5&&position.east<=352&&
   position.north>=(near?631:635)&&position.north<=669&&position.height>=(near?345:346);
  production.group.visible=near;input.skyline.visible=!near&&!active;
  if(near)production.update(...local(position.east,position.north),input.now());
  else snowPending=0;
 }
 function updateSnow(dt:number,sample:SouthSnowVisualSample){
  if(!production||!near||!Number.isFinite(dt)||dt<=0)return;
  snowPending+=Math.min(dt,.25);if(snowPending<1)return;
  const seconds=snowPending;snowPending=0;
  production.updateSnow(seconds,(e:number,n:number,h:number)=>sample(e+summitAssemblyAnchor.east,n+summitAssemblyAnchor.north,h));
 }
 function surveyedSupport(e:number,n:number,r=.27){
  if(!production||!Number.isFinite(e)||!Number.isFinite(n)||!Number.isFinite(r)||r<0)return;
  const [le,ln]=local(e,n),h=production.supportAt(le,ln,r);
  if(h===undefined||!Number.isFinite(h))return;
  // Missing any point of the player's footprint is an actual edge, not
  // permission to fall back to the former town or analytic height.
  for(const [de,dn] of [[-r,0],[r,0],[0,-r],[0,r]])if(production.surfaceAt(le+de!,ln+dn!)===undefined)return;
  return h;
 }
 function surveyedBlocked(e:number,n:number,h:number,r=.27,body=1.8){
  if(!production||![e,n,h,r,body].every(Number.isFinite)||r<0||body<0)return true;
  const [le,ln]=local(e,n);
  return production.blocked(le,ln,h,r,body)||!!production.assembly.northWall?.blocked(le,ln,h,r,body);
 }
 const gate=a31GateFoot;
 /** A caller may only hand off the SAME physically supported foot, and
  * must accept the real authority/room transition. No new transport clock,
  * no teleport destination, no call site until B/C2 certification. */
 function enterAt(p:Foot,accept:()=>boolean){
  if(active||status!=='ready'||!production||!finite(p)||!gate(p))return false;
  const h=surveyedSupport(p.east,p.north);
  if(h===undefined||Math.abs(h-p.height)>.08||surveyedBlocked(p.east,p.north,h)||!accept())return false;
  active=true;scene.add(production.group);production.group.visible=true;input.skyline.visible=false;return true;
 }
 function leaveAt(p:Foot,accept:()=>boolean){
  if(!active||!production||!finite(p)||!gate(p))return false;
  const h=surveyedSupport(p.east,p.north);
  if(h===undefined||Math.abs(h-p.height)>.08||surveyedBlocked(p.east,p.north,h)||!accept())return false;
  active=false;input.town.add(production.group);near=false;update(p);return true;
 }
 function surfaceAt(e:number,n:number,r=.27){return active?surveyedSupport(e,n,r):undefined;}
 function acceptsStep(fe:number,fn:number,te:number,tn:number,r=.27){
  if(!active)return false;
  const a=surfaceAt(fe,fn,r),b=surfaceAt(te,tn,r),d=Math.hypot(te-fe,tn-fn);
  return a!==undefined&&b!==undefined&&(d<1e-6||b-a<=.85*d+.001);
 }
 function setNight(value:boolean){
  if(night===value)return;night=value;production?.setNight(value);visual?.afterNightChange();
 }
 function state(){
  return {status,stage,failure,active,near,farVisible:input.skyline.visible,draws,elapsedMs,ready:audit?.ready===true&&status==='ready',
   installed:production?.installed()??[],cutTiles:production?cutTiles:0,
   duplicates:production?duplicates:[],sectorSamples:audit?.sectors.map(s=>s.samples)??[],
   legacyPruned:visual?{roadTriangles:visual.removedTrailTriangles,forestInstances:visual.removedForestInstances}:undefined,
   cable:production?.cableState()??{installed:false,boardable:false,certified:false},
   sceneOwner:production?.group.parent===input.town?'town':production?.group.parent===scene?'summit':undefined};
 }
 return {scene,prepare,update,updateView(p:Foot){update(p);return '后山';},active:()=>active,
  riding:()=>false,ridePoint:():Foot|undefined=>undefined,
  action(_p:Foot):Action|undefined{return;},surfaceAt,walkingSurfaceAt:surfaceAt,acceptsStep,
  blocked(e:number,n:number,h:number,r=.27,b=1.8){return active&&surveyedBlocked(e,n,h,r,b);},
  surveyedSupport,surveyedBlocked,enterAt,leaveAt,setNight,state,updateSnow,
  assembly:()=>active?assembly:undefined,
  dispose(){if(status==='disposed')return;status='disposed';active=false;near=false;production?.dispose();production=undefined;assembly=undefined;input.skyline.visible=true;}
 };
}
