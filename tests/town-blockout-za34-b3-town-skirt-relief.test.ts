import assert from 'node:assert/strict';
import test from 'node:test';
import expansion from '../docs/p0-layout-draft.json';
import { createTerrainGrid, worldBounds, isWater } from '../tools/voxel-tavern/town-blockout/terrain';
import { b3TownSkirtReliefOffset, terrainReliefOffset }
  from '../tools/voxel-tavern/town-blockout/terrain-undulations';
import { extensionRoads, districtStreets, districtParcels, extensionPlots }
  from '../tools/voxel-tavern/town-blockout/town-extension';
import { fillB3Clusters, B3_RADII } from '../tools/voxel-tavern/town-blockout/town-fill-b3';
import { buildTownRailRoute } from '../tools/voxel-tavern/town-blockout/town-railway';

const f=b3TownSkirtReliefOffset;
test('ZA34 B3 R1: town-side foothills sculpt actual shared mesh without touching the N540 seam',()=>{
  const before=createTerrainGrid({relief:false});
  const after=createTerrainGrid();
  let changed=0,largest=0;
  for(let north=440;north<=540;north+=2)for(let east=40;east<=440;east+=2){
    const delta=f(east,north);
    const actual=after.groundHeightAt(east,north)-before.groundHeightAt(east,north);
    // Actual water vertices have a final top-level zero mask in terrain.ts;
    // the raw procedural relief function is never applied to river/ice.
    if(isWater(east,north)) {
      assert.ok(Math.abs(actual)<2e-4,`river vertex moved E${east}/N${north}`);
      continue;
    }
    assert.ok(Math.abs(actual-delta)<2e-4,`grid mismatch E${east}/N${north}`);
    if(Math.abs(delta)>.05)changed++;
    largest=Math.max(largest,Math.abs(delta));
  }
  assert.ok(changed>200,`only ${changed} sculpted samples`);
  assert.ok(largest>=1.8&&largest<=5.3,`unusable maximum ${largest.toFixed(2)}m`);
  for(let east=0;east<=640;east+=4){
    assert.equal(f(east,540),0,`N540 seam E${east} moved`);
    assert.equal(f(east,541),0);
    assert.ok(Math.abs(before.heightAt(east,540)-after.heightAt(east,540))<2e-4,
      `actual town world north seam E${east} moved`);
  }
});
test('ZA34 B3 R1: field rolloff and no slope cliff, retaining all road/rail/house elevations',()=>{
  for(let east=40;east<=440;east+=2){
    assert.equal(f(east,440),0);
    assert.equal(f(east,540),0);
  }
  for(let north=440;north<=540;north+=2){
    assert.equal(f(40,north),0);
    assert.equal(f(440,north),0);
  }
  let maxSlope=0;
  for(let north=441;north<540;north+=2)for(let east=41;east<440;east+=2){
    const at=f(east,north);
    maxSlope=Math.max(maxSlope,Math.hypot(f(east+1,north)-at,f(east,north+1)-at));
  }
  assert.ok(maxSlope<Math.tan(12*Math.PI/180)+.02,
    `incremental B3 slope ${(Math.atan(maxSlope)*180/Math.PI).toFixed(2)}°`);
  for(const route of [...extensionRoads,...districtStreets]){
    for(const [east,north] of route.points)
      assert.equal(f(east,north),0,`road displaced E${east}/N${north}`);
  }
  for(const parcel of Object.values(districtParcels).flat()){
    assert.equal(f(parcel[0],parcel[1]),0,`house parcel displaced ${parcel}`);
  }
  for(const plot of extensionPlots)
    assert.equal(f(plot.origin[0],plot.origin[1]),0,`plot displaced ${plot.id}`);
  for(const [east,north] of expansion.extension.coasterGuideLine)
    assert.equal(f(east,north),0,`rail control point displaced ${east}/${north}`);
});
test('ZA34 B3 R1: real curved rail and existing town-side B3 scenery can sample shared grade',()=>{
  const before=createTerrainGrid({relief:false});
  const after=createTerrainGrid();
  const railway=buildTownRailRoute(before);
  const townRail=railway.points.filter(p=>p.x>40&&p.x<440&&-p.z>440&&-p.z<540);
  for(const p of townRail){
    assert.ok(Math.abs(after.heightAt(p.x,-p.z)-before.heightAt(p.x,-p.z))<.01,
      `rail arc raised E${p.x}/N${-p.z}`);
  }
  // W-1 officially opened the town frame from N540 to N800. The earlier
  // B3 relief pilot *still* ends at N540; frame extension is not evidence
  // that the remaining northern clusters were sculpted or surface-audited.
  const pilotNorthLimit=540;
  const inside=fillB3Clusters.filter(c=>c.north<=pilotNorthLimit);
  const outside=fillB3Clusters.filter(c=>c.north>pilotNorthLimit);
  assert.ok(worldBounds.depth>=pilotNorthLimit,'W-1 world bound regressed');
  assert.equal(inside.length,7);
  assert.equal(outside.length,22);
  for(const cluster of inside){
    const center=terrainReliefOffset(cluster.east,cluster.north);
    const actual=after.heightAt(cluster.east,cluster.north)-before.heightAt(cluster.east,cluster.north);
    assert.ok(Math.abs(actual-center)<2e-4,`B3 scene base ${cluster.id} mismatch`);
    const radius=B3_RADII[cluster.kind];
    for(const [de,dn] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      assert.ok(Math.abs(f(cluster.east+de,cluster.north+dn)-f(cluster.east,cluster.north))<.72,
        `B3 asset ${cluster.id} too much elevation delta across footprint`);
    }
  }
});
