import type {Za36CableRepairEvent,Za36CableRepairLine,Za36CableRepairState} from './town-za36-cable-repair';
type Line=Za36CableRepairLine;
type Input={state:(line:Line)=>Za36CableRepairState|undefined;send:(line:Line,event:Za36CableRepairEvent)=>boolean;now?:()=>number};
/** Input timing only: the cable height is ALWAYS the broadcast reducer state.
 * One quarter-second of active E hold earns .125 lift; one outstanding
 * request at a time. Release before alignment halves authoritative lift. */
export function createNightBPryHold(input:Input){
 const now=input.now??(()=>performance.now());
 let active:Line|undefined,last=0,credit=0,release=false;
 let pending:{height:number;at:number}|undefined;
 function clear(){active=undefined;credit=0;release=false;pending=undefined;}
 function begin(line:Line){
  const s=input.state(line);
  if(active!==undefined||s?.stage!=='one-station'||s.cableAligned)return false;
  active=line;last=now();credit=0;release=false;return true;
 }
 function update(held:boolean,eligible:Line|undefined){
  if(active===undefined)return;
  const line=active,s=input.state(line),t=now();
  if(!s||s.stage!=='one-station'||s.cableAligned||eligible!==line){clear();return;}
  if(!held)release=true;
  const dt=Math.max(0,Math.min(100,t-last));last=t;
  if(!release)credit=Math.min(250,credit+dt);
  if(pending){
   if(s.cableHeight!==pending.height)pending=undefined;
   else if(t-pending.at>=2000){clear();return;}
   else return;
  }
  if(release){
   if(s.cableHeight>0)input.send(line,{kind:'release-cable'});
   clear();return;
  }
  if(credit<250)return;
  credit=0;
  if(input.send(line,{kind:'pry-cable',effort:Math.min(.125,1-s.cableHeight)}))pending={height:s.cableHeight,at:t};
  else clear();
 }
 return {begin,update,active:()=>active!==undefined,cancel:clear};
}
