import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Matrix4, type InstancedMesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface';

test('A-5 walking-camera preflight: survey every cyan tip against the real B-01 spiral trail (no camera teleport)', t => {
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const surface=mountMeteorCraterSurface(road.anchor);
  const cyan=road.midground.group.getObjectByName('za36-midground-cyan') as InstancedMesh;
  assert.ok(cyan?.isInstancedMesh);
  assert.equal(cyan.count,14);
  const trail=Array.from({length:1001},(_,i)=>({progress:i/1000,...surface.trailPoint(i/1000)}));
  const transform=new Matrix4();
  let nearest: {crystalIndex:number;progress:number;distance:number;cameraFoot:{east:number;north:number;height:number};crystal:{east:number;north:number;height:number}}|undefined;
  for(let i=0;i<cyan.count;i++){
    cyan.getMatrixAt(i,transform);
    const crystal={east:transform.elements[12]!,north:-transform.elements[14]!,height:transform.elements[13]!};
    for(const foot of trail){
      const distance=Math.hypot(foot.east-crystal.east,foot.north-crystal.north,foot.height-crystal.height);
      if(!nearest||distance<nearest.distance)nearest={
        crystalIndex:i,progress:foot.progress,distance,crystal,
        cameraFoot:{east:foot.east,north:foot.north,height:foot.height},
      };
    }
  }
  assert.ok(nearest && Number.isFinite(nearest.distance));
  assert.ok(nearest.distance<7,'no B-01 centerline viewpoint even within 7m of cyan');
  assert.ok(nearest.progress>0&&nearest.progress<1);
  t.diagnostic(JSON.stringify({nearestTrailCenterline:nearest,
    note:'This is B-01 path centerline geometry only. Not a proof that a 2m off-center safe stance exists. Do not call it a 2m first-person photo.'}));
});
