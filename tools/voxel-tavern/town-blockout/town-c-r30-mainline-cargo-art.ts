import {BoxGeometry,Group,Color,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {U19MineCartSnapshot} from '../../../src/presence/underground-mainline-cart.js';
/** A bounded visual projection, not an inventory or capacity counter.
 * Large accepted quantities fill the same bin rather than spawning meshes. */
export function mountR30MainlineCargoArt(parent:Group){
 const root=new Group();root.name='r30-accepted-cart-cargo';parent.add(root);
 const geo=new BoxGeometry(),map=makeCampGrain('rock'),mat=new MeshLambertMaterial({map});
 const mesh=new InstancedMesh(geo,mat,36);mesh.name='r30-ore-bin-visual';mesh.count=0;root.add(mesh);
 let previous='';
 const sync=(cargo?:U19MineCartSnapshot['cargo'])=>{
  const valid=!!cargo&&Number.isSafeInteger(cargo.pieces)&&cargo.pieces>0&&typeof cargo.oreId==='string'&&cargo.oreId.trim().length>0;
  const key=valid?cargo.oreId+':'+cargo.pieces:'';
  if(previous===key)return;previous=key;
  root.visible=valid;mesh.count=valid?Math.min(36,cargo.pieces*3):0;
  if(!valid)return;
  let seed=0;for(const c of cargo.oreId)seed=(seed*31+c.charCodeAt(0))>>>0;
  const palette=[0x64717b,0x7a6856,0x525e68,0x968b78,0x6d7673];
  const m=new Matrix4(),q=new Quaternion(),c=new Color();
  for(let i=0;i<mesh.count;i++){
   const slot=(i*5)%12,level=Math.floor(i/12);
   const x=(slot%3-1)*.175,z=(Math.floor(slot/3)-1.5)*.19;
   const y=.412+level*.087,angle=(i*17+seed%23)*.071;
   m.compose(new Vector3(x,y,z),q.setFromAxisAngle(new Vector3(0,1,0),angle),new Vector3(.145,.080+(i%3)*.010,.15));
   mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(palette[(seed+i*7)%palette.length]));
  }
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
 };
 root.visible=false;
 return {group:root,mesh,sync,dispose(){root.removeFromParent();mesh.dispose();geo.dispose();mat.dispose();map.dispose();root.clear()}};
}
