import assert from 'node:assert/strict';
import test from 'node:test';
import expansion from '../docs/p0-layout-draft.json';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { b2TerrainReliefOffset, b4TerrainReliefOffset, terrainReliefOffset }
  from '../tools/voxel-tavern/town-blockout/terrain-undulations';
import { districtParcels, districtStreets, extensionPlots, extensionRoads }
  from '../tools/voxel-tavern/town-blockout/town-extension';
import { fillLakeEastClusters, LAKE_EAST_RADII }
  from '../tools/voxel-tavern/town-blockout/town-fill-lake-east';
import { fillNorthWestClusters, NORTH_WEST_RADII }
  from '../tools/voxel-tavern/town-blockout/town-fill-north-west';
import { buildTownRailRoute }
  from '../tools/voxel-tavern/town-blockout/town-railway';

const near=(a:number,b:number,epsilon=1e-4)=>Math.abs(a-b)<epsilon;
const zones=[
  { name:'B2 lake east', west:440,east:640,south:0,north:160,offset:b2TerrainReliefOffset },
  { name:'B4 northwest',west:0,east:40,south:360,north:480,offset:b4TerrainReliefOffset },
] as const;

test('ZA34 R1 B2/B4: both candidates actually displace the shared 1m terrain, not a surface decoration',()=>{
  const before=createTerrainGrid({relief:false});
  const after=createTerrainGrid();
  for(const zone of zones){
    let count=0,maxDelta=0;
    for(let n=zone.south+2;n<zone.north;n+=2)
      for(let e=zone.west+2;e<zone.east;e+=2){
        const delta=zone.offset(e,n);
        const actual=after.groundHeightAt(e,n)-before.groundHeightAt(e,n);
        assert.ok(near(actual,delta),`${zone.name}: heightAt mismatch at E${e}/N${n}`);
        if(Math.abs(delta)>.05)count++;
        maxDelta=Math.max(maxDelta,Math.abs(delta));
      }
    assert.ok(count>=25,`${zone.name}: only ${count} changed samples`);
    assert.ok(maxDelta>=2&&maxDelta<5.1,`${zone.name}: displacement ${maxDelta.toFixed(3)}m`);
  }
  // Geometrically important datum points outside the wilds must stay unchanged.
  for(const [e,n] of [[10,10],[210,190],[370,160],[575,365],[318,510],[200,540]]){
    assert.ok(near(after.heightAt(e,n),before.heightAt(e,n),2e-4),`built or mountain seam E${e}/N${n}`);
  }
});

test('ZA34 R1 B2/B4: road/rail/district footings remain exactly at existing grade',()=>{
  for(const road of [...extensionRoads,...districtStreets])
    for(const [e,n] of road.points)
      for(const zone of zones)assert.equal(zone.offset(e,n),0,`${zone.name} road @${e}/${n}`);
  for(const plot of extensionPlots)
    for(const zone of zones)assert.equal(zone.offset(plot.origin[0],plot.origin[1]),0,`${zone.name} plot ${plot.id}`);
  for(const plots of Object.values(districtParcels))for(const [e,n] of plots)
    for(const zone of zones)assert.equal(zone.offset(e,n),0,`${zone.name} parcel @${e}/${n}`);
  for(const [e,n] of expansion.extension.coasterGuideLine)
    for(const zone of zones)assert.equal(zone.offset(e,n),0,`${zone.name} rail @${e}/${n}`);
});

test('ZA34 R1 B2: actual curved railway grade stays intact between guide points',()=>{
  const before=createTerrainGrid({relief:false});
  const after=createTerrainGrid();
  const railway=buildTownRailRoute(before);
  const lakePoints=railway.points.filter(p=>p.x>=440&&p.x<=640&&-p.z>=0&&-p.z<=160);
  assert.ok(lakePoints.length>8,'curved rail must cross B2 wildland');
  for(const p of lakePoints){
    const e=p.x,n=-p.z;
    assert.ok(Math.abs(after.heightAt(e,n)-before.heightAt(e,n))<.01,
      `B2 railway real centreline grade changed E${e}/N${n}`);
  }
});

test('ZA34 R1 B2/B4: smooth boundaries and limited incremental cross-slope',()=>{
  for(const zone of zones){
    for(let e=zone.west;e<=zone.east;e+=2){
      assert.equal(zone.offset(e,zone.south),0);
      assert.equal(zone.offset(e,zone.north),0);
    }
    for(let n=zone.south;n<=zone.north;n+=2){
      assert.equal(zone.offset(zone.west,n),0);
      assert.equal(zone.offset(zone.east,n),0);
    }
    let maxSlope=0;
    for(let n=zone.south+1;n<zone.north;n+=2)for(let e=zone.west+1;e<zone.east;e+=2){
      const d=zone.offset(e,n);
      maxSlope=Math.max(maxSlope,Math.hypot(zone.offset(e+1,n)-d,zone.offset(e,n+1)-d));
    }
    assert.ok(maxSlope<=Math.tan(12*Math.PI/180)+.01,
      `${zone.name}: incremental slope ${(Math.atan(maxSlope)*180/Math.PI).toFixed(2)} degrees`);
  }
  assert.equal(terrainReliefOffset(0,430),0);
  assert.equal(terrainReliefOffset(640,90),0);
  assert.equal(terrainReliefOffset(410,100),0);
});

test('ZA34 R1 B2/B4: staged scenery bases can follow the shared height sampler without large footprint steps',()=>{
  const before=createTerrainGrid({relief:false});
  const after=createTerrainGrid();
  for(const [clusters,radii,zone] of [
    [fillLakeEastClusters,LAKE_EAST_RADII,zones[0]],
    [fillNorthWestClusters,NORTH_WEST_RADII,zones[1]],
  ] as const){
    for(const cluster of clusters){
      const { east,north,kind,id }=cluster;
      const radius=(radii as Record<string,number>)[kind]!;
      const displacement=after.heightAt(east,north)-before.heightAt(east,north);
      assert.ok(near(displacement,terrainReliefOffset(east,north),2e-4),`${id}: scenery base not on shared grid`);
      const center=terrainReliefOffset(east,north);
      for(const [de,dn] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
        const change=terrainReliefOffset(east+de,north+dn)-center;
        assert.ok(Math.abs(change)<.72,`${zone.name} ${id}: footprint relief delta ${change.toFixed(2)}m`);
      }
    }
  }
});
