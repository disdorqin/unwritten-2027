/** A-owned presentation guard, not a lift or landing authority. Only the
 * existing chain's matching accepted landing can reveal the world. */
export type DreamFoot=Readonly<{east:number;north:number;height:number}>;
export type DreamLandingState='idle'|'waiting'|'failed'|'complete';
type Host=Readonly<{
 request(tripId:number):Promise<DreamFoot|undefined>;
 accept(tripId:number,foot:DreamFoot):boolean;
 show(state:DreamLandingState):void;
}>;
const finite=(p:DreamFoot|undefined):p is DreamFoot=>!!p&&[p.east,p.north,p.height].every(Number.isFinite);
export function createAR30LandingRecovery(host:Host){
 let active:{id:number;state:'waiting'|'failed'}|undefined,disposed=false;
 function attempt(s:NonNullable<typeof active>){
  s.state='waiting';host.show('waiting');
  void (async()=>{
   try{
    const foot=await host.request(s.id);
    if(disposed||active!==s)return;
    if(!finite(foot)||!host.accept(s.id,foot))throw Error('No matching accepted landing');
    active=undefined;host.show('complete');
   }catch{
    if(disposed||active!==s)return;
    s.state='failed';host.show('failed');
   }
  })();
 }
 return {
  start(id:number){
   if(disposed||active||!Number.isSafeInteger(id)||id<0)return false;
   active={id,state:'waiting'};attempt(active);return true;
  },
  retry(){if(disposed||active?.state!=='failed')return false;attempt(active);return true;},
  state:():DreamLandingState=>active?.state??'idle',
  dispose(){disposed=true;active=undefined;host.show('idle');},
 };
}
