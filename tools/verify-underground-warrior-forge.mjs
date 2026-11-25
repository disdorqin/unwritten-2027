import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(process.argv[2]??'docs/交流区/GPT/窗C-批91铁匠铺实物审图-2026-11-24');
await mkdir(out,{recursive:true});
const cache=resolve(out,'.vite-cache');
const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#181e25}</style><script type="module" src="/tools/fixtures/underground-warrior-forge-review.ts"></script>';
const server=await createServer({configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},
  plugins:[{name:'forge-review',configureServer(vite){vite.middlewares.use('/forge-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)})}}],
  server:{host:'127.0.0.1',port:0,hmr:false}});
const result={scope:'isolated local forge geometry with original hall collisions, not registered -165 domain or gameplay receipt',views:{},errors:[],passed:false};
let browser,error;
try{
  await server.listen();
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});
  page.on('pageerror',e=>result.errors.push(String(e)));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/forge-review',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.forgeReview?.inspect().frames>=2);
  for(const name of ['entrance','hearth','quench','rack'])for(const lit of [true,false]){
    const valid=await page.evaluate(({name,lit})=>window.forgeReview.setView(name)&&window.forgeReview.lamp(lit),{name,lit});
    assert.ok(valid,name+' eye must be on clear local hall floor');
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const stats=await page.evaluate(()=>window.forgeReview.inspect());
    assert.equal(stats.lamp,lit);assert.ok(stats.clear);assert.ok(stats.pieces>=450);
    const label=name+(lit?'-handlamp':'-fixed-hearth');
    const shot=await page.screenshot({path:resolve(out,label+'.png')});
    assert.ok(shot.byteLength>10000,label+' empty screenshot');
    result.views[label]={...stats,bytes:shot.byteLength};
  }
  await page.evaluate(()=>window.forgeReview.setView('entrance'));
  await page.keyboard.down('w');
  assert.ok(await page.evaluate(()=>window.forgeReview.step(1.2)));
  await page.keyboard.up('w');
  const walk=await page.evaluate(()=>window.forgeReview.inspect());
  assert.ok(walk.trustedW>0);assert.ok(walk.walked>=2.99);assert.ok(walk.clear);assert.equal(walk.rejected,0);
  result.entryWalk=walk;assert.deepEqual(result.errors,[]);result.passed=true;
}catch(e){error=e;result.errors.push(String(e))}
finally{
  await browser?.close().catch(()=>{});await server.close();
  await rm(cache,{recursive:true,force:true});await writeFile(resolve(out,'review-stats.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify(result,null,2));if(error)throw error;
