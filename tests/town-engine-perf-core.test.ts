import test from 'node:test';
import assert from 'node:assert/strict';
import {ChunkRegistry,ResourceCache,BudgetQueue,BuildCoordinator,meshKey,shouldDraw,batchKey,VisualScheduler,summarizeFrames,planResidency,type MeshKey,type FrameCounters} from '../tools/voxel-tavern/town-blockout/engine-perf/index';
test('new arbitrary content registers without a map-specific dependency',()=>{
 const r=new ChunkRegistry();
 const d={owner:'future-content',id:'unknown-building',revision:'v1',west:-60,east:0,south:0,north:64,staticGeometry:true,coverageRequired:true};
 r.register(d);assert.throws(()=>r.register(d));r.register({...d,revision:'v2'});
 assert.equal(r.list().length,1);assert.equal(r.list()[0]!.revision,'v2');
 assert.equal(planResidency(r.list()[0]!,{east:0,north:1}).tier,'near');
 assert.notEqual(meshKey({owner:'a',id:'b:c',revision:'1',tier:'near'}),meshKey({owner:'a:b',id:'c',revision:'1',tier:'near'}));
});
test('resource budget never evicts leased resources; release is idempotent',()=>{
 let disposals=0;const c=new ResourceCache<string>(10);const make=(value:string,bytes:number)=>({value,bytes,dispose:()=>{disposals++;}});
 assert.ok(c.put('a',make('a',6)));const a=c.acquire('a')!;
 assert.ok(c.put('b',make('b',4)));assert.equal(c.put('c',make('c',5)),false);assert.equal(disposals,0);
 a.release();a.release();assert.ok(c.put('c',make('c',5)));assert.equal(disposals,1);assert.equal(c.bytes,9);
 c.clear();assert.equal(c.bytes,0);assert.equal(disposals,3);
});
test('queue prioritizes, deduplicates, respects byte limit, records overshoot and failure',()=>{
 let now=0;const q=new BudgetQueue({now:()=>now});const order:string[]=[];
 const job=(id:string,priority:number,bytes:number,ms:number)=>({id,priority,bytes,estimatedMs:1,run:()=>{order.push(id);now+=ms;}});
 assert.ok(q.enqueue(job('low',1,3,1)));assert.ok(q.enqueue(job('high',5,4,4)));assert.equal(q.enqueue(job('high',5,4,4)),false);
 const a=q.drain({ms:2,bytes:4});assert.deepEqual(order,['high']);assert.equal(a.overshootMs,2);assert.equal(a.pending,1);
 assert.equal(q.drain({ms:2,bytes:2}).completed,0);assert.equal(q.drain({ms:2,bytes:3}).completed,1);
 q.enqueue({id:'failure',priority:1,bytes:0,estimatedMs:0,run(){throw Error('fail');}});
 assert.deepEqual(q.drain({ms:2,bytes:3}).failures,['failure']);
});
test('async builds deduplicate and dispose stale outputs even if worker ignores cancellation',async()=>{
 let builds=0,disposed=0;let complete!:()=>void;
 const coordinator=new BuildCoordinator({async build(){builds++;await new Promise<void>(r=>{complete=r;});return {value:1,bytes:1,dispose(){disposed++;}};}});
 const key:MeshKey={owner:'fixture',id:'cell',revision:'1',tier:'near'};
 const first=coordinator.request(key,1);assert.equal(first,coordinator.request(key,2));await Promise.resolve();
 assert.equal(builds,1);coordinator.cancel(key);complete();assert.equal(await first,undefined);assert.equal(disposed,1);
});
test('visibility fails open for unknown or stale proof; unsafe batches fall back',()=>{
 assert.equal(shouldDraw(true,'unknown',undefined,'scene+view'),true);
 assert.equal(shouldDraw(true,'occluded','old-view','new-view'),true);
 assert.equal(shouldDraw(true,'occluded','scene+view','scene+view'),false);
 assert.equal(shouldDraw(false,'unknown',undefined,'scene+view'),false);
 const d={chunk:'0,0',material:'stone',staticGeometry:true,transparent:false,interactive:false,skinned:false};
 assert.ok(batchKey(d));for(const k of ['transparent','interactive','skinned'] as const)assert.equal(batchKey({...d,[k]:true}),undefined);
});
test('cosmetic scheduler does not catch up with a burst; profiler retains long frames',()=>{
 const s=new VisualScheduler();const dt:number[]=[];s.register({id:'wind',intervalMs:100,run:ms=>dt.push(ms)},0);
 assert.equal(s.tick(50),0);assert.equal(s.tick(500),1);assert.deepEqual(dt,[500]);
 const f=(frameMs:number):FrameCounters=>({frameMs,cpuStages:{},gpuMs:null,draws:0,triangles:0,uploadBytes:0,cacheHits:0,cacheMisses:0});
 const r=summarizeFrames([f(16),f(17),f(1000)]);assert.equal(r.max,1000);assert.equal(r.over50,1);assert.equal(r.p95,1000);
 assert.throws(()=>summarizeFrames([]));
});
