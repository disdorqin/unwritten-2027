import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,process.argv[2]==='bank'?'.evidence/c-r30-deep-bank':process.argv[2]==='shallow'?'.evidence/c-r30-shallow':process.argv[2]==='creaturepose'?'.evidence/c-r30-creature-poses':process.argv[2]==='creature'?'.evidence/c-r30-creatures':process.argv[2]==='ore'?'.evidence/c-r30-ore':process.argv[2]==='railcargo'?'.evidence/c-r30-rail-cargo':process.argv[2]==='railrepair'?'.evidence/c-r30-rail-repair':process.argv[2]==='mainline'?'.evidence/c-r30-mainline':process.argv[2]==='return'?'.evidence/c-r30-return-bay':process.argv[2]==='annex'?'.evidence/c-r30-support-annex':process.argv[2]==='thinwall'?'.evidence/c-r30-thinwall':process.argv[2]==='workbay'?'.evidence/c-r30-workbay':process.argv[2]==='gallery'?'.evidence/c-r30-gallery':process.argv[2]==='crystal'?'.evidence/c-r30-crystal-host':process.argv[2]==='deep'?'.evidence/c-r30-interlayer':process.argv[2]==='lift'?'.evidence/c-r30-lift':'.evidence/c-r30-camp'),cache=resolve(out,'.vite-cache');
await mkdir(out,{recursive:true});
const fixture=process.argv[2]==='crystal'?'town-c-r30-crystal-host-review.ts':'town-c-r30-camp-review.ts';
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;overflow:hidden;background:#1c232a}</style><script type="module" src="/tools/fixtures/'+fixture+'"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},plugins:[{name:'camp-r30-review',configureServer(vite){vite.middlewares.use('/camp-r30-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const result={scope:'real mounted mine host and local movement query, review camera light only, not live Presence or device performance',errors:[],views:{},passed:false};
try{
 await server.listen();browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});page.on('pageerror',e=>result.errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/camp-r30-review',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.campR30?.inspect().frames>2);
 for(const name of process.argv[2]==='bank'?['bankwest','bankbench','bankwater','bankeast','bankbypass']:process.argv[2]==='shallow'?['shallowentry','shallowdesk','shallowrack','shallowturn','shallowbench','shallowbarrels','shallowexit']:process.argv[2]==='creaturepose'?['creature-90-A-01-action','creature-90-B-04-action','creature-90-C-02-action','creature-90-D-03-action']:process.argv[2]==='creature'?['creature-90-A-01','creature-90-A-05','creature-90-B-04','creature-90-C-02','creature-90-D-01','creature-90-D-03']:process.argv[2]==='ore'?['ore-1','ore-2','ore-3','ore-4','ore-5','ore-1-cracked','ore-1-open']:process.argv[2]==='railcargo'?['rail-cargo-camp','rail-cargo-curve','rail-cargo-gate']:process.argv[2]==='railrepair'?['rail-damage-sleepers','rail-damage-gauge','rail-damage-turnout-rust','rail-sleepers','rail-gauge','rail-turnout-rust']:process.argv[2]==='mainline'?['rail-camp','rail-sleepers','rail-gauge','rail-curve','rail-turnout-rust','rail-turnout','rail-gate']:process.argv[2]==='return'?['returnapproach','returnstand','returnbell']:process.argv[2]==='annex'?['annexentry','annexbunk','annexmap','annexrear','annexsupply','annexreturn']:process.argv[2]==='thinwall'?['pocketclosed','pocketopen','shortcutclosed','shortcutopen','baycart']:process.argv[2]==='workbay'?['bayentry','baycart','baywreck','baydesk']:process.argv[2]==='gallery'?['gallery','collapse','mainshaft','oldsupports','deeptrack']:process.argv[2]==='crystal'?['entry','forest','overlook','quay','far']:process.argv[2]==='deep'?['deep-upper','deep-bore','deep-lower']:process.argv[2]==='lift'?['lift-upper','lift-mid','lift-deep','wreck']:['entry','hearth','dorm','canteen','memorial','exit']){
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
