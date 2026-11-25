import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../docs/交流区/GPT/A2-R89坑沿内侧与前山高处新眼-2026-11-23/',import.meta.url));
const report=JSON.parse(readFileSync(join(root,'za22-live-walk.json'),'utf8'));
const samples=report.a2R89Visual?.samples??[];
const byId=Object.fromEntries(samples.map((s:{id:string})=>[s.id,s])) as Record<string,any>;

test('R89 A2: genuine B01 night-authorized rim walk and six first-person day/night PNGs',()=>{
  assert.equal(report.segment,'a2-r89-visual');
  assert.equal(report.errors,0);
  assert.equal(report.pageErrors.length+report.consoleErrors.length+report.requestFailures.length+report.httpErrors.length,0);
  assert.ok(report.a2R89Visual.canvasVisible);
  assert.equal(report.paths.length,1);
  assert.equal(report.paths[0].craterWindow?.canEnterRestricted,true);
  assert.ok(report.paths[0].poses.length>=180);
  const inside=byId['b01-upper-slope-new-eye'];
  assert.ok(inside?.legalNightWindow);
  assert.ok(Math.hypot(inside.actual.east+132.5,inside.actual.north-133.6)<.5);
  assert.ok(inside.actual.height>8&&inside.actual.height<9);
  assert.ok(report.paths[0].checkpoints.filter((c:{label:string})=>c.label?.startsWith('a2-upper-slope-view')).length>=7);
  for(const id of ['b01-upper-slope-new-eye','front-mountain-high-candidate','front-hill-road-approach']){
    for(const time of ['day','night']){
      const path=join(root,`${id}-${time}.png`);
      const bytes=readFileSync(path);
      assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16),960);
      assert.equal(bytes.readUInt32BE(20),540);
      const checkpoint=report.paths[0].checkpoints.find((p:{label:string})=>p.label===`${id}-${time}`);
      assert.ok(checkpoint);
      assert.equal(checkpoint.lighting,time==='night'?'雪夜':'白昼');
    }
  }
  assert.match(readFileSync(join(root,'source-commit.txt'),'utf8').trim(),/^[a-f0-9]{40}$/);
});

test('R89 A2: high elevation is real but destination did not land at requested coordinate',()=>{
  const upper=byId['front-mountain-high-candidate'],approach=byId['front-hill-road-approach'];
  assert.ok(upper&&approach);
  assert.ok(Math.abs(upper.actual.east-336)<.5&&Math.abs(upper.actual.north-640)<.5);
  assert.ok(upper.actual.height>300,'high camera is not truly in mountain/cloud domain');
  assert.equal(upper.arrived,false,'do not claim the planned starport footprint was visited');
  assert.equal(upper.validHighEye,false,'the old exact-coordinate quality gate must remain unsatisfied');
  assert.ok(Math.abs(approach.actual.east-290)<.5&&Math.abs(approach.actual.north-300)<.5);
  assert.ok(approach.actual.height<20);
});
