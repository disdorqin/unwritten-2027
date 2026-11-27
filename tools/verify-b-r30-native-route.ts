import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from './voxel-tavern/town-blockout/town-railway';
import {ar30SurfacePort} from './voxel-tavern/town-blockout/town-a-r30-surface-port';
import {createAR30RimAccessSurvey} from './voxel-tavern/town-blockout/town-a-r30-rim-access';
import {rimPublicAccessFootway} from './voxel-tavern/town-blockout/town-a-r30-west-landscape';
import {createTerrainGrid,worldBounds} from './voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road';
import {createMeteorCrater,meteorCraterFixturePlan,meteorCraterFloorRadius,meteorCraterDepth} from './voxel-tavern/town-blockout/meteor-crater';

/** Read current final rendered/walk surface, not an old fixed-height fixture.
 * The survey is only used to aim actual keyboard/mouse movement; no pose
 * writes or authority bypass. Dense entry knots retain the tight turn. */
export function buildBR30NativeRoute(){
  const grid=createTerrainGrid(),port=ar30SurfacePort(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:port.story});
  const rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);
  const assembly=port.attach(road,rail);
  const approach=createAR30RimAccessSurvey(road,rail,.40).trace(rimPublicAccessFootway);
  const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  const fixture=createMeteorCrater(meteorCraterFixturePlan);
  const point=(t:number)=>{
    const p=fixture.mainTrailPoint(t),east=a.east+p.east*c+p.north*s,north=a.north+p.north*c-p.east*s;
    const height=road.heightAt(east,north);
    if(height===undefined||!Number.isFinite(height))throw Error('Missing support t='+t);
    return {t,east,north,height};
  };
  const ts=[0,.002,.004,.006,.008,...Array.from({length:100},(_,i)=>(i+1)/100)];
  const points=ts.map(point);
  const exit=points.at(-1)!,r=(meteorCraterFloorRadius-2)/meteorCraterFloorRadius;
  const east=a.east+(exit.east-a.east)*r,north=a.north+(exit.north-a.north)*r,height=road.heightAt(east,north);
  if(height===undefined||Math.abs(height-(a.rimHeight-meteorCraterDepth))>.12)throw Error('Actual bottom datum mismatch');
  const floor={east,north,height};
  const view=road.midgroundS5.crystalViews.find(v=>v.cluster==='r30-crystal-4-1')?.view;
  return {approach,anchor:a,lip:points[0],points,floor,floorYaw:Math.atan2(east-a.east,north-a.north),view};
}
