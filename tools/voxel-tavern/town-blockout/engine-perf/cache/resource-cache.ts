import type {Resource} from '../core/contracts';
/** Explicit lease; a pinned visible resource cannot be evicted. Ownership
 * transfers only on a successful put; caller disposes rejected resources. */
export class ResourceCache<T>{
 private items=new Map<string,{resource:Resource<T>;pins:number;stamp:number}>();
 private stamp=0;private total=0;
 constructor(readonly budgetBytes:number){if(!Number.isSafeInteger(budgetBytes)||budgetBytes<0)throw RangeError('budget');}
 get bytes(){return this.total;}
 put(key:string,resource:Resource<T>):boolean{
  if(this.items.has(key)||!Number.isSafeInteger(resource.bytes)||resource.bytes<0||resource.bytes>this.budgetBytes)return false;
  const candidates=[...this.items].filter(([,x])=>x.pins===0).sort((a,b)=>a[1].stamp-b[1].stamp);
  if(this.total+resource.bytes-candidates.reduce((s,[,x])=>s+x.resource.bytes,0)>this.budgetBytes)return false;
  for(const [k] of candidates){if(this.total+resource.bytes<=this.budgetBytes)break;this.remove(k);}
  this.items.set(key,{resource,pins:0,stamp:++this.stamp});this.total+=resource.bytes;return true;
 }
 acquire(key:string){const item=this.items.get(key);if(!item)return undefined;item.pins++;item.stamp=++this.stamp;let released=false;
  return {value:item.resource.value,release:()=>{if(!released){released=true;item.pins--;}}};
 }
 remove(key:string){const item=this.items.get(key);if(!item||item.pins)return false;this.items.delete(key);this.total-=item.resource.bytes;item.resource.dispose();return true;}
 clear(){for(const key of this.items.keys())this.remove(key);}
}
