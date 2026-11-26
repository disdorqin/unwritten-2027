import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
import type {Box} from './landmark-kit';
import {attachBR30PhysicalKit} from './town-b-r30-physical-kit';
import {installBR30MeltColumns} from './town-b-r30-melt-columns';
import {installBR30MoundPlanting} from './town-b-r30-mound-planting';
import {installBR30MoundWorkFlag} from './town-b-r30-mound-work-flag';
import {installBR30HistoricEastWall} from './town-b-r30-historic-walkway-site';
import {installBR30RubbingPaper} from './town-b-r30-inscription-rubbing';
import {surveyBR30ReturnHeadframe} from './town-b-r30-return-headframe';
import {surveyBR30WorkshopApproaches} from './town-b-r30-workshop-approaches';
import {surveyBR30InscriptionApproach} from './town-b-r30-inscription-approach';
type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
type RailTrack=ReadonlyArray<Readonly<{east:number;north:number}>>;
type Mode='review'|'host-candidate';
type HostRoute=Parameters<typeof surveyBR30WorkshopApproaches>[2][number];
type HostRail=Rail&{readonly sidingSamples?:RailTrack};
const live=new WeakSet<object>();
/** One B-owned attachment after A's final unified terrain, legacy plate
 * retirement/refit and rail build, before the sole west collision index.
 * Host-candidate mode requires all three actual A rail routes and the
 * industrial approach surveys. No authority, new floor, lift, or
 * production approval is implied by returning a mounted scene. */
export function attachBR30CraterCompletion(road:Road,rail:HostRail,tracks:readonly RailTrack[],mode:Mode,hostRoutes?:readonly HostRoute[]){
 const root=road.group,old=road.group.userData.colliders as Box[];
 if(!Array.isArray(old))throw Error('Missing final west collision list');
 const ground=root.getObjectByName('meteor-crater-walk-mesh');
 if(ground?.userData.bR30UnifiedRelief!==true)throw Error('B completion requires final unified R30 crater ground');
 if(!Array.isArray(road.midgroundS5?.colliders))throw Error('B completion requires R30 relic collision metadata');
 if(live.has(root)||['b-r30-pit-workface','b-r30-crater-workstations','b-r30-melt-columns','b-r30-mound-planting','b-r30-east-historic-walkway','mound-old-work-flag','b-r30-rubbing-transfer'].some(n=>root.getObjectByName(n)))throw Error('B crater completion already attached or individually mounted');
 if(root.getObjectByName('za36-dressing-terrace:plate'))throw Error('Retire legacy terrace plates before B completion');
 if((mode==='host-candidate'?tracks.length!==3:tracks.length<2)||tracks.some(t=>t.length<2))throw Error('Missing real rail tracks for selected mode');
 if(tracks[0]!==rail.samples||tracks[1]!==rail.narrowSamples||(mode==='host-candidate'&&tracks[2]!==rail.sidingSamples))throw Error('Rail samples must be the actual host arrays');
 if(mode==='host-candidate'&&!hostRoutes?.length)throw Error('Missing actual host pedestrian routes');
 const undo:(()=>void)[]=[];
 const take=<T extends {dispose():void}>(leaf:T):T=>{undo.push(()=>leaf.dispose());return leaf;};
 const railBoxes=(rail.group.userData.colliders??[]) as Box[];
 try{
  const kit=take(attachBR30PhysicalKit(road,rail)),melt=take(installBR30MeltColumns(road)),mound=take(installBR30MoundPlanting(road)),flag=take(installBR30MoundWorkFlag(road));
  const historic=take(installBR30HistoricEastWall(road,tracks,railBoxes)),paper=take(installBR30RubbingPaper(road.inscription));
  const returnSurvey=surveyBR30ReturnHeadframe(road);
  let workshopApproaches:ReturnType<typeof surveyBR30WorkshopApproaches>|undefined,inscriptionApproach:ReturnType<typeof surveyBR30InscriptionApproach>|undefined;
  if(mode==='host-candidate'){
   const routes=hostRoutes!;
   const solids=[...road.group.userData.colliders,...railBoxes] as Box[];
   workshopApproaches=surveyBR30WorkshopApproaches(road,kit.machines.sites,routes,tracks,solids);
   const dock=routes.find(r=>r.id==='transfer-dock');if(!dock)throw Error('Missing real transfer dock');
   inscriptionApproach=surveyBR30InscriptionApproach(road,road.inscription.layout.useFoot,dock,tracks,solids);
  }
  live.add(root);
  let disposed=false;
  return {kit,melt,mound,flag,historic,paper,returnSurvey,workshopApproaches,inscriptionApproach,
   mode,productionReady:false as const,dispose(){
    if(disposed)return;disposed=true;live.delete(root);
    for(const release of undo.reverse())release();
   }};
 }catch(error){
  // No failed candidate may leave a partial set of boxes or old cones
  // hidden. The original channel identity is restored on failed mount.
  for(const release of undo.reverse())release();
  road.group.userData.colliders=old;throw error;
 }
}
