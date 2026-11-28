import type {SummitPassportAction,SummitPassportProgress,SummitPassportReply} from '../../../src/shared/summit-passport';
import {createMainSummitRegistrationLandmarks,withinMainSummitRegistrationReach} from './main-summit-registration';
type Foot={east:number;north:number;height:number};
type Area='front'|'rear';
type Stamp=Exclude<SummitPassportAction,'status'>;
const landmarks=createMainSummitRegistrationLandmarks();
const labels:Record<Stamp,string>={'cloud-stamp':'盖云海台纪念章','summit-stamp':'盖主峰纪念章','register-summit':'在山顶小屋登记'};
const flags:Record<Stamp,keyof SummitPassportProgress>={'cloud-stamp':'cloudStamped','summit-stamp':'summitStamped','register-summit':'summitRegistered'};
export function createA32PassportInput(port:{available():boolean;request(action:SummitPassportAction):boolean;notice(text:string):void;now?:()=>number}){
 let state:SummitPassportProgress|undefined,pending:SummitPassportAction|undefined,deadline=0,lastRoom:string|undefined,connected=false;
 const now=port.now??(()=>performance.now());
 function send(action:SummitPassportAction){
  if(!port.available()||pending||!port.request(action))return false;
  pending=action;deadline=now()+5000;return true;
 }
 function tick(room:string){
  const available=port.available();
  if(!available||room!==lastRoom||!connected){state=undefined;pending=undefined;connected=available;lastRoom=room;if(available)send('status');return;}
  if(pending&&now()>=deadline){pending=undefined;state=undefined;}
  if(!state&&!pending)send('status');
 }
 function receive(reply:SummitPassportReply){
  if(!port.available()||reply.action!==pending)return;
  pending=undefined;
  if(reply.result==='ok'){state=reply.progress;if(reply.action!=='status')port.notice(labels[reply.action]+'成功'+(reply.action==='register-summit'?'，已取得雪翼领取资格':'')+'。');}
  else{if(reply.action==='status')state=undefined;else port.notice(reply.result==='previous-stamp'?'请先完成前一枚纪念章。':reply.result==='position'?'请站在真实登记点并稍候同步。':'登记服务暂未受理，请稍后再试。');}
 }
 function action(area:Area,foot:Foot,physical:(stamp:Stamp)=>boolean,stillValid:()=>boolean){
  if(!port.available()||!state||pending)return;
  const candidates=area==='front'?[['cloud-stamp',landmarks.cloudDeck.stampPoint] as const]:
   [['summit-stamp',landmarks.summit.stampPoint] as const,['register-summit',landmarks.summit.registry] as const];
  for(const [id,anchor] of candidates){
   if(state[flags[id]]||!physical(id)||!withinMainSummitRegistrationReach(foot,anchor))continue;
   if(id==='summit-stamp'&&!state.cloudStamped||id==='register-summit'&&!state.summitStamped)continue;
   return {label:labels[id],run(){if(stillValid()&&physical(id))send(id);}};
  }
 }
 return {tick,receive,action,progress:()=>state,pending:()=>pending};
}
