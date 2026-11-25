import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]??'docs/交流区/GPT/窗C-U11地宫建模审图-2026-11-21');
const cache=resolve(output,'.vite-cache');
await mkdir(output,{recursive:true});
const html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1">' +
'<link rel="icon" href="data:,"><style>html,body{margin:0;background:#212735;overflow:hidden}canvas{display:block}</style>' +
'</head><body><script type="module" src="/tools/fixtures/underground-palace-dressing-review.ts"></script></body></html>';
const app=await createServer({
  configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},
  plugins:[{name:'u11-palace-art-local-only',configureServer(vite){
    vite.middlewares.use('/u11-review',(_req,res)=>{
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
    });
  }}],
  server:{host:'127.0.0.1',port:0,hmr:false},
});
const result={kind:'ISOLATED ART + PINNED WINDOW D SHELL SNAPSHOT; not official world -190m, U-15 or player',
  views:{},errors:[],passed:false};
let browser,error;
try{
  await app.listen();
  const addr=app.httpServer.address();
  assert.ok(addr && typeof addr==='object');
  // No browser downloads or C: cache clones; use the existing Chrome.
  browser=await chromium.launch({
    executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless:true,args:['--use-gl=angle','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'],
  });
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:.8});
  page.on('pageerror',e=>result.errors.push('page '+e.message));
  page.on('requestfailed',r=>result.errors.push('request '+r.url()));
  await page.goto('http://127.0.0.1:'+addr.port+'/u11-review',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.palaceDressingReview?.inspect().frames>=3);
  for(const [index,name] of ['stairs','colonnade','gallery','throne','arena','gate'].entries()){
    assert.ok(await page.evaluate(n=>window.palaceDressingReview.setView(n),name));
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const stats=await page.evaluate(()=>window.palaceDressingReview.inspect());
    assert.equal(stats.view,name);
    // Five new 144-piece socket lanterns extend the original 9,861 blocks.
    // Keep the art fixture pinned to the full R5 visual bill of materials.
    assert.equal(stats.allPieces,12141);
    assert.equal(stats.visualPieces,9126);
    assert.equal(stats.vaultMounted,false);
    assert.ok(stats.materials>0 && stats.materials<=8);
    assert.ok(stats.drawing<=12,'D-shell plus C materials exceeded batch cap: '+name);
    assert.ok(stats.triangles>=20000 && stats.triangles<=500000,
      'render empty or too dense '+name+': '+stats.triangles);
    assert.equal(stats.officialWorldMounted,false);
    assert.equal(stats.reviewedDShellSnapshot,true);
    const shot=await page.screenshot({path:resolve(output,
      (index+1)+'-'+name+'.png')});
    assert.ok(shot.byteLength>12000,'black/blank image '+name);
    result.views[name]={...stats,imageBytes:shot.byteLength};
  }
  await page.evaluate(()=>window.palaceDressingReview.setView('retreat'));
  const started=Date.now(),initial=await page.evaluate(()=>window.palaceDressingReview.inspect().frames);
  await page.keyboard.down('w');assert.ok(await page.evaluate(()=>window.palaceDressingReview.step(2)));await page.keyboard.up('w');await page.waitForTimeout(650);
  result.walk=await page.evaluate(()=>window.palaceDressingReview.inspect());result.walk.fps=(result.walk.frames-initial)*1000/(Date.now()-started);
  assert.ok(result.walk.walked>5.99&&result.walk.trustedW>0&&result.walk.rejected===0);
  assert.deepEqual(result.errors,[]);
  result.passed=true;
  await page.close();
}catch(e){
  error=e;result.errors.push(String(e));
}finally{
  await browser?.close().catch(()=>{});
  await app.close();await rm(cache,{recursive:true,force:true});
  await writeFile(resolve(output,'review-stats.json'),JSON.stringify(result,null,2),'utf8');
}
console.log(JSON.stringify(result,null,2));
if(error)throw error;
