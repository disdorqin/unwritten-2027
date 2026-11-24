import {Group,InstancedMesh,Matrix4,Vector3,Color} from 'three';
import {createWarriorCityShell} from './underground-warrior-city-shell.js';
import {mountWarriorStoneDistrict} from './underground-warrior-stone-district.js';
import {createWarriorForgeHall,warriorForgeHallSite} from './underground-warrior-forge-hall.js';
import {createWarriorSquare} from './underground-warrior-square.js';
/** Offline candidate assembly, not a production registration or authority port.
 * Reuses existing canonical assets, at their actual relative ENY positions. */
export function createWarriorCityCandidate(){
 const group=new Group();group.name='u10-local-full-city-review';
 const shell=createWarriorCityShell();group.add(shell.group);
 const district=mountWarriorStoneDistrict({
   parent:group,site:{domainId:'review-only/u10-full-city',east:0,north:0,height:0,yaw:0},
   supportsDistrict:()=>true,supportsFoot:()=>true,acceptsSolidWorldBox:()=>true,
   readViewer:()=>undefined,canUse:()=>false,readActionRevision:()=>undefined,nextActionRequestId:()=>undefined,
   dispatch:()=>{},readLightBudget:()=>0,
 });
 if(district.kind!=='ready'){shell.dispose();throw Error('existing city district '+district.kind)}
 const forge=createWarriorForgeHall({...warriorForgeHallSite,height:0});group.add(forge.group);
 const square=createWarriorSquare();square.group.position.y+=165;group.add(square.group);
 const squareBoxes=square.colliders.map(b=>({min:[b.min[0],b.min[1]+165,b.min[2]],max:[b.max[0],b.max[1]+165,b.max[2]]}));
 const colliders=[...district.colliders,...forge.colliders,...squareBoxes];
 function canStand(e:number,n:number,y=0,r=.27){
   if(!shell.canStand(e,n,y,r))return false;
   return !colliders.some(b=>b.max[1]>y+.025&&b.min[1]<y+1.8&&Math.hypot(Math.max(0,b.min[0]-e,e-b.max[0]),Math.max(0,b.min[2]+n,-n-b.max[2]))<r);
 }
 // Split legacy all-city material batches without altering the canonical
 // district builder, station authority, matrices, material or colliders.
 const spatialChunks:InstancedMesh[]=[];
 const transform=new Matrix4(),position=new Vector3(),color=new Color();
 for(const child of [...district.group.children]){
   if(!(child instanceof InstancedMesh))continue;
   const buckets=new Map<number,number[]>();
   for(let i=0;i<child.count;i++){
     child.getMatrixAt(i,transform);position.setFromMatrixPosition(transform);
     const key=Math.floor(position.x/24);const list=buckets.get(key)??[];list.push(i);buckets.set(key,list);
   }
   for(const [key,indices] of buckets){
     const chunk=new InstancedMesh(child.geometry,child.material,indices.length);
     chunk.name=child.name+'/sector-'+key;
     for(const [i,j] of indices.entries()){
       child.getMatrixAt(j,transform);chunk.setMatrixAt(i,transform);
       if(child.instanceColor){child.getColorAt(j,color);chunk.setColorAt(i,color);}
     }
     chunk.computeBoundingSphere();district.group.add(chunk);spatialChunks.push(chunk);
   }
   child.visible=false;
 }
 let instancedPieces=0;group.traverse(o=>{if(o instanceof InstancedMesh&&o.visible)instancedPieces+=o.count});
 return {group,shell,district,forge,square,canStand,colliders,instancedPieces,spatialChunks,
   dispose(){group.removeFromParent();for(const chunk of spatialChunks){chunk.removeFromParent();chunk.dispose();}
     square.dispose();forge.dispose();district.dispose();shell.dispose();group.clear();}};
}
