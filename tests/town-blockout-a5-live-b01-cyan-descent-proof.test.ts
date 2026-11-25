import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=fileURLToPath(new URL('../docs/交流区/GPT/A5-B01合法夜窗晶簇近摄-2026-11-22/',import.meta.url));
const report=JSON.parse(readFileSync(join(dir,'za22-live-walk.json'),'utf8'));

test('A-5: B-01 descent is authorized by genuine Presence night window, not a camera teleport',()=>{
  assert.equal(report.segment,'a5-crystal-live');
  assert.equal(report.errors,0);
  assert.ok(report.a5CloseView?.legalWindow?.canEnterRestricted);
  assert.equal(report.paths.length,1);
  const path=report.paths[0];
  const onTrail=path.checkpoints.filter((p:{label?:string})=>p.label?.startsWith('a5-b01-t'));
  assert.ok(onTrail.length>=55,'the actual spiral trail must be walked in many short steps');
  assert.ok(path.poses.length>=800,'missing continuous native position frames');
  assert.ok(path.poses.some((p:{height:number})=>p.height<0),'camera never descended into crater');
  assert.ok(path.poses.some((p:{height:number})=>p.height< -13),'did not reach the cyan-nearby t=.721 trail grade');
  const final=report.a5CloseView.actual;
  assert.ok(Math.abs(final.east+143.874)<.5&&Math.abs(final.north-202.776)<.5);
  assert.ok(Math.abs(final.height+14.458)<.5);
});

test('A-5: capture actually reaches cyan line-of-sight, reports actual >2m distance, preserves real screenshots',()=>{
  const d=report.a5CloseView.sightDistance;
  assert.ok(d>5&&d<6,'do not claim a fake 2m first-person shot');
  const sha=readFileSync(join(dir,'source-commit.txt'),'utf8').trim();
  assert.match(sha,/^[0-9a-f]{40}$/);
  for(const name of ['a5-crystal-rim-night.png','a5-crystal-from-trail-day.png','a5-crystal-from-trail-night.png',
    'a5-trail-progress-0.360.png','a5-trail-progress-0.600.png']){
    const b=readFileSync(join(dir,name));
    assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(b.readUInt32BE(16),960);
    assert.equal(b.readUInt32BE(20),540);
  }
});
