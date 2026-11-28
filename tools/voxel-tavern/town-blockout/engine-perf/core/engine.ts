import {ChunkRegistry} from './registry';
import {planChunk} from './planner';
import type {ChunkDescriptor,FrameInput} from './contracts';
import {initialPerfPolicy,type PerfPolicy,type PerfTier} from '../residency';
/** First usable orchestration boundary. Plans desired residency only.
 * The production executor (worker/cache/upload/ready swap) belongs to F2
 * of the performance work order, not this initializer. No draw or physics. */
export class PerformancePlanner{
 private registry=new ChunkRegistry();
 private previous=new Map<string,PerfTier>();
 constructor(private policy:PerfPolicy=initialPerfPolicy){}
 register(chunk:ChunkDescriptor){this.registry.register(chunk);}
 remove(owner:string,id:string){this.previous.delete(JSON.stringify([owner,id]));return this.registry.remove(owner,id);}
 plan(input:FrameInput){
  return this.registry.list().map(chunk=>{
   const key=JSON.stringify([chunk.owner,chunk.id]);
   const plan=planChunk(chunk,input,this.previous.get(key),this.policy);
   this.previous.set(key,plan.tier);return {chunk,...plan};
  });
 }
 clear(){this.registry=new ChunkRegistry();this.previous.clear();}
}
