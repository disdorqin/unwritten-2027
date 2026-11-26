import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,process.argv[2]==='deep'?'.evidence/c-r30-interlayer':process.argv[2]==='lift'?'.evidence/c-r30-lift':'.evidence/c-r30-camp'),cache=resolve(out,'.vite-cache');
await mkdir(out,{recursive:true});
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;overflow:hidden;background:#1c232a}</style><script type="module" src="/tools/fixtures/town-c-r30-camp-review.ts"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},plugins:[{name:'camp-r30-review',configureServer(vite){vite.middlewares.use('/camp-r30-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const result={scope:'real mounted mine host and local movement query, review camera light only, not live Presence or device performance',errors:[],views:{},passed:false};
try{
 await server.listen();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});page.on('pageerror',e=>result.errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/camp-r30-review',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.campR30?.inspect().frames>2);
 for(const name of process.argv[2]==='deep'?['deep-upper','deep-bore','deep-lower']:process.argv[2]==='lift'?['lift-upper','lift-mid','lift-deep','wreck']:['entry','hearth','dorm','canteen','memorial','exit']){
  assert.ok(await page.evaluate(name=>window.campR30.setView(name),name),name+' blocked');
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  result.views[name]=await page.evaluate(()=>window.campR30.inspect());
  await page.screenshot({path:resolve(out,name+'.jpg'),type:'jpeg',quality:82});
 }
 await page.evaluate(()=>{window.campR30.setView('entry');window.campR30.reset()});
 await page.keyboard.down('w');assert.ok(await page.evaluate(()=>window.campR30.step(1)));await page.keyboard.up('w');
 await page.waitForTimeout(1200);result.walk=await page.evaluate(()=>window.campR30.inspect());
 assert.ok(result.walk.walked>2.69&&result.walk.trustedW>0&&result.walk.rejected===0);assert.deepEqual(result.errors,[]);result.passed=true;
}finally{await browser?.close().catch(()=>{});await server.close();await rm(cache,{recursive:true,force:true});await writeFile(resolve(out,'review.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));
