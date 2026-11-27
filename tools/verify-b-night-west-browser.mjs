import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&/^[dD]:[/\\]/.test(out)&&!existsSync(out),'Fresh D-drive evidence directory required');
await mkdir(out,{recursive:true});
const require=createRequire(path.join(repo,'package.json')),{chromium}=require('playwright');
const root=path.join(repo,'tools','voxel-tavern'),viewerRequire=createRequire(path.join(root,'package.json'));
const {createServer}=await import(pathToFileURL(viewerRequire.resolve('vite')).href);
let server,browser;const errors=[],views=[];let failure;
try{
 server=await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo]}}});await server.listen();
 const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
 browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1160,height:760},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>errors.push(r.url()+':'+r.failure()?.errorText));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+':'+r.url())});
 const response=await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/town-night-b-west-review.html',{waitUntil:'domcontentloaded',timeout:40000});assert.equal(response.status(),200);
 await page.waitForFunction(()=>window.__nightBWestReview?.state().frame>5,{timeout:40000});
 for(let i=0;i<5;i++){
  await page.keyboard.press(String(i+1));await page.waitForFunction(index=>{const s=window.__nightBWestReview?.state();return s?.selected===index&&s.frames>=30},i,{timeout:20000});
  const s=await page.evaluate(()=>window.__nightBWestReview.state());const samples=s.frameMs.slice(-25).sort((a,b)=>a-b);
  const p95=samples[Math.ceil(samples.length*.95)-1];const fps=1000*samples.length/samples.reduce((a,b)=>a+b,0);
  const file='west-'+(i+1)+'.jpg';await page.screenshot({path:path.join(out,file),type:'jpeg',quality:88});
  assert.ok(s.draws>0&&s.triangles>0);views.push({file,label:s.label,draws:s.draws,triangles:s.triangles,gpu:s.gpu,fps,p95,cutCount:s.cutCount,lowered:s.lowered});console.log(JSON.stringify(views.at(-1)));
 }
 assert.equal(errors.length,0);assert.ok(views.every(v=>v.cutCount>0&&v.lowered>0));
}catch(e){failure=e.stack??String(e);}
finally{await browser?.close();await server?.close();await rm(path.join(out,'.vite-cache'),{recursive:true,force:true});await writeFile(path.join(out,'report.json'),JSON.stringify({scope:'isolated west geometry, not production route or real phone',sha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),views,errors,failure,complete:!failure},null,2));}
if(failure)throw Error(failure);
