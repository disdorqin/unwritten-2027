import type {Group} from 'three';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import type {buildCraterRailExtension} from './town-crater-rail-extension';
import {installBR30Workface,surveyBR30Workface} from './town-b-r30-crater-workface';
import {installCraterWorkshopWorld,surveyCraterWorkstations} from './town-b-r30-crater-workstations';

type Road=ReturnType<typeof mountWestCraterRoad>;
type Rail=ReturnType<typeof buildCraterRailExtension>;
type Mounted={
  readonly face:ReturnType<typeof installBR30Workface>;
  readonly machines:ReturnType<typeof installCraterWorkshopWorld>;
  readonly addedRelicBoxes:number;
  dispose():void;
};
const mounted=new WeakMap<Group,Mounted>();

/** A's single post-rail attachment. Call once after the final west height
 * authority and legacy story refit, before building westWalkGeometry.
 * Existing floor/ramp arrays, guard/shaft state and authority remain owned
 * by the host. No second collision channel and no production E binding.
 */
export function attachBR30PhysicalKit(road:Road,rail:Rail):Mounted{
  const group=road.group;
  const prior=mounted.get(group);if(prior)return prior;
  const old=group.userData.colliders as Box[];
  if(!Array.isArray(old))throw Error('R30 requires the existing west collision channel');
  if(group.getObjectByName('b-r30-pit-workface')||group.getObjectByName('b-r30-crater-workstations'))
    throw Error('R30 physical kit must be the sole attachment owner');
  // Do not double-register S5 if the host already consumed the same boxes.
  const extra=road.midgroundS5.colliders.filter(b=>!old.includes(b));
  let face:Mounted['face']|undefined,machines:Mounted['machines']|undefined;
  try{
    group.userData.colliders=[...old,...extra];
    surveyBR30Workface(road);
    surveyCraterWorkstations(road,rail);
    face=installBR30Workface(road);
    machines=installCraterWorkshopWorld(road,rail);
    const f=face,m=machines;
    const kit:Mounted={face:f,machines:m,addedRelicBoxes:extra.length,dispose(){
      if(mounted.get(group)!==kit)return;
      mounted.delete(group);
      m.dispose();f.dispose();
      group.userData.colliders=(group.userData.colliders as Box[]).filter(b=>!extra.includes(b));
    }};
    mounted.set(group,kit);
    return kit;
  }catch(error){
    machines?.dispose();face?.dispose();
    group.userData.colliders=old;
    throw error;
  }
}
