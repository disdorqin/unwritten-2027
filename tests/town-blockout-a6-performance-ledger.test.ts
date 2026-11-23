import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const path=fileURLToPath(new URL('../docs/交流区/GPT/A6-四格二十秒原生帧率性能-2026-11-22/',import.meta.url));
const report=JSON.parse(readFileSync(join(path,'za22-live-walk.json'),'utf8'));
const table=report.a6Performance;
const groups=table?.fourGroups??[];

test('A-6: exactly four 20s native rAF measurements and actual renderer.info source',()=>{
  assert.equal(groups.length,4);
  for(const item of groups){
    assert.ok(item.durationMs>=20000&&item.durationMs<23000,`${item.label} duration not 20s`);
    assert.ok(item.frameCount>300);
    assert.ok(Math.abs(item.rafFps-item.frameCount*1000/item.durationMs)<1e-8);
    assert.ok(item.rendererInfoSamples>300,'no true renderer.info frame events');
    assert.ok(item.drawsMean>0&&item.trianglesMean>0);
    assert.equal(item.metricSource,'renderer.info.render via real town-frame-profile event');
  }
});

test('A-6: same session, validated legal positions, correct day/night and honest ratio',()=>{
  assert.equal(report.paths.length,1,'do not compare two browser/device sessions');
  assert.equal(report.errors,0);
  assert.equal(report.startupEvidence?.validSpawn??true,true);
  const by=Object.fromEntries(groups.map((m:{label:string})=>[m.label,m])) as Record<string,{rafFps:number;checkpoint:{east:number;north:number};lighting:string}>;
  for(const day of ['night','day']){
    const plaza=by[`plaza-clocktower-${day}`],pit=by[`kengkou-to-bowl-${day}`];
    assert.ok(plaza&&pit);
    assert.ok(Math.hypot(plaza.checkpoint.east-223,plaza.checkpoint.north-180)<1);
    assert.ok(Math.hypot(pit.checkpoint.east+44.5,pit.checkpoint.north-168)<2);
    assert.equal(plaza.lighting,day==='night'?'雪夜':'白昼');
    assert.equal(pit.lighting,plaza.lighting);
    const ratio=pit.rafFps/plaza.rafFps;
    assert.ok(Math.abs(ratio-table[`stationToPlazaRatio${day==='night'?'Night':'Day'}`])<1e-9);
  }
  assert.ok(table.stationToPlazaRatioNight<.8,'do not conceal night FPS failing the optimization target');
});

test('A-6: four genuine 960x540 PNG first-person screenshots + SHA are archived',()=>{
  const sha=readFileSync(join(path,'source-commit.txt'),'utf8').trim();
  assert.match(sha,/^[a-f0-9]{40}$/);
  for(const m of groups){
    const bytes=readFileSync(join(path,m.label+'.png'));
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),960);
    assert.equal(bytes.readUInt32BE(20),540);
  }
});
