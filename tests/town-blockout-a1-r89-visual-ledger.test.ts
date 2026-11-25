import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../docs/交流区/GPT/A1-R89保护带与羊圈新眼昼夜实拍-2026-11-23/',import.meta.url));
const report=JSON.parse(readFileSync(join(root,'za22-live-walk.json'),'utf8'));

test('R89 A1 photography: six real production screenshots with measured daylight and night',()=>{
  assert.equal(report.segment,'a1-r89-visual');
  assert.equal(report.errors,0);
  assert.equal(report.pageErrors.length,0);
  assert.equal(report.consoleErrors.length,0);
  assert.equal(report.requestFailures.length,0);
  assert.equal(report.httpErrors.length,0);
  assert.ok(report.a1R89Visual?.canvasVisible);
  assert.equal(report.a1R89Visual.views.length,3);
  const expected=['market-14-protected-row','ice-palace-forecourt-protected','sheep-relief-shifted-eye'];
  for(const name of expected)for(const state of ['day','night']){
    const b=readFileSync(join(root,`${name}-${state}.png`));
    assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(b.readUInt32BE(16),960);
    assert.equal(b.readUInt32BE(20),540);
    const snap=report.paths[0].checkpoints.find((item:{label:string})=>item.label===`${name}-${state}`);
    assert.ok(snap);
    assert.equal(snap.lighting,state==='day'?'白昼':'雪夜');
    assert.equal(snap.wire?.area,'town');
  }
  assert.match(readFileSync(join(root,'source-commit.txt'),'utf8').trim(),/^[0-9a-f]{40}$/);
});

test('R89 A1 photography: sheep view actually moves away from blocked default eye using native controls',()=>{
  const shifted=report.a1R89Visual.views.find((v:{id:string})=>v.id==='sheep-relief-shifted-eye');
  assert.ok(shifted);
  assert.ok(Math.hypot(shifted.actual.east-70,shifted.actual.north-215)>8);
  assert.ok(Math.hypot(shifted.actual.east-78,shifted.actual.north-207)<.6);
  assert.ok(report.paths[0].poses.length>=20);
});
