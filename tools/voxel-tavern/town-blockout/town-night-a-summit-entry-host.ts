import type {Object3D} from 'three';
import type {mountMainSummitAssembly} from './main-summit-assembly';
import {mountSouthEntry} from './town-night-a-summit-entry';
import type {SouthSnowVisualSample} from './town-night-a-summit-snow-appearance';
type Assembly=ReturnType<typeof mountMainSummitAssembly>;
/** Actual ZA22 assembly lifecycle adapter. No forced mount or transfer,
 * and no independent terrain. D2 may supersede this narrow entry mount
 * with its full sector assembly; never draw the entrance twice. */
export function createSouthEntryHost(){
 let current:Assembly|undefined,entry:ReturnType<typeof mountSouthEntry>|undefined,nightApplied:boolean|undefined;
 let fullEntry:Object3D|undefined,fullSector:Object3D|undefined,snowPending=0;
 const detach=()=>{entry?.dispose();entry=undefined;current=undefined;nightApplied=undefined;fullEntry=undefined;fullSector=undefined;snowPending=0;};
 function sync(assembly:Assembly|undefined,night:boolean){
  if(current!==assembly){detach();current=assembly;}
  if(!assembly?.r30||!assembly.group.parent){detach();return;}
  const already=assembly.group.getObjectByName('night-a-south-sector');
  if(already){if(fullSector!==already)snowPending=0;entry?.dispose();entry=undefined;nightApplied=undefined;fullSector=already;fullEntry=already.getObjectByName('night-a-south-entry');return;}
  fullEntry=undefined;fullSector=undefined;
  // A host can be temporarily detached/reused or have its child removed
  // during domain cleanup. Rebuild only the missing leaf, never a duplicate.
  if(entry&&entry.group.parent!==assembly.group){entry.dispose();entry=undefined;nightApplied=undefined;}
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
 const mounted=()=>!!(current?.group.parent&&entry&&entry.group.parent===current.group);
 return {sync,mounted,
  updateSnow(dt:number,sample:SouthSnowVisualSample){
   if(!current?.group.parent||!Number.isFinite(dt)||dt<=0)return;
   snowPending+=Math.min(dt,.25);if(snowPending<1)return;
   const seconds=snowPending;snowPending=0;
   const p=current.group.position;
   const local:SouthSnowVisualSample=(e,n,h)=>sample(e+p.x,n-p.z,h+p.y);
   if(mounted()){entry!.updateSnow(seconds,local);return;}
   let owner=fullSector?.parent,live=false;
   while(owner){if(owner===current.group){live=true;break;}owner=owner.parent;}
   if(live&&typeof fullSector?.userData.updateSouthSnow==='function')fullSector.userData.updateSouthSnow(seconds,local);
  },
  sheltered(e:number,n:number,h:number){
   if(!current?.group.parent)return false;
   const p=current.group.position;
   const local=[e-p.x,n+p.z,h-p.y] as const;
   if(mounted())return entry!.sheltered(...local);
   let owner=fullEntry?.parent,live=false;
   while(owner){if(owner===current.group){live=true;break;}owner=owner.parent;}
   return live&&typeof fullEntry?.userData.shelteredAt==='function'&&!!fullEntry.userData.shelteredAt(...local);
  },
  blocked(e:number,n:number,h:number,r=.27,body=1.8){
   if(!entry||!current||!mounted())return false;
   return entry.blocked(e-current.group.position.x,n+current.group.position.z,h-current.group.position.y,r,body);
  },dispose:detach};
}
