import type {VisualTask} from '../core/contracts';
export class VisualScheduler{
 private tasks=new Map<string,{task:VisualTask;last:number}>();
 register(task:VisualTask,now:number){if(this.tasks.has(task.id)||!Number.isFinite(task.intervalMs)||task.intervalMs<=0||!Number.isFinite(now))throw Error('invalid visual task');this.tasks.set(task.id,{task,last:now});}
 remove(id:string){return this.tasks.delete(id);}
 tick(now:number){let count=0;for(const entry of this.tasks.values()){const dt=now-entry.last;if(dt>=entry.task.intervalMs){entry.last=now;entry.task.run(dt);count++;}}return count;}
}
