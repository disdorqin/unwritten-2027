import {createMainSummitCable} from './main-summit-cable';
import type {TownD2SectorInstaller,TownD2SectorPackage} from './town-d2-r30-production-host';
import {mountSouthProduction} from './town-night-a-summit-production';
import {createSouthReservation} from './town-night-a-summit-reservation';
import {proposeSouthRoadGrade} from './town-night-a-summit-road-grade';
import {createNightBWestCutSurface,cutNightBWestTerrain} from './town-night-b-summit-west-cut';
import {surveyA32SouthRoad} from './town-a32-south-road';
/** D2's single A slot: preserve the accepted first 833m exactly, add only
 * A's surveyed local replacement and reserve both corridors from vegetation.
 * Not a route release; the other 226 original stations and joins are open. */
export function createA32SouthSectorInstaller():TownD2SectorInstaller{
 return port=>{
  const first=1,last=834,grade=proposeSouthRoadGrade(port.trail,first,last,port.groundAt);
  if(!grade.ok)throw Error('Accepted southern road no longer fits');
  const trail=[...port.trail.slice(0,first),...grade.profile,...port.trail.slice(last+1)];
  const extension=surveyA32SouthRoad(port.trail,port.groundAt);
  const cable=createMainSummitCable(0,10000,port.arrivalHeight);
  const reserved=createSouthReservation([{points:port.trail,radius:18},{points:extension.trail,radius:18},...cable.ropes.map(rope=>({points:rope.points,radius:40}))],[{west:-42,east:42,south:-10,north:55}]);
  const south=mountSouthProduction({owner:port.owner,groundAt:port.groundAt,reserved,trail,first,last,extension,nearTiles:port.tiles,legacySouthVegetationExcluded:true,legacyTreadExcluded:true,cutTerrain:cutNightBWestTerrain,createCutSurface:createNightBWestCutSurface});
  south.group.userData.a32Road={length:extension.grade.length,originalFirst:extension.originalFirst,originalLast:extension.originalLast,grade:extension.grade.maxGrade,cap:extension.cap,connected:false};
  return {sector:'A',group:south.group,groundAt:south.groundAt,coversCut:south.coversCut,cutGroundAt:south.cutGroundAt,deckAt:south.deckAt,supportAt:south.supportAt,blocked:south.blocked,updateView:south.updateView,setNight:south.setNight,updateSnow:(...args:unknown[])=>(south.updateSnow as (...args:unknown[])=>void)(...args),dispose:south.dispose} satisfies TownD2SectorPackage;
 };
}
