import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';

const [project,destination]=process.argv.slice(2);
assert.ok(project&&destination,'usage: node tools/verify-front-ridge-surface-browser.mjs . <D-drive-evidence>');
const root=path.resolve(project),out=path.resolve(destination);
assert.match(out,/^[dD]:[/\\]/,'Store first-person Chrome evidence on D: only');
await mkdir(out,{recursive:true});
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:
  'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server,browser,context,page,failure;
const errors=[],snapshots=[],shots=[],started=Date.now();
try{
  server=await createServer({
    root:path.join(root,'tools','voxel-tavern'),
    configFile:path.join(root,'tools','voxel-tavern','vite.config.ts'),
    cacheDir:path.join(out,'.vite-cache'),
    optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error',
    server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}},
  });
  await server.listen();
  const port=server.httpServer.address().port;
  browser=await chromium.launch({headless:true,executablePath:chrome,
    args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:
      ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1360,height:820},deviceScaleFactor:1,locale:'zh-CN'});
  page=await context.newPage();
  page.on('pageerror',e=>errors.push('page:'+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console:'+m.text())});
  page.on('response',r=>{if(r.status()>=400)errors.push('http:'+r.status()+':'+r.url())});
  page.on('requestfailed',r=>errors.push('net:'+r.failure()?.errorText+':'+r.url()));
  const status=await page.goto('http://127.0.0.1:'+port+'/front-ridge-slope-sevenround-review.html',
    {waitUntil:'domcontentloaded',timeout:35000});
  assert.equal(status.status(),200);
  await page.waitForFunction(()=>window.__ridgeReview?.state().frame>=7,{timeout:30000});
  await page.waitForFunction(()=>window.__ridgeReview.state().referenceLoaded,{timeout:20000});
  async function capture(name){
    await page.waitForFunction(()=>window.__ridgeReview.state().frame>=7,{timeout:20000});
    const snap=await page.evaluate(()=>window.__ridgeReview.state());
    assert.ok(snap.drawCalls>0&&snap.triangles>0);
    assert.equal(snap.nearest,true);
    assert.equal(snap.pixelsPerMetre,16);
    assert.equal(snap.referenceLoaded,true);
    await page.screenshot({path:path.join(out,name+'.png'),timeout:16000});
    shots.push(name+'.png');snapshots.push({name,...snap});
    return snap;
  }
  const near=await capture('d11-day-firstperson-toe-y10');
  assert.equal(near.view,'toe');
  assert.equal(near.night,false);
  assert.ok(near.cameraHeight<12,'first-person toe must be eye height, not aerial');
  await page.keyboard.press('5');const pixel=await capture('d11-day-two-metre-near-grain');
  assert.equal(pixel.view,'pixel');
  await page.keyboard.press('2');await capture('d11-day-rock-face-side');
  await page.keyboard.press('3');await capture('d11-day-full-serrated-ridge');
  await page.keyboard.press('4');await capture('d11-day-west-shoulder-not-wall');
  await page.keyboard.press('1');await page.keyboard.press('n');
  const night=await capture('d11-night-firstperson-toe');
  assert.equal(night.night,true);assert.equal(night.nightLight,true);
  await page.keyboard.press('3');await capture('d11-night-ridge-shadow');
  await page.setViewportSize({width:390,height:844});
  await page.keyboard.press('1');await capture('d11-mobile-viewport-near-slope');
  assert.deepEqual(errors,[]);
}catch(e){failure=String(e);}
finally{
  const teardownErrors=[];
  for(const [name,cleanup]of [['page',()=>page?.close()],
    ['context',()=>context?.close()],['browser',()=>browser?.close()],['server',()=>server?.close()]]){
    try{await cleanup()}catch(e){teardownErrors.push(name+':'+String(e))}
  }
  const report={
    passed:!failure&&!errors.length&&!teardownErrors.length,
    elapsedMs:Date.now()-started,screenshots:shots,snapshots,errors,teardownErrors,failure,
  };
  await writeFile(path.join(out,'front-ridge-slope-native-browser.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,elapsedMs:report.elapsedMs,
    screenshots:shots.length,triangles:snapshots[0]?.sourceTriangles,
    drawCalls:snapshots[0]?.drawCalls,errors,teardownErrors,failure}));
  if(!report.passed)process.exitCode=1;
}
