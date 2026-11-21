import assert from 'node:assert/strict';
import test from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { craterWestUpliftCandidate } from '../tools/voxel-tavern/town-blockout/town-za34-crater-uplift';
import { buildCraterRailExtension } from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';

const grid=createTerrainGrid();
const legacy=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const candidate=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),
  {za34UpliftCandidate:true});

test('ZA34 crater gated mount: legacy default remains unchanged and uplift is real collision terrain',()=>{
  let moved=0,peak=0;
  for(let n=30;n<=420;n+=4)for(let e=-232;e<=-24;e+=4){
    const h0=legacy.heightAt(e,n),h1=candidate.heightAt(e,n);
    assert.notEqual(h0,undefined);
    assert.notEqual(h1,undefined);
    const expected=craterWestUpliftCandidate(e,n,candidate.anchor);
    const delta=h1!-h0!;
    // The impact bowl masks its own surface; outside it the two hosts share
    // one authoritative height function, subject to world-grid precision.
    if(Math.hypot(e-candidate.anchor.east,n-candidate.anchor.north)>59){
      assert.ok(Math.abs(delta-expected)<.002,
        `ground mismatch at E${e}/N${n}: actual=${delta}, expected=${expected}`);
    }
    if(Math.abs(delta)>.2)moved++;
    peak=Math.max(peak,delta);
  }
  assert.ok(moved>1000,`not sculpted: ${moved} samples`);
  assert.ok(peak>=3.3&&peak<5.3,`impact candidate peak ${peak}`);
  for(let n=1;n<540;n+=10){
    assert.ok(Math.abs(candidate.heightAt(-24,n)!-legacy.heightAt(-24,n)!)<.001,
      `legacy approach seam moved at N${n}`);
    assert.ok(Math.abs(candidate.heightAt(-1,n)!-legacy.heightAt(-1,n)!)<.001,
      `town edge moved at N${n}`);
  }
});

test('ZA34 crater gated mount: render ground vertices match the same collision sampler',()=>{
  let checked=0;
  candidate.group.traverse(obj=>{
    if(obj.name!=='meteor-crater-west-ground')return;
    const geo=(obj as {geometry?:{getAttribute:(name:string)=>{count:number;getX:(i:number)=>number;getY:(i:number)=>number;getZ:(i:number)=>number}}}).geometry;
    if(!geo)return;
    const p=geo.getAttribute('position');
    for(let i=0;i<p.count;i+=51){
      const e=p.getX(i),n=-p.getZ(i),h=p.getY(i);
      const actual=candidate.heightAt(e,n);
      if(actual===undefined)continue;
      // The geometry contains the crater hole's deleted triangles; omit its
      // unrendered carrier vertices which intentionally follow the underlay.
      if(Math.hypot(e-candidate.anchor.east,n-candidate.anchor.north)<57.1)continue;
      assert.ok(Math.abs(h-actual)<.005,
        `render/collision disagreement E${e}/N${n}: mesh=${h}, collider=${actual}`);
      checked++;
    }
  });
  // Every 51st merged terrain vertex across all 12 spatial batches.
  assert.ok(checked>2200,`too few real mesh vertices audited (${checked})`);
});

test('ZA34 crater gated mount: existing outside buildings, lamps and dressing move with shared ground',()=>{
  const parts=[
    ['mouth',legacy.mouthWorks.sites,candidate.mouthWorks.sites],
    ['outer',legacy.outerWorks.sites,candidate.outerWorks.sites],
    ['density',legacy.densityA2.sites,candidate.densityA2.sites],
  ] as const;
  let changedSites=0;
  for(const [family,older,newer] of parts){
    assert.equal(older.length,newer.length,`${family} placement population changed`);
    for(let i=0;i<older.length;i++){
      const a=older[i]!,b=newer[i]!;
      assert.equal(a.id,b.id);
      assert.ok(Math.hypot(a.east-b.east,a.north-b.north)<.001);
      // Recorded 'height' is an anchor height, not always ground Y: ZB35's
      // flag ring is +.44 m, and other sites may likewise have a datum.
      // Compare the change of that datum against the same sampled terrain.
      const gradeDelta=candidate.heightAt(b.east,b.north)!-legacy.heightAt(a.east,a.north)!;
      assert.ok(Math.abs((b.height-a.height)-gradeDelta)<.003,
        `${family}/${b.id} no longer follows its original ground-relative datum`);
      if(Math.abs(b.height-a.height)>.2)changedSites++;
    }
  }
  assert.ok(changedSites>5,`only ${changedSites} model sites follow the displaced ground`);
});

test('ZA34 crater gated mount: railroad rebuilt on new ground stays supported by terrain',()=>{
  const railway=buildCraterRailExtension(grid,candidate);
  let west=0;
  for(const p of railway.samples){
    if(p.east>=0)continue;
    const ground=candidate.heightAt(p.east,p.north)!;
    if(!Number.isFinite(ground))continue;
    const clearance=p.y-ground;
    assert.ok(clearance>-.01 && clearance<3.8,
      `unsupported rail at E${p.east.toFixed(1)}/N${p.north.toFixed(1)}: clearance ${clearance.toFixed(2)}`);
    west++;
  }
  assert.ok(west>140,`only ${west} west-domain rail samples`);
});
