export type Visibility='visible'|'occluded'|'unknown';
/** Unknown or stale occlusion must never suppress a visible chunk. */
export function shouldDraw(inFrustum:boolean,occlusion:Visibility,proofRevision:string|undefined,currentRevision:string){return inFrustum&&!(occlusion==='occluded'&&proofRevision===currentRevision);}
