import {Group} from 'three';
import type {MainSummitTrailPoint} from './main-summit-trail';
import type {SouthGround,SouthProtection} from './town-night-a-summit-landform';
import {mountSouthEntry} from './town-night-a-summit-entry';
import {southGullySteps} from './town-night-a-summit-gully';
import {southRavineSteps} from './town-a33-south-ravine';
import {southForestSteps} from './town-night-a-summit-forest';
import {finishNightBAudit} from './town-night-b-audit-slices';
import {mountSouthTrailWorks} from './town-night-a-summit-road';
import type {mountSouthEarthworks} from './town-night-a-summit-road-earthworks';
import type {SouthSnowVisualSample} from './town-night-a-summit-snow-appearance';
/** One D2-owned mount in local coordinates. Caller must explicitly retire
 * the legacy overlapping southern vegetation, and if using road strips,
 * remove exactly their corresponding legacy tread. No automatic domain
 * transition, remote state or alternate height source. */
export function* southSectorSteps(input:{
 heightAt:SouthGround;reserved:SouthProtection;
 legacySouthVegetationExcluded:boolean;
 trailPoints?:readonly MainSummitTrailPoint[];
 legacyTreadExcluded?:boolean;
 /** Host consumes cutTread in canonical terrain/LOD/collision first. */
 earthworks?:ReturnType<typeof mountSouthEarthworks>;
 canonicalCutInstalled?:boolean;
}){
 if(!input.legacySouthVegetationExcluded)throw Error('Exclude legacy southern vegetation before attaching A');
 if((input.trailPoints||input.earthworks)&&!input.legacyTreadExcluded)throw Error('Exclude corresponding legacy tread before attaching A road');
 if(input.trailPoints&&input.earthworks)throw Error('Two southern road renderers requested');
 if(input.earthworks&&(!input.canonicalCutInstalled||input.earthworks.group.parent))throw Error('Install shared terrain cut and transfer an unattached road leaf');
 const group=new Group();group.name='night-a-south-sector';
 const leaves:{dispose():void}[]=[];let accepted=false;
 try{
 const entry=mountSouthEntry(input.heightAt);leaves.push(entry);yield;
 const gully=yield* southGullySteps(input.heightAt,input.reserved);leaves.push(gully);
 const forest=yield* southForestSteps(input.heightAt,input.reserved);leaves.push(forest);
 const ravine=yield* southRavineSteps(input.heightAt,input.reserved);leaves.push(ravine);
 const road=input.earthworks??(input.trailPoints?mountSouthTrailWorks(input.trailPoints,input.heightAt):undefined);
 if(road&&!input.earthworks)leaves.push(road);
 group.add(entry.group,gully.group,forest.group,ravine.group);if(road)group.add(road.group);
 let disposed=false;
 function updateSnow(dt:number,sample:SouthSnowVisualSample){
  if(disposed)return;entry.updateSnow(dt,sample);gully.updateSnow(dt,sample);forest.updateSnow(dt,sample);
 }
 group.userData.updateSouthSnow=updateSnow;accepted=true;
 return {group,entry,gully,forest,ravine,road,updateSnow,cutTread:input.earthworks?.cutTread,
 supportAt:(e:number,n:number)=>disposed?undefined:input.earthworks?.supportAt(e,n),
 blocked(e:number,n:number,h:number,r=.27,body=1.8){return !disposed&&(entry.blocked(e,n,h,r,body)||forest.blocked(e,n,h,r,body)||ravine.blocked(e,n,h,r,body)||!!road?.blocked(e,n,h,r,body));},
 updateView(e:number,n:number){if(!disposed)forest.updateView(e,n);},
 setNight(night:boolean){if(!disposed)entry.setNight(night);},
 dispose(){if(disposed)return;disposed=true;entry.dispose();gully.dispose();forest.dispose();ravine.dispose();road?.dispose();group.removeFromParent();group.clear();}};
 }finally{if(!accepted){for(const leaf of leaves.reverse())leaf.dispose();group.removeFromParent();group.clear();}}
}
export function mountSouthSector(input:Parameters<typeof southSectorSteps>[0]){return finishNightBAudit(southSectorSteps(input));}
