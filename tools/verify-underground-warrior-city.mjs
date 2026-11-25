import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.argv[2]??'docs/交流区/GPT/窗C-批94勇士城整体成形-2026-11-24'),cache=resolve(out,'.vite-cache');
await mkdir(out,{recursive:true});
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;overflow:hidden;background:#202731}</style><script type="module" src="/tools/fixtures/underground-warrior-city-review.ts"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},plugins:[{name:'city-review',configureServer(vite){vite.middlewares.use('/city-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const report={scope:'local unregistered -165 candidate; existing assets composed; no authority',errors:[],views:{},passed:false};
try{await server.listen();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});page.on('pageerror',e=>report.errors.push(String(e)));
await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/city-review',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.cityReview?.inspect().frames>2);
for(const name of ['gate','street','square','tavern','forge','market','exit']){
 assert.ok(await page.evaluate(name=>window.cityReview.setView(name),name),name+' standing point blocked');
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const stats=await page.evaluate(()=>window.cityReview.inspect());const shot=await page.screenshot({path:resolve(out,name+'.png')});assert.ok(shot.byteLength>10000);report.views[name]=stats;
}
await page.evaluate(()=>{window.cityReview.setView('gate');window.cityReview.resetFPS()});
await page.keyboard.down('w');assert.ok(await page.evaluate(()=>window.cityReview.step(3)));await page.keyboard.up('w');await page.waitForTimeout(800);
report.walk=await page.evaluate(()=>window.cityReview.inspect());assert.ok(report.walk.walked>8.99&&report.walk.trustedW>0&&report.walk.rejected===0);assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser?.close().catch(()=>{});await server.close();await rm(cache,{recursive:true,force:true});await writeFile(resolve(out,'review-stats.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
