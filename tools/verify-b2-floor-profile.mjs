/**
 * B-2: complete live B-01 spiral and measure the real floor camera.
 * Call from the established ZA-22 local production preview harness.
 * Only test input and observation; no production viewer or game-state edits.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildB2FloorRoute} from './verify-b2-floor-route.ts';

export async function runB2FloorProfile({openTown,follow,walkTo,readPose,face,waitForWire,
  snapshot,sampleA6TwentySeconds,report,output}) {
  const route=buildB2FloorRoute();
  const {page,evidence,westWindow}=await openTown('b2-pit-floor');
  const result={survey:{lip:route.lip,floor:route.floor,center:route.center,
    floorHeight:route.floorHeight,knots:route.points.length},
    legalWindow:null,visited:0,complete:false,measurements:[],
    note:'Only the original player view and real server poses. Visual day/night switch is not permission.',
    lightCount:null,lightEvidence:'The production renderer profile exposes draws/tris/points, not scene light counts.'};
  report.b2Floor=result;
  const save=()=>writeFile(join(output,'b2-floor-progress.json'),JSON.stringify(result,null,2)+'\n');
  await save();
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label:'陨石坑口'});
  if(await page.locator('#town-settings').evaluate(d=>d.open))
    await page.locator('#town-settings-close').click();
  await page.waitForFunction(()=>{
    const match=/东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/.exec(document.querySelector('#position')?.textContent??'');
    return match&&Math.hypot(+match[1]-2,+match[2]-159)<1.2;
  },undefined,{timeout:45000});
  // Wait *before* crossing the actual guard line, never disable the guard.
  await follow(page,evidence,[[-12,159],[-40,159],[-67,159]],'b2-approach');
  const deadline=Date.now()+120000;
  while(Date.now()<deadline) {
    const f=westWindow();
    if(f?.state?.phase==='night-window'&&f.state.canEnterRestricted) {
      const now=f.joinEpoch+Date.now()-f.joinReceivedAt;
      if(f.state.morningBellAt-now>60000) {
        result.legalWindow={...f.state,now};
        evidence.craterWindow=result.legalWindow;
        break;
      }
    }
    await page.waitForTimeout(350);
  }
  assert.ok(result.legalWindow,'West Presence did not authorize legal night entry');
  await walkTo(page,evidence,[-71,159],'b2-rim-authorized');
  await waitForWire(page,evidence,pose=>pose?.area==='west'&&pose.east<-70.55);
  await snapshot(page,evidence,'b2-rim-night');
  await save();
  const knots=route.points;
  for(let i=0;i<knots.length;i++){
    const knot=knots[i];
    await walkTo(page,evidence,[knot.east,knot.north],'b2-b01-t'+knot.t.toFixed(3));
    const actual=await readPose(page);
    assert.ok(Math.abs(actual.height-knot.height)<1.3,
      'B01 vertical divergence at t='+knot.t+': '+JSON.stringify({actual,knot}));
    result.visited=i+1;
    result.last={t:knot.t,actual,expected:knot,wire:evidence.poses.at(-1)};
    if(i%10===0||i===knots.length-1) await save();
    if(Math.abs(knot.t-.72)<.001)await snapshot(page,evidence,'b2-spiral-072-native');
  }
  await walkTo(page,evidence,[route.floor.east,route.floor.north],'b2-floor-apron');
  const actual=await readPose(page);
  assert.ok(Math.hypot(actual.east-route.center.east,actual.north-route.center.north)<route.floorRadius,
    'Not a true pit-bottom eye');
  assert.ok(Math.abs(actual.height-route.floorHeight)<.65,
    'Player not on the physical bottom: '+JSON.stringify({actual,survey:route.floor}));
  await face(page,evidence,route.floorYaw);
  result.floorPose=await readPose(page);
  result.floorWire=evidence.poses.at(-1);
  await save();
  for(const phase of ['night','day']){
    const wanted=phase==='night'?'雪夜':'白昼';
    if((await page.locator('#lighting').textContent())!==wanted){
      await page.locator('#town-panel-toggle').click();
      await page.locator('#lighting').click();
      await page.locator('#town-settings-close').click();
    }
    await page.waitForTimeout(850);
    assert.equal(await page.locator('#lighting').textContent(),wanted);
    const label='b2-floor-facing-rim-'+phase;
    await snapshot(page,evidence,label);
    const metrics=await sampleA6TwentySeconds(page,label);
    const lightingAfter=await page.locator('#lighting').textContent();
    result.measurements.push({label,phase,lightingAfter,stationary:await readPose(page),
      wire:evidence.poses.at(-1),...metrics});
    await save();
    assert.equal(lightingAfter,wanted,'Server phase changed during the timed sample; reject mixed lighting');
  }
  result.complete=true;
  await save();
}
