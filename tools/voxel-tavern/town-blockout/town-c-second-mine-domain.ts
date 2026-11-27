import {Group} from 'three';
import {createSecondMineScene,type SecondMineLiftAperturePort} from './underground-second-mine.js';
import {resolveSecondMineSurvey,type SurveyRegistration,type MinePoint} from '../../../src/shared/town-c-second-mine-survey.js';
import type {MineRiverState} from '../../../src/shared/underground-second-mine-layout.js';
import {secondMineProductionRegistration} from '../../../src/shared/underground-second-mine-presence-domain.js';
import {readUndergroundWaterPresentation,type AcceptedWaterReader} from '../../../src/shared/town-c-water-snapshot-port.js';
/** Host adapter; does not create registration, grant passage, or derive water
 * phase. Existing authority supplies the accepted phase; C2 supplies the
 * replacement visual adapter once its state core has been integrated. */
/** Production host entry; accepted water is required and no transition is granted here. */
export function mountRegisteredSecondMineDomain(options:{parent:Group;readAcceptedWater:AcceptedWaterReader;liftAperture?:SecondMineLiftAperturePort}){
 return mountSecondMineDomain({...options,registration:secondMineProductionRegistration});
}
export function mountSecondMineDomain(options:{
 parent:Group;registration?:SurveyRegistration;liftAperture?:SecondMineLiftAperturePort;
 /** Formal batch96 authority. If present, no fallback even if missing. */
 readAcceptedWater?:AcceptedWaterReader;
 /** Legacy fixture compatibility only. */
 readAcceptedRiverState?():MineRiverState|undefined;
}){
 const registered=resolveSecondMineSurvey(options.registration);
 if(registered.kind!=='ready')return registered;
 const read=()=>options.readAcceptedWater?readUndergroundWaterPresentation(options.readAcceptedWater)?.riverState:options.readAcceptedRiverState?.();
 const accepted=read();
 const valid=(value:unknown):value is MineRiverState=>value==='high'||value==='middle'||value==='low';
 if(!valid(accepted))return {kind:'unregistered-water'} as const;
 const scene=createSecondMineScene({liftAperture:options.liftAperture}),{frame,toLocal,toWorld}=registered;
 scene.setRiverState(accepted);
 scene.group.position.set(frame.east,frame.height,-frame.north);scene.group.rotation.y=frame.yaw;
 options.parent.add(scene.group);let disposed=false,available=true;
 function sync(){
   if(disposed)return false;
   const next=read();
   available=valid(next);
   scene.group.visible=available;
   if(available&&valid(next)&&next!==scene.riverState)scene.setRiverState(next);
   scene.syncLiftAperture();
   return available;
 }
 function passageAt(east:number,north:number,radius=.27,height=1.8){
   if(disposed||!available||![east,north,radius,height].every(Number.isFinite)||radius<=0||height<=0)return;
   const local=toLocal({east,north,height:frame.height});
   const q=scene.passageLocal(local.east,local.north,radius,height);
   if(!q||q.clearance+1e-9<height)return;
   return {floor:frame.height+q.floor,domainId:frame.domainId,clearance:q.clearance};
 }
 return {kind:'ready',group:scene.group,registered,sync,passageAt,
   acceptsMouth:(mouth:unknown)=>!disposed&&available&&scene.acceptsMouth(mouth),
   lowerAperturePrepared:()=>!disposed&&!!scene.liftPlate,
   syncLiftAperture:()=>!disposed&&scene.syncLiftAperture(),
   toWorld:(local:MinePoint)=>toWorld(local),getRiverState:()=>available?scene.riverState:undefined,
   dispose(){if(disposed)return;disposed=true;scene.dispose();}} as const;
}
