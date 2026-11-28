/** Shared, renderer-independent residency contract. No collision or world
 * ownership is granted by this module. E/N are world metres, render Z=-N.
 * Asset builders need not import this file: host adapters register descriptors.
 * Friend1 owns implementation evolution; incompatible changes need total control.
 */
export type PerfChunk = Readonly<{
 id:string; revision:string; west:number; east:number; south:number; north:number;
 staticGeometry:boolean;
}>;
export type PerfFoot = Readonly<{east:number;north:number}>;
export type PerfTier = 'near'|'middle'|'far'|'unloaded';
export type PerfPolicy = Readonly<{near:number;middle:number;far:number;hysteresis:number;simulation:number}>;
export const initialPerfPolicy:PerfPolicy=Object.freeze({near:128,middle:384,far:1536,hysteresis:32,simulation:96});
const rank:Record<PerfTier,number>={near:0,middle:1,far:2,unloaded:3};
const tiers:readonly PerfTier[]=['near','middle','far','unloaded'];
export function chunkDistance(chunk:PerfChunk,foot:PerfFoot):number{
 return Math.hypot(Math.max(chunk.west-foot.east,foot.east-chunk.east,0),Math.max(chunk.south-foot.north,foot.north-chunk.north,0));
}
export function planResidency(chunk:PerfChunk,foot:PerfFoot,previous:PerfTier='unloaded',policy:PerfPolicy=initialPerfPolicy){
 if(![foot.east,foot.north,chunk.west,chunk.east,chunk.south,chunk.north,policy.near,policy.middle,policy.far,policy.hysteresis,policy.simulation].every(Number.isFinite)
 ||chunk.west>chunk.east||chunk.south>chunk.north||policy.near<0||policy.middle<policy.near||policy.far<policy.middle||policy.hysteresis<0||policy.simulation<0)throw new RangeError('Invalid chunk or residency policy');
 const distance=chunkDistance(chunk,foot);
 const limits=[policy.near,policy.middle,policy.far];
 let next=limits.findIndex(r=>distance<=r);if(next<0)next=3;
 // Promotion is immediate. Demotion has a distance buffer to avoid churn.
 let old=rank[previous];
 while(old<next&&distance>limits[old]!+policy.hysteresis)old++;
 const tier=tiers[Math.min(old,next)]!;
 return {id:chunk.id,revision:chunk.revision,tier,simulate:distance<=policy.simulation,distance};
}
/** Keep the previous visible representation until its replacement is ready.
 * Never use this for physics or to remove the only ground under a player.
 */
export function drawableTier(previous:PerfTier,desired:PerfTier,ready:ReadonlySet<PerfTier>):PerfTier{
 if(desired==='unloaded')return desired;
 if(ready.has(desired))return desired;
 if(previous!=='unloaded'&&ready.has(previous))return previous;
 for(const t of tiers)if(t!=='unloaded'&&ready.has(t))return t;
 return 'unloaded';
}
