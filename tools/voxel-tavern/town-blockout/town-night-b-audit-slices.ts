export type NightBAuditCertificate=boolean|Generator<void,boolean,unknown>;
export function* nightBAuditCertificateSteps(value:NightBAuditCertificate){return typeof value==='boolean'?value:yield* value;}
export type NightBAuditSliceOptions=Readonly<{budgetMs?:number;signal?:AbortSignal;valid?:()=>boolean;yieldTask?:()=>Promise<void>;onSlice?:(ms:number)=>void}>;
/** The exact same iterator powers synchronous tests and the production
 * cooperative install. Only time scheduling changes; every probe executes. */
export function finishNightBAudit<T>(work:Generator<void,T,unknown>):T{
 for(;;){const r=work.next();if(r.done)return r.value;}
}
export async function finishNightBAuditAsync<T>(work:Generator<void,T,unknown>,options:NightBAuditSliceOptions={}):Promise<T>{
 const budget=options.budgetMs??6;
 if(!Number.isFinite(budget)||budget<=0||budget>16)throw Error('Invalid cable audit slice budget');
 const yieldTask=options.yieldTask??(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
 const check=()=>{if(options.signal?.aborted||options.valid?.()===false)throw Error('Cable owner changed or installation cancelled');};
 try{
  check();
  let start=performance.now();
  for(;;){
   const r=work.next();
   if(r.done){options.onSlice?.(performance.now()-start);return r.value;}
   const elapsed=performance.now()-start;
   if(elapsed>=budget){
    options.onSlice?.(elapsed);await yieldTask();check();start=performance.now();
   }
  }
 }catch(error){
  // Throw into the generator to execute its staged rollback/clock cleanup.
  try{work.throw(error);}catch{/* preserve the caller's original error */}
  throw error;
 }
}
