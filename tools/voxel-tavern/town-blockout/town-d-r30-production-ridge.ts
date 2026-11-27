import type {Object3D} from 'three';
import type {createTerrainGrid} from './terrain';
import {createAR30RidgeOwnership} from './town-a-r30-ridge-ownership';
import {buildFrontRidgeR30Field,frontRidgeR30Bounds,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {buildMiddleEastRoadbed,middleEastNorthControls,middleSouthRoadControls,lowerEastServiceControls,lowerEastServiceTerminal} from './town-d-r30-upper-roadbed';
import {auditRidgeRoadSurface} from './town-d-r30-roadbed';
import {buildRearRidgeConnector} from './town-d-r30-rear-connector';
import {mountRidgeForest,ridgeForestRouteClearance} from './town-d-r30-forest';
import {mountRidgeRoadFurniture} from './town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from './town-d-r30-retaining-banks';
import {mountNorthRidgeMiddleStation} from './north-ridge-middle-station';
import {mountRidgeCableFacilities,auditRidgeCableSweep,surveyRidgeCableSpans} from './town-d-r30-cable-facilities';
import {mountRidgeCloudTerrace,auditProductionCloudSeam} from './town-d-r30-cloud-terrace';
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
 const furniture=roads.map(r=>mountRidgeRoadFurniture(field,r.route,allowed,r===lower&&!rearConnected?{title:'后坡施工终点',returnTo:'基站'}:r===east?{title:'中山施工终点',returnTo:'中站'}:undefined));
 const banks=roads.map(r=>mountRidgeRetainingBanks(field,r.route,allowed));
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
 const cloudSeam=auditProductionCloudSeam(field);
 const terrace=cloudSeam.physicalReady?mountRidgeCloudTerrace(owner,field,(e,n,y,r)=>forest.blocked(e,n,y,r)||!!facilities?.blocked(e,n,y,r)||!!station?.blocked(e,n,y,r)||furniture.some(f=>f.blocked(e,n,y,r))||banks.some(b=>b.blocked(e,n,y,r)),true):undefined;
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
 const baseRoute=roads.at(-1)?.route??[];
 const baseToMiddleGuide=rearConnected&&connector&&'road'in connector&&connector.road&&baseRoute.length?
  [...baseRoute,...connector.road.route.slice(1).map(p=>({...p,cum:p.cum+baseRoute.at(-1)!.cum}))]:baseRoute;
 // LOD geometry changes invalidate P's snapshot and fail open. Only
 // these explicitly static outdoor terrain/road roots are registered;
 // operational transport, station signs and assembly interaction stay out.
 return {field,ownership,ownsCell:patch.ownsCell,changedVertices:patch.changedVertices,roads,stationReady,model,forest,heightAt,allowsUphill,facilities,cableAudit,serviceExit,terrace,cloudSeam,rearConnected,baseToMiddleGuide,connectorAudit:connector&&'audit'in connector?connector.audit:undefined,staticRenderRoots,roadTerminalAction(e:number,n:number,h:number){
   const sign=furniture.map(f=>f.terminalSign).find(s=>s&&Math.hypot(e-s.east,n-s.north)<5.5&&Math.abs(h-s.height)<2);
   return sign?{title:sign.title,message:'前方道路尚未贯通，请沿已认证道路返回'+sign.returnTo+'。'}:undefined;
  },reserveRoad:(e:number,n:number,r:number)=>!clearance(e,n,r),
  blocked(e:number,n:number,h:number,r=.27){return forest.blocked(e,n,h,r)||!!station?.blocked(e,n,h,r)||!!facilities?.blocked(e,n,h,r)||!!terrace?.blocked(e,n,h,r)||furniture.some(f=>f.blocked(e,n,h,r))||banks.some(b=>b.blocked(e,n,h,r))},
  setNight(night:boolean){station?.setNight(night);facilities?.setNight(night);terrace?.setNight(night);furniture.forEach(f=>f.setNight(night))},
  updateView(e:number,n:number,allowDistant=true){model.updateView(e,n,allowDistant);forest.updateView(e,n);banks.forEach(b=>b.updateView(e,n));facilities?.updateView(e,n)},
  transportReady:false as const,
 };
}
