import type {BufferGeometry,Mesh} from 'three';
import {cutTransfers,intersectingCutTiles,packCutGeometry,unpackCutGeometry,type CutRequest,type CutReply} from './town-a32-cut-wire';
export async function prepareA32CutCache(tiles:readonly Mesh[],tread:BufferGeometry,signal:AbortSignal){
 if(typeof Worker==='undefined')return;
 const selected=intersectingCutTiles(tiles,tread),sources=selected.map(m=>m.geometry);
 const request:CutRequest={tread:packCutGeometry(tread),tiles:sources.map((g,id)=>({id,wire:packCutGeometry(g)}))};
 let worker:Worker|undefined;
 try{
  const started=performance.now();
  const reply=await new Promise<CutReply>((resolve,reject)=>{
   if(signal.aborted){reject(Error('cut staging cancelled'));return;}
   let timer:ReturnType<typeof setTimeout>;
   const finish=(value:CutReply|undefined,error?:string)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(value)resolve(value);else reject(Error(error??'cut worker error'));};
   const abort=()=>finish(undefined,'cut staging cancelled');
   worker=new Worker(new URL('./town-a32-cut.worker.ts',import.meta.url),{type:'module'});
   signal.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>finish(undefined,'cut worker timeout'),45000);
   worker.onmessage=e=>e.data?.cuts?finish(e.data):finish(undefined,e.data?.error);
   worker.onerror=e=>finish(undefined,e.message);
   worker.postMessage(request,[...cutTransfers(request.tread),...request.tiles.flatMap(t=>cutTransfers(t.wire))]);
  });
  if(signal.aborted)throw Error('cut staging cancelled');
  const result=new Map<BufferGeometry,CutReply['cuts'][number]['wire']>();
  if(reply.cuts.length!==sources.length)throw Error('incomplete cut worker reply');
  for(const {id,wire} of reply.cuts){const source=sources[id];if(!source||result.has(source))throw Error('unexpected cut worker tile');result.set(source,wire);}
  return {stats:{mode:'worker' as const,ms:reply.ms,elapsedMs:performance.now()-started,tiles:sources.length,changed:reply.cuts.filter(c=>c.wire).length},
   cut(source:BufferGeometry,actualTread:BufferGeometry){
    if(actualTread!==tread||!result.has(source))throw Error('stale prepared cut input');
    const wire=result.get(source);
    if(!wire)return {geometry:source};
    const g=unpackCutGeometry(wire);g.name=source.name+'-west-cut';g.userData={...source.userData};return {geometry:g};
   }};
 }finally{worker?.terminate();}
}
