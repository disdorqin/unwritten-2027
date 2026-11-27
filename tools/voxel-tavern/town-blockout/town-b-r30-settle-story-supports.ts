import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import type {buildZa36CraterStoryDressing} from './town-za36-crater-story-dressing';

type Ground=(east:number,north:number)=>number|undefined;
type Story=ReturnType<typeof buildZa36CraterStoryDressing>;
const prefix='za36-dressing-';
const nonSolidKinds=new Set(['prop','timber','scorch','marker','black-rock','ice','rust']);

/** Old story stamps were made before the in-place rockfall cut. Refit only
 * demonstrably floating, non-colliding pieces on the FINAL ground. Preserve
 * their horizontal coordinates, rotation, material and all solid/story
 * authority. A lamp is never processed by this adapter. */
export function settleBR30StorySupports(group:Group,heightAt:Ground){
  const story=group.name==='za36-crater-story-dressing'?group:group.getObjectByName('za36-crater-story-dressing');
  const changes:{batch:string;index:number;east:number;north:number;before:number;after:number;drop:number}[]=[];
  const matrix=new Matrix4(),v=new Vector3();
  function gap(mesh:InstancedMesh,m:Matrix4){
    const positions=mesh.geometry.getAttribute('position');
    let clearance=Infinity;
    for(let j=0;j<positions.count;j++){
      v.fromBufferAttribute(positions,j).applyMatrix4(m);
      const h=heightAt(v.x,-v.z);
      // No height authority means this instance cannot be repaired safely.
      if(h===undefined||!Number.isFinite(h))return undefined;
      clearance=Math.min(clearance,v.y-h);
    }
    return clearance;
  }
  if(!story)return changes;
  for(const mesh of story.children){
    if(!(mesh instanceof InstancedMesh)||!mesh.name.startsWith(prefix))continue;
    const [band,kind]=mesh.name.slice(prefix.length).split(':');
    if(!nonSolidKinds.has(kind)||!['trail','terrace','floor'].includes(band))continue;
    let changed=false;
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);
      const before=gap(mesh,matrix);
      if(before===undefined||before<=.10)continue;
      const drop=before+.035;
      matrix.elements[13]-=drop;
      const after=gap(mesh,matrix);
      if(after===undefined||after>.01||after<-.06)throw Error('R30 support did not meet its surveyed surface');
      mesh.setMatrixAt(i,matrix);changed=true;
      changes.push({batch:mesh.name,index:i,east:matrix.elements[12],north:-matrix.elements[14],before,after,drop});
    }
    if(changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();}
  }
  return changes;
}
/** Production call after the in-place cut, before other users of the story
 * placements. Only the visual instances above move; metadata retains the
 * same anchor coordinates, and reports the FINAL ground at each moved site. */
export function refitBR30LegacyStory(story:Story,heightAt:Ground){
  const changes=settleBR30StorySupports(story.group,heightAt);
  const placements=story.placements.map(p=>{
    if(!changes.some(c=>Math.abs(c.east-p.east)<1e-4&&Math.abs(c.north-p.north)<1e-4&&c.batch===prefix+p.band+':'+p.kind))return p;
    const h=heightAt(p.east,p.north);return h===undefined?p:{...p,height:h};
  });
  return {story:{...story,placements},changes};
}
