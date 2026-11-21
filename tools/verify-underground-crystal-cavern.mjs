import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] ?? 'docs/交流区/GPT/窗C-U3晶洞建模审图-2026-11-21');
await mkdir(output, { recursive:true });
const html = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8">
<link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#2c3648}canvas{display:block}</style>
<script type="module" src="/tools/fixtures/underground-crystal-cavern-review.ts"></script></html>`;
const app = await createServer({
  configFile:false,root,publicDir:false,
  cacheDir:resolve(output,'.vite-cache'),resolve:{dedupe:['three']},
  plugins:[{name:'u3-crystal-vista-review',configureServer(server) {
    server.middlewares.use('/crystal-review',(_req,res)=>{
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(html);
    });
  }}],
  server:{host:'127.0.0.1',port:0,hmr:false},
});
const result = {scope:'ISOLATED U-3 modeling review, not real player or official -140m production mount',
  views:{},errors:[],passed:false};
let browser,originalError;
try {
  await app.listen();
  const addr=app.httpServer.address();
  assert.ok(addr && typeof addr==='object');
  browser=await chromium.launch({executablePath:
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('requestfailed',r=>result.errors.push('network '+r.url()));
  await page.goto(`http://127.0.0.1:${addr.port}/crystal-review`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.cavernReview?.inspect().frames>=2);
  for(const [index,name] of ['entrance','grove','overlook','quay'].entries()){
    assert.equal(await page.evaluate(name=>window.cavernReview.setView(name),name),true);
    await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
    const stats=await page.evaluate(()=>window.cavernReview.inspect());
    assert.equal(stats.kind,'ready');
    assert.equal(stats.view,name);
    assert.ok(stats.frames>0);
    assert.ok(stats.voxelCount>3500);
    assert.ok(stats.groups<=8);
    assert.ok(stats.drawCalls<=11,'candidate must be batched');
    // Frustum-culling may hide one or more complete instanced material families
    // depending on camera direction. Check meaningful rendered complexity, not
    // a falsely exact total for every view.
    assert.ok(stats.triangles>20000 && stats.triangles<110000,
      'model failed to render visible cavern or broke geometry budget');
    assert.equal(stats.visibleLights,4);
    assert.ok(stats.eye.every(Number.isFinite));
    const image=await page.screenshot({path:resolve(output,
      String(index+1)+'-'+name+'.png')});
    assert.ok(image.length>12000,'rendered black or blank view '+name);
    result.views[name]={...stats,imageBytes:image.length};
  }
  assert.deepEqual(result.errors,[]);
  result.passed=true;
  await page.close();
} catch(err) {
  originalError=err;
  result.errors.push(String(err));
} finally {
  await browser?.close().catch(()=>{});
  await app.close();
  await rm(resolve(output,'.vite-cache'),{recursive:true,force:true});
  await writeFile(resolve(output,'review-stats.json'),JSON.stringify(result,null,2));
}
console.log(JSON.stringify(result,null,2));
if(originalError) throw originalError;
