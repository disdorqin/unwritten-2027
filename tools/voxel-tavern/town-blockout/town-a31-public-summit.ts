import {AmbientLight,Color,DirectionalLight,Fog,Mesh,Scene,type Group} from 'three';
import type {createTownD2R30ProductionHost} from './town-d2-r30-production-host';
import {retireA31LegacySectorOverlays} from './town-a31-summit-visual-ownership';
import {summitAssemblyAnchor} from './main-summit-assembly';
import type {SouthSnowVisualSample} from './town-night-a-summit-snow-appearance';
import {a31GateFoot} from './town-a31-gate-handoff';
import {readA31UpperCable,type A31CableAuthority} from './town-a31-cable-binding';
import {a32SummitPrefetch,createA32StageMeter,createA32QuietGate,a32YieldFrame} from './town-a32-stream-policy';
import type {A32WarmupStats} from './town-a32-gpu-warmup';
import {prepareA32Canonical} from './town-a32-canonical-preload';
import {certifyHikingSteps,hikingWaypoints} from './town-a32-summit-hiking';
import {mountHikingGuides} from './town-a32-summit-hiking-guides';
import {finishNightBAuditAsync} from './town-night-b-audit-slices';

type Foot=Readonly<{east:number;north:number;height:number}>;
type Production=ReturnType<typeof createTownD2R30ProductionHost>;
type Status='idle'|'loading'|'ready'|'failed'|'disposed';
type Action={label:string;run():void};
type Input={town:Scene;skyline:Group;now():number;yieldFrame?:()=>Promise<void>;profile?:boolean;cableAuthority?:A31CableAuthority;frontSnow?:(e:number,n:number)=>number|undefined;frontWind?:(e:number,n:number)=>number|undefined;warm?:(root:Group,yieldFrame:()=>Promise<void>,cancelled:()=>boolean)=>Promise<A32WarmupStats>};
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
 const stagingAbort=new AbortController();
 let audit:ReturnType<Production['sectorLiveCheck']>|undefined;
 let visual:ReturnType<typeof retireA31LegacySectorOverlays>|undefined;
 let assembly:Readonly<{group:Group;r30:Production['assembly'];summitSnowAt(e:number,n:number):number|undefined}>|undefined;
 let near=false,elapsedMs=0,cutTiles=0,draws=0,snowPending=0,duplicates:readonly string[]=[];
 const yieldFrame=input.yieldFrame??a32YieldFrame,meter=createA32StageMeter(),quiet=createA32QuietGate();
 let canonicalPreparation: {mode:string;ms?:number;elapsedMs?:number;error?:string}|undefined;
 const southSlices:number[]=[];
 let hiking:ReturnType<typeof import('./town-a32-summit-hiking').certifyHiking>|undefined,hikingGuide:ReturnType<typeof mountHikingGuides>|undefined;
 let warmup:A32WarmupStats|undefined,cableFailure:string|undefined,previousFoot:Foot|undefined,previousAt=0,detailEast=Infinity,detailNorth=Infinity,lastViewAt=0,lastViewEast=Infinity,lastViewNorth=Infinity;
 const waitForQuiet=()=>quiet.wait(yieldFrame,()=>status==='disposed');
 const stageRun=async<T,>(name:string,task:()=>T|Promise<T>)=>{stage='queued-'+name;await waitForQuiet();stage=name;return meter.run(name,task);};
 function prepare(){
  if(load)return load;
  if(status==='disposed')return Promise.resolve(false);
  status='loading';
  load=(async()=>{
   let candidate:Production|undefined,preparedSouth:{dispose():void}|undefined;
   const started=performance.now();
   try{
    stage='import';
    const [{createTownD2R30ProductionHost},{createWestSectorInstaller,createEastSectorInstaller},{prepareA32SouthSectorInstaller}]=await Promise.all([
     import('./town-d2-r30-production-host'),import('./town-d2-r30-sector-installers'),import('./town-a32-south-installer')]);
    // Presence's slewed clock may have fractional milliseconds; the ropeway
    // construction contract requires an integer epoch. Live B authority still
    // reads the original continuously synchronized server clock.
    const prepared=await stageRun('canonical-worker',()=>prepareA32Canonical(347,stagingAbort.signal));
    canonicalPreparation=prepared.mode==='worker'?{mode:prepared.mode,ms:prepared.ms,elapsedMs:prepared.elapsedMs}:{mode:prepared.mode,error:prepared.error};
    candidate=await stageRun('canonical',()=>createTownD2R30ProductionHost({epochMs:Math.floor(input.now()),includeRopeway:false,deferDetails:true,preparedCanonical:prepared.mode==='worker'?prepared.data:undefined}));
    const host=candidate;
    // No partially dressed terrain is traversable: mount each real package
    // in an independently measured frame before sector/cable certification.
    host.setNight(night);
    for(const name of host.pendingDetails())await stageRun('detail-'+name,()=>host.mountDetails(name));
    const south=await stageRun('south-prepare',()=>prepareA32SouthSectorInstaller(host.port,stagingAbort.signal));preparedSouth=south;
    await stageRun('south',()=>host.installAsync('A',(port,valid)=>south.installAsync(port,{budgetMs:6,valid,yieldTask:yieldFrame,onSlice:ms=>southSlices.push(ms)})));preparedSouth=undefined;
    await stageRun('west',()=>host.install('B',createWestSectorInstaller()));
    await stageRun('east',()=>host.install('C2',createEastSectorInstaller()));
    host.setFrontSnow(input.frontSnow?(e,n)=>input.frontSnow!(e+summitAssemblyAnchor.east,n+summitAssemblyAnchor.north):undefined);
    host.setFrontWind(input.frontWind?(e,n)=>input.frontWind!(e+summitAssemblyAnchor.east,n+summitAssemblyAnchor.north):undefined);
    visual=await stageRun('ownership',()=>retireA31LegacySectorOverlays(host.group));
    if(input.cableAuthority){
     try{await stageRun('cable',()=>host.preparePublicCable(input.cableAuthority!,{budgetMs:6,signal:stagingAbort.signal,yieldTask:yieldFrame}));}catch(error){cableFailure=error instanceof Error?error.message:String(error);}
    }
    hiking=await stageRun('hiking',()=>finishNightBAuditAsync(certifyHikingSteps(host,hikingWaypoints),{budgetMs:6,signal:stagingAbort.signal,yieldTask:yieldFrame}));
    if(hiking.ready){hikingGuide=mountHikingGuides(host,hiking.path);host.group.add(hikingGuide.group);}
    audit=await stageRun('audit',()=>host.sectorLiveCheck());
    const mountStats=candidate.stats();cutTiles=mountStats.tiles.cut;duplicates=mountStats.duplicates;
    if(!audit.ready||duplicates.length||candidate.cableState().boardable&&!readA31UpperCable(candidate))throw Error('Four-sector public mount refused');
    if(input.warm)warmup=await stageRun('gpu-warmup',()=>input.warm!(host.group,yieldFrame,()=>status==='disposed'));
    candidate.group.position.set(summitAssemblyAnchor.east,0,-summitAssemblyAnchor.north);
    candidate.group.visible=false;
    if(input.profile)candidate.group.traverse(node=>{
     if(node instanceof Mesh){const before=node.onAfterRender;node.onAfterRender=function(...args){before.apply(this,args);draws++;};}
    });
    // Retain one group identity for the future certified domain handoff.
    input.town.add(candidate.group);candidate.setNight(night);if(night)visual.afterNightChange();
    production=candidate;assembly={group:candidate.group,r30:candidate.assembly,
     summitSnowAt:(e,n)=>{const depth=host.snowAt(e,n);if(depth===undefined)return;const front=input.frontSnow?.(e+summitAssemblyAnchor.east,n+summitAssemblyAnchor.north);return front!==undefined&&Number.isFinite(front)&&n<=86?Math.max(0,Math.min(1,Math.max(front-.2,Math.min(front+.2,depth)))):depth;}};
    status='ready';stage='mounted';elapsedMs=performance.now()-started;return true;
   }catch(error){
    preparedSouth?.dispose();hikingGuide?.dispose();hikingGuide=undefined;candidate?.dispose();production=undefined;assembly=undefined;
    if((status as Status)!=='disposed'){status='failed';failure=error instanceof Error?error.message:String(error);}
    input.skyline.visible=true;return false;
   }
  })();
  return load;
 }
 function update(position:Foot){
  draws=0;
  if(!finite(position)||status==='disposed')return;
  quiet.observe(position);
  const now=performance.now(),dt=(now-previousAt)/1000;
  const velocity=previousFoot&&dt>.001&&dt<1&&Math.hypot(position.east-previousFoot.east,position.north-previousFoot.north)<40?{east:(position.east-previousFoot.east)/dt,north:(position.north-previousFoot.north)/dt}:undefined;
  previousFoot=position;previousAt=now;
  if(status==='idle'&&a32SummitPrefetch(position,velocity))void prepare();
  if(!production)return;
  // From the low front ridge the complete massif's vertical south
  // closure is an inappropriate near view (it would show a cliff wall).
  // The accepted distant skyline starts well behind this closure.
  // Only the surveyed high cloud apron, or a certified rear domain,
  // sees the complete production body. No overlapping town collisions.
  near=active||position.east>=286.5&&position.east<=352&&
   position.north>=(near?631:635)&&position.north<=669&&position.height>=(near?345:346);
  production.group.visible=near;input.skyline.visible=!near&&!active;
  if(near){
   const [e,n]=local(position.east,position.north);
   if(Math.hypot(e-detailEast,n-detailNorth)>32){production.setDetailFocus(e,n,1550);detailEast=e;detailNorth=n;}
   if(now-lastViewAt>=150||Math.hypot(e-lastViewEast,n-lastViewNorth)>=8){production.update(e,n,input.now());lastViewAt=now;lastViewEast=e;lastViewNorth=n;}
  }else{snowPending=0;detailEast=detailNorth=lastViewEast=lastViewNorth=Infinity;}
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
  const transfer=production.enterRear(p);if(!transfer.ok)return false;
  active=true;scene.add(production.group);production.group.visible=true;input.skyline.visible=false;return true;
 }
 function leaveAt(p:Foot,accept:()=>boolean){
  if(!active||!production||!finite(p)||!gate(p))return false;
  const h=surveyedSupport(p.east,p.north);
  if(h===undefined||Math.abs(h-p.height)>.08||surveyedBlocked(p.east,p.north,h)||!accept())return false;
  const transfer=production.exitRear();if(!transfer.ok)return false;
  // D2 reports a fixed return anchor; preserve the validated walking foot.
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
  return {status,stage,failure,cableFailure,canonicalPreparation,southSlices:southSlices.length?{count:southSlices.length,max:Math.max(...southSlices),median:[...southSlices].sort((a,b)=>a-b)[Math.floor(southSlices.length/2)]}:undefined,stages:meter.records(),warmup,active,near,farVisible:input.skyline.visible,draws,elapsedMs,ready:audit?.ready===true&&status==='ready',
   installed:production?.installed()??[],cutTiles:production?cutTiles:0,
   duplicates:production?duplicates:[],sectorSamples:audit?.sectors.map(s=>s.samples)??[],
   legacyPruned:visual?{roadTriangles:visual.removedTrailTriangles,forestInstances:visual.removedForestInstances}:undefined,
   southRoad:production?.group.getObjectByName('night-a-south-sector')?.userData.a32Road,
   hiking:hiking?{ready:!!production&&hiking.ready,metres:hiking.metres,maxGrade:hiking.maxGrade,samples:hiking.samples,markers:hikingGuide?.markers??0,skipped:hikingGuide?.skipped??0,...(input.profile&&hiking.ready?{waypoints:hiking.path}: {})}:undefined,
   cable:production?.cableState()??{installed:false,boardable:false,certified:false},
   sceneOwner:production?.group.parent===input.town?'town':production?.group.parent===scene?'summit':undefined};
 }
 return {scene,prepare,waitForQuiet,update,updateView(p:Foot){update(p);return '后山';},active:()=>active,
  riding:()=>false,ridePoint:():Foot|undefined=>undefined,
  action(_p:Foot):Action|undefined{return;},surfaceAt,walkingSurfaceAt:surfaceAt,acceptsStep,
  blocked(e:number,n:number,h:number,r=.27,b=1.8){return active&&surveyedBlocked(e,n,h,r,b);},
  surveyedSupport,surveyedBlocked,enterAt,leaveAt,setNight,state,updateSnow,
  upperOperation:()=>status==='ready'?readA31UpperCable(production):undefined,
  seamReady:()=>status==='ready'&&production?.certifySeamCrossing().open===true,
  seamCertificate:()=>production?.certifySeamCrossing(),
  windAt:(e:number,n:number)=>{const [le,ln]=local(e,n),wind=production?.windAt(le,ln),front=input.frontWind?.(e,n);return wind!==undefined&&front!==undefined&&Number.isFinite(front)&&ln<=86?Math.max(0,Math.min(1,Math.max(front-.2,Math.min(front+.2,wind)))):wind;},
  assembly:()=>active?assembly:undefined,
  dispose(){if(status==='disposed')return;status='disposed';stagingAbort.abort();active=false;near=false;hikingGuide?.dispose();hikingGuide=undefined;production?.dispose();production=undefined;assembly=undefined;input.skyline.visible=true;}
 };
}
