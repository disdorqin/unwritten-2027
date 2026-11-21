import assert from 'node:assert/strict';
import test from 'node:test';
import expansion from '../docs/p0-layout-draft.json';
import { b1BuildProtection, b1TerrainReliefOffset }
  from '../tools/voxel-tavern/town-blockout/terrain-undulations';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { buildTownRailRoute } from '../tools/voxel-tavern/town-blockout/town-railway';
import { B1_RADII, fillB1Clusters } from '../tools/voxel-tavern/town-blockout/town-fill-b1';
import { districtParcels, districtStreets, extensionPlots, extensionRoads }
  from '../tools/voxel-tavern/town-blockout/town-extension';

const near=(a:number,b:number,tol=1e-5)=>Math.abs(a-b)<=tol;
test('ZA34 R1: the B1 ground is actually sculpted on the default shared terrain grid',()=>{
  const vanilla=createTerrainGrid({relief:false});
  const sculpted=createTerrainGrid();
  let changed=0,largest=0;
  for(let n=220;n<=500;n+=5)for(let e=460;e<=635;e+=5){
    const baseline=vanilla.groundHeightAt(e,n);
    const actual=sculpted.groundHeightAt(e,n);
    const offset=b1TerrainReliefOffset(e,n);
    assert.ok(near(actual-baseline,offset,1e-4),`shared relief mismatch at ${e}/${n}`);
    if(Math.abs(offset)>.05)changed++;
    largest=Math.max(largest,Math.abs(offset));
  }
  assert.ok(changed>100,`not a usable landscape; displaced only ${changed} samples`);
  assert.ok(largest>=1.2&&largest<=3.201,`unexpected pilot displacement ${largest.toFixed(3)}m`);
  assert.ok(near(sculpted.groundHeightAt(620,420)-vanilla.groundHeightAt(620,420),
    b1TerrainReliefOffset(620,420),1e-4));
});
test('ZA34 R1: no geometry displaces protected roads, rail platforms or lived-in house plots',()=>{
  const protectedRoads=[...extensionRoads,...districtStreets];
  for(const road of protectedRoads)for(const point of road.points){
    const [e,n]=point;
    assert.equal(b1TerrainReliefOffset(e,n),0,`road ${'district' in road ? road.district : road.id} @ ${e}/${n}`);
  }
  for(const [e,n] of expansion.extension.coasterGuideLine)
    assert.equal(b1TerrainReliefOffset(e,n),0,`rail corridor at ${e}/${n}`);
  for(const plot of extensionPlots){
    assert.equal(b1TerrainReliefOffset(plot.origin[0],plot.origin[1]),0,plot.id);
  }
  for(const parcels of Object.values(districtParcels))
    for(const [e,n] of parcels)
      assert.equal(b1TerrainReliefOffset(e,n),0,`inhabited parcel at ${e}/${n}`);
  assert.equal(b1BuildProtection(610,420),1,'far-field wilds must not be artificially flattened');
});
test('ZA34 R1: physical curved railway and each named B1 landmark are safe for the changed terrain',()=>{
  const baseline=createTerrainGrid({relief:false});
  const after=createTerrainGrid();
  const railway=buildTownRailRoute(baseline);
  const inB1=railway.points.filter(p=>p.x>=447&&p.x<=640&&-p.z>=205&&-p.z<=540);
  assert.ok(inB1.length>5,'actual curved track must be sampled through the pilot');
  for(const p of inB1) {
    const e=p.x,n=-p.z;
    assert.ok(Math.abs(after.heightAt(e,n)-baseline.heightAt(e,n))<.01,
      `curved rail line displacement at ${e}/${n}`);
  }
  for(const cluster of fillB1Clusters){
    const r=B1_RADII[cluster.kind];
    const base=after.heightAt(cluster.east,cluster.north);
    const before=baseline.heightAt(cluster.east,cluster.north);
    assert.ok(Math.abs((base-before)-b1TerrainReliefOffset(cluster.east,cluster.north))<.0001,
      `${cluster.id} does not use the same height authority`);
    // Centre-height-only placed pieces have a small enough new gradient to
    // retain their sculpted-footprint clearance in the B1 pilot.
    for(const [dx,dn] of [[r,0],[-r,0],[0,r],[0,-r]]){
      const delta=b1TerrainReliefOffset(cluster.east+dx,cluster.north+dn)
        -b1TerrainReliefOffset(cluster.east,cluster.north);
      assert.ok(Math.abs(delta)<.72,`${cluster.id} terrain relief varies ${delta.toFixed(2)}m across its footprint`);
    }
  }
});
test('ZA34 R1: relief fades to exact zero at B1 boundary and outside the pilot',()=>{
  for(const n of [0,130,205,540,680])
    for(const e of [0,200,447,500,610,640])
      assert.equal(b1TerrainReliefOffset(e,n),0,`B1 boundary @ ${e}/${n}`);
  for(const e of [0,447,640,720])
    for(const n of [205,300,420,540])
      assert.equal(b1TerrainReliefOffset(e,n),0,`B1 boundary @ ${e}/${n}`);
  // Changes cannot introduce steps across an existing path shoulder.
  let largestRise=0;
  for(let n=250;n<=490;n+=4)for(let e=480;e<=632;e+=4){
    const here=b1TerrainReliefOffset(e,n);
    const de=(b1TerrainReliefOffset(e+1,n)-here);
    const dn=(b1TerrainReliefOffset(e,n+1)-here);
    largestRise=Math.max(largestRise,Math.hypot(de,dn));
  }
  assert.ok(largestRise<=Math.tan(12*Math.PI/180)+.025,
    `added pilot slope ${(Math.atan(largestRise)*180/Math.PI).toFixed(2)} degrees`);
});
