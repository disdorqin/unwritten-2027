import type {PerfChunk,PerfTier} from '../residency';
export type RenderTier=Exclude<PerfTier,'unloaded'>;
export type ChunkDescriptor=PerfChunk&Readonly<{owner:string;coverageRequired:boolean}>;
export type MeshKey=Readonly<{owner:string;id:string;revision:string;tier:RenderTier}>;
export function meshKey(k:MeshKey):string{return JSON.stringify([k.owner,k.id,k.revision,k.tier]);}
export type Resource<T>=Readonly<{value:T;bytes:number;dispose:()=>void}>;
export type BuildRequest=Readonly<{key:MeshKey;priority:number;signal:AbortSignal}>;
export interface MeshBuilder<T>{build(request:BuildRequest):Promise<Resource<T>>}
export interface RenderPort<T,G>{
 upload(key:MeshKey,data:T):Resource<G>;
 show(key:MeshKey,resource:G):void;
 hide(key:MeshKey):void;
}
export interface Clock{now():number}
export type FrameBudget=Readonly<{ms:number;bytes:number}>;
export type FrameInput=Readonly<{east:number;north:number;frameMs:number;nowMs:number}>;
export type FrameCounters=Readonly<{frameMs:number;cpuStages:Readonly<Record<string,number>>;gpuMs:number|null;draws:number;triangles:number;uploadBytes:number;cacheHits:number;cacheMisses:number}>;
/** Only cosmetic client updates may be registered here. Never authoritative
 * movement, collision, gameplay or network protocol. */
export interface VisualTask {id:string;intervalMs:number;run:(elapsedMs:number)=>void}
