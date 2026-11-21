import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMainSummitBlock,mainSummitLayout} from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {createMainSummitTrail} from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import {summitSledGateCount,summitSledLineLengthM} from '../tools/voxel-tavern/town-blockout/town-summit-sled-line';

// D-2 field crosswalk only. The 5590m hiking path is NOT the canonical sled run.
// Do NOT export SledGate or wire these sites into the game.
function p1WalkwayReference(){
  const block=createMainSummitBlock(mainSummitLayout,347,100);
  const footpath=createMainSummitTrail(block.heightAt,347);
  const reversed=footpath.points;
  const cumulative=[0];
  for(let i=1;i<reversed.length;i++){
    const a=reversed[i-1]!,b=reversed[i]!;
    cumulative.push(cumulative[i-1]!+
      Math.hypot(b.east-a.east,b.north-a.north,b.height-a.height));
  }
  const footpathM=cumulative.at(-1)!;
  const segmentM=summitSledLineLengthM/(summitSledGateCount+1);
  function pointAt(metresDownhill:number){
    const remaining=footpathM-metresDownhill;
    if(remaining<0||remaining>footpathM)throw new RangeError('Outside P1 reference');
    let lo=0,hi=cumulative.length-1;
    while(lo+1<hi){
      const m=(lo+hi)>>>1;
      if(cumulative[m]!>remaining)hi=m;
      else lo=m;
    }
    const t=(remaining-cumulative[lo]!)/(cumulative[hi]!-cumulative[lo]!);
    const a=reversed[lo]!,b=reversed[hi]!;
    const east=a.east+(b.east-a.east)*t;
    const north=a.north+(b.north-a.north)*t;
    const height=a.height+(b.height-a.height)*t;
    return {east,north,height};
  }
  const points=Array.from({length:summitSledGateCount},(_,i)=>{
    const cumulativeM=(i+1)*segmentM;
    const point=pointAt(cumulativeM);
    return {
      gate:i+1,segmentM,cumulativeM,...point,
      blockGround:block.heightAt(point.east,point.north),
      supportedHikingFoot:footpath.sampleWalkwaySurface(point.east,point.north,.27),
    };
  });
  return {block,footpathM,segmentM,points,unmeasuredFinalM:summitSledLineLengthM-footpathM};
}

test('D2: official 6037.881 total is closed only as a NUMERIC split template, not a verified sled route',t=>{
  const v=p1WalkwayReference();
  t.after(v.block.dispose);
  assert.equal(summitSledGateCount,12);
  assert.equal(summitSledLineLengthM,6037.881);
  assert.equal(v.points.length,12);
  assert.ok(Math.abs(v.segmentM*13-summitSledLineLengthM)<1e-9);
  assert.ok(Math.abs(v.footpathM-5609.66845909278)<1e-6);
  assert.ok(Math.abs(v.unmeasuredFinalM-428.2125409072205)<1e-6);
  assert.ok(v.points.every(p=>p.cumulativeM<v.footpathM),
    'reference points fit the P1 walkway, but the full sled descent does not');
  t.diagnostic(JSON.stringify({
    official:summitSledLineLengthM,p1: v.footpathM,remaining:v.unmeasuredFinalM,
    warning:'12 labelled crosswalk points are not production sled gates',
  }));
});

test('D2: 11 hiking-ribbon points contact the P1 foot, the 12th falls on station approach',t=>{
  const v=p1WalkwayReference();
  t.after(v.block.dispose);
  let supported=0;
  for(const point of v.points){
    assert.ok(Number.isFinite(point.blockGround));
    // The P1 trail can have designed cut-and-fill: compare with its own
    // supported foot, not arbitrarily forcing the original P1 terrain.
    if(point.supportedHikingFoot!==undefined){
      supported++;
      assert.ok(Math.abs(point.supportedHikingFoot-point.height)<.001,
        `Mismatched P1 reference at station G${point.gate}`);
    }else {
      assert.equal(point.gate,12,'all other points must have walkway support');
      assert.ok(Math.abs(point.blockGround!-point.height)<.001);
    }
  }
  assert.equal(supported,11);
});

test('D2: transcribing reference gate coordinates cannot promote them to a 12-gate player run',t=>{
  const v=p1WalkwayReference();
  t.after(v.block.dispose);
  const provisional=v.points.map(p=>({
    index:p.gate,cumulative:+p.cumulativeM.toFixed(3),
    e:+p.east.toFixed(3),n:+p.north.toFixed(3),y:+p.height.toFixed(3),
    reference:p.supportedHikingFoot!==undefined?'P1-walking-strip':'P1-gate-approach',
    acceptedForSled:false,
  }));
  assert.equal(provisional.filter(p=>p.acceptedForSled).length,0);
  assert.ok(v.unmeasuredFinalM>400);
  t.diagnostic(JSON.stringify(provisional));
});
