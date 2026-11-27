import {surveyR30ReturnRelocation,r30ReturnRelocationCandidate} from './town-c-r30-return-relocation-candidate.js';
import {firstMineConnectionDatum} from '../../../src/shared/underground-second-mine-presence-domain.js';
import type {R30ReturnHeadframeSurvey} from './town-c-r30-return-bore-candidate.js';

type Point=Readonly<{east:number;north:number;height:number}>;
type Foot=Point&Readonly<{domainId:string;playerId:string}>;
type Stop='crater-floor'|'mine';
export type R30ReturnRidePath=Readonly<{shaft:Point;landing:Point}>;
type Survey=R30ReturnHeadframeSurvey&Readonly<{approach:Point;routeGap:number;grade:number;reservationGap:number;solidGap:number;radius:number}>;
/** The geometry candidate is always sealed. Only the existing A/B/C
 * production hosts and total controller may supply the live certificate.
 * None of these booleans is inferred from the candidate's model. */
export type R30ReturnRideAcceptance=Readonly<{
 revision:string;surfaceCut:boolean;mineRoofAndWestWallCut:boolean;oldStationRetired:boolean;
 continuousBore:boolean;physicalCageAndDock:boolean;existingAuthorityConnected:boolean;
 presentationConnected:boolean;approvedByTotalControl:boolean;
}>;
type Options=Readonly<{
 survey:Survey;surfaceDomain:string;mineDomain:string;
 readAcceptance():R30ReturnRideAcceptance|undefined;
 /** A's accepted movement/actual support query; no camera-derived foot. */
 supportsFoot(stop:Stop,role:'call'|'board'|'landing',foot:Foot):boolean;
}>;
const finite=(p:Point)=>[p.east,p.north,p.height].every(Number.isFinite);
const distance=(a:Point,b:Point)=>Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height);
const same=(a:number,b:number)=>Math.abs(a-b)<1e-6;
export function createR30ReturnRidePort(options:Options){
 const {survey:s}=options,lower=surveyR30ReturnRelocation(),datum=firstMineConnectionDatum;
 if(!finite(s.axis)||!finite(s.approach)||![s.yaw,s.apertureSide,s.roofSpan,s.dockHeight,s.verticalSpan,s.routeGap,s.grade,s.reservationGap,s.solidGap,s.radius].every(Number.isFinite)||
  s.productionReady!==false||!same(s.axis.east,lower.world.east)||!same(s.axis.north,lower.world.north)||
  !same(s.yaw,datum.yaw)||!same(s.dockHeight,lower.world.height)||!same(s.verticalSpan,s.axis.height-lower.world.height)||
  s.verticalSpan<=r30ReturnRelocationCandidate.ceiling+4||!same(s.apertureSide,2.2)||s.roofSpan<0||s.roofSpan>.025||
  s.radius<2.35||s.reservationGap<s.radius||s.solidGap<s.radius||s.routeGap<.35||s.grade<0||s.grade>.10||
  !same(Math.hypot(s.approach.east-s.axis.east,s.approach.north-s.axis.north),1.95)||Math.abs(s.approach.height-s.axis.height)>.025||
  !options.surfaceDomain.trim()||!options.mineDomain.trim()||options.surfaceDomain===options.mineDomain)return {kind:'blocked' as const,reason:'return-survey-mismatch'};
 const point=(p:Point)=>Object.freeze({east:p.east,north:p.north,height:p.height});
 const path:R30ReturnRidePath=Object.freeze({shaft:point(s.axis),landing:point(lower.world)});
 const calls=Object.freeze({'crater-floor':point(s.approach),mine:point(lower.call)});
 const docks=Object.freeze({'crater-floor':path.shaft,mine:path.landing});
 const domains=Object.freeze({'crater-floor':options.surfaceDomain,mine:options.mineDomain});
 function revision(){
  const c=options.readAcceptance();
  return c&&typeof c.revision==='string'&&c.revision.trim()&&c.surfaceCut===true&&c.mineRoofAndWestWallCut===true&&c.oldStationRetired===true&&
   c.continuousBore===true&&c.physicalCageAndDock===true&&c.existingAuthorityConnected===true&&c.presentationConnected===true&&c.approvedByTotalControl===true?c.revision:undefined;
 }
 function check(stop:Stop,role:'call'|'board'|'landing',foot:Foot){
  if(!revision()||!foot.playerId.trim()||foot.domainId!==domains[stop]||!finite(foot))return false;
  const target=role==='call'?calls[stop]:docks[stop];
  const reach=role==='landing'?.01:role==='board'?.40:.70;
  return Math.hypot(foot.east-target.east,foot.north-target.north)<=reach&&Math.abs(foot.height-target.height)<(role==='landing'?.01:.18)&&options.supportsFoot(stop,role,foot)===true;
 }
 return {kind:'ready' as const,path,calls,domains,revision,check,
  /** Still not authorization: the original lift consumes this exact route
   * only while the live certificate and accepted supports remain present. */
  crossing(point:Point){return !!revision()&&finite(point)&&Math.hypot(point.east-path.shaft.east,point.north-path.shaft.north)<=.40},
 } as const;
}
export type R30ReturnRidePort=Extract<ReturnType<typeof createR30ReturnRidePort>,{kind:'ready'}>;
