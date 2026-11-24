import type { AircraftPoint } from '../../../src/shared/aircraft-flight';
import { starportAssemblyParts, type StarportAssemblyPart, type StarportAssemblyState } from '../../../src/shared/starport-assembly';
import type { CombineSnapshot } from '../../../src/shared/town-combine-flags';
import type { TownNightWindowState } from '../../../src/shared/town-night-window';
import type { mountStarportAssemblySite } from './starport-assembly-site';

type Model = Pick<ReturnType<typeof mountStarportAssemblySite>, 'aim'|'show'|'targets'>;
type Target=StarportAssemblyPart|'ignition';
export type CombineStagingFacts=Readonly<{
  assembly:StarportAssemblyState;
  flags:CombineSnapshot;
  /** Existing server snapshot, not a client timer or a lighting toggle. */
  night:TownNightWindowState;
  keyOne:boolean;
}>;
export type CombineStagingAction=
  | Readonly<{kind:'place';part:StarportAssemblyPart;label:string}>
  | Readonly<{kind:'ignite';mode:'first'|'daily';label:string}>;
export type CombineStagingRequest=
  | Readonly<{kind:'place';part:StarportAssemblyPart;expectedRevision:number}>
  | Readonly<{kind:'ignite';mode:'first'|'daily';expectedRevision:number;beaconAt:number}>;
type RequestResult=Readonly<{accepted:boolean;reason?:string}>;
export type CombineStagingHost=Readonly<{
  /** These must come from the same existing authenticated authority. */
  facts():CombineStagingFacts|undefined;
  pose():AircraftPoint|undefined;
  /**
   * Server-side transaction owner, NOT the preview grantKeyOne() path.
   * Revalidate accepted feet, part ownership, revision, key, actual shared
   * beacon overlap and mode at the write boundary; daily opens must not reuse
   * the existing assembly's already-ignited return as an authorization.
   * This adapter never launches or opens the space chapter gate.
   */
  request(request:CombineStagingRequest):Promise<RequestResult>;
}>;
const labels:Record<StarportAssemblyPart,string>={
  'snow-wing':'推正雪翼，入卡槽',booster:'搭手抬助推器，上挂架','navigation-core':'将导航芯嵌入船徽凹位',
};
const complete=(s:StarportAssemblyState)=>starportAssemblyParts.every(p=>s.installed.includes(p));

/** Derive the D/A staging view, using ONLY the canonical B flag and assembly
 * ledgers. No independent progression, forge/ignition counter, or drift table. */
export function combineStagingPresentation(f:CombineStagingFacts|undefined) {
  const first=f?.flags.mode==='first';
  const installed=f?complete(f.assembly):false;
  const assembled=!!f&&installed&&(f.flags.stage==='assembled'||f.flags.stage==='ignited');
  const overlap=!!f&&f.night.phase==='night-window'&&f.night.layersOverlap&&
    f.night.beaconAt!==null&&f.night.beaconAt===f.flags.beaconAt;
  return {
    carryProcession:!!f&&first&&f.flags.stage==='forged'&&f.flags.handsEventPending,
    crowdAtApron:!!f&&first&&assembled,
    aircraftAssembled:assembled,
    ignitionAvailable:!!f&&assembled&&overlap&&f.keyOne===true&&f.flags.ignitionOpen,
    mode:f?.flags.mode??null,
  };
}
function actionFor(target:Target|null,f:CombineStagingFacts|undefined):CombineStagingAction|undefined {
  if(!f||!target)return;
  if(target==='ignition'){
    if(!combineStagingPresentation(f).ignitionAvailable)return;
    return {kind:'ignite',mode:f.flags.mode,label:'启动点火'};
  }
  if(f.flags.mode!=='first'||f.flags.stage!=='forged'||f.assembly.ignited||
      !f.assembly.carried.includes(target)||f.assembly.installed.includes(target))return;
  return {kind:'place',part:target,label:labels[target]};
}

/** Attach to D's actual already-mounted rack. Read snapshots and forward
 * native aim/E intent; a missing host cannot grant or simulate success. */
export function createCombineStagingControls(model:Model,host:CombineStagingHost){
  let pending=false;
  function read(heading:number,pitch:number,eyeHeight:number){
    const facts=host.facts(),feet=host.pose();
    const target=feet&&[heading,pitch,eyeHeight].every(Number.isFinite)
      ?model.aim(feet,heading,pitch,eyeHeight):null;
    return {facts,action:actionFor(target,facts)};
  }
  return {
    presentation:()=>combineStagingPresentation(host.facts()),
    refresh(){
      const f=host.facts();
      if(f)model.show({installed:f.assembly.installed,ignited:f.assembly.ignited});
      return combineStagingPresentation(f);
    },
    action(heading:number,pitch:number,eyeHeight:number){
      return pending?undefined:read(heading,pitch,eyeHeight).action;
    },
    async interact(heading:number,pitch:number,eyeHeight:number):Promise<RequestResult>{
      if(pending)return {accepted:false,reason:'pending'};
      const {facts,action}=read(heading,pitch,eyeHeight);
      if(!facts||!action)return {accepted:false,reason:'unavailable'};
      const request:CombineStagingRequest=action.kind==='place'
        ?{kind:'place',part:action.part,expectedRevision:facts.assembly.revision}
        :{kind:'ignite',mode:action.mode,expectedRevision:facts.assembly.revision,beaconAt:facts.night.beaconAt!};
      pending=true;
      try {
        const result=await host.request(request);
        // Never display speculative success or apply a locally manufactured revision.
        const fresh=host.facts();
        if(fresh)model.show({installed:fresh.assembly.installed,ignited:fresh.assembly.ignited});
        return result;
      }finally{pending=false;}
    },
  };
}
