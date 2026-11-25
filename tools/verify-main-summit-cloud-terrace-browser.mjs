import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
const [base,evidence]=process.argv.slice(2);
assert.ok(base&&evidence,'usage: node tools/verify-main-summit-cloud-terrace-browser.mjs . <D-drive-dir>');
const root=path.resolve(base),out=path.resolve(evidence);
assert.match(out,/^[dD]:[/\\]/,'Genuine browser receipts must be stored only on D:');
await mkdir(out,{recursive:true});
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require('playwright');
const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:
  'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server,browser,context,page,failure;
const errors=[],screenshots=[],snapshots=[],started=Date.now();
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
  context=await browser.newContext({viewport:{width:1360,height:830},deviceScaleFactor:1,locale:'zh-CN'});
  page=await context.newPage();
  page.on('console',message=>{if(message.type()==='error')errors.push('console:'+message.text())});
  page.on('pageerror',e=>errors.push('page:'+e.message));
  page.on('requestfailed',request=>errors.push('network:'+request.url()+':'+request.failure()?.errorText));
  page.on('response',response=>{if(response.status()>=400)errors.push('http:'+response.status()+':'+response.url())});
  const response=await page.goto('http://127.0.0.1:'+port+'/main-summit-cloud-terrace-review.html',
    {waitUntil:'domcontentloaded',timeout:35000});
  assert.equal(response.status(),200);
  assert.match(await page.title(),/云海台石环/);
  await page.waitForFunction(()=>window.__terraceReview?.state().frame>=5,{timeout:18000});
  await page.waitForFunction(()=>window.__terraceReview.state().referenceLoaded,{timeout:15000});
  const capture=async name=>{
    await page.waitForFunction(()=>window.__terraceReview.state().referenceLoaded,{timeout:15000});
    const state=await page.evaluate(()=>window.__terraceReview.state());
    assert.ok(state.renderCalls>0&&state.triangles>0);
    assert.ok(state.stats.pieces>600);
    assert.equal(state.stats.lanternCount,3);
    await page.screenshot({path:path.join(out,name+'.png'),timeout:20000});
    screenshots.push(name+'.png');
    snapshots.push({name,...state});
    return state;
  };
  const overview=await capture('d4-day-real-plaza-overview');
  assert.equal(overview.night,false);
  assert.equal(overview.chineseSign,true);
  assert.ok(overview.stats.draws<=20);
  await page.keyboard.press('3');
  const ring=await capture('d4-day-stone-ring-closeshot');
  assert.equal(ring.currentView,'ring');
  assert.ok(ring.referenceSrc.includes('ref-m34'));
  await page.keyboard.press('v');
  await page.keyboard.press('l');
  await page.keyboard.press('e');
  const interacted=await capture('d4-ring-three-physical-interactions');
  assert.equal(interacted.lastTouch.accepted,true);
  assert.equal(interacted.ringTouches,1);
  await page.keyboard.press('4');
  const benches=await capture('d4-day-benches-lanterns-supply');
  assert.equal(benches.currentView,'bench');
  await page.keyboard.press('2');
  const night=await capture('d4-night-cloudseas-reference');
  assert.equal(night.night,true);
  assert.ok(night.referenceSrc.includes('ref-m36'));
  // Key 4 already chose the supply station; key 7 would toggle
  // back to the ring and invalidate the accepted-reach test.
  await page.keyboard.press('v');
  await page.keyboard.press('l');
  await page.keyboard.press('e');
  const luggage=await capture('d4-night-supply-accepted-interactions');
  assert.ok(luggage.supplyInspections>=3);
  await page.keyboard.press('5');
  await capture('d4-night-overhead-clear-running-path');
  await page.setViewportSize({width:390,height:844});
  await capture('d4-mobile-viewport-emulation');
  assert.deepEqual(errors,[]);
}catch(e){failure=String(e);}
finally{
  const teardownErrors=[];
  for(const [label,fn] of [['page',()=>page?.close()],['context',()=>context?.close()],
    ['browser',()=>browser?.close()],['server',()=>server?.close()]]){
    try{await fn();}catch(e){teardownErrors.push(label+':'+String(e))}
  }
  const result={passed:!failure&&!errors.length&&!teardownErrors.length,
    elapsedMs:Date.now()-started,screenshots,snapshots,errors,teardownErrors,failure};
  await writeFile(path.join(out,'cloud-terrace-real-browser.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:result.passed,elapsedMs:result.elapsedMs,screenshots:screenshots.length,
    pieces:snapshots[0]?.stats.pieces,draws:snapshots[0]?.stats.draws,
    reference:snapshots[0]?.referenceSrc,errors,teardownErrors,failure}));
  if(!result.passed)process.exitCode=1;
}
