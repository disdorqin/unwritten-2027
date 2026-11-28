import type {A32CanonicalWire} from './town-a32-canonical-wire';
export async function prepareA32Canonical(arrivalHeight:number,signal:AbortSignal){
 if(typeof Worker==='undefined')return {mode:'sync' as const};
 let worker:Worker|undefined;
 try{
  if(signal.aborted)throw Error('Canonical staging cancelled');
  const started=performance.now();
  const data=await new Promise<A32CanonicalWire>((resolve,reject)=>{
   let timer:ReturnType<typeof setTimeout>;
   const finish=(value:A32CanonicalWire|undefined,error?:string)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);value?resolve(value):reject(Error(error??'Canonical worker failure'));};
   const abort=()=>finish(undefined,'Canonical staging cancelled');
   worker=new Worker(new URL('./town-a32-canonical.worker.ts',import.meta.url),{type:'module'});
   signal.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>finish(undefined,'Canonical worker timeout'),45000);
   worker.onmessage=e=>e.data?.massif&&e.data?.heights instanceof Float32Array?finish(e.data):finish(undefined,e.data?.error);
   worker.onerror=e=>finish(undefined,e.message);
   worker.postMessage(arrivalHeight);
  });
  if(signal.aborted)throw Error('Canonical staging cancelled');
  if(data.arrivalHeight!==arrivalHeight||!data.trail?.points?.length||!Number.isFinite(data.ms))throw Error('Canonical worker malformed reply');
  return {mode:'worker' as const,data,ms:data.ms,elapsedMs:performance.now()-started};
 }catch(error){if(signal.aborted)throw error;return {mode:'sync' as const,error:error instanceof Error?error.message:String(error)};}
 finally{worker?.terminate();}
}
