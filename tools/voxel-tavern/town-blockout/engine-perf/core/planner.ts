import {planResidency,initialPerfPolicy,type PerfFoot,type PerfPolicy,type PerfTier} from '../residency';
import type {ChunkDescriptor} from './contracts';
/** Pure desired-state planner, not a streaming executor. Required coverage
 * survives outside the distance budget. Host must supply a resident fallback
 * before enabling the optimized path, otherwise use the original renderer. */
export function planChunk(c:ChunkDescriptor,foot:PerfFoot,previous:PerfTier='unloaded',policy:PerfPolicy=initialPerfPolicy){
 const p=planResidency(c,foot,previous,policy);
 return {...p,tier:c.coverageRequired&&p.tier==='unloaded'?'far' as const:p.tier};
}
