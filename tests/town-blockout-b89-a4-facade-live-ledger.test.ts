import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../docs/交流区/GPT/B89-A4补给站新屋面与工业带正立面-2026-11-24/',import.meta.url));
const report=JSON.parse(readFileSync(join(dir,'za22-live-walk.json'),'utf8'));
const cases=[['supply-same-eye',-74,126],['supply-front-quarter',-88,132],['instrument-front-quarter',-65,147]] as const;
test('B89 A4: six real grounded day/night facade images with production canvas and zero browser errors',()=>{
  assert.equal(report.segment,'a4-b89-facades');
  assert.equal(report.errors,0);
  assert.ok(report.b89Facades.canvasVisible);
  for(const key of ['pageErrors','consoleErrors','requestFailures','httpErrors']) assert.equal(report[key].length,0);
  assert.ok(report.paths[0].poses.length>=200);
  for(const [id,e,n] of cases){
    const view=report.b89Facades.samples.find((x:{id:string})=>x.id===id);
    assert.ok(view&&view.pose.hud.includes('行走'));
    assert.ok(Math.hypot(view.pose.east-e,view.pose.north-n)<.6);
    for(const light of ['day','night']){
      const bytes=readFileSync(join(dir,id+'-'+light+'.png'));
      assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),540);
      const shot=report.paths[0].checkpoints.find((x:{label:string})=>x.label===id+'-'+light);
      assert.ok(shot&&shot.hud.includes('行走'));
      assert.equal(shot.lighting,light==='day'?'白昼':'雪夜');
      assert.equal(shot.wire.area,'west');
    }
  }
  assert.match(readFileSync(join(dir,'source-commit.txt'),'utf8').trim(),/^[a-f0-9]{40}$/);
});
