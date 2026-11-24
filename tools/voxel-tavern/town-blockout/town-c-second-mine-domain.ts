import {Group} from 'three';
import {createSecondMineScene} from './underground-second-mine.js';
import {resolveSecondMineSurvey,type SurveyRegistration,type MinePoint} from '../../../src/shared/town-c-second-mine-survey.js';
import type {MineRiverState} from '../../../src/shared/underground-second-mine-layout.js';
import {readUndergroundWaterPresentation,type AcceptedWaterReader} from '../../../src/shared/town-c-water-snapshot-port.js';
/** Host adapter; does not create registration, grant passage, or derive water
 * phase. Existing authority supplies the accepted phase; C2 supplies the
 * replacement visual adapter once its state core has been integrated. */
export function mountSecondMineDomain(options:{
 parent:Group;registration?:SurveyRegistration;
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
 const scene=createSecondMineScene(),{frame,toLocal,toWorld}=registered;
 scene.setRiverState(accepted);
 scene.group.position.set(frame.east,frame.height,-frame.north);scene.group.rotation.y=frame.yaw;
 options.parent.add(scene.group);let disposed=false,available=true;
 function sync(){
   if(disposed)return false;
   const next=read();
   available=valid(next);
   scene.group.visible=available;
   if(available&&valid(next)&&next!==scene.riverState)scene.setRiverState(next);
   return available;
 }
 function passageAt(east:number,north:number,radius=.27){
   if(disposed||!available||![east,north,radius].every(Number.isFinite)||radius<=0)return;
   const local=toLocal({east,north,height:frame.height});
   if(!scene.canStand(local.east,local.north,radius))return;
   const height=scene.floor(local.east,local.north);
   if(height===undefined)return;
   return {floor:frame.height+height,domainId:frame.domainId};
 }
 return {kind:'ready',group:scene.group,registered,sync,passageAt,
   toWorld:(local:MinePoint)=>toWorld(local),getRiverState:()=>available?scene.riverState:undefined,
   dispose(){if(disposed)return;disposed=true;scene.dispose();}} as const;
}
