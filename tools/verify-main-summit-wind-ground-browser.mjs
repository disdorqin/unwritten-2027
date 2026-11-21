import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';

const [project, directory] = process.argv.slice(2);
assert.ok(project && directory,'usage: node tools/verify-main-summit-wind-ground-browser.mjs <checkout> <D-drive-evidence>');
const root = path.resolve(project);
const target = path.resolve(directory);
assert.match(target, /^[dD]:[/\\]/,'Save genuine PNG browser receipts only to D:');
await mkdir(target,{recursive:true});
const requireFromProject = createRequire(path.join(root,'package.json'));
const { chromium } = requireFromProject('playwright');
const browserExecutable = process.env.CHROMIUM_PATH ?? (existsSync(chromium.executablePath())
  ? undefined : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server, browser, context, page;
const errors = [], captures = [], states = [];
let failure;
const started = Date.now();
try {
  server = await createServer({
    root:path.join(root,'tools','voxel-tavern'),
    configFile:path.join(root,'tools','voxel-tavern','vite.config.ts'),
    cacheDir:path.join(target,'.vite-cache'),
    optimizeDeps:{noDiscovery:true,include:[]},
    logLevel:'error',
    server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}},
  });
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({headless:true,executablePath:browserExecutable,
    args:process.platform==='win32' ? ['--use-gl=angle','--use-angle=d3d11'] :
      ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context = await browser.newContext({viewport:{width:1240,height:810},deviceScaleFactor:1,locale:'zh-CN'});
  page = await context.newPage();
  page.on('pageerror',error=>errors.push('page:'+error.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console:'+m.text());});
  page.on('requestfailed',req=>errors.push('request:'+req.url()+':'+req.failure()?.errorText));
  page.on('response',response=>{if(response.status()>=400)errors.push('http:'+response.status()+':'+response.url());});
  const r = await page.goto('http://127.0.0.1:'+port+'/main-summit-wind-ground-detail-review.html',
    {waitUntil:'domcontentloaded',timeout:35000});
  assert.equal(r.status(),200);
  await page.waitForFunction(()=>window.__windReview?.state().frame>=5,{timeout:30000});
  await page.waitForFunction(()=>window.__windReview.state().referenceLoaded,{timeout:20000});
  const take=async name=>{
    const s=await page.evaluate(()=>window.__windReview.state());
    states.push({name,...s});
    await page.screenshot({path:path.join(target,name+'.png'),timeout:15000});
    captures.push(name+'.png');
    assert.ok(s.renderCalls>0&&s.triangles>0);
    return s;
  };
  const day=await take('m64-day-overview');
  assert.ok(day.pieceCount>800);
  assert.ok(day.drawBudget<=26);
  assert.equal(day.lights,2);
  assert.equal(day.signTexture,true,'Chinese sign must have a real browser canvas texture');
  assert.equal(day.report.source,'calm-no-authority');
  await page.keyboard.press('5');
  const near=await take('m64-day-near-wood-and-bronze');
  assert.equal(near.point,'close');
  await page.keyboard.press('2');
  const dark=await take('m64-night-near');
  assert.equal(dark.night,true);
  await page.keyboard.press('7');
  await take('m64-night-side');
  await page.keyboard.press('6');
  await page.keyboard.press('3');
  const signal=await take('m64-review-g09-sample-brass-rotor');
  assert.equal(signal.report.source,'official-zb20');
  assert.ok(signal.report.visibleGustFactor>0);
  assert.equal(signal.officialReviewFixture,true);
  await page.keyboard.press('v');
  await page.keyboard.press('l');
  await page.keyboard.press('e');
  const touched=await take('m64-review-real-compass-touch');
  assert.equal(touched.compassTouches,1);
  assert.equal(touched.lastInteraction.accepted,true);
  await page.keyboard.press('4');
  const calm=await take('m64-back-to-calm-no-invented-wind');
  assert.equal(calm.report.source,'calm-no-authority');
  assert.equal(calm.report.visibleGustFactor,0);
  await page.setViewportSize({width:390,height:844});
  await take('m64-mobile-viewport-emulation');
  assert.deepEqual(errors,[]);
} catch(error) {
  failure=String(error);
} finally {
  const teardownErrors=[];
  for(const [name,cleanup] of [['context',()=>context?.close()],['browser',()=>browser?.close()],['server',()=>server?.close()]]) {
    try {await cleanup();}catch(error){teardownErrors.push(name+':'+String(error));}
  }
  const result={
    passed:!failure&&!errors.length&&!teardownErrors.length,
    elapsedMs:Date.now()-started,
    screenshots:captures,states,errors,teardownErrors,failure,
  };
  await writeFile(path.join(target,'wind-ground-seven-round-native.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:result.passed,elapsedMs:result.elapsedMs,
    screenshots:captures.length,sitePieces:states[0]?.pieceCount,
    modelDrawBudget:states[0]?.drawBudget,errors,teardownErrors,failure}));
  if(!result.passed)process.exitCode=1;
}
