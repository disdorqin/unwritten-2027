import {Group} from 'three';
import type {MainSummitTrailPoint} from './main-summit-trail';
import type {SouthGround,SouthProtection} from './town-night-a-summit-landform';
import {mountSouthEntry} from './town-night-a-summit-entry';
import {mountSouthGully} from './town-night-a-summit-gully';
import {mountSouthForest} from './town-night-a-summit-forest';
import {mountSouthTrailWorks} from './town-night-a-summit-road';
/** One D2-owned mount in local coordinates. Caller must explicitly retire
 * the legacy overlapping southern vegetation, and if using road strips,
 * remove exactly their corresponding legacy tread. No automatic domain
 * transition, remote state or alternate height source. */
export function mountSouthSector(input:{
 heightAt:SouthGround;reserved:SouthProtection;
 legacySouthVegetationExcluded:boolean;
 trailPoints?:readonly MainSummitTrailPoint[];
 legacyTreadExcluded?:boolean;
}){
 if(!input.legacySouthVegetationExcluded)throw Error('Exclude legacy southern vegetation before attaching A');
 if(input.trailPoints&&!input.legacyTreadExcluded)throw Error('Exclude corresponding legacy tread before attaching A road');
 const group=new Group();group.name='night-a-south-sector';
 const entry=mountSouthEntry(input.heightAt),gully=mountSouthGully(input.heightAt,input.reserved),forest=mountSouthForest(input.heightAt,input.reserved);
 const road=input.trailPoints?mountSouthTrailWorks(input.trailPoints,input.heightAt):undefined;
 group.add(entry.group,gully.group,forest.group);if(road)group.add(road.group);
 let disposed=false;
 return {group,entry,gully,forest,road,
 blocked(e:number,n:number,h:number,r=.27,body=1.8){return entry.blocked(e,n,h,r,body)||forest.blocked(e,n,h,r,body)||!!road?.blocked(e,n,h,r,body);},
 updateView(e:number,n:number){forest.updateView(e,n);},
 setNight(night:boolean){entry.setNight(night);},
 dispose(){if(disposed)return;disposed=true;entry.dispose();gully.dispose();forest.dispose();road?.dispose();group.removeFromParent();group.clear();}};
}
