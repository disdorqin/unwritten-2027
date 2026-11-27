import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import type {MineCreature} from '../../../src/shared/mine-bestiary.js';
type Burst={id:string;species:MineCreature;at:Vector3;start:number};
const colors:Record<MineCreature,number>={'snow-clump':0xc6d5dd,'skeleton-miner':0xb9b7a2,'zombie-miner':0x657064,'rock-snake':0x626b67,'crystal-bat':0x7896a6};
/** One bounded effect batch, triggered only by a previously seen actor's
 * confirmed transition to defeated. Fragments are not drops or colliders. */
export function mountR30CreatureFragments(parent:Group,now=()=>performance.now()){
 const geometry=new BoxGeometry(),material=new MeshLambertMaterial();
 const mesh=new InstancedMesh(geometry,material,28*8);mesh.name='r30-noncollectible-defeat-fragments';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;
 mesh.raycast=()=>{};parent.add(mesh);
 const active=new Map<string,Burst>(),matrix=new Matrix4(),q=new Quaternion(),axis=new Vector3(0,1,0),c=new Color(),position=new Vector3(),scale=new Vector3();
 function burst(id:string,species:MineCreature,at:Vector3){active.set(id,{id,species,at:at.clone(),start:now()})}
 function sync(){
  let index=0;const time=now();
  for(const [id,b] of active){
   const t=Math.max(0,(time-b.start)/1000);
   if(t>=.85){active.delete(id);continue}
   for(let i=0;i<8&&index<28*8;i++){
    const a=i*Math.PI/4,spread=.10+t*.45,dy=Math.max(.025,.11+.48*t-.75*t*t);
    position.copy(b.at).add(new Vector3(Math.cos(a)*spread,dy,Math.sin(a)*spread));
    const s=.10*(1-t/.85);scale.set(s,s*.75,s);
    matrix.compose(position,q.setFromAxisAngle(axis,a+t*2),scale);mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,c.setHex(colors[b.species]));index++;
   }
  }
  mesh.count=index;mesh.visible=index>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 }
 return {mesh,burst,sync,retain(ids:ReadonlySet<string>){for(const id of active.keys())if(!ids.has(id))active.delete(id)},clear(){active.clear();sync()},dispose(){active.clear();mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose()}};
}
