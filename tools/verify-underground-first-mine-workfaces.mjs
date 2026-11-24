import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.argv[2]??'docs/交流区/GPT/窗C-批94首层工位驿站实景-2026-11-24'),cache=resolve(out,'.vite-cache');
await mkdir(out,{recursive:true});
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;overflow:hidden;background:#161d27}</style><script type="module" src="/tools/fixtures/underground-first-mine-workfaces-review.ts"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},plugins:[{name:'workface-review',configureServer(vite){vite.middlewares.use('/workface-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const report={scope:'actual shared first mine layout and mounted workface artwork; fixture movement not live Presence',errors:[],views:{},passed:false};
try{await server.listen();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});page.on('pageerror',e=>report.errors.push(String(e)));
await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/workface-review',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.workfaceReview?.inspect().frames>2);
for(const name of ['workface-1','workface-2','workface-3','workface-4','workface-5','support-station']){
 assert.ok(await page.evaluate(name=>window.workfaceReview.setView(name),name),name+' standing point blocked');
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const stats=await page.evaluate(()=>window.workfaceReview.inspect());const shot=await page.screenshot({path:resolve(out,name+'.png')});assert.ok(shot.byteLength>10000);report.views[name]=stats;
}
await page.evaluate(()=>{window.workfaceReview.setView('workface-1');window.workfaceReview.resetFPS()});
await page.keyboard.down('w');assert.ok(await page.evaluate(()=>window.workfaceReview.step(.5)));await page.keyboard.up('w');await page.waitForTimeout(800);
report.walk=await page.evaluate(()=>window.workfaceReview.inspect());assert.ok(report.walk.walked>1.49&&report.walk.trustedW>0&&report.walk.rejected===0);assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser?.close().catch(()=>{});await server.close();await rm(cache,{recursive:true,force:true});await writeFile(resolve(out,'review-stats.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
