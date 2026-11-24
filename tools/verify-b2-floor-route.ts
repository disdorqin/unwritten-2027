/**
 * B-2 canonical foot survey. Reuse the actual B-01 mount/heightAt,
 * never recreate the spiral or move the player from JavaScript.
 */
import {createTerrainGrid,worldBounds} from './voxel-tavern/town-blockout/terrain.ts';
import {mountWestCraterRoad} from './voxel-tavern/town-blockout/town-za22-crater-road.ts';
import {mountMeteorCraterSurface} from './voxel-tavern/town-blockout/meteor-crater-surface.ts';
import {meteorCraterDepth,meteorCraterFloorRadius} from './voxel-tavern/town-blockout/meteor-crater.ts';

export function buildB2FloorRoute() {
  const terrain=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>terrain.groundHeightAt(0,n));
  const crater=mountMeteorCraterSurface(road.anchor);
  const {east,north,rimHeight}=road.anchor;
  // Dense entry samples avoid cutting the initial sharp transition.
  // The remaining chord intervals are conservative for the surveyed spiral.
  const ts=[0,.002,.004,.006,.008,...Array.from({length:99},(_,i)=>(i+1)/100)];
  ts.push(1);
  const points=ts.map(t=>({t,...crater.trailPoint(t)}));
  const exit=points.at(-1)!;
  const radius=meteorCraterFloorRadius-2;
  const inward={east:east+(exit.east-east)*radius/meteorCraterFloorRadius,
    north:north+(exit.north-north)*radius/meteorCraterFloorRadius};
  const floor={...inward,height:crater.heightAt(inward.east,inward.north)!};
  return {center:{east,north},rimHeight,floorHeight:rimHeight-meteorCraterDepth,
    floorRadius:meteorCraterFloorRadius,lip:points[0],points,floor,
    floorYaw:Math.atan2(floor.east-east,floor.north-north)};
}
