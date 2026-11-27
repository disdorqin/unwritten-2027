import type {R30OreBridge,mountR30OreArt} from './town-c-r30-ore-art.js';
import type {surveyR30Ore} from './town-c-r30-ore-survey.js';
import type {UndergroundMiningPoint,UndergroundMiningTargetView,UndergroundMiningCore} from '../../../src/shared/underground-mining.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type Foot=Point&Readonly<{domainId:string}>;
type Survey=Extract<ReturnType<typeof surveyR30Ore>,{kind:'ready'}>;
export type R30OreIntent=Readonly<{playerId:string;action:'strike'|'pickup';targetId:string}>;
export type R30OreInteraction=Readonly<{
 readPlayerId():string|undefined;
 readHeld(): 'pickaxe'|'other'|null|undefined;
 /** Existing input host checks current aim and unobstructed target ray. */
 canSee(playerId:string,targetId:string,point:UndergroundMiningPoint):boolean;
 dispatch(intent:R30OreIntent):void;
}>;
const domain='underground/mine';
const finite=(p:Point)=>[p.east,p.north,p.height].every(Number.isFinite);
const distance=(a:Point,b:Point)=>Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height);
const sameTarget=(a:UndergroundMiningTargetView,b:UndergroundMiningTargetView)=>a.id===b.id&&a.kind===b.kind&&a.at.layer===b.at.layer&&
 distance(a.at,b.at)<.00001&&a.surface===b.surface&&a.mineral===b.mineral&&a.hits===b.hits&&a.strikes===b.strikes&&a.open===b.open&&a.regrowAt===b.regrowAt;
function exactCore(c:UndergroundMiningCore,s:Survey['ordinary'][number]){
 let id:unknown;try{id=JSON.parse(c.id)}catch{return false}
 return Array.isArray(id)&&id.length===2&&id[0]===s.target.id&&Number.isSafeInteger(id[1])&&id[1]>=0&&
 c.at.layer===s.layer&&distance(c.at,s.coreAt)<.00001&&c.mineral===s.marker.mineral&&c.amount===s.marker.amount;
}
/** Interaction requests only. The existing mining authority owns input
 * sequence, hit cadence, backpack credit, core removal and regrowth. */
export function createR30OreActions(options:Readonly<{survey:Survey;art:ReturnType<typeof mountR30OreArt>;
 bridge:R30OreBridge;interaction:R30OreInteraction;readFoot():Foot|undefined;supports(p:Point):boolean}>){
 const {survey,art,bridge,interaction}=options;
 function prompt(){
  const foot=options.readFoot(),playerId=interaction.readPlayerId();
  if(!foot||foot.domainId!==domain||!finite(foot)||!playerId?.trim()||!options.supports(foot))return;
  const targets=bridge.readTargets()??[],cores=bridge.readCores()??[],shown=art.targets();
  const choices:{id:string;label:string;action:R30OreIntent['action'];targetId:string;playerId:string;distance:number}[]=[];
  function add(action:R30OreIntent['action'],targetId:string,point:UndergroundMiningPoint,label:string){
   const d=distance(foot!,point);
   if(point.layer!==domain||!finite(point)||d>2||!interaction.canSee(playerId!,targetId,point))return;
   choices.push({id:'ore/'+action+'/'+targetId,label,action,targetId,playerId:playerId!,distance:d});
  }
  for(const site of survey.ordinary){
   if(bridge.acceptsSite(site)!==true)continue;
   const matches=targets.filter(t=>t.id===site.target.id),present=shown.find(t=>t.id===site.target.id);
   if(matches.length!==1||!present||!sameTarget(matches[0],present))continue;
   if(!present.open&&interaction.readHeld()==='pickaxe')add('strike',present.id,present.at,'开采矿石 '+present.hits+'/'+present.strikes);
   for(const core of cores){
    if(cores.filter(c=>c.id===core.id).length!==1||!art.cores.has(core.id)||!exactCore(core,site))continue;
    add('pickup',core.id,core.at,'拾取矿核');
   }
  }
  return choices.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id))[0];
 }
 return {prompt,press(expectedId:string){
  const p=prompt();if(!p||p.id!==expectedId)return false;
  interaction.dispatch({playerId:p.playerId,action:p.action,targetId:p.targetId});return true;
 }};
}
