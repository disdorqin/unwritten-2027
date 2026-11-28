type Foot=Readonly<{east:number;north:number;height:number}>;
type Velocity=Readonly<{east:number;north:number}>;
const finite=(p:Foot)=>[p.east,p.north,p.height].every(Number.isFinite);
const distance=(e:number,n:number,x:number,z:number)=>Math.hypot(e-x,n-z);
// Prefetch at the actual railway approach / foothill, not on initial plaza
// load. Speed prediction is bounded so a menu jump cannot make every zone hot.
export function a32SummitPrefetch(p:Foot,v:Velocity={east:0,north:0}){
 if(!finite(p)||p.east<0||p.north<0||![v.east,v.north].every(Number.isFinite))return false;
 const speed=Math.hypot(v.east,v.north),scale=speed>0?Math.min(12,180/speed):0;
 const next={east:p.east+v.east*scale,north:p.north+v.north*scale};
 // Approaching along the western/southern face or on the high apron
 // must also initiate staging, even outside the railway approach circle.
 if(p.height>=90&&p.north>=390&&p.north<=800&&p.east<=640)return true;
 return [p,next].some(q=>q.north>=290&&q.east>=240&&distance(q.east,q.north,430,490)<=245);
}
/** Synchronous legacy factories cannot be interrupted mid-call. Never begin
 * one while a moving player is producing frames; bounded GPU work may still
 * continue separately. No timeout silently bypasses this admission policy. */
export function createA32QuietGate(now:()=>number=()=>performance.now(),quietMs=250,maxWaitMs=Infinity){
 let previous:Foot|undefined,lastMotion=-Infinity;
 return {
  observe(p:Foot){if(!finite(p))return;if(previous&&Math.hypot(p.east-previous.east,p.north-previous.north,p.height-previous.height)>.006)lastMotion=now();previous=p;},
  ready:()=>now()-lastMotion>=quietMs,
  async wait(yieldFrame:()=>Promise<void>,cancelled:()=>boolean){
   const started=now();
   do{await yieldFrame();if(cancelled())throw Error('A32 staging cancelled');}while(now()-lastMotion<quietMs&&now()-started<maxWaitMs);
  }
 };
}
export type A32StageRecord={stage:string;ms:number;at:number};
export function createA32StageMeter(now:()=>number=()=>performance.now()){
 const records:A32StageRecord[]=[];
 async function run<T>(name:string,task:()=>T|Promise<T>){
  const start=now();try{return await task();}finally{records.push({stage:name,ms:now()-start,at:start});}
 }
 return {run,records:()=>records.map(r=>({...r}))};
}
export function a32YieldFrame(){
 return new Promise<void>(resolve=>{
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(resolve,0));
  else setTimeout(resolve,0);
 });
}
