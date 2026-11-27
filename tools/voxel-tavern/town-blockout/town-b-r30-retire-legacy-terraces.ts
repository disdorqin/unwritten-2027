import {Group,InstancedMesh} from 'three';
import type {buildZa36CraterStoryDressing} from './town-za36-crater-story-dressing';

const batchName='za36-dressing-terrace:plate';
const isOldPlate=(p:{kind:string;band:string;cluster:string})=>p.kind==='plate'&&p.band==='terrace'&&/^band-L[123]$/.test(p.cluster);

/** Narrow R30 retirement of the old, non-colliding flat terrace skin.
 * No lamp, winch, sign, crystal, prop or story anchor is removed. The
 * new rock/haul material already lives on the actual walking surface.
 * Geometry/material are shared by the legacy builder: do not dispose. */
export function stripBR30LegacyTerraceMesh(group:Group){
  const mesh=group.getObjectByName(batchName);
  if(!mesh)return 0;
  if(!(mesh instanceof InstancedMesh))throw Error('Unexpected legacy terrace batch');
  const count=mesh.count;
  mesh.removeFromParent();
  return count;
}
type Story=ReturnType<typeof buildZa36CraterStoryDressing>;
/** A-owned road host calls this before story reservations/collision
 * consumers, so obsolete plates are not left as phantom keep-outs. */
export function retireBR30LegacyTerracePlates(story:Story):Story{
  const all=story.placements.filter(p=>p.kind==='plate'&&p.band==='terrace');
  if(all.some(p=>!isOldPlate(p)))throw Error('Do not retire an unrecognized story plate');
  const mesh=story.group.getObjectByName(batchName);
  if(all.length&&(!(mesh instanceof InstancedMesh)||mesh.count!==all.length))
    throw Error('Legacy terrace instance/placement mismatch');
  stripBR30LegacyTerraceMesh(story.group);
  return {...story,placements:story.placements.filter(p=>!isOldPlate(p)),
    batches:story.batches.filter(b=>b!=='terrace:plate')};
}
