import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {createServer} from 'vite';

const [project,evidence]=process.argv.slice(2);
assert.ok(project&&evidence,'usage: node tools/verify-front-ridge-default-town-browser.mjs . <D-drive-evidence>');
const root=path.resolve(project),out=path.resolve(evidence);
assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require('playwright');
const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:
  'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server,browser,context,page,failure;
const errors=[],screenshots=[],frames=[],started=Date.now();
try{
  server=await createServer({root:path.join(root,'tools','voxel-tavern'),
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
  context=await browser.newContext({viewport:{width:1140,height:700},deviceScaleFactor:.7,locale:'zh-CN'});
  page=await context.newPage();
  await page.addInitScript(()=>{
    // Identical native user-input fallback used by the ZA22 field harness.
    Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});
    localStorage.setItem('unwritten.quality.tier.v1','smooth');
    document.addEventListener('town-frame-profile',e=>{window.__d11RealFrame=e.detail},true);
  });
  page.on('pageerror',error=>errors.push('page:'+error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console:'+msg.text())});
  page.on('response',r=>{if(r.status()>=400) errors.push('http:'+r.status()+':'+r.url())});
  const response=await page.goto('http://127.0.0.1:'+port+'/town-blockout.html?profile',
    {waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(response.status(),200);
  await page.waitForTimeout(5000);
  const startup=await page.evaluate(()=>({bodyClass:document.body.className,
    entryHidden:document.querySelector('#town-entry')?.hidden,
    loadingHidden:document.querySelector('#town-entry-loading')?.hidden,
    failureHidden:document.querySelector('#town-entry-error')?.hidden,
    continueHidden:document.querySelector('#town-entry-continue')?.hidden,
    canvasParent:document.querySelector('#scene canvas')?.parentElement?.outerHTML.slice(0,200),
    canvasRect:document.querySelector('#scene canvas')?.getBoundingClientRect().toJSON(),
    scripts:[...document.scripts].map(x=>x.src).slice(0,5)
  }));
  console.log('APP_STARTUP',JSON.stringify({entryHidden:startup.entryHidden,errorVisible:startup.failureHidden===false,canvasMounted:Boolean(startup.canvasParent)}));
  if(!startup.entryHidden&&startup.continueHidden===false)await page.locator('#town-entry-continue').click();
  if(!startup.entryHidden&&startup.failureHidden===false){
    const diagnosis=await page.evaluate(async()=>{
      try{await import('/town-blockout/viewer.ts');return 'viewer-import-did-not-throw';}
      catch(e){return (e instanceof Error ? e.stack : String(e))||String(e)}
    });
    throw Error('Default town entry failed: '+diagnosis);
  }
  await page.locator('#scene canvas').waitFor({state:'visible',timeout:24000});
  await page.waitForFunction(()=>document.querySelector('#town-entry')?.hidden===true,
    {timeout:24000});
  await page.waitForFunction(()=>document.querySelector('#position')?.textContent.includes('东 '),
    {timeout:75000});
  const capture=async(name,view,mode)=>{
    await page.waitForTimeout(650);
    const state=await page.evaluate(()=>({
      position:document.querySelector('#position')?.textContent,
      sceneEntryHidden:document.querySelector('#town-entry')?.hidden,
      dayButton:document.querySelector('#lighting')?.textContent,
      renderer:window.__d11RealFrame,
      title:document.title,
      settingsOpen:document.querySelector('#town-settings')?.open,
      canvasSize:[document.querySelector('#scene canvas')?.width,document.querySelector('#scene canvas')?.height],
    }));
    assert.equal(state.sceneEntryHidden,true);
    assert.ok(state.position?.includes('东 '));
    assert.ok(state.renderer?.calls>0,'real viewer profile must report actual WebGL draws');
    const namePng=name+'.png';
    await page.screenshot({path:path.join(out,namePng),timeout:18000});
    screenshots.push(namePng);frames.push({name,view,mode,...state});
    return state;
  };
  // A default-world player, not any isolated mountain review canvas.
  await capture('default-town-plaza-initial-night','town-plaza-spawn','night');
  await page.locator('#town-panel-toggle').click();
  await page.locator('#lighting').click();
  await page.locator('#town-settings-close').click();
  const day=await capture('default-town-plaza-day','town-plaza-spawn','day');
  assert.equal(day.dayButton,'白昼');
  // Real in-app location chooser, not a synthetic camera setter.
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label:'山口'});
  const gateHud=await page.locator('#position').innerText();
  const reachedGate=gateHud.includes('东 300.') && gateHud.includes('北 665.');
  if(reachedGate)await capture('default-town-mountain-gate-day','town-mountain-gate','day');
  await page.locator('#town-panel-toggle').click();
  await page.locator('#lighting').click();
  await page.locator('#town-settings-close').click();
  if(reachedGate)await capture('default-town-mountain-gate-night','town-mountain-gate','night');
  else frames.push({name:'mountain-gate-visit-blocked',view:'NOT_VISITED',gateHud,
    reason:'The built-in location chooser refuses to land here; never label spawn as mountain'});
  // This is the crater MOUTH, not inside the crater; do not label as
  // the stricter requested crater-internal camera.
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label:'陨石坑口'});
  // Native canvas drag toward north (starting crater-mouth look is E/NE).
  await page.mouse.move(550,355);
  await page.mouse.down();
  await page.mouse.move(153,355,{steps:9});
  await page.mouse.up();
  await capture('default-town-crater-mouth-night-not-interior','crater-mouth-not-interior','night');
  await page.locator('#town-panel-toggle').click();
  await page.locator('#lighting').click();
  await page.locator('#town-settings-close').click();
  await capture('default-town-crater-mouth-day-not-interior','crater-mouth-not-interior','day');
}catch(error){failure=String(error);}
finally{
  const cleanupErrors=[];
  for(const [label,cleanup]of [['page',()=>page?.close()],['context',()=>context?.close()],
    ['browser',()=>browser?.close()],['server',()=>server?.close()]]){
    try{await cleanup()}catch(e){cleanupErrors.push(label+':'+String(e))}
  }
  const report={passed:!failure&&!cleanupErrors.length,screenshots,frames,errors,cleanupErrors,failure,
    elapsedMs:Date.now()-started,
    // This check only proves normal entry + real renderer + two available
    // daylight/night player camera locations. It CANNOT satisfy the new
    // six-shot production quality gate in the absence of the mountain road.
    fullD11QualityGatePassed:false,
    realPresenceLinked:false,
    cameraAnglesMeasuredFromServer:false,
    unmetCameras:['crater-interior-facing-north-day/night','mountain-winding-road-midpoint-day/night'],
    caveat:'Not a full quality-gate pass: missing crater-interior, mountain-road midpoint, exact accepted yaw, and production Presence/WS. Built-in mountain-gate visit currently rejects landing.'};
  await writeFile(path.join(out,'d11-default-town-camera-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,screenshots:screenshots.length,frames:frames.map(x=>({
    name:x.name,position:x.position,calls:x.renderer?.calls,triangles:x.renderer?.triangles,day:x.dayButton
  })),elapsedMs:report.elapsedMs,errorCount:errors.length,firstErrors:errors.slice(0,6),
    cleanupErrors,failure}));
  if(!report.passed)process.exitCode=1;
}
