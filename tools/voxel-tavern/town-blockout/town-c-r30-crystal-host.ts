import {Group} from 'three';
import {mountR30CrystalVestibule} from './town-c-r30-crystal-vestibule.js';
import {mountR30CrystalGrove} from './town-c-r30-crystal-grove.js';
import {mountUndergroundCrystalCavern,crystalCavernPlan,crystalCavernToWorld,type CrystalCavernFrame,type CrystalCavernPoint} from './underground-crystal-cavern.js';
import {createUndergroundCrystalReturnSwitch} from './underground-crystal-gate.js';
import {crystalRoutePassage,crystalLocal,crystalThreshold,mountR30CrystalSupport,r30CrystalReturnSwitch,r30CrystalDomain} from './town-c-r30-crystal-support.js';
import type {UndergroundMineGateStage} from '../../../src/presence/underground-mine-gate.js';
type Foot=CrystalCavernPoint&Readonly<{domainId:string}>;
export type CrystalRoom=Readonly<{origin:CrystalCavernPoint;bounds:Readonly<{width:number;depth:number;height:number}>}>;
export type R30CrystalGateAction='open-mine'|'open-crystal'|'traverse';
export type R30CrystalBridge=Readonly<{
 /** The real domain/Presence owner must accept the room and placement. */
 acceptsFrame(frame:CrystalCavernFrame,room:CrystalRoom):boolean;
 readGateStage():UndergroundMineGateStage|undefined;
 readLightBudget?:()=>number;
 /** A's existing authenticated input dispatcher; receipt is still
  * consumed exclusively through readGateStage and accepted feet. */
 interaction?:Readonly<{
  readPlayerId():string|undefined;
  isAimingAt(point:CrystalCavernPoint):boolean;
  dispatch(playerId:string,action:R30CrystalGateAction):void;
 }>;
}>;
function roomOf(frame:CrystalCavernFrame):CrystalRoom{
 const corners=[-100,100].flatMap(e=>[-12,113].map(n=>crystalCavernToWorld(frame,[e,0,n])));
 const origin={east:Math.floor(Math.min(...corners.map(p=>p.east)))-2,north:Math.floor(Math.min(...corners.map(p=>p.north)))-2,height:frame.height-5};
 return {origin,bounds:{width:Math.ceil(Math.max(...corners.map(p=>p.east)))-origin.east+2,depth:Math.ceil(Math.max(...corners.map(p=>p.north)))-origin.north+2,height:40}};
}
export function createR30CrystalHost(options:Readonly<{
 parent:Group;frame?:CrystalCavernFrame;mineThreshold:CrystalCavernPoint;mineWinch:CrystalCavernPoint;
 supportsMineThreshold:()=>boolean;installMouth:()=>boolean;
 bridge?:R30CrystalBridge;readAcceptedFoot?:()=>Foot|undefined;
 supportsMineInteractionFoot?:(p:CrystalCavernPoint)=>boolean;
}>){
 const frame=options.frame,room=frame&&roomOf(frame);
 const mine={domainId:'underground/mine',...options.mineThreshold,yaw:frame?frame.yaw-Math.PI:0};
 const crystal=frame&&{domainId:r30CrystalDomain,...crystalThreshold(frame),yaw:frame.yaw};
 const ret=frame&&{domainId:r30CrystalDomain,...crystalCavernToWorld(frame,[r30CrystalReturnSwitch.east,r30CrystalReturnSwitch.height,r30CrystalReturnSwitch.north])};
 let stage:UndergroundMineGateStage='closed',disposed=false,active=false,certified=false;
 let cavern:Extract<ReturnType<typeof mountUndergroundCrystalCavern>,{kind:'ready'}>|undefined;
 let support:ReturnType<typeof mountR30CrystalSupport>|undefined,handle:ReturnType<typeof createUndergroundCrystalReturnSwitch>|undefined;
 let vestibule:ReturnType<typeof mountR30CrystalVestibule>|undefined,grove:ReturnType<typeof mountR30CrystalGrove>|undefined;
 let budget=0,lightFocus:CrystalCavernPoint|undefined;
 function supportsWorld(p:CrystalCavernPoint){
  if(!frame)return false;
  const l=crystalLocal(frame,p),q=crystalRoutePassage(l.east,l.north);
  return !!q&&Math.abs(q.floor-l.height)<.02&&!vestibule?.blocks(l.east,l.north,q.floor,.27,1.8)&&!grove?.blocks(l.east,l.north,q.floor,.27,1.8);
 }
 function clear(){stage='closed';budget=0;lightFocus=undefined;active=false;certified=false;if(cavern){cavern.group.visible=false;cavern.sync()}handle?.update('closed')}
 function sync(){
  if(disposed)return false;
  if(!frame||!room||!crystal||!options.bridge||!options.bridge.acceptsFrame(frame,room)||!options.supportsMineThreshold()||!supportsWorld(crystal)){clear();return false}
  if(!cavern){
   const result=mountUndergroundCrystalCavern({parent:options.parent,frame,acceptsCavern:f=>f===frame,
    supportsFoot:supportsWorld,acceptsCollider:b=>[...b.min,...b.max].every(Number.isFinite),
    readLightBudget:()=>budget,readLocalLightFocus:()=>lightFocus,r30Art:true});
   if(result.kind!=='ready'){clear();return false}
   support=mountR30CrystalSupport(result.group);
   vestibule=mountR30CrystalVestibule(result.group);
   grove=mountR30CrystalGrove(result.group,vestibule.blocks);
   handle=createUndergroundCrystalReturnSwitch({position:[r30CrystalReturnSwitch.east,r30CrystalReturnSwitch.height,-r30CrystalReturnSwitch.north],yaw:0});
   result.group.add(handle.group);
   if(!supportsWorld(crystal)||!options.installMouth()){handle.dispose();grove.dispose();vestibule.dispose();support.dispose();result.dispose();handle=undefined;grove=undefined;vestibule=undefined;support=undefined;clear();return false}
   cavern=result;
  }
  certified=true;
  const value=options.bridge.readGateStage();
  stage=value==='open'||value==='ajar'?value:'closed';
  const foot=options.readAcceptedFoot?.(),l=foot&&crystalLocal(frame,foot);
  active=!!foot&&foot.domainId===r30CrystalDomain&&!!l&&[l.east,l.north,l.height].every(Number.isFinite)&&
    Math.abs(l.east)<=100&&l.north>=-12&&l.north<=113&&l.height>=-5&&l.height<=35;
  lightFocus=active?l:undefined;
  const residual=active?options.bridge.readLightBudget?.()??0:0;
  budget=Number.isFinite(residual)?Math.min(4,Math.max(0,Math.floor(residual))):0;
  cavern.group.visible=active||stage==='open';
  cavern.sync();handle?.update(stage);
  return true;
 }
 const contract=frame&&room&&crystal&&ret?{
  frame,room,mine,crystal,winch:{domainId:mine.domainId,...options.mineWinch,horizontalReach:.7,verticalReach:.3},
  returnSwitch:{...ret,horizontalReach:.9,verticalReach:.3},
  isAtThreshold(side:'mine'|'crystal',foot:Foot){
   const p=side==='mine'?mine:crystal;
   return foot.domainId===p.domainId&&Math.hypot(foot.east-p.east,foot.north-p.north)<=.48&&Math.abs(foot.height-p.height)<=.22;
  },
  supportsLanding(side:'mine'|'crystal',foot:Foot){
   const p=side==='mine'?mine:crystal;
   return certified&&!!cavern&&foot.domainId===p.domainId&&Math.hypot(foot.east-p.east,foot.north-p.north,foot.height-p.height)<.01&&
    (side==='mine'?options.supportsMineThreshold():supportsWorld(foot));
  },
 }:undefined;
 function prompt(){
  const port=options.bridge?.interaction,f=options.readAcceptedFoot?.(),id=port?.readPlayerId();
  if(disposed||!certified||!contract||!port||!id?.trim()||!f||![f.east,f.north,f.height].every(Number.isFinite))return;
  if(!options.bridge?.acceptsFrame(contract.frame,contract.room))return;
  const side=f.domainId===mine.domainId?'mine':f.domainId===r30CrystalDomain?'crystal':undefined;
  if(!side||!(side==='mine'?options.supportsMineInteractionFoot?.(f):supportsWorld(f)))return;
  if(stage==='open'&&contract.isAtThreshold(side,f))return {id:'crystal-gate/traverse',action:'traverse' as const,label:side==='mine'?'进入晶洞':'返回矿道',playerId:id};
  if(stage!=='closed')return;
  const p=side==='mine'?contract.winch:contract.returnSwitch;
  if(Math.hypot(p.east-f.east,p.north-f.north)>p.horizontalReach||Math.abs(p.height-f.height)>p.verticalReach||
    !port.isAimingAt({east:p.east,north:p.north,height:p.height+1.08}))return;
  const action=side==='mine'?'open-mine' as const:'open-crystal' as const;
  return {id:'crystal-gate/'+action,action,label:'尝试开启晶门',playerId:id};
 }
 function press(expectedId:string){
  const p=prompt();
  if(!p||p.id!==expectedId)return false;
  options.bridge!.interaction!.dispatch(p.playerId,p.action);return true;
 }
 return {sync,stage:()=>stage,contract,prompt,press,get mounted(){return cavern},get vestibule(){return vestibule},get grove(){return grove},
  passageAt(domainId:string,east:number,north:number,posture:'standing'|'crouching'='standing'){
   if(disposed||!active||!frame||domainId!==r30CrystalDomain||options.readAcceptedFoot?.()?.domainId!==domainId)return;
   const l=crystalLocal(frame,{east,north,height:frame.height});
   const q=crystalRoutePassage(l.east,l.north,.27,posture==='crouching'?1.1:1.8);
   if(q&&!vestibule?.blocks(l.east,l.north,q.floor,.27,posture==='crouching'?1.1:1.8)&&!grove?.blocks(l.east,l.north,q.floor,.27,posture==='crouching'?1.1:1.8))return {...q,floor:q.floor+frame.height};
  },
  dispose(){if(disposed)return;disposed=true;clear();handle?.dispose();grove?.dispose();vestibule?.dispose();support?.dispose();cavern?.dispose();cavern=undefined},
 } as const;
}
