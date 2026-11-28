import {Group} from 'three';
import {applyTownD2R30NightTint} from './town-d2-r30-night-lights';
import {finishNightBAudit} from './town-night-b-audit-slices';
import {nightBWestRoadSteps} from './town-night-b-summit-west-road';
import {createNightBWestDressing,nightBWestDressingSteps} from './town-night-b-summit-west-dressing';
import {createNightBWestPavilion,findNightBWestPavilionSite} from './town-night-b-summit-west-pavilion';
import {inNightBWest,type WestReserve} from './town-night-b-summit-west-relief';
import type {MainSummitTrailPoint} from './main-summit-trail';
type Height=(e:number,n:number)=>number|undefined;
/** D2 passes the final shared surface and C2's full ordered centreline.
 * No second ground mesh, old upper-cloud pavilion, road or forest may be
 * mounted in the same ownership. The cutTread is for the canonical cutter. */
export function* nightBWestSectorSteps(heightAt:Height,trail:readonly MainSummitTrailPoint[],externalReserve:WestReserve=()=>false){
 const group=new Group();group.name='night-b-west-sector';
 const site=findNightBWestPavilionSite(trail,heightAt,externalReserve);
 if(!site)throw new RangeError('No certified west pavilion candidate on supplied trail');
 const approach=site.approach;
 const inEntrance=(e:number,n:number,r:number)=>{
  const de=e-approach.east,dn=n-approach.north,along=de*site.viewEast+dn*site.viewNorth,cross=-de*site.viewNorth+dn*site.viewEast;
  return along>0&&along<3+r&&Math.abs(cross)<1.2+r;
 };
 const road=yield* nightBWestRoadSteps(trail,heightAt,inEntrance);
 let pavilion:ReturnType<typeof createNightBWestPavilion>|undefined,dressing:ReturnType<typeof createNightBWestDressing>|undefined;
 try{
  pavilion=createNightBWestPavilion(site,heightAt);yield;
  const reserve:WestReserve=(e,n,r)=>externalReserve(e,n,r)||road.reserved(e,n,r)||Math.hypot(e-site.east,n-site.north)<=7+r||inEntrance(e,n,r)||Math.hypot(e-approach.east,n-approach.north)<=3+r;
  dressing=yield* nightBWestDressingSteps(heightAt,reserve);
  const p=pavilion,d=dressing;group.add(road.group,p.group,d.group);
  let disposed=false,night=false;
  return {group,road,pavilion:p,dressing:d,reserved:reserve,cutTread:road.cutTread,
   supportAt(e:number,n:number,r=.27){
    if(!inNightBWest(e,n))return;
    const a=road.surfaceAt(e,n),b=p.supportAt(e,n,r);
    return a===undefined?b:b===undefined?a:Math.max(a,b);
   },
   blocked(e:number,n:number,h:number,r=.27,body=1.8){return road.blocked(e,n,h,r,body)||p.blocked(e,n,h,r,body)||d.blocked(e,n,h,r,body);},
   updateView:d.updateView,
   setNight(value:boolean){if(disposed||night===value)return;night=value;applyTownD2R30NightTint(group,value);},
   dispose(){if(disposed)return;disposed=true;group.removeFromParent();road.dispose();p.dispose();d.dispose();group.clear();}
  };
 }catch(error){road.dispose();pavilion?.dispose();dressing?.dispose();throw error;}
}
export function createNightBWestSector(heightAt:Height,trail:readonly MainSummitTrailPoint[],externalReserve:WestReserve=()=>false){return finishNightBAudit(nightBWestSectorSteps(heightAt,trail,externalReserve));}
