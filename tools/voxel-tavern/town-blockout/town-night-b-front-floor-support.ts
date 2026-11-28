import {externalCableDockSupport} from './town-d-r30-cable-facilities';
type WorldFloor={min:readonly number[];max:readonly number[]};
/** World-space floor boxes from real station/rail geometry, not a second raster.
 * The .43 step cap matches the normal viewer. Never assume missing elevation. */
export function createNightBFrontFloorSupport(groundAt:(e:number,n:number)=>number|undefined,floors:readonly WorldFloor[]){
 return (e:number,n:number):number|undefined=>{
  const base=externalCableDockSupport(e,n)??groundAt(e,n);
  if(base===undefined||!Number.isFinite(base))return undefined;
  let h=base;
  for(const f of floors){
   const top=f.max[1];
   if(top===undefined||!Number.isFinite(top)||top>base+.43||top<=h)continue;
   if(Math.hypot(Math.max(0,f.min[0]!-e,e-f.max[0]!),Math.max(0,f.min[2]!+n,-n-f.max[2]!))<.27)h=top;
  }
  return h;
 };
}
