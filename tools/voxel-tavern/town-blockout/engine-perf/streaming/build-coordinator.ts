import {meshKey,type MeshKey,type MeshBuilder,type Resource} from '../core/contracts';
/** Deduplicate in-flight work; stale outputs never reach the renderer.
 * Adapter owns actual Worker pool, transferables, backpressure and retries. */
export class BuildCoordinator<T>{
 private pending=new Map<string,{controller:AbortController;promise:Promise<Resource<T>|undefined>}>();
 constructor(private builder:MeshBuilder<T>){}
 request(key:MeshKey,priority:number):Promise<Resource<T>|undefined>{
  const id=meshKey(key);const old=this.pending.get(id);if(old)return old.promise;
  const controller=new AbortController();
  const promise=Promise.resolve().then(()=>this.builder.build({key,priority,signal:controller.signal})).then(result=>{
   if(controller.signal.aborted){result.dispose();return undefined;}return result;
  }).catch(error=>{if(controller.signal.aborted)return undefined;throw error;}).finally(()=>{if(this.pending.get(id)?.controller===controller)this.pending.delete(id);});
  this.pending.set(id,{controller,promise});return promise;
 }
 cancel(key:MeshKey){const id=meshKey(key);const item=this.pending.get(id);if(!item)return;this.pending.delete(id);item.controller.abort();}
 dispose(){for(const item of this.pending.values())item.controller.abort();this.pending.clear();}
}
