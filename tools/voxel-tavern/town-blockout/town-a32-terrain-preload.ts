import type {TerrainGridSamples} from './terrain';
let prepared:TerrainGridSamples|undefined,loading:Promise<void>|undefined;
let result:{mode:'idle'|'worker'|'fallback';ms?:number;error?:string}={mode:'idle'};
export function preloadTownTerrain(){
 if(loading)return loading;
 loading=new Promise<void>(resolve=>{
  let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  let done=false;
  const finish=(error?:string)=>{
   if(done)return;done=true;
   if(timer)clearTimeout(timer);worker?.terminate();
   if(error)result={mode:'fallback',error};
   resolve();
  };
  try{
   if(typeof Worker==='undefined'){finish('Worker unavailable');return;}
   worker=new Worker(new URL('./town-a32-terrain.worker.ts',import.meta.url),{type:'module'});
   worker.onmessage=e=>{
    const v=e.data;
    if(v?.samples?.elevation instanceof Float32Array&&v.samples.surfaces instanceof Uint8Array){
     prepared=v.samples;result={mode:'worker',ms:v.ms};finish();
    }else finish(v?.error??'invalid worker result');
   };
   worker.onerror=e=>finish(e.message||'worker error');
   timer=setTimeout(()=>finish('worker deadline'),45000);
   worker.postMessage(null);
  }catch(error){finish(error instanceof Error?error.message:String(error));}
 });
 return loading;
}
export function takeTownTerrain(){const value=prepared;prepared=undefined;return value;}
export const townTerrainPreloadStats=()=>({...result});
