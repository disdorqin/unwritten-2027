import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [origin, output, segment = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const bare = process.env.ZA22_BARE === '1';
const url = new URL(bare ? '/' : '/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(['gate','north','west','supply','instrument','smelter','kengkou','gatehouse','wall','northwalk','supplyinterior','freight'].includes(segment), segment);

const spawn = [223, 180];
const station = [
  [245, 192], [251, 192], [278, 192], [304, 192], [315, 199], [319, 230], [332, 245],
  [350, 249], [382, 220], [398, 207], [410, 207], [427, 214], [445, 221], [456, 222],
  [453, 254], [473, 276], [506, 286], [526, 312], [526, 317.15], [536.8, 317.15],
];
const westShore = [
  [192, 180], [161, 181], [151, 156], [127, 140], [108, 114], [85, 131], [77, 164], [1, 159],
];
const cloudStop = [336, 640];
const cloudRunway = [[336, 657], [326.82, 657]];
const crater = [[-12, 159], [-40, 159], [-67, 159], [-71, 159]];
const gate = [[336, 663.25], [300, 663.25], [300, 676], [300, 696], [300, 683], [307.25, 683]];
const [width, height] = (process.env.ZA22_VIEWPORT ?? '960x540').split('x').map(Number);
assert.ok(Number.isInteger(width) && width >= 320 && Number.isInteger(height) && height >= 200);
const viewport = { width, height };
const deviceScaleFactor = Number(process.env.ZA22_DEVICE_SCALE ?? .25);
assert.ok(Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0 && deviceScaleFactor <= 2);
const dragX = Math.round(width * .48), dragY = Math.round(height * .51);
const maxDrag = Math.round(width * .34);
const tau = 2 * Math.PI;
const yawDistance = (from, to) => ((to - from + Math.PI) % tau + tau) % tau - Math.PI;
const positionPattern = /东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/;
const hardware = process.env.ZA22_HARDWARE === '1';
const graphicsArgs = hardware ? (process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] : [])
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const report = { url: url.href, segment, viewport, quality: 'smooth', gpu: null, paths: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };

await mkdir(output, { recursive: true });
let browser;
let lastPage;
let lastEvidence;
let measuring = true;

async function openTown(name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'zh-CN' });
  const page = await context.newPage();
  lastPage = page;
  const evidence = { name, checkpoints: [], sockets: [], poses: [] };
  lastEvidence = evidence;
  let westWindow;
  report.paths.push(evidence);
  page.on('pageerror', error => { if (measuring) report.pageErrors.push(String(error)); });
  page.on('console', message => {
    if (measuring && message.type() === 'error') report.consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  page.on('requestfailed', request => {
    if (measuring) report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (measuring && response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  page.on('websocket', socket => {
    const socketPath = new URL(socket.url()).pathname;
    if (!socketPath.startsWith('/presence')) return;
    const mountain = socketPath.startsWith('/presence-mountain');
    const west = socketPath.startsWith('/presence-west');
    evidence.sockets.push(socket.url());
    if (west) {
      const current = {};
      westWindow = current;
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;
        const frame = JSON.parse(payload);
        if (frame.type === 'join' && frame.self === true) {
          current.state = frame.townNightWindow;
          current.joinEpoch = frame.epochMs;
          current.joinReceivedAt = Date.now();
        } else if (frame.type === 'event' && frame.kind === 'town-night-window') {
          current.state = frame.state;
        }
      });
      socket.on('close', () => { if (westWindow === current) westWindow = undefined; });
    }
    socket.on('framesent', ({ payload }) => {
      if (!Buffer.isBuffer(payload) || payload.byteLength !== 12 || payload.readUInt16LE(0) !== 0) return;
      evidence.poses.push({
        ms: Date.now(),
        east: payload.readUInt16LE(2) / 100 - (west ? 240 : 0),
        north: payload.readUInt16LE(4) / 100 + (mountain ? 540 : 0),
        area: mountain ? 'mountain' : west ? 'west' : 'town',
        height: payload.readUInt16LE(6) / 100 - (west ? 64 : 0),
        yaw: payload.readUInt16LE(8) * tau / 65536,
        seq: payload.readUInt16LE(10),
      });
    });
  });
  await page.addInitScript(() => {
    // Use the production drag fallback for consistent native mouse input in headless Chromium.
    // Only the browser API is made unavailable. All movement still runs through the viewer.
    Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined });
    // This is the viewer's ordinary saved graphics setting. It does not change the world or movement.
    localStorage.setItem('unwritten.quality.tier.v1', 'smooth');
    document.addEventListener('town-frame-profile', event => { window.__za22Frame = event.detail; }, true);
  });
  const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  assert.equal(new URL(page.url()).pathname, '/', 'Use the normal production root entry');

  // The current production entry includes an async loading/continue screen.
  // Previous versions of this native-walk harness assumed the canvas was
  // visible immediately, then timed out on a hidden yet correctly mounted
  // Three.js canvas. Follow the SAME normal user flow; never click past an
  // actual load error or forcibly mutate the entry DOM.
  await page.waitForFunction(() => {
    const entry = document.querySelector('#town-entry');
    const next = document.querySelector('#town-entry-continue');
    const fail = document.querySelector('#town-entry-error');
    return entry?.hidden === true || next?.hidden === false || fail?.hidden === false;
  }, undefined, { timeout: 90_000 });
  const entryState = await page.evaluate(() => ({
    entryHidden: document.querySelector('#town-entry')?.hidden === true,
    canContinue: document.querySelector('#town-entry-continue')?.hidden === false,
    failed: document.querySelector('#town-entry-error')?.hidden === false,
  }));
  if (entryState.failed) {
    const startupDiagnosis = await page.evaluate(async () => {
      const resources = performance.getEntriesByType('resource')
        .map(item => item.name)
        .filter(url => /\/assets\/(viewer|town-panel|townBlockout)-[^/]+\.js/.test(url));
      const candidates = resources.filter(url => /\/assets\/(viewer|town-panel)-/.test(url));
      const checked = [];
      for (const url of [...new Set(candidates)]) {
        try {
          await import(/* @vite-ignore */ url);
          checked.push({ url, result:'import succeeded' });
        } catch (error) {
          checked.push({ url, result:String(error),
            stack:error instanceof Error ? error.stack : undefined });
        }
      }
      return {resources,checked,htmlTitle:document.title};
    });
    throw new Error('Actual production entry failed without bypass: '+
      JSON.stringify(startupDiagnosis));
  }
  if (!entryState.entryHidden && entryState.canContinue)
    await page.locator('#town-entry-continue').click();
  await Promise.race([
    page.locator('#scene canvas').waitFor({ state: 'visible', timeout: 90_000 }),
    page.waitForFunction(() => document.querySelector('#town-entry-error')?.hidden === false,
      null, {timeout: 90_000}).then(() => {
        throw new Error('Actual town entry transitioned to failure fallback');
      }),
  ]);


  await page.waitForFunction(pattern => {
    const hud = document.querySelector('#position')?.textContent ?? '';
    return new RegExp(pattern).test(hud) && (window.__za22Frame?.calls > 0 || !location.search);
  }, positionPattern.source, { timeout: 90_000 });
  if (!report.gpu) report.gpu = await page.evaluate(() => {
    const gl = document.querySelector('#scene canvas')?.getContext('webgl2');
    const names = gl?.getExtension('WEBGL_debug_renderer_info');
    return names ? { vendor: gl.getParameter(names.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(names.UNMASKED_RENDERER_WEBGL) } : null;
  });
  if (bare) {
    await page.locator('#scene canvas').click({ position: { x: Math.round(width * .35), y: dragY } });
    await waitForWire(page, evidence, pose => pose?.area === 'town' &&
      Math.hypot(pose.east - spawn[0], pose.north - spawn[1]) < .3);
  }
  const start = await readPose(page);
  assert.ok(Math.hypot(start.east - spawn[0], start.north - spawn[1]) < .3, JSON.stringify(start));
  assert.ok(Math.abs(start.height - 12) < .3, JSON.stringify(start));
  await page.locator('#scene canvas').click({ position: { x: Math.round(width * .35), y: dragY } });
  await waitForWire(page, evidence);
  evidence.checkpoints.push({ label: 'spawn', ...start, wire: evidence.poses.at(-1) });
  console.log(JSON.stringify({ phase: 'spawn', east: start.east, north: start.north, y: start.height }));
  return { page, evidence, westWindow: () => westWindow };
}

async function readPose(page) {
  const frame = await page.evaluate(() => ({
    hud: document.querySelector('#position')?.textContent ?? '',
    cameraY: window.__za22Frame?.cameraY,
    action: document.querySelector('#world-action')?.textContent ?? '',
    status: document.querySelector('#town-presence-status')?.textContent ?? '',
  }));
  const point = positionPattern.exec(frame.hud);
  return { ...frame, east: point ? Number(point[1]) : undefined, north: point ? Number(point[2]) : undefined,
    height: Number.isFinite(frame.cameraY) ? Math.round((frame.cameraY - 1.65) * 100) / 100
      : lastEvidence?.poses.at(-1)?.height };
}

async function waitForWire(page, evidence, predicate = pose => Boolean(pose), timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate(evidence.poses.at(-1)) && Date.now() < deadline) await page.waitForTimeout(35);
  const pose = evidence.poses.at(-1);
  assert.ok(predicate(pose), `No expected pose from the real presence socket: ${JSON.stringify(pose)}`);
  return pose;
}

async function face(page, evidence, desired) {
  for (let attempt = 0; attempt < 16; ++attempt) {
    const before = await waitForWire(page, evidence);
    const delta = yawDistance(before.yaw, desired);
    if (Math.abs(delta) <= .009) return;
    const dx = Math.max(-maxDrag, Math.min(maxDrag, Math.round(delta / .003)));
    const anchor = await page.evaluate(({ width, height, dx, attempt }) => {
      const canvas = document.querySelector('#scene canvas');
      const candidates = [[.48, .51], [.41, .37], [.40, .61], [.56, .45], [.37, .48]];
      for (let index = 0; index < candidates.length; ++index) {
        const [cx, cy] = candidates[(index + attempt) % candidates.length];
        const x = Math.round(width * cx), y = Math.round(height * cy);
        if (x + dx > 0 && x + dx < width && document.elementFromPoint(x, y) === canvas) return { x, y };
      }
    }, { width, height, dx, attempt });
    assert.ok(anchor, 'The canvas needs an unobstructed native mouse target');
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    try { await page.mouse.move(anchor.x + dx, anchor.y, { steps: Math.max(2, Math.ceil(Math.abs(dx) / 55)) }); }
    finally { await page.mouse.up(); }
    // Sample the actual view. Native pointer coordinates may be rounded at a fractional raster scale.
    const until = Date.now() + 800;
    while (evidence.poses.at(-1)?.seq === before.seq && Date.now() < until) await page.waitForTimeout(30);
    await page.waitForTimeout(120);
  }
  assert.fail(`Native mouse drag could not face ${desired}`);
}

async function walkTo(page, evidence, target, label, precision=.46) {
  const [east, north] = target;
  let after = await readPose(page);
  for (let attempt = 0; attempt < 6; ++attempt) {
    assert.ok(Number.isFinite(after.east) && Number.isFinite(after.north), JSON.stringify(after));
    const from = after;
    const dx = east - from.east, dn = north - from.north;
    const distance = Math.hypot(dx, dn);
    if (distance <= precision) {
      evidence.checkpoints.push({ label, target, ...from, wire: evidence.poses.at(-1) });
      console.log(JSON.stringify({ phase: label, east: from.east, north: from.north, y: from.height }));
      return;
    }
    const desired = Math.atan2(dx, dn);
    await face(page, evidence, desired);
    // For small final corrections use the slow backward movement, avoiding double-W sprint.
    const backwards = precision < .3 || distance < 1.4;
    if (backwards) await face(page, evidence, desired + Math.PI);
    const key = backwards ? 's' : 'w';
    const fast = precision >= .3 && distance > 9 && segment !== 'a4-shots';
    if (fast) await page.keyboard.down('Shift');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ pattern, start, east, north, dx, dn, distance, precision }) => {
        const point = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        if (!point) return false;
        const x = Number(point[1]), n = Number(point[2]);
        if (Math.hypot(x - east, n - north) <= Math.max(.10,precision*.7)) return true;
        const forward = ((x - start.east) * dx + (n - start.north) * dn) / distance;
        return forward >= distance;
      }, { pattern: positionPattern.source, start: from, east, north, dx, dn, distance, precision },
      { timeout: Math.ceil(30_000 + distance * 1000) });
    } catch (error) {
      const stopped = await readPose(page);
      throw new Error(`Native walking stopped before ${label} (${east}, ${north}): ${JSON.stringify(stopped)}`, { cause: error });
    } finally {
      await page.keyboard.up(key);
      if (fast) await page.keyboard.up('Shift');
    }
    after = await readPose(page);
  }
  assert.fail(`Native walking did not settle at ${label}: ${JSON.stringify(after)}`);
}
import { createTerrainGrid, worldBounds } from './voxel-tavern/town-blockout/terrain.ts';
import { mountWestCraterRoad } from './voxel-tavern/town-blockout/town-za22-crater-road.ts';

async function picture(page,evidence,label){
  await page.screenshot({path:join(output,label+'.png'),timeout:45000});
  evidence.checkpoints.push({label,lighting:await page.locator('#lighting').textContent(),...await readPose(page),wire:evidence.poses.at(-1)});
}
import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension.ts';
const grid=createTerrainGrid(), road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=['kengkou','freight'].includes(segment)?buildCraterRailExtension(grid,road):undefined;
const approach={
 northwalk:[[-12,159],[-12,240],[-12,320]],
 wall:[[-9,159]],
 gatehouse:[[-3,159],[-6,154],[-7,150.2]],
 kengkou:[[-12,159],[-29,159],[-35,164],[-36,167]],
 gate:[[-12,159],[-40,159],[-27,171],[-27,175]],
 north:[[-12,159],[-40,159],[-37,168],[-39,175],[-62,201],[-68,220],[-83,235],[-98,243],[-120,256],[-124,256]],
 west:[[-12,159],[-40,159],[-80,126],[-95,128],[-110,124],[-126,123],[-151,129],[-170,148],[-178,163],[-187,174],[-187,175]],
 supply:[[-12,159],[-43,159],[-67,136],[-76.5,126],[-74,117.5],[-75,116.5]],
 supplyinterior:[[-12,159],[-43,159],[-67,136]],
 freight:[[-12,159],[-43,159]],
 instrument:[[-12,159],[-29,159],[-36,145],[-38,145],[-48,143.5],[-54.5,140.5]],
 smelter:[[-12,159],[-43,159],[-67,136],[-144,105]],
};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:graphicsArgs});
 const {page,evidence}=await openTown(segment);
 await page.locator('#town-panel-toggle').click();
 await page.locator('#jump').selectOption({label:'陨石坑口'});
 if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();
 await page.waitForFunction(pattern=>{
   const p=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');
   return p&&Math.hypot(+p[1]-2,+p[2]-159)<1.2;
 },positionPattern.source,{timeout:45000});
 for(const [i,target] of approach[segment].entries())await walkTo(page,evidence,target,segment+'-approach-'+i);
 const tower=road.outerWorks.towerRoutes.find(t=>t.id===segment+'-tower');
 const path=segment==='northwalk'?[[-12,320],[-12,336],[-12,400],[-12,450],[-9,470],[-4,485],[2,490]].map(([east,north])=>({east,north,height:east<0?road.heightAt(east,north):grid.heightAt(east,north)})):
   segment==='wall'?[-9,-15,-21,-28].map(east=>({east,north:159,height:road.heightAt(east,159)})):
   tower?[tower.entry,...tower.stairs]:segment==='supply'?road.mouthWorks.supplyDeckRoute:
   segment==='supplyinterior'?road.mouthWorks.supplyInteriorRoute:
   ['kengkou','freight'].includes(segment)?rail.stationWalkRoutes.find(t=>t.id===(segment==='freight'?'freight-shed':'kengkou-station')).points:
   road.outerWorks.industrialRoutes.find(t=>t.id===(segment==='gatehouse'?'gatehouse':segment+'-plant')).points;
 async function step(point,label){
   await walkTo(page,evidence,[point.east,point.north],label,segment==='northwalk'?.46:.18);
   await page.waitForTimeout(140);
   const pose=await readPose(page);
   assert.ok(Math.abs(pose.height-point.height)<.39,JSON.stringify({label,pose,point}));
   return pose;
 }
 async function wallView(label,heading){
   await face(page,evidence,heading);
   for(const lighting of ['雪夜','白昼']){
     if((await page.locator('#lighting').textContent())!==lighting){
       await page.locator('#town-panel-toggle').click();
       await page.locator('#lighting').click();
       await page.locator('#town-settings-close').click();
     }
     await picture(page,evidence,label+'-'+(lighting==='雪夜'?'night':'day'));
   }
 }
 for(const [i,point] of path.entries()){
   await step(point,segment+'-up-'+i);
   if(segment==='northwalk'&&(i===1||i===2))await wallView('northwalk-'+(i===1?'seam':'mid'),0);
   if(segment==='wall'&&i===0)await wallView('wall-town-face',-Math.PI/2);
   if(segment==='wall'&&i===path.length-1)await wallView('wall-crater-face',Math.PI/2);
 }
 const top=await readPose(page);
 if(segment==='kengkou'||segment==='gatehouse'){
   const bench=segment==='kengkou'?rail.benchSeats.find(s=>s.id==='坑口站-1'):road.outerWorks.gatehouseSeats[0];
   await step({east:bench.useEast,north:bench.useNorth,height:bench.height},'station-bench');
   await page.waitForFunction(label=>document.querySelector('#world-action')?.textContent?.includes(label),segment==='gatehouse'?'门房长椅':'站台长椅',{timeout:8000});
   await page.keyboard.press('e');
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('起身'),null,{timeout:8000});
   await picture(page,evidence,segment+'-seated');
   await page.keyboard.press('e');
   await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#position')?.textContent??''),positionPattern.source,{timeout:8000});
   await step(path.at(-1),'station-stand-return');
   await face(page,evidence,segment==='gatehouse'?0:1.7+Math.PI);
   for(const lighting of ['雪夜','白昼']){
     if((await page.locator('#lighting').textContent())!==lighting){
       await page.locator('#town-panel-toggle').click();
       await page.locator('#lighting').click();
       await page.locator('#town-settings-close').click();
     }
     await picture(page,evidence,segment+'-'+(lighting==='雪夜'?'night':'day'));
   }
 }else if(segment==='supplyinterior'){
   await wallView('supplyinterior-map',150*Math.PI/180);
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('手绘图'),null,{timeout:8000});
   await page.keyboard.press('e');
   await page.locator('#place-card[open]').waitFor({timeout:8000});
   assert.equal(await page.locator('#place-title').textContent(),'坑区手绘图');
   await picture(page,evidence,'supplyinterior-map-open');
   await page.locator('#place-card .close-card').click();
 }else if(segment==='freight'){
   await wallView('freight-interior',Math.PI);
 }else if(segment==='instrument'||segment==='smelter'){
   await face(page,evidence,(segment==='instrument'?307:297)*Math.PI/180);
   for(const lighting of ['雪夜','白昼']){
     if((await page.locator('#lighting').textContent())!==lighting){
       await page.locator('#town-panel-toggle').click();
       await page.locator('#lighting').click();
       await page.locator('#town-settings-close').click();
     }
     await picture(page,evidence,segment+'-interior-'+(lighting==='雪夜'?'night':'day'));
   }
 }else if(tower){
   const heading=Math.atan2(road.anchor.east-top.east,road.anchor.north-top.north);
   await wallView(segment+'-lookout',heading);
 }else await picture(page,evidence,segment+'-top');
 if(segment==='supply'){
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('屋顶望筒'),null,{timeout:5000});
   await page.keyboard.press('e');await page.waitForTimeout(600);
   await picture(page,evidence,'supply-scope');
   await page.keyboard.press('e');
 }
 for(const [i,point] of path.slice().reverse().slice(1).entries())await step(point,segment+'-down-'+i);
 const returned=await readPose(page);
 if(segment==='gatehouse')assert.ok(Math.abs(returned.height-path[0].height)<.08,JSON.stringify({returned,ground:path[0]}));
 await picture(page,evidence,segment+'-return');
 report.traversal={top,returned,expectedTop:path.at(-1),expectedReturn:path[0]};
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;try{await picture(lastPage,lastEvidence,'failed-position');}catch{}}
finally{
 measuring=false;report.errors=report.pageErrors.length+report.consoleErrors.length+report.requestFailures.length+report.httpErrors.length;
 await writeFile(join(output,'za22-live-walk.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({segment,paths:report.paths.map(x=>({name:x.name,checkpoints:x.checkpoints.length,poses:x.poses.length})),traversal:report.traversal,errors:report.errors,failure:report.failure}));
 await browser?.close();
}
