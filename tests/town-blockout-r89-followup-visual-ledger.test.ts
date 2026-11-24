import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=fileURLToPath(new URL('../docs/交流区/GPT/R89-星港坪牌板绕行与羊圈西野新眼-2026-11-23/',import.meta.url));
const report=JSON.parse(readFileSync(join(dir,'za22-live-walk.json'),'utf8'));
const name=(id:string)=>report.r89RefinedViews.samples.find((p:{id:string})=>p.id===id);
test('R89 follow-up: four day/night PNGs are real native render frames with source SHA',()=>{
  assert.equal(report.segment,'a-r89-refine');
  assert.equal(report.errors,0);
  assert.ok(report.r89RefinedViews.canvasVisible);
  assert.equal(report.paths.length,1);
  assert.ok(report.paths[0].poses.length>=75);
  for(const id of ['front-high-actual-clear-of-sign','sheep-open-wildland-facing-west'])
    for(const state of ['day','night']){
      const b=readFileSync(join(dir,`${id}-${state}.png`));
      assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');
      assert.equal(b.readUInt32BE(16),960);
      assert.equal(b.readUInt32BE(20),540);
      const snap=report.paths[0].checkpoints.find((p:{label:string})=>p.label===`${id}-${state}`);
      assert.ok(snap);
      assert.equal(snap.lighting,state==='night'?'雪夜':'白昼');
    }
  assert.match(readFileSync(join(dir,'source-commit.txt'),'utf8').trim(),/^[0-9a-f]{40}$/);
});
test('R89 cross-window D defect: starport native walk loses >=100m footing and enters airborne state',()=>{
  const high=name('front-high-actual-clear-of-sign');
  assert.ok(high);
  assert.ok(Math.hypot(high.pose.east-327,high.pose.north-657)<1);
  assert.ok(high.pose.hud.includes('腾空'),'capture has not registered the terrain unsafe status');
  const poses=report.paths[0].poses.filter((p:{area:string})=>p.area==='mountain'||p.north>=640);
  const earliest=poses.find((p:{height:number})=>p.height>345);
  assert.ok(earliest,'no true high-elevation start frame');
  assert.ok(earliest.height-high.pose.height>100,'misreporting an ordinary traversable high lookout');
  // This test locks the regression OBSERVATION; it does not assert safety.
});
test('R89 A1: sheep west-facing eye uses a distinct actual player camera direction',()=>{
  const sheep=name('sheep-open-wildland-facing-west');
  assert.ok(sheep);
  assert.ok(Math.hypot(sheep.pose.east-78,sheep.pose.north-207)<1);
  assert.ok(report.paths[0].checkpoints.some((p:{label:string})=>p.label==='r89-sheep-real-moving-2'));
});
