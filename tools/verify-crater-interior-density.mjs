import assert from 'node:assert/strict';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]??'docs/交流区/GPT/窗C-C3坑内三区建模审图-2026-11-21');
const cache=resolve(output,'.vite-cache');
await mkdir(output,{recursive:true});
const html='<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<link rel="icon" href="data:,"><style>html,body{margin:0;background:#273644;overflow:hidden}canvas{display:block}</style>'+
  '<script type="module" src="/tools/fixtures/meteor-crater-interior-review.ts"></script></html>';
const app=await createServer({
  configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},
  plugins:[{name:'c3-crater-mounted-art-review',configureServer(vite){
    vite.middlewares.use('/c3-crater-review',(_req,res)=>{
      res.setHeader('content-type','text/html; charset=utf-8');res.end(html);
    });
  }}],
  server:{host:'127.0.0.1',port:0,hmr:false},
});
const result={
  scope:'REAL B-01 surface mount in offline Chrome; not official town domain/player/server',
  views:{},errors:[],passed:false,
};
let browser,problem;
try{
  await app.listen();
  const addr=app.httpServer.address();
  assert.ok(addr&&typeof addr==='object');
  browser=await chromium.launch({
    executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>result.errors.push('page: '+e.message));
  page.on('requestfailed',r=>result.errors.push('request: '+r.url()));
  await page.goto('http://127.0.0.1:'+addr.port+'/c3-crater-review',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.craterInteriorReview?.inspect().frames>=3);
  for(const [index,name] of ['rim','upper','middle','floor','well','overview'].entries()){
    assert.equal(await page.evaluate(name=>window.craterInteriorReview.setView(name),name),true);
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const stats=await page.evaluate(()=>window.craterInteriorReview.inspect());
    assert.equal(stats.current,name);
    assert.ok(stats.counts.count>5000);
    assert.ok(stats.counts.terraces>2500);
    assert.ok(stats.counts.floor>1300);
    assert.ok(stats.counts.sealedWell>250);
    assert.equal(stats.materials,6);
    assert.equal(stats.worldIsLive,false);
    assert.equal(stats.sealedCover,true);
    assert.ok(Math.abs(stats.surfaceHeightAtWell+35)<.001);
    assert.ok(stats.draws<=18,'C3+C2 detail budget exceeded '+name+': '+stats.draws);
    assert.ok(stats.triangles>28000 && stats.triangles<275000,
      'empty/oversized draw: '+name+' tris='+stats.triangles);
    const shot=await page.screenshot({path:resolve(output,String(index+1)+'-'+name+'.png')});
    assert.ok(shot.byteLength>15000,'blank C3 review shot '+name);
    result.views[name]={...stats,bytes:shot.byteLength};
  }
  // C-0 / C3 R1 audit demanded by the new quality gate: two standing-eye
  // positions in both phases, with exact local pose metadata per image.
  // These are an honest offline first-person view of the production B-01
  // geometry, NOT a real town-night host or verified avatar E traversal.
  for(const name of ['auditFloorToTerrace','auditRimToFloor']){
    for(const phase of ['day','night']){
      assert.equal(await page.evaluate(args=>{
        return window.craterInteriorReview.setView(args.name)&&
          window.craterInteriorReview.setPhase(args.phase);
      },{name,phase}),true);
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      const stats=await page.evaluate(()=>window.craterInteriorReview.inspect());
      assert.equal(stats.current,name);
      assert.equal(stats.phase,phase);
      assert.equal(stats.firstPersonEyeHeight,1.67);
      assert.ok(stats.draws<=18);
      const file=(name==='auditFloorToTerrace'?'pit-bottom-to-terrace':'rim-to-pit-bottom')+'-'+phase+'.png';
      const shot=await page.screenshot({path:resolve(output,file)});
      assert.ok(shot.length>15000,'missing audit first-person shot '+file);
      result.views[file]={...stats,bytes:shot.length,mode:'offline-visual-day-night-review'};
    }
  }
  // C-2: exactly the real B-01 lamp mount seen at 1.67 m eye height.
  // Check actual six PointLight.visible states as the phase changes.
  for(const name of ['c2WellAcrossWorklights','c2WinchService','c2ReturnWorklightChain']){
    for(const phase of ['day','night']){
      assert.equal(await page.evaluate(({name,phase})=>
        window.craterInteriorReview.setView(name)&&
        window.craterInteriorReview.setPhase(phase),{name,phase}),true);
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
      const stats=await page.evaluate(()=>window.craterInteriorReview.inspect());
      assert.equal(stats.physicalWorklightCount,6);
      assert.equal(stats.activeWorklightSources,phase==='night'?6:0);
      assert.ok(stats.draws<=18,'C2 near-camera draw budget '+stats.draws);
      assert.equal(stats.firstPersonEyeHeight,1.67);
      const nameOut=name==='c2WellAcrossWorklights'?'c2-well-to-worklights':
        name==='c2WinchService'?'c2-winch-worksite':'c2-return-side-chain';
      const imageName=nameOut+'-'+phase+'.png';
      const image=await page.screenshot({path:resolve(output,imageName)});
      assert.ok(image.length>15000);
      result.views[imageName]={...stats,bytes:image.length,
        phaseProof:'actual C2 sources switched; offline browser phase not live clock'};
    }
  }
  assert.deepEqual(result.errors,[]);
  result.passed=true;
  await page.close();
}catch(e){problem=e;result.errors.push(String(e))}
finally{
  await browser?.close().catch(()=>{});
  await app.close();
  await rm(cache,{recursive:true,force:true});
  await writeFile(resolve(output,'review-stats.json'),JSON.stringify(result,null,2),'utf8');
}
console.log(JSON.stringify(result,null,2));
if(problem)throw problem;
