import {Box3,Group,Vector3,type Object3D} from 'three';
import {createTownD2R30Ropeway} from './town-d2-r30-ropeway';
import {createTownD2R30CableTowers} from './town-d2-r30-cable-towers';
import {mountMainSummitCableWorkshop,mainSummitR30CableWorkshopAnchor} from './main-summit-cable-workshop';
import {installNightBUpperOperation} from './town-night-b-summit-upper-install';
import {stageNightBCablePaintClearance} from './town-night-b-cable-paint-clearance';
import {createNightBMountedClearance} from './town-night-b-mounted-clearance';
import type {nightBProductionAuthority} from './town-night-b-production-controller';
import {applyTownD2R30NightTint} from './town-d2-r30-night-lights';
type Foot={east:number;north:number;height:number};
type Ground=(e:number,n:number)=>number|undefined;
type Dock={station:'cloud-deck'|'summit';cabin:0|1;board:Foot;approach:Foot};
type Input={
 owner:Group;groundAt:Ground;supportAt:Ground;
 blocked:(e:number,n:number,h:number,r:number,body:number)=>boolean;
 /** The actual canonical near tiles and known non-solid terrain-only LODs.
  * Never exclude a building, tree, bridge, guardrail or previous machine room. */
 groundMeshes:readonly Object3D[];
 authority:ReturnType<typeof nightBProductionAuthority>;
 /** Host certifies actual continuous path from its route network to each
  * approach and every repair anchor, using the supplied combined collider. */
 certifyRoutes:(docks:readonly Dock[],repair:ReturnType<typeof mountMainSummitCableWorkshop>['repairAnchors'],supportAt:Ground,blocked:Input['blocked'])=>boolean;
 authorized:boolean;
};
/** D2 calls inside the actual production owner after A/B/C2 have landed.
 * On rejection no second rope, old hall, or partial operation remains.
 * On success expose this exact package through installCable/cableOperation;
 * update is deliberately absent: the public B controller is the sole writer. */
export function mountNightBPublicRearCable(input:Input){
 const owner=input.owner,group=new Group();group.name='night-b-public-rear-cable';
 if(owner.getObjectByName(group.name))throw Error('Rear production cable already mounted');
 const existing=owner.getObjectByName('town-d2-r30-ropeway')||owner.getObjectByName('town-d2-r30-cable-towers')||owner.getObjectByName('main-summit-cable-machine-workshop')||owner.getObjectByName('main-summit-machine-room');
 if(existing)return {ready:false as const,reason:'existing-legacy-cable-or-machine-room:'+existing.name};
 const ropeway=createTownD2R30Ropeway({heightAt:input.groundAt,controlPointSupports:false});
 const corridor=ropeway.cable.ropes.flatMap(r=>r.points.slice(1).map((p,i)=>{const a=r.points[i]!;return new Box3().setFromPoints([new Vector3(a.east,a.height,-a.north),new Vector3(p.east,p.height,-p.north)]).expandByScalar(5);}));
 let paint:ReturnType<typeof stageNightBCablePaintClearance>|undefined;
 let scan:ReturnType<typeof createNightBMountedClearance>;
 let towers:ReturnType<typeof createTownD2R30CableTowers>|undefined,workshop:ReturnType<typeof mountMainSummitCableWorkshop>|undefined,op:ReturnType<typeof installNightBUpperOperation>|undefined;
 let disposed=false,accepted=false;
 function dispose(){if(disposed)return;disposed=true;op?.dispose();workshop?.dispose();towers?.dispose();ropeway.dispose();paint?.restore();group.removeFromParent();group.clear();}
 try{
  paint=stageNightBCablePaintClearance(owner,ropeway,input.groundAt);
  // The original summit plume is atmospheric, not a solid body. Keep
  // its visible geometry and exclude only this precisely identified layer.
  const plume=owner.getObjectByName('main-summit-banner-cloud');
  const plumeMesh=plume?.getObjectByName('banner-cloud-segments') as (Object3D&{isInstancedMesh?:boolean;material?:{transparent?:boolean}})|undefined;
  const atmospheric=plume&&plumeMesh?.isInstancedMesh&&plumeMesh.material?.transparent===true&&plume.children.length===1&&!plume.userData.colliders?[plume]:[];
  scan=createNightBMountedClearance(owner,[...input.groundMeshes,...atmospheric],corridor);
  towers=createTownD2R30CableTowers({heightAt:input.groundAt,cable:ropeway.cable});
  group.add(ropeway.group,towers.group);owner.add(group);
  workshop=mountMainSummitCableWorkshop(group,input.groundAt,mainSummitR30CableWorkshopAnchor);
  const t=towers,w=workshop;
  const supportAt:Ground=(e,n)=>{const hs=[input.supportAt(e,n),ropeway.supportAt(e,n),w.surfaceAt(e,n)].filter((h):h is number=>h!==undefined&&Number.isFinite(h));return hs.length?Math.max(...hs):undefined;};
  const blocked:Input['blocked']=(e,n,h,r,b)=>input.blocked(e,n,h,r,b)||ropeway.blocked(e,n,h,r,b)||t.blocked(e,n,h,r,b)||w.blocked(e,n,h,r,b);
  const dockClear=(_s:string,p:Foot)=>Math.abs((supportAt(p.east,p.north)??Infinity)-p.height)<=.08&&!blocked(p.east,p.north,p.height,.27,1.8);
  op=installNightBUpperOperation({...input.authority,authorized:input.authorized,ropeway,towers:t,workshop:w,groundAt:input.groundAt,
   externalBlocked:p=>{
    if(scan.blocked(p))return true;
    const c=Math.cos(p.heading),s=Math.sin(p.heading);
    for(let i=0;i<=6;i++)for(let j=0;j<=8;j++){
     const x=(i/3-1)*p.halfWidth,z=(j/4-1)*p.halfLength;
     if(input.blocked(p.feet.east+x*c+z*s,p.feet.north-x*s+z*c,p.feet.height,.025,p.bodyTop))return true;
    }return false;
   },
   dockClear,certifyApproaches:docks=>input.certifyRoutes(docks,w.repairAnchors,supportAt,blocked)});
  if(!op.ready)return {ready:false as const,reason:op.reason,audit:op.audit,docks:op.docks,meshAudit:scan.stats(),paintTrianglesRemoved:paint.removed};
  accepted=true;
  return {ready:true as const,certified:true,boardable:true,group,cableOperation:op,stations:op.docks,
   supportAt:(e:number,n:number,r=.27)=>{const a=ropeway.supportAt(e,n),b=w.surfaceAt(e,n,r);return a===undefined?b:b===undefined?a:Math.max(a,b);},
   blocked:(e:number,n:number,h:number,r=.27,b=1.8)=>ropeway.blocked(e,n,h,r,b)||t.blocked(e,n,h,r,b)||w.blocked(e,n,h,r,b),
   setNight(night:boolean){ropeway.setNight(night);t.setNight(night);applyTownD2R30NightTint(w.group,night);},dispose,meshAudit:scan.stats(),paintTrianglesRemoved:paint.removed};
 }finally{if(!accepted)dispose();}
}
