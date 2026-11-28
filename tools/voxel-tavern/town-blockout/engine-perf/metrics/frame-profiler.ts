import type {FrameCounters} from '../core/contracts';
export function summarizeFrames(frames:readonly FrameCounters[]){
 if(!frames.length||frames.some(f=>!Number.isFinite(f.frameMs)||f.frameMs<0))throw Error('missing or invalid frame evidence');
 const sorted=frames.map(f=>f.frameMs).sort((a,b)=>a-b);
 const pct=(q:number)=>sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]!;
 return {count:sorted.length,p50:pct(.5),p95:pct(.95),p99:pct(.99),max:sorted.at(-1)!,over50:sorted.filter(n=>n>50).length};
}
