import type {Clock,FrameBudget} from '../core/contracts';
export type BudgetJob=Readonly<{id:string;priority:number;bytes:number;estimatedMs:number;run:()=>void;cancel?:()=>void}>;
/** Cooperative synchronous slices only. A running JS function cannot be
 * preempted; actual overshoot is reported, never hidden. */
export class BudgetQueue{
 private jobs=new Map<string,BudgetJob>();
 constructor(private clock:Clock){}
 enqueue(job:BudgetJob){if(!job.id||![job.priority,job.bytes,job.estimatedMs].every(Number.isFinite)||job.bytes<0||job.estimatedMs<0)throw RangeError('invalid job');if(this.jobs.has(job.id))return false;this.jobs.set(job.id,job);return true;}
 cancel(id:string){const job=this.jobs.get(id);if(!job)return false;this.jobs.delete(id);job.cancel?.();return true;}
 drain(budget:FrameBudget){
  if(!Number.isFinite(budget.ms)||!Number.isFinite(budget.bytes)||budget.ms<0||budget.bytes<0)throw RangeError('invalid budget');
  const start=this.clock.now();let bytes=0,completed=0;
  const failures:string[]=[];
  for(const job of [...this.jobs.values()].sort((a,b)=>b.priority-a.priority)){
   if(this.clock.now()-start>=budget.ms)break;
   if(bytes+job.bytes>budget.bytes||this.clock.now()-start+job.estimatedMs>budget.ms)continue;
   this.jobs.delete(job.id);bytes+=job.bytes;
   try{job.run();completed++;}catch{failures.push(job.id);}
  }
  const elapsedMs=this.clock.now()-start;
  return {completed,bytes,elapsedMs,overshootMs:Math.max(0,elapsedMs-budget.ms),pending:this.jobs.size,failures};
 }
}
