import {Group,Vector3} from 'three';
import {mineBestiary,type createMineBestiaryEncounter} from '../../../src/shared/mine-bestiary.js';
import type {surveyR30Encounters,R30EncounterSite} from './town-c-r30-encounter-survey.js';
import {createR30MineCreatureFactory} from './town-c-r30-mine-creature-model.js';
import {mountR30CreatureFragments} from './town-c-r30-creature-fragments.js';
type Survey=ReturnType<typeof surveyR30Encounters>;
type Actor=ReturnType<ReturnType<typeof createMineBestiaryEncounter>['snapshot']>[number];
export type R30EncounterBridge=Readonly<{
 /** Return the host's accepted logical room for the exact surveyed group. */
 acceptGroup(group:R30EncounterSite):string|undefined;
 readActors():readonly Actor[]|undefined;
}>;
const phases=new Set(['rest','peek','chase','orbit','windup','recover','retreat','rebuild','defeated']);
/** Only visualizes the original encounter snapshot. No local combat or drops. */
export function mountR30EncounterArt(parent:Group,survey:Survey,bridge:R30EncounterBridge|undefined,
 passage:(e:number,n:number)=>{floor:number;waterDepth:number}|undefined){
 const root=new Group();root.name='r30-accepted-mine-creatures';parent.add(root);parent.updateWorldMatrix(true,true);
 const inverse=parent.matrixWorld.clone().invert(),factory=createR30MineCreatureFactory();
 const models=new Map(survey.groups.flatMap(g=>g.members.map(m=>{
  const model=factory.create(g.species);model.group.name=m.id;model.group.visible=false;root.add(model.group);
  return [m.id,model] as const;
 })));
 const prev=new Map<string,Vector3>(),travel=new Map<string,number>();let disposed=false,accepted=new Map<string,Actor>();
 const fragments=mountR30CreatureFragments(root);
 function sync(){
  if(disposed)return;
  const registered=bridge&&survey.buildSpawns(g=>bridge.acceptGroup(g)),snapshot=registered&&bridge?.readActors();
  const next=new Map<string,Actor>();
  for(const [id,model] of models){
   const ref=registered?.find(s=>s.id===id),matches=snapshot?.filter(s=>s.id===id),s=matches?.length===1?matches[0]:undefined;
   if(!ref||!s||ref.species!==s.species||ref.room!==s.room||!phases.has(s.phase)||
      !Number.isSafeInteger(s.remainingHits)||s.remainingHits<0||s.remainingHits>mineBestiary[s.species].hits||
      (s.phase==='defeated')!==(s.remainingHits===0)||![s.at.east,s.at.north].every(Number.isFinite)){
    model.group.visible=false;prev.delete(id);travel.delete(id);continue
   }
   const q=passage(s.at.east,s.at.north);
   if(!q||(s.species!=='rock-snake'&&q.waterDepth>0)){model.group.visible=false;prev.delete(id);travel.delete(id);continue}
   const p=new Vector3(s.at.east,q.floor,-s.at.north).applyMatrix4(inverse),old=prev.get(id);
   const distance=old?Math.hypot(p.x-old.x,p.z-old.z):0;
   if(!old)model.group.rotation.y=Math.PI;
   else if(distance>.0001)model.group.rotation.y=Math.atan2(old.x-p.x,old.z-p.z);
   const moved=distance<=2?(travel.get(id)??0)+distance:0;travel.set(id,moved);
   if(s.phase==='defeated'&&accepted.has(id)&&accepted.get(id)?.phase!=='defeated')fragments.burst(id,s.species,p);
   model.group.position.copy(p);model.pose(s.phase,s.remainingHits,moved);prev.set(id,p);next.set(id,s);
  }
  accepted=next;fragments.retain(new Set(next.keys()));fragments.sync();
 }
 sync();
 return {group:root,models,fragments,parts:[...models.values()].reduce((n,m)=>n+m.parts,0),sync,accepted:()=>[...accepted.values()].map(a=>structuredClone(a)),
  dispose(){if(disposed)return;disposed=true;fragments.dispose();models.forEach(m=>m.dispose());factory.dispose();root.removeFromParent();root.clear();prev.clear();travel.clear();accepted.clear()}};
}
