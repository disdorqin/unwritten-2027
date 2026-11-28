import {Group,type Object3D} from 'three';
import type {createTerrainGrid} from './terrain';
import {createAR30RidgeOwnership} from './town-a-r30-ridge-ownership';
import {buildFrontRidgeR30Field,frontRidgeR30Bounds,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {buildMiddleEastRoadbed,middleEastNorthControls,middleSouthRoadControls,lowerEastServiceControls,lowerEastServiceTerminal} from './town-d-r30-upper-roadbed';
import {auditRidgeRoadSurface} from './town-d-r30-roadbed';
import {c2EastRoadHandoffs} from './town-night-c2-summit-road-handoff';
import {buildRearRidgeConnector} from './town-d-r30-rear-connector';
import {mountRidgeForest,ridgeForestRouteClearance} from './town-d-r30-forest';
import {mountRidgeRoadFurniture} from './town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from './town-d-r30-retaining-banks';
import {mountNorthRidgeMiddleStation} from './north-ridge-middle-station';
import {mountRidgeCableFacilities,auditRidgeCableSweep,surveyRidgeCableSpans} from './town-d-r30-cable-facilities';
import {mountRidgeCloudTerrace,auditProductionCloudSeam} from './town-d-r30-cloud-terrace';
import type {C2CableAuthority} from './town-night-c2-front-cable-host';
import {installA32FrontOperation} from './town-a32-front-operation';
import {createA32FrontWalkAuthority} from './town-a32-front-walk-authority';
import type {NightBAuditSliceOptions} from './town-night-b-audit-slices';
type Foot={east:number;north:number;height:number};
type C2FrontInstall=Awaited<ReturnType<typeof installA32FrontOperation>>;
type C2FrontRepair=Extract<C2FrontInstall,{ready:true}>['frontRepair'];
type C2FrontOperation=Extract<C2FrontInstall,{ready:true}>['frontOperation'];
/** Repair anchors measured by B on this exact production front field
 * (handoff 2026-11-28, lane-build): brake E524.6/N326.6/H26, cable wheel
 * E483/N424.5, weight tower E436.8/N523.2/H140, frame E440.6/N517.4/H140.
 * They are the machine-room and counterweight positions of the real station,
 * not invented points; whether a player can actually reach them is decided by
 * the walking certification below, not by these numbers. */
const c2FrontRepairAnchors=Object.freeze({
 brake:Object.freeze({east:524.6,north:326.6}),
 cableWheel:Object.freeze({east:483,north:424.5}),
 weightTower:Object.freeze({east:436.8,north:523.2}),
 weightFrame:Object.freeze({east:440.6,north:517.4}),
});
type Grid=ReturnType<typeof createTerrainGrid>;
type Options=Parameters<typeof createAR30RidgeOwnership>[0]&{rearConnectorCandidate?:boolean};
/** M1 production only: actual rail geometry defines the protected H0.
 * No old spiral support, no uncertified cable/domain transfer. */
export function mountProductionRidge(owner:Object3D,grid:Grid,options:Options){
 const ownership=createAR30RidgeOwnership({...options,cloudApron:true});
 const allowed=(e:number,n:number)=>ownership.distance(e,n)>0;
 const natural=buildFrontRidgeR30Field(grid.groundHeightAt,ownership.weight);
 let field=natural;
 const south=buildMiddleEastRoadbed(field,allowed,middleSouthRoadControls);
 if(south.ok&&'field'in south)field=south.field;
 const east=buildMiddleEastRoadbed(field,allowed,middleEastNorthControls);
 if(east.ok&&'field'in east)field=east.field;
 // Never publish an overlapping or protected cut merely because individual
 // segments passed. Fall back to the natural mountain, not the old shell.
 const lower=buildMiddleEastRoadbed(field,allowed,lowerEastServiceControls,lowerEastServiceTerminal);
 if(lower.ok&&'field'in lower)field=lower.field;
 const accepted=[south,east,lower].filter(r=>r.ok&&'field'in r);
 const coherent=accepted.every(r=>auditRidgeRoadSurface(field,r.route).maxGrade<=.12+1e-6)&&
 field.elevation.every((v,i)=>Math.abs(v-natural.elevation[i]!)<=8.00001);
 const connector=coherent&&accepted.length===3&&options.rearConnectorCandidate?buildRearRidgeConnector(field,accepted,ownership.distance):undefined;
 const rearConnected=!!(connector?.ok&&'road'in connector&&connector.road);
 const roads=coherent?rearConnected&&connector&&'road'in connector&&connector.road?
  [...accepted.filter(r=>r!==lower),connector.road,...accepted.filter(r=>r===lower)]:accepted:[];
 if(!coherent)field=natural;
 else if(rearConnected&&connector&&'road'in connector&&connector.road)field=connector.road.field;
 const patch=grid.installGroundPatch(frontRidgeR30Bounds,field.vertexAt,allowed);
 const roadAt=(e:number,n:number)=>roads.some(r=>r.roadAt?.(e,n)===true);
 const model=mountFrontRidgeR30(field,roadAt,patch.ownsCell);owner.add(model.group);
 const clearance=ridgeForestRouteClearance(roads.map(r=>r.route));
 const forest=mountRidgeForest(field,(e,n,r)=>ownership.distance(e,n)>r+3&&clearance(e,n,r)&&!(e+r>=284&&e-r<=355&&n+r>=628&&n-r<=670));owner.add(forest.group);
 // The base cable dock sweeps its own approach: keep roadside posts, lamps
 // and retaining walls out of that footprint instead of letting the host
 // report 15 blocked probes inside the certified cable envelope.
 const dockClearZone=(e:number,n:number)=>!(e>=512&&e<=540&&n>=344&&n<=366);
 const roadAllowed=(e:number,n:number)=>allowed(e,n)&&dockClearZone(e,n);
 const furniture=roads.map(r=>mountRidgeRoadFurniture(field,r.route,roadAllowed,r===lower&&!rearConnected?{title:'后坡施工终点',returnTo:'基站'}:r===east?{title:'中山施工终点',returnTo:'中站'}:undefined));
 const banks=roads.map(r=>mountRidgeRetainingBanks(field,r.route,roadAllowed));
 for(const asset of [...furniture,...banks])owner.add(asset.group);
 // The old terminal footprint is preserved; mid station is mounted only
 // when its actual platform datum is supported by this exact field.
 const stationReady=Array.from({length:13},(_,i)=>i-6).every(de=>Array.from({length:9},(_,i)=>i-4).every(dn=>Math.abs((field.heightAt(440+de,520+dn)??-1)-140)<.001));
 const station=stationReady?mountNorthRidgeMiddleStation(owner):undefined;
 // Static facilities use the actual raster; operational authority remains
 // closed. No cabin motion, old line, or unverified domain transfer.
 const cableSurvey=surveyRidgeCableSpans(field,true);
 const cableAudit=auditRidgeCableSweep(field,cableSurvey);
 const serviceExit=roads.includes(lower)&&Math.abs((field.heightAt(522,355)??-1)-26)<.001;
 const facilities=stationReady&&cableAudit.groundHits===0&&cableAudit.minMoving>=.25
  ?mountRidgeCableFacilities(owner,field,true,true,serviceExit):undefined;
 const seamAudit=auditProductionCloudSeam(field);let seamCertified=false;
 const cloudSeam={...seamAudit,get domainReady(){return seamCertified;},get failure():string|undefined{return terrace?.seamFailure;}};
 let activeFacilities=facilities;
 // The terrace routes its own cloud paths, so it must keep seeing the cable
 // facility (otherwise it draws a path straight through the station). The
 // cable envelope query below leaves the terrace out instead: B's mounted-mesh
 // triangle scan already covers the terrace geometry, so re-entering the
 // facility through the terrace would only reproduce the loop.
 const terrace=cloudSeam.physicalReady?mountRidgeCloudTerrace(owner,field,(e,n,y,r)=>forest.blocked(e,n,y,r)||!!activeFacilities?.blocked(e,n,y,r)||!!station?.blocked(e,n,y,r)||furniture.some(f=>f.blocked(e,n,y,r))||banks.some(b=>b.blocked(e,n,y,r)),true):undefined;
 function heightAt(e:number,n:number){
  return patch.ownsCell(Math.floor(e),Math.floor(n))?grid.heightAt(e,n):undefined;
 }
 // A small frame step must not allow walking up a rock face merely
 // because its per-frame elevation increment is below the old step limit.
 // Natural snow slopes remain explorable; engineered roads keep their
 // separately certified 12% bound. Actual steps/platforms are exempt.
 function allowsUphill(from:{east:number;north:number;height:number},to:{east:number;north:number;height:number}){
  const a=heightAt(from.east,from.north),b=heightAt(to.east,to.north);
  if(a===undefined&&b===undefined)return true;
  const h0=a??grid.heightAt(from.east,from.north),h1=b??grid.heightAt(to.east,to.north);
  if(Math.abs(from.height-h0)>.04||Math.abs(to.height-h1)>.04)return true;
  const d=Math.hypot(to.east-from.east,to.north-from.north);
  return d<1e-6||h1-h0<=.85*d+1e-5;
 }
 const staticRenderRoots=[model.group,forest.group,...furniture.map(f=>f.group),...banks.map(b=>b.group)];
 const frontRoadHandoffs=c2EastRoadHandoffs.map(h=>{
  const match=roads.find(r=>Math.hypot(r.route[0]!.east-h.from.east,r.route[0]!.north-h.from.north)<.01&&Math.hypot(r.route.at(-1)!.east-h.to.east,r.route.at(-1)!.north-h.to.north)<.01);
  const surface=match?auditRidgeRoadSurface(field,match.route):undefined;
  return {id:h.id,domain:h.domain,installed:!!match,fromHeight:match&&field.heightAt(h.from.east,h.from.north),toHeight:match&&field.heightAt(h.to.east,h.to.north),length:match?.route.at(-1)?.cum,surface};
 });
 const baseRoute=roads.at(-1)?.route??[];
 const baseToMiddleGuide=rearConnected&&connector&&'road'in connector&&connector.road&&baseRoute.length?
  [...baseRoute,...connector.road.route.slice(1).map(p=>({...p,cum:p.cum+baseRoute.at(-1)!.cum}))]:baseRoute;
 // C32-1: the closed facility is replaced in place by B's certified open one.
 // Until that swap really succeeds `transportReady` stays false and A's
 // readA31FrontCable keeps returning nothing.
 let frontOperation:C2FrontOperation|undefined;
 let frontRepair:C2FrontRepair|undefined;
 let transport=false;
 let prepareReason:string|undefined,preparing=false,disposed=false,routeAudit:unknown;
 let cableSlices:number[]=[];
 const cableAbort=new AbortController();
 /** Everything the host actually owns except the facility being replaced, so
  * the installer never counts its own parked cars as an external obstacle. */
 function externalObstacles(e:number,n:number,h:number,r=.27,body=1.8){
  // No terrace term: it chains back into this facility, and B's triangle scan
  // of the mounted meshes already tests the real terrace geometry.
  return forest.blocked(e,n,h,r)||!!station?.blocked(e,n,h,r)||
   furniture.some(f=>f.blocked(e,n,h,r))||banks.some(b=>b.blocked(e,n,h,r));
 }
 return {field,ownership,ownsCell:patch.ownsCell,changedVertices:patch.changedVertices,roads,stationReady,model,forest,heightAt,allowsUphill,cableAudit,serviceExit,terrace,cloudSeam,rearConnected,baseToMiddleGuide,frontRoadHandoffs,connectorAudit:connector&&'audit'in connector?connector.audit:undefined,staticRenderRoots,roadTerminalAction(e:number,n:number,h:number){
   const sign=furniture.map(f=>f.terminalSign).find(s=>s&&Math.hypot(e-s.east,n-s.north)<5.5&&Math.abs(h-s.height)<2);
   return sign?{title:sign.title,message:'前方道路尚未贯通，请沿已认证道路返回'+sign.returnTo+'。'}:undefined;
  },reserveRoad:(e:number,n:number,r:number)=>!clearance(e,n,r),
  /** A's `preparePublicFrontCable`: real B installer, real host obstacles,
   * real walking certification. Rejection keeps the closed instance and
   * never grants transportReady. */
  async preparePublicFrontCable(authority:C2CableAuthority,walkGroups?:readonly Group[],auditOptions:NightBAuditSliceOptions={}){
   if(transport)return true;
   if(!activeFacilities||!stationReady||!serviceExit){prepareReason='host-not-ready';return false;}
   if(frontOperation||preparing||disposed)return false;
   const closed=activeFacilities;
   const groups=walkGroups??owner.children.filter((c):c is Group=>c instanceof Group&&c!==closed.group);
   const walk=createA32FrontWalkAuthority(groups,grid.heightAt);
   preparing=true;cableSlices=[];
   try{
   const result=await installA32FrontOperation({owner,field,closed,groundMeshes:[model.group],authority,
    authorized:cableAudit.groundHits===0&&cableAudit.minMoving>=.25,
    supportAt:walk.supportAt,groundAt:grid.heightAt,allowsUphill,
    blocked:(e:number,n:number,h:number,r:number,body:number)=>externalObstacles(e,n,h,r,body)||!!terrace?.physicalBlocked(e,n,h,r)||walk.blocked(e,n,h,r,body),
    repairAnchors:c2FrontRepairAnchors,roads:roads.map(road=>road.route)},
    {...auditOptions,signal:auditOptions.signal??cableAbort.signal,valid:()=>!disposed&&activeFacilities===closed&&auditOptions.valid?.()!==false,
     onSlice:ms=>{cableSlices.push(ms);auditOptions.onSlice?.(ms);}});
   routeAudit=result.routeAudit;
   if(!result.ready){prepareReason=result.reason;return false;}
   // Same parent, one facility: the closed instance is already disposed by
   // the installer, so every consumer must now read the new one.
   activeFacilities=result.facilities;
   frontOperation=result.frontOperation;
   frontRepair=result.frontRepair;
   transport=true;
   prepareReason=undefined;
   return true;
   }finally{preparing=false;}
  },
  get frontRouteAudit(){return routeAudit;},
  get frontAuditSlices(){return cableSlices.length?{count:cableSlices.length,max:Math.max(...cableSlices),median:[...cableSlices].sort((a,b)=>a-b)[Math.floor(cableSlices.length/2)]}:undefined;},
  certifyPublicSeam(rear:(e:number,n:number)=>number|undefined){seamCertified=terrace?.certifySeam(rear)===true;return seamCertified;},
  get facilities(){return activeFacilities;},
  get frontOperation(){return frontOperation;},
  get frontRepair(){return frontRepair;},
  get transportReady(){return transport;},
  get frontCablePrepareResult(){return prepareReason;},
  /** The host obstacle query A/D2 may reuse; excludes the facility itself. */
  externalObstacles,
  blocked(e:number,n:number,h:number,r=.27){return forest.blocked(e,n,h,r)||!!station?.blocked(e,n,h,r)||!!activeFacilities?.blocked(e,n,h,r)||!!terrace?.blocked(e,n,h,r)||furniture.some(f=>f.blocked(e,n,h,r))||banks.some(b=>b.blocked(e,n,h,r))},
  setNight(night:boolean){station?.setNight(night);activeFacilities?.setNight(night);terrace?.setNight(night);furniture.forEach(f=>f.setNight(night))},
  updateView(e:number,n:number,allowDistant=true){model.updateView(e,n,allowDistant);forest.updateView(e,n);banks.forEach(b=>b.updateView(e,n));activeFacilities?.updateView(e,n)},
  dispose(){disposed=true;cableAbort.abort();activeFacilities?.dispose();activeFacilities=undefined;frontRepair=undefined;transport=false;},
 };
}
