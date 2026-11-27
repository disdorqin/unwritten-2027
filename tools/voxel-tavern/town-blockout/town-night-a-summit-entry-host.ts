import type {mountMainSummitAssembly} from './main-summit-assembly';
import {mountSouthEntry} from './town-night-a-summit-entry';
type Assembly=ReturnType<typeof mountMainSummitAssembly>;
/** Actual ZA22 assembly lifecycle adapter. No forced mount or transfer,
 * and no independent terrain. D2 may supersede this narrow entry mount
 * with its full sector assembly; never draw the entrance twice. */
export function createSouthEntryHost(){
 let current:Assembly|undefined,entry:ReturnType<typeof mountSouthEntry>|undefined,nightApplied:boolean|undefined;
 const detach=()=>{entry?.dispose();entry=undefined;current=undefined;nightApplied=undefined;};
 function sync(assembly:Assembly|undefined,night:boolean){
  if(current!==assembly){detach();current=assembly;}
  if(!assembly?.r30||!assembly.group.parent)return;
  const already=assembly.group.getObjectByName('night-a-south-sector');
  if(already){entry?.dispose();entry=undefined;return;}
  if(!entry){
   // Fixed existing gate and plaza were certified by the canonical
   // surface; fail closed for any future incompatible datum.
   const ground=assembly.r30.collision.surfaceAt;
   for(const [e,n] of [[0,0],[0,13],[-24,19.4],[24,37],[11.4,9.8],[0,38]]){
    const h=ground(e!,n!);if(h===undefined||Math.abs(h-347)>.05)return;
   }
   entry=mountSouthEntry(ground);assembly.group.add(entry.group);nightApplied=undefined;
  }
  if(nightApplied!==night){entry.setNight(night);nightApplied=night;}
 }
 return {sync,mounted:()=>!!entry?.group.parent,
  blocked(e:number,n:number,h:number,r=.27,body=1.8){
   if(!entry||!current)return false;
   return entry.blocked(e-current.group.position.x,n+current.group.position.z,h-current.group.position.y,r,body);
  },dispose:detach};
}
