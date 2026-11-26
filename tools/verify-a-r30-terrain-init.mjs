import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync,mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createTerrainGrid} from './voxel-tavern/town-blockout/terrain.ts';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='tools/voxel-tavern/town-blockout';
const git=(...a)=>execFileSync('git',a,{cwd:root,windowsHide:true,maxBuffer:16*1024*1024});
const old=git('rev-parse','b2f28dc4').toString().trim(),source=git('rev-parse','HEAD').toString().trim();
const tmp=mkdtempSync(join(root,'.a-r30-terrain-init-'));
try{
 cpSync(join(root,prefix),join(tmp,prefix),{recursive:true});
 cpSync(join(root,'src'),join(tmp,'src'),{recursive:true});
 cpSync(join(root,'tools','fixtures'),join(tmp,'tools','fixtures'),{recursive:true});
 writeFileSync(join(tmp,prefix,'terrain.ts'),git('show',old+':'+prefix+'/terrain.ts'));
 const {createTerrainGrid:before}=await import(pathToFileURL(join(tmp,prefix,'terrain.ts')).href);
 const hash=g=>createHash('sha256').update(new Uint8Array(g.elevation.buffer)).update(g.surfaces).digest('hex');
 const measure=(fn,options)=>{const t=performance.now(),g=fn(options);return {g,ms:performance.now()-t,digest:hash(g)}};
 const samples=[];
 // Warm both implementations, then interleave orders to avoid systematic
 // warm-cache bias. Equality includes all raw Float32 and surface bytes.
 before();createTerrainGrid();
 for(const relief of [true,false]){
  const pairs=[];
  for(let i=0;i<3;i++){
   const a=i%2?measure(createTerrainGrid,{relief}):measure(before,{relief});
   const b=i%2?measure(before,{relief}):measure(createTerrainGrid,{relief});
   const x=i%2?b:a,y=i%2?a:b;
   assert.equal(x.digest,y.digest);
   assert.deepEqual(x.g.elevation,y.g.elevation);assert.deepEqual(x.g.surfaces,y.g.surfaces);
   pairs.push({beforeMs:x.ms,afterMs:y.ms,digest:x.digest,cells:x.g.elevation.length});
  }
  const median=arr=>arr.sort((a,b)=>a-b)[Math.floor(arr.length/2)];
  samples.push({relief,pairs,medianBefore:median(pairs.map(p=>p.beforeMs)),medianAfter:median(pairs.map(p=>p.afterMs))});
 }
 const report={old,source,scope:'same process paired terrain construction; bit exact; timing sensitive to concurrent local load',samples};
 if(process.argv[2]){const out=resolve(process.argv[2]);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report));
}finally{rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
