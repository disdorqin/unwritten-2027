import assert from 'node:assert/strict';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [origin, output, segment = 'roundtrip'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const bare = process.env.ZA22_BARE === '1';
const url = new URL(bare ? '/' : '/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(['descent','roundtrip','rim-return'].includes(segment), segment);

const spawn = [223, 180];
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
const report = { url: url.href, segment, viewport, deviceScaleFactor, quality: 'smooth', gpu: null, paths: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };

await mkdir(output, { recursive: true });
let browser;
let lastPage;
let lastEvidence;
let measuring = true;
// A complete 824m descent plus return needs more time than the previous
// single-descent evidence budget. Keep an explicit bounded deadline.
const budget=Number(process.env.ZA22_ROUTE_BUDGET_MS??(segment==='roundtrip'?480_000:225_000));
assert.ok(Number.isInteger(budget)&&budget>=225_000&&budget<=600_000,'Invalid native route budget');
const runDeadline=Date.now()+budget;report.routeBudgetMs=budget;
function remaining(){const left=runDeadline-Date.now();assert.ok(left>1000,'Native route evidence budget exhausted');return left;}

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
    window.__za22Stage='entry';window.__za22Samples=[];
    document.addEventListener('town-frame-profile', event => {
      const f=event.detail;window.__za22Frame=f;
      if(window.__za22Samples.length<30000&&Number.isFinite(f.frameMs)&&f.frameMs>0)window.__za22Samples.push([window.__za22Stage,f.frameMs,f.calls,f.triangles,f.movementMs,f.detailMs,f.weatherMs]);
    }, true);
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

async function face(page, evidence, desired, tolerance=.009) {
  for (let attempt = 0; attempt < 16; ++attempt) {
    remaining();
    const before = await waitForWire(page, evidence);
    const delta = yawDistance(before.yaw, desired);
    if (Math.abs(delta) <= tolerance) return;
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

async function walkTo(page, evidence, target, label, precise=false) {
  const [east, north] = target;
  let after = await readPose(page);
  for (let attempt = 0; attempt < 6; ++attempt) {
    remaining();
    assert.ok(Number.isFinite(after.east) && Number.isFinite(after.north), JSON.stringify(after));
    const from = after;
    const dx = east - from.east, dn = north - from.north;
    const distance = Math.hypot(dx, dn);
    if (distance <= (precise?.19:.46)) {
      evidence.checkpoints.push({ label, target, ...from, wire: evidence.poses.at(-1) });
      console.log(JSON.stringify({ phase: label, east: from.east, north: from.north, y: from.height }));
      return;
    }
    const desired = Math.atan2(dx, dn);
    await face(page, evidence, desired,precise?.004:.009);
    // For small final corrections use the slow backward movement, avoiding double-W sprint.
    const backwards = distance < 1.4;
    if (backwards) await face(page, evidence, desired + Math.PI,precise?.004:.009);
    const key = backwards ? 's' : 'w';
    const fast = !precise && !backwards && distance > 3;
    if (fast) await page.keyboard.down('Shift');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ pattern, start, east, north, dx, dn, distance, tolerance }) => {
        const point = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        if (!point) return false;
        const x = Number(point[1]), n = Number(point[2]);
        if (Math.hypot(x - east, n - north) <= tolerance) return true;
        const forward = ((x - start.east) * dx + (n - start.north) * dn) / distance;
        return forward >= distance;
      }, { pattern: positionPattern.source, start: from, east, north, dx, dn, distance,tolerance:precise?.13:.32 },
      { timeout: Math.min(remaining(),Math.ceil(30_000 + distance * 1000)) });
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

async function follow(page, evidence, knots, prefix) {
  for (const [index, target] of knots.entries()) await walkTo(page, evidence, target, `${prefix}-${index + 1}`);
}


async function snapshot(page,evidence,label){
  await page.screenshot({path:join(output,label+'.png'),timeout:45000});
  evidence.checkpoints.push({label,lighting:await page.locator('#lighting').textContent(),...await readPose(page),wire:evidence.poses.at(-1)});
}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:graphicsArgs});
  report.browser=browser.version();
  const {buildBR30NativeRoute}=await import('./verify-b-r30-native-route.ts');
  const route=buildBR30NativeRoute();
  const {page,evidence,westWindow}=await openTown('b-r30-'+segment);
  const result={scope:'normal entry and in-game location chooser; actual W/S/Shift and mouse, not full spawn walk or underground entry',down:0,up:0,complete:false,legalWindow:null,route};
  report.bR30=result;
  const save=async()=>{
    const progress={...result,observed:{checkpoints:evidence.checkpoints.length,poseSamples:evidence.poses.length,
      errors:report.pageErrors.length+report.consoleErrors.length+report.requestFailures.length+report.httpErrors.length,
      lastAcceptedPose:evidence.poses.at(-1)}};
    const dst=join(output,'b-r30-progress.json'),tmp=dst+'.next';
    const body=JSON.stringify(progress,null,2);
    await writeFile(tmp,body);
    let replaced=false;
    for(let i=0;i<5;i++){
      try{await rename(tmp,dst);replaced=true;break;}
      catch(error){
        if(!['EPERM','EACCES','EBUSY'].includes(error?.code))throw error;
        await new Promise(done=>setTimeout(done,40*(i+1)));
      }
    }
    if(!replaced){
      // Windows indexers/readers may hold the previous progress file.
      // Preserve a new immutable checkpoint, never turn a completed
      // movement into a geometry failure because replace was locked.
      const fallback=join(output,'b-r30-progress-'+result.down+'-'+result.up+'-'+Date.now()+'.json');
      await writeFile(fallback,body,{flag:'wx'});
      (report.evidenceWarnings??=[]).push({kind:'progress-replace-locked',fallback});
    }
  };
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label:'陨石坑口'});
  if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();
  await page.waitForFunction(pattern=>{const m=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');return m&&Math.hypot(+m[1]-2,+m[2]-159)<1.2;},positionPattern.source,{timeout:45000});
  await page.evaluate(()=>{window.__za22Stage='approach';});
  await follow(page,evidence,[[-12,159],[-40,159]],'approach');
  for(const [i,p] of route.approach.points.entries())await walkTo(page,evidence,[p.east,p.north],'certified-approach-'+i,true);
  await page.evaluate(()=>{window.__za22Stage='night-permission';});
  const deadline=Math.min(Date.now()+120000,runDeadline-1000);
  while(Date.now()<deadline){
    const f=westWindow();
    if(f?.state?.phase==='night-window'&&f.state.canEnterRestricted){
      const now=f.joinEpoch+Date.now()-f.joinReceivedAt;
      if(f.state.morningBellAt-now>60000){result.legalWindow={...f.state,now};break;}
    }
    await page.waitForTimeout(350);
  }
  assert.ok(result.legalWindow,'No actual west night-window permission');
  await walkTo(page,evidence,[-71,159],'authorized-rim');
  await waitForWire(page,evidence,p=>p?.area==='west'&&p.east<-70.55);
  await snapshot(page,evidence,'rim-night');await save();
  async function traverse(knots,key){
    await page.evaluate(stage=>{window.__za22Stage=stage;},key);
    for(let i=0;i<knots.length;i++){
      const q=knots[i];
      await walkTo(page,evidence,[q.east,q.north],key+'-'+q.t.toFixed(3));
      const actual=await readPose(page);
      assert.ok(Number.isFinite(actual.height)&&Math.abs(actual.height-q.height)<1.3,'Height divergence '+JSON.stringify({q,actual}));
      result[key]=i+1;result.last={key,q,actual,wire:evidence.poses.at(-1)};
      await save();
    }
  }
  if(segment==='rim-return'){
    // Separate actual upper segment; not a full bottom-to-rim round trip.
    const upper=route.points.filter(p=>p.t<=.12);
    result.scope='normal entry/actual authorized rim and t0..0.12 round trip only; no floor or full descent claim';
    await traverse(upper,'down');
    await snapshot(page,evidence,'upper-turnback');
    await traverse([...upper].reverse(),'up');
    await walkTo(page,evidence,[-67,159],'return-outside');
    await waitForWire(page,evidence,p=>p?.area==='west'&&Math.hypot(p.east+67,p.north-159)<.7);
    await snapshot(page,evidence,'return-outside');
  }else{
  await traverse(route.points,'down');
  await walkTo(page,evidence,[route.floor.east,route.floor.north],'actual-bottom');
  result.floor=await readPose(page);
  assert.ok(Math.abs(result.floor.height-route.floor.height)<.65,'Not on actual floor');
  await waitForWire(page,evidence,p=>p?.area==='west'&&Math.hypot(p.east-route.floor.east,p.north-route.floor.north)<.7);
  await face(page,evidence,route.floorYaw);
  await snapshot(page,evidence,'floor-night');await save();
  if(segment==='roundtrip'){
    await traverse([...route.points].reverse(),'up');
    await walkTo(page,evidence,[-67,159],'return-outside');
    await waitForWire(page,evidence,p=>p?.area==='west'&&Math.hypot(p.east+67,p.north-159)<.7);
    await snapshot(page,evidence,'return-outside');
  }
  }
  assert.equal(report.pageErrors.length+report.consoleErrors.length+report.requestFailures.length+report.httpErrors.length,0);
  result.complete=true;await save();
}catch(error){
  report.failure=error instanceof Error?error.stack:String(error);
  if(lastPage&&!lastPage.isClosed()){try{report.lastPose=await readPose(lastPage);await lastPage.screenshot({path:join(output,'failed-position.png'),timeout:10000});}catch{}}
  process.exitCode=1;
}finally{
  measuring=false;
  report.errors=report.pageErrors.length+report.consoleErrors.length+report.requestFailures.length+report.httpErrors.length;
  if(lastPage&&!lastPage.isClosed()&&!bare){try{
    const data=await lastPage.evaluate(()=>({rows:window.__za22Samples??[],canvas:[document.querySelector('#scene canvas')?.width,document.querySelector('#scene canvas')?.height]}));
    const stats=a=>{a=a.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?{median:a[Math.floor((a.length-1)/2)],p95:a[Math.max(0,Math.ceil(a.length*.95)-1)]}:null;};
    report.nativePerformance={canvas:data.canvas,scope:'actual normal entrance; native player keyboard and pointer route, includes turning/checkpoints, not fixed-camera A/B',stages:[...new Set(data.rows.map(r=>r[0]))].map(stage=>{const rows=data.rows.filter(r=>r[0]===stage),get=i=>stats(rows.map(r=>r[i]));return {stage,frames:rows.length,fps:1000*rows.length/rows.reduce((a,r)=>a+r[1],0),frameMs:get(1),draws:get(2),triangles:get(3),movementMs:get(4),detailMs:get(5),weatherMs:get(6)};})};
  }catch(e){report.nativePerformanceError=String(e);}}
  await writeFile(join(output,'za22-live-walk.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({segment,down:report.bR30?.down,up:report.bR30?.up,complete:report.bR30?.complete,errors:report.errors,failure:report.failure,poses:report.paths[0]?.poses.length}));
  await browser?.close();
}
