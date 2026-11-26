import {encounterPlacementPlan} from '../../../src/shared/underground-encounter-placement-plan.js';
import {mineBestiary,type MineCreature,type createMineBestiaryEncounter} from '../../../src/shared/mine-bestiary.js';
import {isMinePresenceFoot} from '../../../src/shared/underground-mine-presence-domain.js';
import type {surveyR30Ore} from './town-c-r30-ore-survey.js';
type Point=Readonly<{east:number;north:number;height:number}>;
type Local=readonly [number,number,number];
type Survey=Extract<ReturnType<typeof surveyR30Ore>,{kind:'ready'}>;
type Spawn=Parameters<typeof createMineBestiaryEncounter>[0][number];
type Passage=Readonly<{floor:number;waterDepth:number}>;
const dist=(a:Point,b:Point)=>Math.hypot(a.east-b.east,a.north-b.north);
export type R30EncounterSite=Readonly<{id:string;species:MineCreature;habitat:Spawn['habitat'];center:Point;members:readonly {id:string;at:Point}[]}>;
/** Survey only. A host assigns real logical rooms and acknowledges each
 * member before it is handed to the existing mine encounter authority.
 * No locally fabricated combat, respawn or health state. */
export function surveyR30Encounters(toWorld:(p:Local)=>Point,passage:(p:Point)=>Passage|undefined,ore:Survey,safe:readonly Point[]){
 const groups:R30EncounterSite[]=[],failures:string[]=[];
 for(const g of encounterPlacementPlan.filter(g=>g.layer==='90-main')){
  if(!g.candidate||!Object.hasOwn(mineBestiary,g.species)){failures.push(g.id+':missing-plan');continue}
  const species=g.species as MineCreature,habitat=mineBestiary[species].site;
  const a=g.candidate.at;if(!('height' in a)||a.height===undefined){failures.push(g.id+':height');continue}
  const center=toWorld([a.east,a.height,a.north]);
  const offsets=species==='snow-clump'?[[0,0],[-.63,.38],[.63,.38]]:[[0,0]];
  const members:{id:string;at:Point}[]=[];
  for(const [i,[dx,dz]] of offsets.entries()){
   const raw=toWorld([a.east+dx,a.height,a.north+dz]),q=passage(raw);
   if(!q||Math.abs(q.floor-raw.height)>.01||!isMinePresenceFoot(raw.east,raw.north,q.floor)||
      (species!=='rock-snake'&&q.waterDepth>0)||safe.some(p=>dist(p,raw)<30)||
      (species==='snow-clump'&&ore.ordinary.some(o=>dist(o.target.at,raw)<15))||
      (species==='zombie-miner'&&ore.ordinary.some(o=>dist(o.target.at,raw)<20))){
    failures.push(g.id+'/'+(i+1)+':unsupported-or-mask');continue
   }
   members.push({id:'mine1/'+g.id+'/'+(i+1),at:{...raw,height:q.floor}});
  }
  if(members.length!==offsets.length)continue;
  groups.push({id:g.id,species,habitat,center,members});
 }
 const skeletons=groups.filter(g=>g.species==='skeleton-miner');
 for(const s of ore.ordinary){
  const nearby=skeletons.filter(g=>dist(g.center,s.target.at)<=25);
  if(nearby.length!==1)failures.push(s.marker.id+':workface-mask');
 }
 // Partial survey may be useful for correction but never becomes a
 // partial clear-gate population. All sixteen groups must be present.
 const ready=failures.length===0&&groups.length===16;
 function buildSpawns(accept:(group:R30EncounterSite)=>string|undefined):readonly Spawn[]|undefined{
  if(!ready)return;
  const rows:Spawn[]=[],counts=new Map<string,number>();
  for(const g of groups){
   const room=accept(g);if(!room||!room.trim())return;
   for(const m of g.members){
    const key=g.species+'/'+room,count=(counts.get(key)??0)+1;counts.set(key,count);
    if(g.species==='snow-clump'&&count>5)return;
    rows.push({id:m.id,species:g.species,habitat:g.habitat,room,at:{east:m.at.east,north:m.at.north}});
   }
  }
  return rows;
 }
 return {ready,groups,failures,buildSpawns};
}
