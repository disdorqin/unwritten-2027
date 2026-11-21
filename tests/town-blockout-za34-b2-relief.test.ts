import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrainGrid, isWater, bridgeAt } from '../tools/voxel-tavern/town-blockout/terrain';
import { b1TerrainReliefOffset, b1BuildProtection } from '../tools/voxel-tavern/town-blockout/terrain-undulations';
import {
  b2TerrainReliefOffset, b2TerrainEnvelope, b2LakeShoreMask,
  b2LandmarkMask, b2PalaceProtection, b2ExistingLandmarks,
} from '../tools/voxel-tavern/town-blockout/terrain-undulations-b2';
import {
  fillLakeEastClusters, LAKE_EAST_RADII,
} from '../tools/voxel-tavern/town-blockout/town-fill-lake-east';
import { extensionRoads, extensionPlots, districtParcels, districtStreets }
  from '../tools/voxel-tavern/town-blockout/town-extension';
import { buildTownRailRoute } from '../tools/voxel-tavern/town-blockout/town-railway';
import { icePalaceSite } from '../tools/voxel-tavern/town-blockout/ice-palace-site';

const almost = (x:number,y:number,tol=.0001)=>Math.abs(x-y)<=tol;

test('ZA34 R2 B2 is actual terrain displacement in the shared physical height grid',()=>{
  const base=createTerrainGrid({relief:false});
  const active=createTerrainGrid();
  let moving=0,peak=0;
  for(let n=5;n<=165;n+=5)for(let e=410;e<=635;e+=5) {
    const change=active.groundHeightAt(e,n)-base.groundHeightAt(e,n);
    const expected=b2TerrainReliefOffset(e,n)+b1TerrainReliefOffset(e,n);
    assert.ok(almost(change,expected),`B1+B2 shared height mismatch at E${e}/N${n}: ${change} vs ${expected}`);
    if(Math.abs(b2TerrainReliefOffset(e,n))>.05)moving++;
    peak=Math.max(peak,Math.abs(b2TerrainReliefOffset(e,n)));
  }
  assert.ok(moving>75,`the second field must cover area, not one cosmetic snow cube (${moving})`);
  assert.ok(peak>=1.5 && peak<=6,`B2 volume not legible / too large: ${peak.toFixed(3)}m`);
  assert.equal(b2TerrainReliefOffset(617,31) < -1.9,true,'the open wind-scoop must be visible');
});

test('ZA34 R2 32 original B2 props retain their exact Y at model centre and a protected footprint',()=>{
  const sorted=(a:readonly {east:number;north:number;radius:number}[])=>
    a.map(p=>`${p.east}:${p.north}:${p.radius}`).sort();
  assert.deepEqual(sorted(b2ExistingLandmarks),
    sorted(fillLakeEastClusters.map(point=>({
      east:point.east,north:point.north,radius:LAKE_EAST_RADII[point.kind],
    }))), 'protect actual installed snowfield clusters, no stale hand-authored centre table');
  for(const point of b2ExistingLandmarks){
    assert.equal(b2TerrainReliefOffset(point.east,point.north),0,`moved existing prop at ${point.east}/${point.north}`);
    const radius=point.radius;
    for(const [de,dn] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      assert.equal(b2TerrainReliefOffset(point.east+de,point.north+dn),0,
        `float/slab intrusion on footprint of ${point.east}/${point.north}`);
    }
  }
});

test('ZA34 R2 lake shore, frozen ice, established roads/rail and house plinths are never raised',()=>{
  for(const road of [...extensionRoads,...districtStreets]){
    for(const [e,n] of road.points){
      assert.equal(b2TerrainReliefOffset(e,n),0,`road centre at ${e}/${n}`);
    }
  }
  for(const plot of extensionPlots){
    assert.equal(b2TerrainReliefOffset(plot.origin[0],plot.origin[1]),0,plot.id);
  }
  for(const parcels of Object.values(districtParcels)){
    for(const [e,n] of parcels)assert.equal(b2TerrainReliefOffset(e,n),0,`house parcel ${e}/${n}`);
  }
  const base=createTerrainGrid({relief:false});
  const active=createTerrainGrid();
  for(let n=30;n<=105;n+=5)for(let e=305;e<=430;e+=5) {
    if(isWater(e,n)||bridgeAt(e,n)||e<400){
      assert.ok(almost(active.heightAt(e,n),base.heightAt(e,n)),
        `lake/ice or old town mutated: ${e},${n}`);
    }
  }
  assert.ok(b2LakeShoreMask(393,66)===0,'at frozen east rim no uplifts');
  const route=buildTownRailRoute(base);
  const positions=route.points.filter(p=>p.x>=404&&p.x<640&&-p.z<=173);
  assert.ok(positions.length>0,'must cover real rail geometry not a made-up centreline');
  for(const p of positions){
    assert.ok(Math.abs(active.heightAt(p.x,-p.z)-base.heightAt(p.x,-p.z))<.01,
      `rail centre moved E${p.x}/N${-p.z}`);
  }
});

test('ZA34 R2 ice palace original southern forecourt and building foundation remain exact',()=>{
  const old=createTerrainGrid({relief:false});
  const current=createTerrainGrid();
  const [centerEast,centerNorth]=icePalaceSite.terrain.origin;
  const [width,depth]=icePalaceSite.terrain.footprint;
  let checked=0;
  for(let east=centerEast-width/2;east<=centerEast+width/2;east++){
    for(let north=centerNorth-depth/2;north<=centerNorth+depth/2;north++){
      assert.equal(b2PalaceProtection(east,north),0);
      assert.equal(b2TerrainReliefOffset(east,north),0,`palace pad at E${east}/N${north}`);
      assert.equal(current.groundHeightAt(east,north),old.groundHeightAt(east,north),
        `existing forecourt Y changed at E${east}/N${north}`);
      checked++;
    }
  }
  assert.ok(checked>2400,'test the actual whole forecourt grid, not just the center');
});
test('ZA34 R2 terrain envelope is C1-smooth at the zero seam and respects the <=12-degree added grade',()=>{
  for(const e of [0,403,404,640,650,750])for(const n of [0,35,80,125,173,185,310]){
    assert.equal(b2TerrainReliefOffset(e,n),0,`outside B2 must be untouched E${e} N${n}`);
  }
  for(const e of [404,475,540,610,640])for(const n of [0,30,90,125,173]){
    assert.ok(b2TerrainEnvelope(e,n)>=0 && b2TerrainEnvelope(e,n)<=1);
    assert.ok(b2LandmarkMask(e,n)>=0 && b2LandmarkMask(e,n)<=1);
  }
  let peakAbsGrade=0;
  for(let n=6;n<=167;n+=2)for(let e=410;e<=636;e+=2){
    const c=b2TerrainReliefOffset(e,n);
    const dx=b2TerrainReliefOffset(e+1,n)-c;
    const dn=b2TerrainReliefOffset(e,n+1)-c;
    peakAbsGrade=Math.max(peakAbsGrade,Math.hypot(dx,dn));
  }
  assert.ok(peakAbsGrade<Math.tan(12*Math.PI/180)+.01,
    `R2 snow-relief addendum too steep: ${(Math.atan(peakAbsGrade)*180/Math.PI).toFixed(3)}°`);
  assert.ok(b1BuildProtection(510,90)<1, 'lake side routes still get a broad safety shoulder');
  assert.equal(b2TerrainReliefOffset(590,320),0,'R2 cannot modify independently owned B1 hills');
});
