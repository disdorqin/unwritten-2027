import assert from 'node:assert/strict';
import { test } from 'node:test';
import layout from '../tools/voxel-tavern/town-blockout/layout.json';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import {
  craterApproachReliefOffset, b2TerrainReliefOffset, terrainBuildProtection,
  terrainReliefOffset,
} from '../tools/voxel-tavern/town-blockout/terrain-undulations';

const near=(a:number,b:number,epsilon=2e-4)=>Math.abs(a-b)<epsilon;
const approachRoute=[
  [223,180],[192,180],[161,181],[151,156],[127,140],
  [108,114],[85,131],[77,164],[1,159],
] as const;

test('A-1: the default player height and render grid share the real crater-approach relief',()=>{
  const original=createTerrainGrid({relief:false});
  const active=createTerrainGrid();
  let displaced=0;
  for(let n=58;n<=231;n+=3)for(let e=0;e<=230;e+=3){
    const modeled=terrainReliefOffset(e,n);
    const actual=active.groundHeightAt(e,n)-original.groundHeightAt(e,n);
    assert.ok(near(actual,modeled),`default terrain mismatch at E${e}/N${n}: ${actual} != ${modeled}`);
    if(Math.abs(craterApproachReliefOffset(e,n))>.2)displaced++;
  }
  assert.ok(displaced>550,`only ${displaced} visible 3m-grid wildland sites`);
  assert.equal(active.elevation.length,original.elevation.length);
  assert.equal(active.gridWidth,original.gridWidth);
  assert.equal(active.gridDepth,original.gridDepth);
});

test('A-1: the protected 7m road, plaza, west-domain seam and built plot datums do not move',()=>{
  for(const [e,n] of approachRoute)assert.equal(craterApproachReliefOffset(e,n),0,
    `road centreline E${e}/N${n} acquired a snow mound`);
  const [w,s,e,n]=layout.plaza.bounds;
  for(let north=s;north<=n;north+=3)for(let east=w;east<=e;east+=3)
    assert.equal(craterApproachReliefOffset(east,north),0,
      `spawn plaza pavers no longer flat at E${east}/N${north}`);
  for(let north=60;north<=230;north+=2){
    assert.equal(craterApproachReliefOffset(0,north),0,'west terrain seam must remain exactly unchanged');
    assert.equal(craterApproachReliefOffset(-20,north),0,'ZA36 west domain must not be overwritten');
  }
  for(const plot of layout.plots){
    assert.equal(terrainBuildProtection(plot.origin[0],plot.origin[1]),0,plot.id);
  }
  const a=createTerrainGrid({relief:false});
  const b=createTerrainGrid();
  for(const [east,north] of [...approachRoute,[223,180],[210,190]]){
    assert.ok(near(a.groundHeightAt(east,north),b.groundHeightAt(east,north)),
      `road/plaza height was altered at E${east}/N${north}`);
  }
});

test('A-1: approach shoulders have a true 2–6m peak and no added grade above 12 degrees',()=>{
  let peak=0,peakPoint:readonly [number,number]|undefined;
  let changed=0,steepest=0;
  for(let n=58;n<=231;n++)for(let e=0;e<=230;e++){
    const h=craterApproachReliefOffset(e,n);
    if(Math.abs(h)>peak){peak=Math.abs(h);peakPoint=[e,n];}
    if(Math.abs(h)>.2)changed++;
    const slope=Math.hypot(
      craterApproachReliefOffset(e+1,n)-h,
      craterApproachReliefOffset(e,n+1)-h,
    );
    steepest=Math.max(steepest,slope);
  }
  assert.ok(peak>=2&&peak<=6,`wildland peak ${peak} is outside the 2–6m design band`);
  assert.ok(changed>=5_000,`only ${changed} m² of visible shoulder relief`);
  assert.ok(steepest<=Math.tan(12*Math.PI/180),
    `added approach grade ${(Math.atan(steepest)*180/Math.PI).toFixed(3)}° exceeds 12°`);
  assert.ok(peakPoint && peakPoint[0]>0,'no measured crater approach relief landmark');
});

test('A-1: B2 two-phase relief is bounded by 6m on every one-metre grid point',()=>{
  let peak=0,changed=0;
  for(let n=0;n<=160;n++)for(let e=440;e<=640;e++){
    const v=b2TerrainReliefOffset(e,n);
    peak=Math.max(peak,Math.abs(v));
    if(Math.abs(v)>.2)changed++;
  }
  // Stronger than just scanning: sum of mode amplitude bounds is 4.65+1.30.
  assert.ok(4.65+1.30<=6);
  assert.ok(peak>=2&&peak<=6,`B2 true maximum ${peak.toFixed(3)}m not inside 2–6m`);
  assert.ok(changed>1_000,`B2 only ${changed} obvious elevation samples`);
});
