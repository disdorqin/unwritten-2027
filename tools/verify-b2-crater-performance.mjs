/**
 * B-2 · Real first-person crater render profiling (no fake camera setters).
 *
 * Run against the *current integration worktree*:
 *   node tools/verify-b2-crater-performance.mjs . D:/.../B2-profile
 *
 * Intentionally DOES NOT modify viewer.ts, ZB-17, location coordinates, or
 * any production scene. The location chooser and desktop mouse+W input are
 * native. Unrealized sites are reported as missing, never renamed or
 * credited as passed screenshots.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';

const [project, evidence] = process.argv.slice(2);
assert.ok(project && evidence, 'usage: node tools/verify-b2-crater-performance.mjs <project> <D-drive-evidence>');
const root = path.resolve(project), out = path.resolve(evidence);
assert.match(out, /^[dD]:[/\\]/, 'evidence must remain on formal D drive');
await mkdir(out, {recursive: true});
const {chromium} = createRequire(path.join(root,'package.json'))('playwright');
const chrome = process.env.CHROMIUM_PATH ?? (existsSync(chromium.executablePath()) ? undefined :
  'C:/Program Files/Google/Chrome/Application/chrome.exe');
const errors = [], views = [], movements = [];
const started = Date.now();
let server, browser, context, page, failure;
let estimatedYaw = 0; // scripted native inputs; NOT a viewer-exported orientation.
let descent = {attempted:false,visited:0,reachedFloor:false,blocker:null};
const round = value => Math.round(value * 1000) / 1000;
const sleep = ms => page.waitForTimeout(ms);
async function playerPosition() {
  const hud = await page.locator('#position').innerText();
  const match = hud.match(/东\s+(-?\d+(?:\.\d+)?)\s*m\s*·\s*北\s+(-?\d+(?:\.\d+)?)/);
  return match ? {east: Number(match[1]), north: Number(match[2]), hud} : {east:null,north:null,hud};
}
async function turnTo(east, north) {
  const pos = await playerPosition();
  if (pos.east === null) return;
  const desired = Math.atan2(east-pos.east, north-pos.north);
  const diff = Math.atan2(Math.sin(desired-estimatedYaw), Math.cos(desired-estimatedYaw));
  const totalPx = diff / .003; // desktop-look.ts's real radiansPerPixel.
  const chunks = Math.max(1, Math.ceil(Math.abs(totalPx)/490));
  const dx = totalPx/chunks;
  for(let i=0;i<chunks;i++){
    await page.mouse.move(750,350);
    await page.mouse.down();
    await page.mouse.move(750+dx,350,{steps:8});
    await page.mouse.up();
  }
  estimatedYaw=desired; // only an input estimate, not an independently measured pose.
}
async function walkTo(targetEast, targetNorth, label, maxAttempts=6, tolerance=5.5){
  for (let i=0;i<maxAttempts;i++){
    const before = await playerPosition();
    if(before.east===null) break;
    const distance=Math.hypot(targetEast-before.east, targetNorth-before.north);
    if(distance<tolerance){movements.push({label,reached:true,at:before});return true;}
    await turnTo(targetEast,targetNorth);
    await page.keyboard.down('w');
    await sleep(Math.max(400,Math.min(4000,distance/7.5*1000*.62)));
    await page.keyboard.up('w');
    await sleep(350);
    const after=await playerPosition();
    movements.push({label,step:i,before,after,distanceBefore:round(distance),
      distanceAfter:round(Math.hypot(targetEast-after.east,targetNorth-after.north))});
    if(Math.hypot(targetEast-after.east,targetNorth-after.north)<tolerance) return true;
    if(Math.hypot(after.east-before.east,after.north-before.north)<.35)break;
  }
  return false;
}
async function capture(name, positionLabel, phase, validity) {
  await sleep(850);
  const pos=await playerPosition();
  const details=await page.evaluate(()=>({
    profile:window.__b2Frames?.slice(-8)??[],
    entryHidden:document.querySelector('#town-entry')?.hidden,
    canvasPresent:!!document.querySelector('#scene canvas'),
    dayText:document.querySelector('#lighting')?.textContent,
  }));
  assert.equal(details.entryHidden,true);
  assert.ok(details.profile.length>0, 'actual player scene must emit profiler events');
  const median=(values)=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const calls=median(details.profile.map(x=>x.calls).filter(Number.isFinite));
  const triangles=median(details.profile.map(x=>x.triangles).filter(Number.isFinite));
  assert.ok(calls>0 && triangles>0);
  const filename=name+'.png';
  await page.screenshot({path:path.join(out,filename),timeout:30000});
  const row={name,positionLabel,phase,validity,position:pos,estimatedYawRadians:round(estimatedYaw),
    angleSource:'native gesture integration estimate; NOT verified camera yaw',
    medianCalls:calls,medianTriangles:triangles,lights:null,
    cameraY:details.profile.at(-1)?.cameraY??null,
    lightEvidence:'renderer.info in current scene exposes draws/tris but does not expose scene light list',
    screenshot:filename,canvasPresent:details.canvasPresent,dayText:details.dayText};
  views.push(row);
  return row;
}
async function setPhase(phase) {
  const dayText=await page.locator('#lighting').innerText();
  const isDay=dayText.includes('白昼');
  if(isDay!== (phase==='day')) {
    await page.locator('#town-panel-toggle').click();
    await page.locator('#lighting').click();
    await page.locator('#town-settings-close').click();
  }
}
async function location(label,east,north){
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label});
  await sleep(550);
  const pos=await playerPosition();
  const succeeded=pos.east!==null&&Math.hypot(pos.east-east,pos.north-north)<5;
  if(!succeeded) movements.push({label,fromChooser:true,succeeded:false,pos});
  // viewer.ts sets yaw = atan2(226-x, 223-n) when location is not a plot.
  if(succeeded) estimatedYaw=Math.atan2(226-pos.east,223-pos.north);
  return succeeded;
}
try {
  server=await createServer({root:path.join(root,'tools','voxel-tavern'),
    configFile:path.join(root,'tools','voxel-tavern','vite.config.ts'),
    cacheDir:path.join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},
    logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}}});
  await server.listen();
  const port=server.httpServer.address().port;
  browser=await chromium.launch({headless:true,executablePath:chrome,
    args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:
      ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1140,height:700},deviceScaleFactor:.7,locale:'zh-CN'});
  page=await context.newPage();
  await page.addInitScript(()=>{
    Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});
    localStorage.setItem('unwritten.quality.tier.v1','smooth');
    window.__b2Frames=[];
    document.addEventListener('town-frame-profile',e=>{
      window.__b2Frames.push(e.detail);
      if(window.__b2Frames.length>60)window.__b2Frames.shift();
    },true);
  });
  page.on('pageerror',e=>errors.push('page:'+e.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push('console:'+msg.text())});
  page.on('response',r=>{if(r.status()>=400)errors.push('http:'+r.status()+':'+r.url())});
  const res=await page.goto('http://127.0.0.1:'+port+'/town-blockout.html?profile',
    {waitUntil:'domcontentloaded',timeout:65000});
  assert.equal(res.status(),200);
  await page.locator('#scene canvas').waitFor({state:'visible',timeout:65000});
  await page.waitForFunction(()=>document.querySelector('#town-entry')?.hidden===true,
    {timeout:65000});
  await page.waitForFunction(()=>document.querySelector('#position')?.textContent.includes('东 '),
    {timeout:65000});
  estimatedYaw=0; // spawn defaults to north; verify with title and known site plan.
  await setPhase('night');
  await capture('plaza-night','plaza E223/N180 toward clocktower','night','true-spawn');
  await setPhase('day');
  await capture('plaza-day','plaza E223/N180 toward clocktower','day','true-spawn');
  await setPhase('night');
  const mouth=await location('陨石坑口',2,159);
  if (mouth) {
    await capture('crater-mouth-night','crater mouth E2/N159, NOT station','night','mouth-only');
    await setPhase('day');
    await capture('crater-mouth-day','crater mouth E2/N159, NOT station','day','mouth-only');
    const reached=await walkTo(-44.5,168,'kengkou-station');
    if(reached){
      // From the station face the physically known crater center (-120,185).
      await turnTo(-120,185);
      await capture('kengkou-station-day','station E-44.5/N168 facing crater','day','walk-reached-within-5.5m');
      await setPhase('night');
      await capture('kengkou-station-night','station E-44.5/N168 facing crater','night','walk-reached-within-5.5m');
      const {createMeteorCrater,meteorCraterFixturePlan,meteorCraterRimRadius}
        =await import('./voxel-tavern/town-blockout/meteor-crater.ts');
      const crater=createMeteorCrater(meteorCraterFixturePlan);
      const off=159-185;
      const yaw=Math.atan2(Math.sqrt(meteorCraterRimRadius**2-off**2),off)
        -meteorCraterFixturePlan.mainTrail.startBearing;
      const co=Math.cos(yaw),si=Math.sin(yaw);
      const trail=t=>{
        const p=crater.mainTrailPoint(t);
        return {east:-120+p.east*co+p.north*si,
          north:185+p.north*co-p.east*si,progress:t};
      };
      descent.attempted=true;
      const entry=trail(0);
      if(!await walkTo(entry.east,entry.north,'spiral-entry',10,2.5)) {
        descent.blocker={reason:'no valid walking route to spiral entrance',
          at:await playerPosition(),entry};
        await capture('spiral-entry-blocked-night','near B-01 lip E-68/N159','night','blocked-not-floor');
        await setPhase('day');
        await capture('spiral-entry-blocked-day','near B-01 lip E-68/N159','day','blocked-not-floor');
      } else {
        await capture('crater-spiral-entry-night',
          'canonical B-01 spiral start, not pit bottom','night','physical-approach');
        for(let i=1;i<=100;i++){
          const p=trail(i/100);
          if(!await walkTo(p.east,p.north,'spiral-step-'+i,4,2.7)) {
            descent.blocker={reason:'path blocked / lost at B-01 spiral',
              progress:i/100,at:await playerPosition(),p};
            break;
          }
          descent.visited=i;
        }
        descent.reachedFloor=descent.visited===100;
        if(descent.reachedFloor) {
          await turnTo(-120,238);
          await capture('crater-bottom-facing-rim-night',
            'B-01 floor via continuous native spiral walking','night','physically-reached');
          await setPhase('day');
          await capture('crater-bottom-facing-rim-day',
            'B-01 floor via continuous native spiral walking','day','physically-reached');
        }
      }
    }
  }
}catch(e){failure=String(e?.stack||e);}
finally {
  const cleanupErrors=[];
  for(const [name,close] of [['page',()=>page?.close()],['context',()=>context?.close()],
    ['browser',()=>browser?.close()],['server',()=>server?.close()]]) {
    try{await close()}catch(e){cleanupErrors.push(name+':'+String(e))}
  }
  const report={scene:'real default player town (not detached model viewer)',
    source:'viewer.ts ?profile renderer.info event; Chromium native location chooser + pointer drag + keyboard movement',
    integrationHead:process.env.B2_INTEGRATION_HEAD??'read from git command separately',
    passed:!failure && cleanupErrors.length===0, recordedViews:views,
    movements,descent,errors,cleanupErrors,failure,elapsedMs:Date.now()-started,
    missingRequired:[...(descent.reachedFloor?[]:['crater-bottom-facing-rim-day/night']),
      ...(views.some(x=>x.name==='kengkou-station-day')?[]:['kengkou-station-facing-crater-day/night'])],
    caveat:'Browser is local Vite without live Presence backend; 404/poll may occur. FPS, lights and exact camera yaw not falsely claimed. Crater mouth != crater bottom.'};
  await writeFile(path.join(out,'b2-real-town-profile.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,views:views.map(v=>({
    name:v.name,east:v.position.east,north:v.position.north,calls:v.medianCalls,
    tris:v.medianTriangles,yawEstimate:v.estimatedYawRadians,lightCount:v.lights
  })),movementSteps:movements,errors:errors.slice(0,9),missing:report.missingRequired,
    descent,reportPath:path.join(out,'b2-real-town-profile.json'),failure,cleanupErrors}));
  if(!report.passed)process.exitCode=1;
}
