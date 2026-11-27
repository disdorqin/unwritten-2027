import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url)),sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const mode=process.argv[2]==='mobile'?'mobile':'desktop';
const out=resolve(root,'.evidence/c-r30-deep-review-'+sha.slice(0,8)+'-'+mode),cache=resolve(out,'.vite-cache');
await mkdir(out,{recursive:true});
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><style>body{margin:0;overflow:hidden;background:#161e27}button{font:16px sans-serif;background:#403729;color:#fff3dc;border:1px solid #9e8e75;border-radius:5px}</style><script type="module" src="/tools/fixtures/town-c-r30-deep-review.ts"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},plugins:[{name:'deep-r30-review',configureServer(vite){vite.middlewares.use('/deep-r30-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;const result={sha,mode,scope:'review fixture; real C/C2 host, geometry, camera and browser inputs; not production Presence or real phone',errors:[],views:{},passed:false};
try{
 await server.listen();
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage(mode==='mobile'?{viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true}:{viewport:{width:1280,height:720},deviceScaleFactor:1});
 page.on('pageerror',e=>result.errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/deep-r30-review',{waitUntil:'networkidle',timeout:25000});
 await page.waitForFunction(()=>window.deepReview?.inspect().frames>2);
 for(const name of mode==='mobile'?['open','corridor1','palaceArena']:['sealed','open','corridor1','city','corridor2','palace','palaceArena']){
  assert.equal(await page.evaluate(n=>window.deepReview.setView(n),name),true,name);
  await page.evaluate(()=>window.deepReview.reset());
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(done)))));
  result.views[name]=await page.evaluate(()=>window.deepReview.inspect());
  await page.screenshot({path:resolve(out,name+'.jpg'),type:'jpeg',quality:82});
 }
 await page.evaluate(()=>window.deepReview.setView('open'));
 if(mode==='mobile'){await page.getByRole('button',{name:'穿过层界'}).tap();await page.getByRole('button',{name:'前进'}).tap()}
 else {await page.keyboard.press('e');await page.keyboard.press('w')}
 result.input=await page.evaluate(()=>window.deepReview.inspect());
 assert.equal(result.input.transfers,1);assert.ok(result.input.steps>=5);assert.equal(result.input.rejected,0);
 assert.ok(mode==='mobile'?result.input.trustedTaps>=2:result.input.trustedKeys>=2);
 assert.ok(result.input.foot.domainId.endsWith('minus140-to-minus165'));
 assert.deepEqual(result.errors,[]);result.passed=true;
}finally{await browser?.close().catch(()=>{});await server.close();await rm(cache,{recursive:true,force:true});await writeFile(resolve(out,'review.json'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));
