/** Public viewer input/receipt bridge for B's existing model controls.
 * No clock, inventory, atlas, reward, persisted flag or train authority.
 * A controller-approved transport must be injected; absence is explicit. */
export type CraterPose=Readonly<{east:number;north:number;height:number;heading:number;pitch:number;eyeHeight:number}>;
type OreKind='stardust'|'scrap'|'rubble';
type Triple<T>=readonly [T,T,T];
export type WorkshopFacts=Readonly<{dayIndex:number;bellows:Readonly<{pressure:number;heldMs:number;inBand:boolean;cast:boolean;stroke:number}>;calibration:Readonly<{angles:Triple<number>;locked:Triple<boolean>}>;sorting:Readonly<{bins:Readonly<Record<OreKind,number>>}>;scale:Readonly<{kg:number}>;track:Readonly<{thrown:boolean}>}>;
export type WorkshopIntent=Readonly<{kind:'pump-bellows'}|{kind:'turn-dial';index:0|1|2;direction:-1|1}|{kind:'sort-carried-lump';bin:OreKind}|{kind:'weigh-carried-lump'}|{kind:'pull-track-switch'}>;
export type MoundIntent=Readonly<{kind:'reach-overlook';site:'crater-mound-overlook'}|{kind:'straighten-flag';site:'mound-old-work-flag'}>;
export type RubbingFacts=Readonly<{progress:number;complete:boolean}>;
export type MoundFacts=Readonly<{flagStraight:boolean;overlookKnown:boolean}>;
export type CraterReceipt=Readonly<{accepted:boolean;reason?:string}>;
export type CraterAcceptedFrame=Readonly<{session:string;domain:'west';revision:string;receivedAt:number;pose:CraterPose;workshop?:WorkshopFacts;rubbing?:RubbingFacts;mound?:MoundFacts}>;
export type CraterPlayAuthority=Readonly<{
 // Only a confirmed server frame, never an outgoing sample/preview.
 read():CraterAcceptedFrame|undefined;
 request(frame:CraterAcceptedFrame,intent:WorkshopIntent|MoundIntent):Promise<CraterReceipt>;
 // Server owns hold expiry and rechecks pose/aim/session each tick.
 setHeld(frame:CraterAcceptedFrame,markerId:string,held:boolean):void;
}>;
type Hit={station:'bellows'|'calibration'|'sorting'|'weighing'|'turnout';index?:0|1|2};
type Target={key:string;label:string;mode:'tap'|'hold';reverse?:boolean;available:boolean;session?:string;authority?:CraterPlayAuthority};
type WorkshopControl={action(direction?:-1|1):WorkshopIntent|undefined;refresh():void;interact(direction?:-1|1):Promise<CraterReceipt>};
type MoundControl={action(kind:MoundIntent['kind']):MoundIntent|undefined;refresh():void;interact(kind:MoundIntent['kind']):Promise<CraterReceipt>};
type RubbingControl={frame(held:boolean):{aim:boolean;held:boolean;shown:number};release():void};
type FactHost<F,I>={pose():CraterPose|undefined;facts():F|undefined;request(intent:I):Promise<CraterReceipt>};
export type CraterPlayLeaves={
 aimWorkshop(p:CraterPose):Hit|null|undefined;aimPaper(p:CraterPose):boolean;aimFlag(p:CraterPose):boolean;atSummit(p:CraterPose):boolean;
 workshop(host:FactHost<WorkshopFacts,WorkshopIntent>):WorkshopControl;
 mound(host:FactHost<MoundFacts,MoundIntent>):MoundControl;
 rubbing(host:{pose():CraterPose|undefined;facts():RubbingFacts|undefined;setHeld(marker:string,held:boolean):void}):RubbingControl;
};
export type CraterPlayContext={localPose():CraterPose|undefined;authority():CraterPlayAuthority|undefined;now():number;notify(message:string):void};
const finitePose=(p:CraterPose)=>!!p&&[p.east,p.north,p.height,p.heading,p.pitch,p.eyeHeight].every(Number.isFinite)&&p.eyeHeight>=.5&&p.eyeHeight<=2.2;
const close=(a:CraterPose,b:CraterPose)=>Math.hypot(a.east-b.east,a.north-b.north)<=.30&&Math.abs(a.height-b.height)<=.25&&Math.abs(Math.atan2(Math.sin(a.heading-b.heading),Math.cos(a.heading-b.heading)))<=.16&&Math.abs(a.pitch-b.pitch)<=.12;
const keyFor=(h:Hit)=>h.station+':'+(h.index??'-');
const stationLabels={bellows:'压动风箱',calibration:'转动校准盘',sorting:'投放手持矿料',weighing:'称量手持矿料',turnout:'扳动道岔'};
const denied=(reason='unavailable'):CraterReceipt=>({accepted:false,reason});
export function createAR30CraterPlay(leaves:CraterPlayLeaves,ctx:CraterPlayContext){
 let lastHeld:{authority:CraterPlayAuthority;frame:CraterAcceptedFrame;marker:string}|undefined;
 let active=false,disposed=false,session:string|undefined,activeAuthority:CraterPlayAuthority|undefined,autoSummit=false,requestPending=false;
 let nextSummitAttempt=0,scopeEpoch=0;
 let rendered:string|null=null;
 function local(){const p=ctx.localPose();return p&&finitePose(p)?p:undefined;}
 function frame(){
  if(disposed)return;
  const a=ctx.authority(),p=local(),now=ctx.now();
  let f:CraterAcceptedFrame|undefined;try{f=a?.read();}catch{return;}
  if(!a||!f||!p||f.domain!=='west'||typeof f.session!=='string'||!f.session.trim()||typeof f.revision!=='string'||!f.revision.trim()||!Number.isFinite(now)||!Number.isFinite(f.receivedAt)||f.receivedAt>now||now-f.receivedAt>1000||!finitePose(f.pose)||!close(f.pose,p))return;
  return {authority:a,frame:f};
 }
 function pose(){return frame()?.frame.pose;}
 function facts<K extends 'workshop'|'mound'|'rubbing'>(key:K){return frame()?.frame[key];}
 const request=async(intent:WorkshopIntent|MoundIntent)=>{
  const f=frame();if(!f||requestPending)return denied();
  // All seven interactions share one in-flight request slot; the host
  // must independently recheck the accepted pose, target and receipt.
  requestPending=true;
  try{
   const result=await f.authority.request(f.frame,intent);
   if(disposed||ctx.authority()!==f.authority||frame()?.frame.session!==f.frame.session)return denied('receipt-unavailable');
   return result&&typeof result.accepted==='boolean'?result:denied('receipt-unavailable');
  }catch{return denied('receipt-unavailable');}finally{requestPending=false;}
 };
 function release(){
  const old=lastHeld;lastHeld=undefined;
  if(old)try{old.authority.setHeld(old.frame,old.marker,false);}catch{/* server expiry owns the fail-safe */}
 }
 const workshop=leaves.workshop({pose,facts:()=>facts('workshop'),request});
 const mound=leaves.mound({pose,facts:()=>facts('mound'),request});
 const rubbing=leaves.rubbing({pose,facts:()=>facts('rubbing'),setHeld(marker,held){
  if(!held){release();return;}
  const f=frame();if(!f||lastHeld)return;
  lastHeld={...f,marker};try{f.authority.setHeld(f.frame,marker,true);}catch{release();}
 }});
 function target():Target|undefined{
  if(disposed)return;
  const p=local();if(!p)return;
  const f=frame(),q=requestPending?undefined:f?.frame.pose,s=f?.frame.session;
  if(leaves.aimPaper(p))return {key:'paper',label:'长按拓印',mode:'hold',session:s,authority:f?.authority,available:!!(q&&f?.frame.rubbing&&!f.frame.rubbing.complete&&Number.isFinite(f.frame.rubbing.progress)&&f.frame.rubbing.progress>=0&&f.frame.rubbing.progress<=1&&leaves.aimPaper(q))};
  if(leaves.aimFlag(p))return {key:'flag',label:'扶正旧工旗',mode:'tap',session:s,authority:f?.authority,available:!!(q&&mound.action('straighten-flag'))};
  const h=leaves.aimWorkshop(p);if(!h)return;
  const h2=q&&leaves.aimWorkshop(q);
  return {key:keyFor(h),label:stationLabels[h.station]+(h.station==='calibration'?' · Q反转':''),mode:'tap',session:s,authority:f?.authority,reverse:h.station==='calibration',available:!!(h2&&keyFor(h)===keyFor(h2)&&workshop.action())};
 }
 async function tap(key:string,direction:-1|1=1){
  const t=target();
  if(!t||t.key!==key||!t.available||t.mode!=='tap'||(direction===-1&&!t.reverse))return denied();
  let result:CraterReceipt;
  try{result=key==='flag'?await mound.interact('straighten-flag'):await workshop.interact(direction);}catch{result=denied('receipt-unavailable');}
  if(!disposed&&!result.accepted)ctx.notify(result.reason==='receipt-unavailable'?'未收到受理回执':'本次操作未受理');
  return result;
 }
 function beginHold(key:string){
  const t=target();
  if(!t||t.key!==key||t.mode!=='hold'||!t.available)return false;
  const f=frame();if(!f)return false;
  session=f.frame.session;activeAuthority=f.authority;active=true;rubbing.frame(true);
  if(!lastHeld){cancelHold();return false;}
  return true;
 }
 function cancelHold(){active=false;rubbing.release();release();}
 function update(){
  if(disposed)return;
  const f=frame();
  if(session!==f?.frame.session||activeAuthority!==f?.authority){cancelHold();session=f?.frame.session;activeAuthority=f?.authority;autoSummit=false;nextSummitAttempt=0;scopeEpoch++;}
  const p=local(),q=f?.frame.pose;
  if(active&&(!q||!p||!leaves.aimPaper(p)||!leaves.aimPaper(q)||!f?.frame.rubbing||f.frame.rubbing.complete))cancelHold();
  rubbing.frame(active);
  // Do not repaint every industrial sign or rebuild its world matrix
  // on every animation frame. The accepted revision/expiry is the only
  // display change; no local interpolation mutates committed mechanisms.
  const key=f?JSON.stringify([f.frame.session,f.frame.revision,f.frame.receivedAt]):'';
  if(rendered!==key){workshop.refresh();mound.refresh();rendered=key;}
  const summit=!!(q&&p&&leaves.atSummit(p)&&leaves.atSummit(q));
  if(!summit){if(autoSummit){scopeEpoch++;}autoSummit=false;nextSummitAttempt=0;}
  else if(!requestPending&&!autoSummit&&ctx.now()>=nextSummitAttempt&&f?.frame.mound?.overlookKnown===false&&mound.action('reach-overlook')){
   autoSummit=true;const epoch=scopeEpoch;
   const retry=()=>{if(!disposed&&epoch===scopeEpoch){autoSummit=false;nextSummitAttempt=ctx.now()+2000;ctx.notify('未收到受理回执');}};
   void mound.interact('reach-overlook').then(result=>{if(!result.accepted&&result.reason==='receipt-unavailable')retry();},retry);
  }
 }
 function dispose(){cancelHold();disposed=true;}
 return {target,tap,beginHold,cancelHold,update,dispose};
}
export type CraterPlay=ReturnType<typeof createAR30CraterPlay>;
/** A captured press belongs to one target for its lifetime. No retarget
 * on release, snow gathering fallback, key repeat, or touch ghost click. */
export function createAR30PlayInput(play:()=>CraterPlay|undefined){
 let captured:{source:string;key:string;mode:Target['mode'];direction:-1|1;live:boolean;session?:string;authority?:CraterPlayAuthority;owner:CraterPlay}|undefined;
 function down(source:string,direction:-1|1=1){
  if(captured)return true;
  const p=play(),t=p?.target();
  if(!p||!t||(direction===-1&&!t.reverse))return false;
  captured={source,key:t.key,mode:t.mode,direction,live:t.available,session:t.session,authority:t.authority,owner:p};
  if(t.mode==='hold'&&t.available)captured.live=p.beginHold(t.key);
  return true;
 }
 function up(source:string){
  const c=captured;if(!c||c.source!==source)return false;
  captured=undefined;const p=play();
  if(c.mode==='hold')c.owner.cancelHold();
  else if(c.live&&p===c.owner){const t=p.target();if(t?.session===c.session&&t?.authority===c.authority&&t?.key===c.key)void p.tap(c.key,c.direction);}
  return true;
 }
 function cancel(){if(captured){captured.live=false;captured.owner.cancelHold();}}
 function clear(){cancel();captured=undefined;}
 function update(){
  const p=play();
  // Idle input has no captured target to invalidate. The display and
  // actual press each read a fresh target separately.
  if(captured?.live){const t=p?.target();if(p!==captured.owner||!t||t.key!==captured.key||t.session!==captured.session||t.authority!==captured.authority||!t.available){captured.live=false;captured.owner.cancelHold();}}
  p?.update();
 }
 return {down,up,cancel,clear,update,cancelSource(source:string){if(captured?.source===source)clear();},target:()=>play()?.target(),click(){
  const t=play()?.target();if(!t)return false;
  if(!captured&&t.mode==='tap'&&t.available)void play()?.tap(t.key);
  return true;
 }};
}
