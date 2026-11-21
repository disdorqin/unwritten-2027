import assert from 'node:assert/strict';
import test from 'node:test';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {summitSledLineLengthM,summitSledGateCount} from '../tools/voxel-tavern/town-blockout/town-summit-sled-line';

/**
 * D-03 safety audit, NOT approved gate coordinates.
 * 12 equally spaced illustrative points were extracted from the archived
 * `origin/lane-d:main-summit-sled-route.ts` preview curve. Their Y is
 * derived by its 6015m three-band profile, NOT the approved 6037.881m road.
 *
 * Any candidate >1m above/below the real P-1 surface, or outside a
 * sampled authoritative domain, must remain INVALID and never mount.
 */
const obsoletePreviewCandidates = Object.freeze([
  {number:1,distance:462.692,east:520.68,north:959.15,previewY:730.16},
  {number:2,distance:925.385,east:184.67,north:814.00,previewY:660.32},
  {number:3,distance:1388.077,east:355.97,north:648.00,previewY:590.48},
  {number:4,distance:1850.769,east:815.06,north:648.00,previewY:534.07},
  {number:5,distance:2313.462,east:685.30,north:482.00,previewY:488.05},
  {number:6,distance:2776.154,east:227.69,north:467.81,previewY:442.04},
  {number:7,distance:3238.846,east:515.32,north:310.00,previewY:396.03},
  {number:8,distance:3701.538,east:974.31,north:309.89,previewY:338.26},
  {number:9,distance:4164.231,east:774.49,north:140.00,previewY:274.21},
  {number:10,distance:4626.923,east:316.25,north:140.00,previewY:210.15},
  {number:11,distance:5089.615,east:317.83,north:-60.00,previewY:146.10},
  {number:12,distance:5552.308,east:776.07,north:-60.00,previewY:82.05},
] as const);

test('D-03: official gate length is not the historical 6015m preview',()=>{
  assert.equal(summitSledGateCount,12);
  assert.equal(summitSledLineLengthM,6037.881);
  const previewLength=1590+1810+2615;
  assert.equal(previewLength,6015);
  assert.ok(Math.abs(summitSledLineLengthM-previewLength-22.881)<.00001);
  assert.equal(obsoletePreviewCandidates.length,12);
});

test('D-03: reject all 12 legacy-preview locations using actual P-1 height and domain guards',context=>{
  const block=createMainSummitBlock(mainSummitLayout,347,100);
  context.after(block.dispose);
  const table=obsoletePreviewCandidates.map(p=>{
    const height=block.heightAt(p.east,p.north);
    const delta=height===undefined?null:p.previewY-height;
    return {...p,ground:height,delta,accepted:delta!==null&&Math.abs(delta)<=1};
  });
  assert.equal(table.length,12);
  for(const row of table){
    assert.equal(row.accepted,false,
      `preview G${row.number} MUST NOT be interpreted as a live gate: Y offset ${row.delta}`);
  }
  assert.equal(table.filter(row=>row.ground===undefined).length,2,
    'After crossing the preview seam the old line has no P-1 authoritative terrain');
  const maxAbsoluteError=Math.max(...table.filter(row=>row.delta!==null).map(row=>Math.abs(row.delta!)));
  assert.ok(maxAbsoluteError>175,'historic route visibly cuts through the actual massif');
});

test('D-03: no silent automatic clamping of invalid gates onto terrain',context=>{
  const block=createMainSummitBlock(mainSummitLayout,347,100);
  context.after(block.dispose);
  for(const row of obsoletePreviewCandidates){
    const y=block.heightAt(row.east,row.north);
    const separation=y===undefined?Infinity:Math.abs(row.previewY-y);
    assert.ok(separation>1,`legacy G${row.number} unexpectedly became safe; re-survey before promotion`);
  }
  // This is a SAFETY diagnostic only; no SledGate objects are exported.
});
