import {
  bellowsBand, dialTargets, sortBasketCapacity,
  type OreKind,
} from './town-crater-surface-play';
import type {
  CraterWorkstationView, installCraterWorkshopWorld,
} from './town-b-r30-crater-workstations';

type Model=Pick<ReturnType<typeof installCraterWorkshopWorld>,'aimControl'|'show'>;
type Pose=Readonly<{east:number;north:number;height:number;heading:number;pitch:number;eyeHeight:number}>;
type Triple<T>=readonly [T,T,T];
const oreKinds=['stardust','scrap','rubble'] as const;

/**
 * A presentation projection of the existing surface rule leaves. The host
 * supplies its actual day and inventory transaction; this module never
 * owns a clock, a second ledger, a train route or a reward.
 */
export type BR30WorkshopFacts=Readonly<{
  dayIndex:number;
  bellows:Readonly<{pressure:number;heldMs:number;inBand:boolean;cast:boolean;stroke:number}>;
  calibration:Readonly<{angles:Triple<number>;locked:Triple<boolean>}>;
  sorting:Readonly<{bins:Readonly<Record<OreKind,number>>}>;
  scale:Readonly<{kg:number}>;
  track:Readonly<{thrown:boolean}>;
}>;
export type BR30WorkshopIntent=
  | Readonly<{kind:'pump-bellows'}>
  | Readonly<{kind:'turn-dial';index:0|1|2;direction:-1|1}>
  | Readonly<{kind:'sort-carried-lump';bin:OreKind}>
  | Readonly<{kind:'weigh-carried-lump'}>
  | Readonly<{kind:'pull-track-switch'}>;

export type BR30WorkshopHost=Readonly<{
  /** Existing accepted player state; no invented player position or day. */
  pose():Pose|undefined;
  facts():BR30WorkshopFacts|undefined;
  /**
   * A's production dispatcher forwards to the existing rules/authority.
   * Recheck current accepted pose, target, held lump and eligibility before
   * mutation. In particular sort/weigh resolve the real held item on the
   * host, not from a claimed client item id. No new inventory is permitted.
   */
  request(intent:BR30WorkshopIntent):Promise<{accepted:boolean;reason?:string}>;
}>;
const clamp=(n:number)=>Number.isFinite(n)?Math.min(1,Math.max(0,n)):0;
export function projectBR30Workshop(f:BR30WorkshopFacts):CraterWorkstationView {
  return {
    bellowsStroke:clamp(f.bellows.stroke),
    bellowsPressure:clamp(f.bellows.pressure),
    bellowsInBand:f.bellows.inBand&&f.bellows.pressure>=bellowsBand.low&&f.bellows.pressure<=bellowsBand.high,
    gaugeNeedle:0,
    calibrationAngles:f.calibration.angles,
    calibrationLocked:f.calibration.locked,
    calibrationTargets:dialTargets(f.dayIndex),
    sortingFill:oreKinds.map(k=>clamp(f.sorting.bins[k]/sortBasketCapacity)) as unknown as Triple<number>,
    weighingNeedle:clamp(f.scale.kg/17.9),
    turnout:f.track.thrown?'branch':'straight',
  };
}
export function createBR30WorkshopControls(model:Model,host:BR30WorkshopHost){
  let pending=false;
  function action(direction:-1|1=1):BR30WorkshopIntent|undefined{
    if(pending||!host.facts()||(direction!==1&&direction!==-1))return;
    const pose=host.pose();if(!pose)return;
    const hit=model.aimControl(pose,pose.heading,pose.pitch,pose.eyeHeight);
    if(!hit)return;
    switch(hit.station){
      case 'bellows':return {kind:'pump-bellows'};
      case 'calibration':return hit.index===undefined?undefined:{kind:'turn-dial',index:hit.index,direction};
      case 'sorting':return hit.index===undefined?undefined:{kind:'sort-carried-lump',bin:oreKinds[hit.index]};
      case 'weighing':return {kind:'weigh-carried-lump'};
      case 'turnout':return {kind:'pull-track-switch'};
    }
  }
  function refresh(){
    const facts=host.facts();if(facts)model.show(projectBR30Workshop(facts));
  }
  return {action,refresh,async interact(direction:-1|1=1){
    if(pending)return {accepted:false,reason:'pending'};
    const next=action(direction);
    if(!next)return {accepted:false,reason:'unavailable'};
    pending=true;
    try{
      const result=await host.request(next);
      refresh(); // project only committed/read-back state
      return result;
    }finally{pending=false;}
  }};
}
