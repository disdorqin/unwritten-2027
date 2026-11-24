/** Placement inventory ONLY. Existing water/encounter rotation and spawn authority are untouched.
 * Source: 设计-地下遭遇组逐层配表-2026-11-22, batch 56; batch 94 retains GPT-C scope. */
import {secondMineDrySites} from './underground-second-mine-dry-wings.js';
import {createFirstMineWorkfaces,firstMineMiddleSnowSites,firstMineWaterlineSite} from './town-c-first-mine-workfaces.js';
export type EncounterLayer='90-main'|'90-crystal'|'140'|'165'|'190';
type Family={id:string;layer:EncounterLayer;species:string;habitats:readonly string[];members:readonly [number,number];spacing?:readonly [number,number];safeDistance?:number};
const families:readonly Family[]=[
  {id:'90-A',layer:'90-main',species:'snow-clump',habitats:[...Array(4).fill('shallow-snow'),...Array(2).fill('middle-snow')],members:[3,5],spacing:[40,60],safeDistance:30},
  {id:'90-B',layer:'90-main',species:'skeleton-miner',habitats:Array(5).fill('workface'),members:[1,1],safeDistance:30},
  {id:'90-C',layer:'90-main',species:'zombie-miner',habitats:Array(2).fill('deep-mine'),members:[1,2],safeDistance:30},
  {id:'90-D',layer:'90-main',species:'rock-snake',habitats:Array(3).fill('waterline'),members:[1,1],safeDistance:30},
  {id:'crystal-A',layer:'90-crystal',species:'crystal-bat',habitats:Array(3).fill('ceiling-roost'),members:[6,10],spacing:[25,40]},
  {id:'crystal-B',layer:'90-crystal',species:'crystal-mimic',habitats:Array(2).fill('grove-edge'),members:[1,1]},
  {id:'140-A',layer:'140',species:'zombie-miner',habitats:['upper','upper','collapse','old-barracks'],members:[1,2],spacing:[70,100],safeDistance:30},
  {id:'140-B',layer:'140',species:'rock-snake',habitats:['near-bank','near-bank','far-bank','far-bank'],members:[1,1],safeDistance:30},
  {id:'165-A',layer:'165',species:'stone-monster',habitats:['residential','residential','square-edge'],members:[1,1]},
  {id:'165-B',layer:'165',species:'skeleton-warrior',habitats:['gate-plinth-patrol','gate-plinth-patrol'],members:[1,1]},
  {id:'165-C',layer:'165',species:'ice-golem',habitats:['cold-transition'],members:[1,1],safeDistance:30},
  {id:'190-A',layer:'190',species:'ice-golem',habitats:['outer-corridor'],members:[1,1]},
];
type Point=Readonly<{east:number;north:number;height?:number}>;
const local140:readonly Point[]=[{east:-42,north:124},{east:42,north:124},{east:-44,north:149},{east:44,north:149}];
const cityStone:readonly Point[]=[{east:30,north:-5},{east:55,north:5},{east:118,north:-19}];
const cityPatrol:readonly Point[]=[{east:13,north:-3},{east:13,north:3}];
// Measured on actual U3 crown underside and rock tile tops, not live ore registry.
const crystalRoosts:readonly Point[]=[
 {east:0,north:22.08,height:27.92007657498973},
 {east:0,north:53.16,height:23.898684675147155},
 {east:0,north:84.24,height:28.5693949958759},
];
const crystalMimics:readonly Point[]=[
 {east:-27.18,north:40.3,height:-1.5195218820687295},
 {east:31.22,north:43.2,height:-1.6390682011914437},
];
// Canonical layout frame: +Z goes down the registered main mine, not ENY north.
// Survey only. No live encounter registration until safe/ore masks are accepted.
const firstMineWorkfaceSites=createFirstMineWorkfaces({minX:-100,maxX:100,minZ:45,maxZ:140},-91);
function localCandidate(family:string,i:number){
  if(family==='90-B'){
    const [x,y,z]=firstMineWorkfaceSites[i].foot;
    return {frame:'first-mine-local-plus-z-candidate' as const,at:{east:x,north:z,height:y}};
  }
  if(family==='90-A'&&i>=4){const p=firstMineMiddleSnowSites[i-4];return {frame:'first-mine-local-plus-z-candidate' as const,at:{east:p.x,north:p.z,height:p.y}};}
  if(family==='90-D'&&i===0){const p=firstMineWaterlineSite;return {frame:'first-mine-local-plus-z-candidate' as const,at:{east:p.x,north:p.z,height:p.y}};}
  if(family==='crystal-A')return {frame:'first-mine-crystal-local-candidate' as const,at:crystalRoosts[i]};
  if(family==='crystal-B')return {frame:'first-mine-crystal-local-candidate' as const,at:crystalMimics[i]};
  if(family==='190-A')return {frame:'palace-shell-local-candidate' as const,at:{east:12,north:58,height:-2.4}};
  if(family==='140-A')return {frame:'second-mine-local-candidate' as const,at:Object.values(secondMineDrySites)[i]};
  if(family==='140-B')return {frame:'second-mine-local-candidate' as const,at:local140[i]};
  if(family==='165-A')return {frame:'warrior-city-local-candidate' as const,at:cityStone[i]};
  if(family==='165-B')return {frame:'warrior-city-local-candidate' as const,at:cityPatrol[i],
    patrol:[cityPatrol[i],{east:82,north:cityPatrol[i].north}]};
  if(family==='165-C')return {frame:'warrior-city-local-candidate' as const,at:{east:171,north:-4.5}};
  return undefined;
}
export const encounterPlacementPlan=families.flatMap(f=>f.habitats.map((habitat,i)=>Object.freeze({
  id:f.id+'-'+String(i+1).padStart(2,'0'),family:f.id,layer:f.layer,species:f.species,habitat,members:f.members,
  spacing:f.spacing,safeDistance:f.safeDistance,
  candidate:localCandidate(f.id,i),
  status:'awaiting-registered-survey' as const,
})));
/** No method here promotes an unregistered point into a live spawn. */
export const encounterPlacementTotals=Object.freeze(Object.fromEntries(
  (['90-main','90-crystal','140','165','190'] as const).map(layer=>[layer,encounterPlacementPlan.filter(g=>g.layer===layer).length])));
