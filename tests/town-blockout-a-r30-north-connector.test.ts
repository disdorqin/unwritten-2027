import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Raycaster,Vector3,CatmullRomCurve3,type Mesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {craterBranchControlLine} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';

test('A-R04 north railway support is a real bounded surface across the former N336 gap',()=>{
  const terrain=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>terrain.groundHeightAt(0,n));
  road.group.updateMatrixWorld(true);
  const group=road.group.getObjectByName('meteor-crater-west-north-connector');
  assert.ok(group);
  const tiles=group.children as Mesh[];
  assert.equal(tiles.length,4);
  assert.equal(tiles.reduce((s,m)=>s+m.geometry.index!.count/3,0),26624);
  const curve=new CatmullRomCurve3(craterBranchControlLine.map(([e,n])=>new Vector3(e,0,-n)),false,'centripetal');
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  let points=0;
  for(const p of curve.getSpacedPoints(1500)){
    const e=p.x,n=-p.z;
    if(e>=-1.5||n<338)continue;
    for(const dx of [-1.4,0,1.4]){
      assert.ok(road.terrainReadyAt(e+dx,n));
      ray.ray.origin.set(e+dx,100,-n);
      const hit=ray.intersectObjects(tiles,false)[0];
      assert.ok(hit,JSON.stringify({e,n,dx}));
      assert.ok(Math.abs(hit.point.y-road.heightAt(e+dx,n)!)<.0001);
      points++;
    }
  }
  assert.ok(points>600);
  assert.equal(road.terrainReadyAt(-65,400),false);
  assert.equal(road.terrainReadyAt(-20,545),false);
  for(let n=336;n<=544;n++)assert.ok(Math.abs(road.heightAt(0,n)!-terrain.groundHeightAt(0,n))<.0001);
});
