import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(process.argv[2]??'docs/交流区/GPT/窗C-批91地下二层实物审图-2026-11-24'),cache=resolve(out,'.vite-cache');
await mkdir(out,{recursive:true});
const html='<!doctype html><meta charset="utf-8"><style>body{margin:0;overflow:hidden;background:#10171e}</style><script type="module" src="/tools/fixtures/underground-second-mine-review.ts"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},plugins:[{name:'mine-review',configureServer(vite){vite.middlewares.use('/mine-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const report={scope:'local unregistered -140 candidate; water injected by fixture, not night authority',errors:[],views:{},passed:false};
try{await server.listen();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});page.on('pageerror',e=>report.errors.push(String(e)));
await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/mine-review',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.mineReview?.inspect().frames>2);
for(const [name,state] of [['support','middle'],['workface','middle'],['westWing','middle'],['eastWing','middle'],['collapse','middle'],['barracks','middle'],['bypass','high']]){
assert.ok(await page.evaluate(({name,state})=>window.mineReview.state(state)&&window.mineReview.setView(name),{name,state}));
await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
const label=name+'-'+state,stats=await page.evaluate(()=>window.mineReview.inspect());assert.equal(stats.boat,state==='middle');assert.equal(stats.water,state!=='low');
const shot=await page.screenshot({path:resolve(out,label+'.png')});assert.ok(shot.byteLength>10000);report.views[label]=stats;
}
await page.evaluate(()=>{window.mineReview.state('middle');window.mineReview.setView('workface');window.mineReview.resetFPS()});
await page.keyboard.down('w');assert.ok(await page.evaluate(()=>window.mineReview.step(2)));await page.keyboard.up('w');
await page.waitForTimeout(1000);report.walk=await page.evaluate(()=>window.mineReview.inspect());assert.ok(report.walk.walked>5.99&&report.walk.trustedW>0&&report.walk.rejected===0);assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser?.close().catch(()=>{});await server.close();await rm(cache,{recursive:true,force:true});await writeFile(resolve(out,'review-stats.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
