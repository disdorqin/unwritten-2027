import {Group} from 'three';
import {createUndergroundMainlineTrack,type UndergroundMainlinePoint} from '../../../src/shared/underground-mainline-track.js';
import {r30MainlineLocal,r30MainlineFaults,r30MainlineTurnout} from '../../../src/shared/town-c-r30-mainline-plan.js';
import {isMinePresenceFoot} from '../../../src/shared/underground-mine-presence-domain.js';
import {mountUndergroundMainlineScene} from './underground-mainline-scene.js';
import {createR30MainlineMotion} from './town-c-r30-mainline-motion.js';
type Route=ReturnType<typeof createUndergroundMainlineTrack>;
type SceneOptions=Parameters<typeof mountUndergroundMainlineScene>[0];
export type R30MainlineBridge=Pick<SceneOptions,'readSnapshot'|'readViewer'|'readLightBudget'|'canSee'|'dispatch'|'onNoise'>&Readonly<{
 /** Single existing U19 authority must explicitly accept this survey. */
 acceptsRoute(route:Route):boolean;
}>;
type Support=(p:UndergroundMainlinePoint,radius:number,height:number)=>boolean;
export function createR30MainlineRoute(worldOf:(p:readonly [number,number,number])=>UndergroundMainlinePoint,supports:Support){
 const waypoints=r30MainlineLocal.map(([x,z])=>worldOf([x,-91,z]));
 return createUndergroundMainlineTrack({
  domainId:'underground/mine',waypoints,gaugeMetres:1,clearanceRadius:.82,
  turnoutMetres:r30MainlineTurnout,faults:r30MainlineFaults,
  acceptsTrackStep(a,b,r){
   const count=Math.ceil(Math.hypot(b.east-a.east,b.north-a.north,b.height-a.height)/.10);
   for(let i=0;i<=count;i++){
    const t=i/count,p={east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t,height:a.height+(b.height-a.height)*t};
    if(!isMinePresenceFoot(p.east,p.north,p.height)||!supports(p,r,2.4))return false;
   }
   return true;
  },
  acceptsWorkFoot(_role,p){return supports(p,.27,1.8)},
 });
}
export function mountR30MainlineHost(options:Readonly<{parent:Group;worldOf:(p:readonly [number,number,number])=>UndergroundMainlinePoint;
 supports:Support;bridge?:R30MainlineBridge}>){
 let route:Route;
 try{route=createR30MainlineRoute(options.worldOf,options.supports)}
 catch(error){return {kind:'blocked' as const,reason:error instanceof Error?error.message:String(error)}}
 const {bridge}=options;
 // The rails and real support exist without the multiplayer cart service.
 // No local snapshot, repair counter, dispatch or rider state is invented.
 const accepted=()=>bridge?.acceptsRoute(route)===true;
 const scene=mountUndergroundMainlineScene({parent:options.parent,route,supportsRoute:r=>r===route,
  r30:{supportsProp:options.supports},
  readSnapshot:()=>accepted()?bridge?.readSnapshot():undefined,
  readViewer:()=>accepted()?bridge?.readViewer():undefined,
  readLightBudget:()=>accepted()?bridge?.readLightBudget()??0:0,
  canSee:(id,role,p)=>accepted()&&bridge?.canSee(id,role,p)===true,
  dispatch:intent=>{if(accepted())bridge?.dispatch(intent)},
  onNoise:(kind,p)=>{if(accepted())bridge?.onNoise?.(kind,p)},
 });
 if(scene.kind!=='ready')return {kind:'blocked' as const,reason:scene.kind};
 const motion=createR30MainlineMotion(scene,options.supports);
 return {kind:'ready' as const,route,scene,motion,accepted,sync(){const ok=scene.sync();motion.sync();return ok},dispose(){motion.dispose();scene.dispose()}};
}
