import {Group,Vector3,Mesh,IcosahedronGeometry} from 'three';
import {createUndergroundOreVein,createUndergroundOreCoreMaterial} from './underground-ore-vein.js';
import type {surveyR30Ore} from './town-c-r30-ore-survey.js';
import type {R30OreInteraction} from './town-c-r30-ore-actions.js';
import {mountR30OreWallArt} from './town-c-r30-ore-wall-art.js';
import type {UndergroundMiningTargetView,UndergroundMiningCore} from '../../../src/shared/underground-mining.js';
type Survey=Extract<ReturnType<typeof surveyR30Ore>,{kind:'ready'}>;
const close=(a:{east:number;north:number;height:number},b:typeof a)=>Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height)<.00001;
export type R30OreBridge=Readonly<{
 acceptsSite(site:Survey['ordinary'][number]):boolean;
 readTargets():readonly UndergroundMiningTargetView[]|undefined;
 readCores():readonly UndergroundMiningCore[]|undefined;
 interaction?:R30OreInteraction;
}>;
/** World-space ore view; no input, pickaxe grants, fragment or core rewards. */
export function mountR30OreArt(parent:Group,survey:Survey,bridge?:R30OreBridge){
 const group=new Group();group.name='r30-authenticated-workface-ore';parent.add(group);
 parent.updateWorldMatrix(true,true);
 const inverse=parent.matrixWorld.clone().invert();
 const local=(p:{east:number;north:number;height:number})=>new Vector3(p.east,p.height,-p.north).applyMatrix4(inverse);
 const wallArt=mountR30OreWallArt(parent,survey);
 const veins=new Map(survey.ordinary.map(site=>{
  const at=site.target.at,n=site.normal;
  const vein=createUndergroundOreVein({id:site.target.id,face:local(at),
    normal:new Vector3(n.east,n.height,-n.north).transformDirection(inverse),ore:site.target});
  vein.group.visible=false;group.add(vein.group);return [site.target.id,vein] as const;
 }));
 const geometry=new IcosahedronGeometry(1,0),material=createUndergroundOreCoreMaterial('ordinary-ore');
 const cores=new Map<string,Mesh>();let accepted=new Map<string,UndergroundMiningTargetView>();
 function sync(){
  const targets=bridge?.readTargets()??[],next=new Map<string,UndergroundMiningTargetView>();
  for(const site of survey.ordinary){
   const ref=site.target,matching=targets.filter(t=>t.id===ref.id),t=matching.length===1?matching[0]:undefined;
   const valid=bridge?.acceptsSite(site)===true&&t&&t.kind==='ore'&&t.at.layer===ref.at.layer&&close(t.at,ref.at)&&
    t.mineral===ref.mineral&&t.surface===ref.surface&&t.strikes===ref.strikes&&
    Number.isSafeInteger(t.hits)&&t.hits>=0&&t.hits<=t.strikes&&t.open===(t.hits===t.strikes);
   const vein=veins.get(ref.id)!;vein.group.visible=!!valid;
   if(valid){vein.sync(t);next.set(t.id,t)}
  }
  accepted=next;
  const live=bridge?.readCores()??[],wanted=new Set<string>();
  for(const c of live){
   if(live.filter(x=>x.id===c.id).length!==1)continue;
   let source:unknown;try{source=JSON.parse(c.id)}catch{continue}
   if(!Array.isArray(source)||source.length!==2||typeof source[0]!=='string'||!Number.isSafeInteger(source[1])||source[1]<0)continue;
   const site=survey.ordinary.find(s=>s.target.id===source[0]);
   if(!site||!accepted.has(site.target.id)||c.at.layer!==site.layer||!close(c.at,site.coreAt)||c.mineral!==site.marker.mineral||c.amount!==site.marker.amount)continue;
   wanted.add(c.id);
   if(!cores.has(c.id)){
    const mesh=new Mesh(geometry,material);mesh.name='accepted-ore-core:'+c.id;
    mesh.position.copy(local({...c.at,height:c.at.height+.14}));mesh.scale.set(.16,.14,.18);group.add(mesh);cores.set(c.id,mesh);
   }
  }
  for(const [id,mesh] of cores)if(!wanted.has(id)){mesh.removeFromParent();cores.delete(id)}
 }
 sync();
 return {group,veins,cores,wallArt,sync,targets:()=>[...accepted.values()].map(t=>structuredClone(t)),
  dispose(){wallArt.dispose();for(const vein of veins.values())vein.dispose();geometry.dispose();material.dispose();group.removeFromParent();group.clear();cores.clear();accepted.clear()}};
}
