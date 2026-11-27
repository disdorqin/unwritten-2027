import {createBellows,createCalibration,createSorting,createScale,createTrackSwitch,type OreKind} from './town-crater-surface-play';
import {createBR30WorkshopControls,type BR30WorkshopFacts} from './town-b-r30-crater-workshop-controls';
import type {installCraterWorkshopWorld} from './town-b-r30-crater-workstations';
type Model=ReturnType<typeof installCraterWorkshopWorld>;
type Pose=Readonly<{east:number;north:number;height:number;heading:number;pitch:number;eyeHeight:number}>;
/** Explicit independent review fixture, never imported by the production
 * viewer or presence server. Exercise the original five rule leaves through
 * the actual keyboard/aim adapter. Fixture lumps are not real inventory. */
export function createBR30WorkshopReviewFixture(model:Model,pose:()=>Pose){
 const dayIndex=7,bellows=createBellows(),calibration=createCalibration(dayIndex),sorting=createSorting(),scale=createScale(),track=createTrackSwitch();
 let held:OreKind|undefined,kg=0,stroke=0,last='请选择实物机位并瞄准操作部件',accepted=0,rejected=0;
 const fixtureIds:Record<OreKind,number>={stardust:123,scrap:456,rubble:789};
 const facts=():BR30WorkshopFacts=>({dayIndex,bellows:{...bellows.state(),stroke},
  calibration:{angles:calibration.angles() as [number,number,number],locked:calibration.locked() as [boolean,boolean,boolean]},
  sorting:sorting.state(),scale:{kg},track:{thrown:track.thrown()}});
 const controls=createBR30WorkshopControls(model,{pose,facts,async request(intent){
  switch(intent.kind){
   case 'pump-bellows':bellows.pump();stroke=1;break;
   case 'turn-dial':calibration.turn(intent.index,intent.direction*.08);break;
   case 'sort-carried-lump':{
    if(!held)return {accepted:false,reason:'没有样例矿块'};
    const result=sorting.place(held,intent.bin);
    if(result!=='sorted')return {accepted:false,reason:result==='bin-full'?'料槽已满':'矿种不匹配'};
    held=undefined;break;
   }
   case 'weigh-carried-lump':if(!held)return {accepted:false,reason:'没有样例矿块'};kg=scale.weigh(fixtureIds[held]).kg;break;
   case 'pull-track-switch':track.pull();break;
  }
  return {accepted:true};
 }});
 let elapsed=0;
 controls.refresh();
 return {
  setHeld(value:string){held=(['stardust','scrap','rubble'] as const).find(k=>k===value);},
  tick(ms:number){
   if(!Number.isFinite(ms)||ms<0)return;
   bellows.tick(ms);stroke=Math.max(0,stroke-ms/250);
   elapsed+=ms;if(elapsed>=75){elapsed%=75;controls.refresh();}
  },
  async press(direction:-1|1=1){
   const result=await controls.interact(direction);
   if(result.accepted){accepted++;last='已受理：样例规则状态已更新';}
   else{rejected++;last=result.reason==='unavailable'?'未瞄准可操作部件':result.reason??'未受理';}
   return result;
  },
  state(){return {held:held??'',facts:facts(),accepted,rejected,last,aim:controls.action()?.kind??null};}
 };
}
