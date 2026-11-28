import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('release evidence checker rejects missing or fixture-only evidence',()=>{
 const missing=spawnSync(process.execPath,['--import','tsx','tools/check-engine-perf-release.mjs'],{encoding:'utf8'});
 assert.equal(missing.status,2);
 const fixture=spawnSync(process.execPath,['--import','tsx','tools/check-engine-perf-release.mjs','-'],{encoding:'utf8',input:JSON.stringify({scope:'fixture',runs:[]})});
 assert.equal(fixture.status,1);
 assert.match(fixture.stderr,/production-browser evidence required/);
 assert.match(fixture.stderr,/mobile-real\/rear-turn/);
});
