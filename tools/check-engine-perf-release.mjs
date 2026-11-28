import {readFileSync} from 'node:fs';
import {summarizeFrames} from '../tools/voxel-tavern/town-blockout/engine-perf/metrics/frame-profiler.ts';
// Run with node --import tsx. This checks declared evidence, not hardware
// authenticity. The reviewer must inspect raw captures and production SHA.
const file=process.argv[2];
if(!file){console.error('Usage: node --import tsx tools/check-engine-perf-release.mjs <evidence.json>');process.exit(2);}
const report=JSON.parse(readFileSync(file==='-'?0:file,'utf8'));
const issues=[];
const need=(ok,msg)=>{if(!ok)issues.push(msg);};
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
need(report.scope==='production-browser','production-browser evidence required');
need(sha(report.baselineSha)&&sha(report.candidateSha)&&report.baselineSha!==report.candidateSha,'distinct full SHAs');
for(const k of ['sameContent','sameQuality','coverage','collision','interaction','multiplayer','rollback'])need(report.checks?.[k]===true,'missing acceptance: '+k);
const cases=['plaza-turn','crater-turn','front-turn','rear-turn','walk-stream','sled','cable','cold-entry'];
const med=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
for(const device of ['pc','mobile-real'])for(const name of cases){
 const rows=(Array.isArray(report.runs)?report.runs:[]).filter(r=>r.deviceClass===device&&r.case===name);
 const label=device+'/'+name;
 if(rows.length<3){issues.push(label+': requires >=3 matched pairs');continue;}
 const before=[],after=[];
 const ids=new Set();
 for(const r of rows){
  need(typeof r.runId==='string'&&!ids.has(r.runId),label+': unique run ID');ids.add(r.runId);
  need(r.sameConditions===true&&typeof r.hardware==='string'&&r.hardware.length>0&&typeof r.viewport==='string'&&Number.isFinite(r.dpr)&&r.dpr>0&&typeof r.quality==='string'&&typeof r.rawEvidence==='string'&&r.rawEvidence.length>0,label+': incomplete metadata');
  need(r.errorCount===0,label+': runtime error or missing count');
  try{
   for(const arm of [r.baseline,r.candidate]){
    if(!Array.isArray(arm)||arm.length<120||arm.some(f=>!Number.isFinite(f.draws)||!Number.isFinite(f.triangles)||!Number.isFinite(f.uploadBytes)||!f.cpuStages||typeof f.cpuStages!=='object'||!(f.gpuMs===null||Number.isFinite(f.gpuMs))))throw Error('raw frames incomplete');
   }
   before.push(summarizeFrames(r.baseline));after.push(summarizeFrames(r.candidate));
  }catch(e){issues.push(label+': '+e.message);}
 }
 if(before.length!==rows.length)continue;
 const limit=device==='pc'?17:34; // rounded 60/30Hz frame-time target
 const b=med(before.map(x=>x.p95)),a=med(after.map(x=>x.p95));
 need(a<=Math.max(limit,b*1.05),label+': median P95 regression');
 need(med(after.map(x=>x.over50))<=med(before.map(x=>x.over50)),label+': long-frame count regression');
 if(name.endsWith('-turn'))need(a<=limit||a<=b*.7,label+': target or >=30% P95 improvement not met');
 console.log(label,JSON.stringify({beforeP95:b,afterP95:a,target:limit,targetMet:a<=limit,p99:med(after.map(x=>x.p99)),max:Math.max(...after.map(x=>x.max))}));
}
if(issues.length){console.error('RELEASE EVIDENCE FAIL\n'+issues.join('\n'));process.exitCode=1;}else console.log('Evidence format and provisional regression thresholds PASS; human production/visual review still required.');
