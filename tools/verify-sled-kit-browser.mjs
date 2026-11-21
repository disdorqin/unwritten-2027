// Headless WebGL verification of the town's new instanced sled and hiring shelter.
// One local Vite server, one Chromium session; both closed on pass or failure.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server=await createServer({configFile:false,root:process.cwd(),
  server:{host:'127.0.0.1',port:0,strictPort:false}});
let browser;
try {
  await server.listen();
  const url='http://127.0.0.1:'+server.httpServer.address().port+'/tools/voxel-tavern/sled-model-preview.html';
  let lastBrowserError;
  for (const channel of ['chrome','msedge',undefined]) {
    try {
      browser=await chromium.launch({headless:true,channel,
        args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
      break;
    } catch (err) { lastBrowserError=err; }
  }
  if (!browser) throw new Error('No installed Chromium channel is available: '+lastBrowserError);
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[],http5xx=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('response',response=>{if(response.status()>=500)http5xx.push(response.url());});
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__sledAudit),{timeout:20000});
  const result=await page.evaluate(()=>window.__sledAudit);
  assert.equal(errors.length,0,'browser JS errors '+errors.join('; '));
  assert.equal(http5xx.length,0,'HTTP 5xx');
  assert.ok(result.renderCalls<=4,'draw calls: '+result.renderCalls);
  assert.ok(result.triangles>=2000,'expected actual geometry');
  assert.ok(result.objectNames.includes('town-sled-racks'));
  assert.ok(result.objectNames.includes('town-local-sled'));
  const output='D:/computer learning/game_exe/kuanian/sled-depot-browser-smoke.png';
  await page.screenshot({path:output});
  // A second native WebGL render checks the phone-sized composition. This is
  // Chromium viewport emulation, not a claim of real-device acceptance.
  const mobile=await browser.newPage({viewport:{width:390,height:844},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const mobileErrors=[],mobile5xx=[];
  mobile.on('pageerror',err=>mobileErrors.push(err.message));
  mobile.on('response',response=>{if(response.status()>=500)mobile5xx.push(response.url());});
  await mobile.goto(url,{waitUntil:'networkidle'});
  await mobile.waitForFunction(()=>Boolean(window.__sledAudit),{timeout:20000});
  const mobileResult=await mobile.evaluate(()=>window.__sledAudit);
  assert.deepEqual(mobileResult.canvas,[390,844],'mobile drawing buffer');
  assert.equal(mobileErrors.length,0,'mobile browser JS errors '+mobileErrors.join('; '));
  assert.equal(mobile5xx.length,0,'mobile HTTP 5xx');
  assert.ok(mobileResult.renderCalls<=4,'mobile draw calls');
  const mobileOutput='D:/computer learning/game_exe/kuanian/sled-depot-mobile-smoke.png';
  await mobile.screenshot({path:mobileOutput});
  await mobile.close();
  console.log(JSON.stringify({result:'PASS',...result,screenshot:output,
    browserErrors:errors.length,http5xx:http5xx.length,
    mobile:{...mobileResult,screenshot:mobileOutput,
      browserErrors:mobileErrors.length,http5xx:mobile5xx.length}}));
} finally {
  if(browser)await browser.close();
  await server.close();
}
