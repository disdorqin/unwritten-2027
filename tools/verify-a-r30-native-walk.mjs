import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { WebSocket } from 'ws';
import {fromSummitPresencePose} from '../src/shared/za22-summit-presence-domain.ts';

const [origin, output, segment = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const bare = process.env.ZA22_BARE === '1';
const url = new URL(bare ? '/' : segment==='a31-front-north'?'/?profile&mRoadSurvey':'/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(['gate','north','west','supply','instrument','smelter','kengkou','gatehouse','wall','northwalk','west-mountain','supplyinterior','freight','shankou','outcrop','outerclusters','ore-yard','transfer-dock','ore-yard-dock','guard-shed','assembly-registration','cold-furnace','water-tower','western-clusters','eastern-cluster','western-shoulders','industrial-ruins','salvage-pipes','rail-valley','rail-buffer','inscription-access','joint-historic','mobile-review','night-r3-entry','night-r3-bare-weather','night-r3-bare-west','a31-bare-crater-return','a31-front-north','a32-stream'].includes(segment), segment);

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
const mobileReview=segment==='mobile-review';
const menuTouch=segment==='night-r3-bare-weather'&&process.env.ZA22_MENU_TOUCH==='1';
const sampleFrames=process.env.ZA22_PROFILE_SAMPLE==='1'||mobileReview||segment==='a32-stream';
const report = { url: url.href, segment, viewport, deviceScaleFactor, quality: 'smooth', gpu: null, paths: [], pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], performanceSamples:[] };

await mkdir(output, { recursive: true });
let browser;
let lastPage;
let lastEvidence;
let measuring = true;

async function openTown(name) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'zh-CN',...((mobileReview||menuTouch)?{isMobile:true,hasTouch:true}: {}) });
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
    const summit = socketPath.startsWith('/presence-summit');
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
      const raw={east:payload.readUInt16LE(2)/100,north:payload.readUInt16LE(4)/100,height:payload.readUInt16LE(6)/100};
      const world=summit?fromSummitPresencePose(raw):{east:raw.east-(west?240:0),north:raw.north+(mountain?540:0),height:raw.height-(west?64:0)};
      assert.ok(world,'rear pose outside its actual wire frame');
      evidence.poses.push({
        ms: Date.now(),
        ...world,
        area: summit?'summit':mountain ? 'mountain' : west ? 'west' : 'town',
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
    window.__a31LoadFrames=[];
    document.addEventListener('town-frame-profile', event => {
      window.__za22Frame = event.detail;
      const s=event.detail.summitProduction;
      if(s&&window.__a31LoadFrames.length<4000)window.__a31LoadFrames.push({ms:event.detail.frameMs,status:s.status,stage:s.stage,near:s.near,draws:s.draws});
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
    await page.waitForTimeout(segment==='joint-historic'?55:120);
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
      const checkpoint={ label, target, ...from, wire: evidence.poses.at(-1) };
      evidence.checkpoints.push(checkpoint);
      if(['joint-historic','west-mountain','night-r3-bare-west','a31-bare-crater-return','a31-front-north'].includes(segment))await appendFile(join(output,'native-checkpoints.ndjson'),JSON.stringify(checkpoint)+'\n');
      console.log(JSON.stringify({ phase: label, east: from.east, north: from.north, y: from.height }));
      return;
    }
    const desired = Math.atan2(dx, dn);
    // Select the actual travel heading once; previously a backward
    // correction first turned forward and then rotated another 180°.
    const backwards = precision < .3 || distance < 1.4;
    await face(page, evidence, desired+(backwards?Math.PI:0));
    const key = backwards ? 's' : 'w';
    const fast = !backwards&&precision >= .3 && distance > (segment==='joint-historic'?3.5:9) && segment !== 'a4-shots';
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
import {smelterFootway} from './voxel-tavern/town-blockout/town-a-r30-west-landscape.ts';
import { mountWestCraterRoad } from './voxel-tavern/town-blockout/town-za22-crater-road.ts';

async function picture(page,evidence,label){
  if(sampleFrames&&!bare){
    // Listen to the actual production renderer event, not a synthetic loop.
    // Exclude the screenshot itself and bound the sample duration/storage.
    const sample=await page.evaluate(()=>new Promise(resolve=>{
      const frames=[],start=performance.now();
      const finish=()=>{document.removeEventListener('town-frame-profile',listener,true);clearTimeout(timer);resolve({elapsedMs:performance.now()-start,frames});};
      const listener=e=>{const f=e.detail;if(Number.isFinite(f.frameMs)&&f.frameMs>0&&Number.isFinite(f.calls)&&Number.isFinite(f.triangles)){
        frames.push({frameMs:f.frameMs,calls:f.calls,triangles:f.triangles,movementMs:f.movementMs,detailMs:f.detailMs});
        if(frames.length>=120)finish();
      }};
      const timer=setTimeout(finish,2000);document.addEventListener('town-frame-profile',listener,true);
    }));
    const stats=k=>{const values=sample.frames.map(f=>f[k]).filter(Number.isFinite).sort((a,b)=>a-b);return values.length?{median:values[Math.floor((values.length-1)/2)],p95:values[Math.floor((values.length-1)*.95)],p99:values[Math.floor((values.length-1)*.99)],max:values.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length}:undefined;};
    const timing=stats('frameMs');report.performanceSamples.push({label,elapsedMs:sample.elapsedMs,frames:sample.frames.length,frameMs:timing,fps:timing?1000/timing.mean:undefined,longFrames:{over50:sample.frames.filter(f=>f.frameMs>50).length,over100:sample.frames.filter(f=>f.frameMs>100).length},calls:stats('calls'),triangles:stats('triangles'),movementMs:stats('movementMs'),detailMs:stats('detailMs'),scope:'headless browser, actual renderer event, not physical phone'});
  }
  await page.screenshot({path:join(output,label+'.png'),timeout:45000});
  evidence.checkpoints.push({label,lighting:await page.locator('#lighting').textContent(),...await readPose(page),wire:evidence.poses.at(-1)});
}
import {buildCraterRailExtension} from './voxel-tavern/town-blockout/town-crater-rail-extension.ts';
import {buildTownRailRoute} from './voxel-tavern/town-blockout/town-railway.ts';
import {mountWestMountainGround,westMountainTrackProtection} from './voxel-tavern/town-blockout/town-night-a-summit-west-ground.ts';
import {westMountainFootway} from './voxel-tavern/town-blockout/town-night-a-summit-west-footway.ts';
const grid=createTerrainGrid(), road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=['kengkou','freight','shankou','transfer-dock','ore-yard-dock','rail-valley','rail-buffer','inscription-access','west-mountain'].includes(segment)?buildCraterRailExtension(grid,road,['rail-buffer','west-mountain'].includes(segment)?buildTownRailRoute(grid).points:undefined):undefined;
const westMountain=segment==='west-mountain'?mountWestMountainGround(road.heightAt,{west:-240,east:0,south:336,north:worldBounds.depth},westMountainTrackProtection([rail.samples,rail.narrowSamples,rail.sidingSamples])):undefined;
const jointManifest=process.env.AR30_JOINT_ROUTE?JSON.parse(await readFile(process.env.AR30_JOINT_ROUTE,'utf8')):undefined;
const joint=segment==='joint-historic'?jointManifest:undefined;
const jointInscription=segment==='inscription-access'?jointManifest?.inscriptionPath:undefined;
const approach={
 'joint-historic':[[-12,159],[-40,159]],
 outerclusters:[[-12,159],[-40,159],[-37,168],[-39,175],[-62,201],[-68,220]],
 'western-clusters':[[-12,159],[-40,159],[-37,168],[-39,175],[-62,201],[-68,220],[-83,235],[-98,243]],
 'eastern-cluster':[[-12,159],[-40,159]],
 'western-shoulders':[[-12,159],[-23,159],[-23,95],[-60,55]],
 outcrop:[[-12,159],[-23,159],[-23,95],[-60,55]],
 shankou:[[296,516],[296,512]],
 'rail-valley':[],
 'rail-buffer':[],
 northwalk:[[-12,159],[-12,240],[-12,320]],
 'west-mountain':[[-12,159],[-40,159],[-37,168],[-39,175],[-62,201],[-68,220],[-68,232],[-83,235],[-98,243],[-95,261],[-90,265]],
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
 smelter:[[-12,159],...smelterFootway],
 'ore-yard':[[-12,159],...smelterFootway],
 'industrial-ruins':[[-12,159],...smelterFootway],
 'salvage-pipes':[[-12,159],...smelterFootway],
 'transfer-dock':[[-12,159],[-43,159]],
 'inscription-access':[[-12,159],[-43,159]],
 'ore-yard-dock':[[-12,159],...smelterFootway,[-132,101],[-132,100],[-123,100]],
 'guard-shed':[[-12,159],[-40,159],[-37,168],[-39,175],[-62,201],[-68,220],[-83,235],[-98,243],[-110,244],[-119,245]],
 'assembly-registration':[[-12,159],...smelterFootway.slice(0,4)],
 'cold-furnace':[[-12,159],...smelterFootway.slice(0,-1)],
 'water-tower':[[-12,159],[-29,159]],
};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:graphicsArgs});
 const {page,evidence,westWindow}=await openTown(segment);
 if(segment==='a31-bare-crater-return'){
  assert.ok(bare);const start=await readPose(page);
  // The reverse straight chord near E67/N164 intersects an actual tree.
  // Walk around the existing trunk on its south side, both directions.
  const path=[...westShore.slice(0,-1),[71,161.8],[63,161],[2,159],[-12,159],[-40,159]];
  for(const [i,p] of path.entries())await walkTo(page,evidence,p,'crater-out-'+i,.65);
  const mouth=await readPose(page);await waitForWire(page,evidence,p=>p?.area==='west'&&Math.hypot(p.east+40,p.north-159)<1);
  await picture(page,evidence,'crater-mouth');
  for(const [i,p] of [...path.slice(0,-1).reverse(),spawn].entries())await walkTo(page,evidence,p,'crater-return-'+i,.65);
  const returned=await readPose(page);await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-223,p.north-180)<1);
  await picture(page,evidence,'town-returned');report.traversal={start,mouth,top:mouth,returned};
 }else if(segment==='night-r3-bare-west'){
  assert.ok(bare);
  const start=await readPose(page);
  const path=[...westShore,[2,159]];
  // The public town route must start at birth, not the jump menu.
  for(const [i,p] of path.entries())await walkTo(page,evidence,p,'birth-west-'+i,.65);
  const mouth=await readPose(page);await picture(page,evidence,'birth-crater-mouth');
  for(const [i,p] of approach['west-mountain'].entries())await walkTo(page,evidence,p,'birth-mountain-approach-'+i,.46);
  for(const [i,p] of westMountainFootway.slice(1).entries())await walkTo(page,evidence,p,'birth-mountain-foot-'+i,.46);
  const top=await readPose(page);const wire=await waitForWire(page,evidence,p=>p?.area==='west'&&Math.hypot(p.east+90,p.north-350)<.8);
  await appendFile(join(output,'native-checkpoints.ndjson'),JSON.stringify({label:'birth-west-outbound-complete',start,mouth,top,wire})+'\n');
  await picture(page,evidence,'birth-mountain-foot');
  for(const [i,p] of [...westMountainFootway.slice(0,-1).reverse(),...approach['west-mountain'].slice(0,-1).reverse(),[2,159],...path.slice(0,-1).reverse(),spawn].entries())await walkTo(page,evidence,p,'birth-return-'+i,.55);
  const returned=await readPose(page);await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-223,p.north-180)<.8);
  await picture(page,evidence,'birth-returned');
  report.traversal={start,mouth,top,returned};
 }else if(segment==='night-r3-bare-weather'){
  assert.ok(bare,'The ordinary settings verification must use the bare root');
  assert.equal(new URL(page.url()).search,'');
  const menu=page.locator('#town-settings'),toggle=page.locator('#town-panel-toggle');
  await page.waitForFunction(()=>document.querySelector('#town-summit-status')?.dataset.status==='idle',null,{timeout:15000});
  assert.match(await page.locator('#town-summit-status').textContent(),/远景常驻.*接近后加载/);
  const activate=locator=>menuTouch?locator.tap():locator.click();
  const hiddenIds=['#town-settings','#town-music-toggle','#town-chat','#fullscreen-toggle','#museum-map-button','#snowball-board'];
  for(const id of hiddenIds)assert.equal(await page.locator(id).isVisible(),false,id+' must not obscure ordinary exploration');
  assert.ok(await toggle.isVisible());
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await activate(toggle);
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const bounds=await menu.boundingBox();
  assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
  assert.ok(bounds.x+bounds.width>=viewport.width-32,'Drawer must be anchored at right edge');
  assert.ok(await page.locator('#town-music-toggle').isVisible());
  assert.ok(await page.locator('#snowball-board').isVisible());
  const advanced=page.locator('#town-advanced-settings');
  assert.equal(await advanced.evaluate(el=>el.open),false);
  await activate(advanced.locator('summary'));assert.ok(await page.locator('#quality-tier').isVisible());
  const weatherAudio=page.locator('#town-weather-audio'),weatherVolume=page.locator('#town-weather-volume');
  assert.equal(await weatherAudio.isChecked(),false);
  await activate(weatherAudio);assert.equal(await weatherAudio.isChecked(),true);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('unwritten.weather.audio.v1')??'{}').enabled===true);
  await weatherVolume.fill('35');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('unwritten.weather.audio.v1')??'{}').volume===35);
  await activate(weatherAudio);assert.equal(await weatherAudio.isChecked(),false);
  await activate(advanced.locator('summary'));assert.equal(await page.locator('#quality-tier').isVisible(),false);
  const chat=page.locator('#town-chat-toggle');
  await chat.waitFor({state:'visible'});
  assert.equal(await chat.getAttribute('aria-expanded'),'false');
  await activate(chat);assert.ok(await page.locator('#town-chat-text').isVisible());
  await page.locator('#town-chat-text').fill('菜单原生验收');
  await page.locator('#town-chat-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#town-chat-log')?.textContent?.includes('菜单原生验收'));
  await activate(chat);
  assert.equal(await page.locator('#town-chat-text').isVisible(),false);
  const status=page.locator('#town-regional-weather');
  await status.waitFor({state:'visible'});
  await page.waitForFunction(()=>/能见度约/.test(document.querySelector('#town-regional-weather')?.textContent??''),null,{timeout:15000});
  const weather=await status.textContent();
  const lighting=page.locator('#lighting'),snow=page.locator('#snow');
  assert.ok(await lighting.isDisabled(),'The ordinary clock must not be manually overrideable');
  const before=await snow.getAttribute('aria-pressed');
  assert.ok(before==='true'||before==='false');
  await snow.click();
  assert.notEqual(await snow.getAttribute('aria-pressed'),before);
  await snow.click();
  assert.equal(await snow.getAttribute('aria-pressed'),before);
  assert.ok((await status.textContent()).includes('能见度约'));
  await picture(page,evidence,'bare-weather-settings');
  // The menu's actual activity button must open only one modal and
  // leave the game operable when that activity closes.
  await activate(page.locator('#town-passport-button'));
  await page.locator('#place-card[open]').waitFor({state:'visible'});
  assert.equal(await menu.evaluate(el=>el.open),false);
  assert.equal(await page.locator('dialog[open]').count(),1);
  await activate(page.locator('#place-card .close-card'));
  await page.locator('#place-card').waitFor({state:'hidden'});
  await activate(toggle);
  await activate(page.locator('#town-settings-close'));
  await page.waitForFunction(()=>document.querySelector('#town-panel-toggle')?.getAttribute('aria-expanded')==='false');
  // A genuine second Presence client sends a town message while the
  // visual browser is walking. No mocked events or extra WebGL context.
  const peerUrl=new URL('/presence',origin);peerUrl.protocol='ws:';
  const peer=new WebSocket(peerUrl);
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Peer join timeout')),8000);
    peer.once('error',e=>{clearTimeout(timer);reject(e);});
    peer.once('open',()=>peer.send(JSON.stringify({type:'join',name:'菜单验收伙伴'})));
    peer.on('message',(raw,binary)=>{if(binary)return;const f=JSON.parse(raw.toString());if(f.type==='join'&&f.self===true){clearTimeout(timer);resolve();}});
   });
   peer.send(JSON.stringify({type:'chat',scope:'town',text:'未读提示实际联机'}));
   await page.waitForFunction(()=>document.querySelector('#town-panel-toggle')?.dataset.chatUnread==='true'&&document.querySelector('#town-chat-log')?.textContent?.includes('未读提示实际联机'));
   assert.equal(await menu.isVisible(),false);
   assert.match(await toggle.getAttribute('aria-label'),/未读/);
   assert.notEqual(await toggle.evaluate(el=>getComputedStyle(el,'::after').content),'none');
   await activate(toggle);await activate(chat);
   await page.waitForFunction(()=>document.querySelector('#town-panel-toggle')?.dataset.chatUnread==='false');
   assert.equal(await page.locator('#town-chat-unread').evaluate(el=>el.hidden),true);
   await activate(page.locator('#town-settings-close'));await menu.waitFor({state:'hidden'});
  }finally{peer.terminate();}
  // A raw protocol probe, not a walked avatar or transport certificate.
  // The local production launcher explicitly keeps summit release off.
  const summitUrl=new URL('/presence-summit',origin);summitUrl.protocol='ws:';
  const probe=new WebSocket(summitUrl);const frames=[];
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Summit protocol join timeout')),8000);
    probe.once('error',e=>{clearTimeout(timer);reject(e);});
    probe.once('open',()=>probe.send(JSON.stringify({type:'join',name:'后山协议验收',presenceFrame:'summit-v1'})));
    probe.on('message',(raw,binary)=>{if(binary)return;const f=JSON.parse(raw.toString());frames.push(f);if(frames.some(m=>m.type==='join'&&m.self===true)&&frames.some(m=>m.type==='cable-line'&&m.line===2)){clearTimeout(timer);resolve();}});
   });
   const hello=frames.find(m=>m.type==='join'&&m.self===true);assert.equal(hello.presenceFrame,'summit-v1');
   const line=frames.find(m=>m.type==='cable-line'&&m.line===2);assert.equal(line.stage,'dormant');
   probe.send(JSON.stringify({type:'event',kind:'cable-release-summit'}));
   await page.waitForTimeout(300);assert.ok(frames.filter(m=>m.type==='cable-line'&&m.line===2).every(m=>m.stage==='dormant'));
   report.summitProtocol={frame:hello.presenceFrame,closedStage:line.stage,releaseAttemptRejected:true,scope:'raw separate socket, no player movement or transfer'};
  }finally{probe.terminate();}
  if(!menuTouch){
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.querySelector('#town-settings')?.open&&document.activeElement?.id==='town-chat-text');
   await page.keyboard.press('Escape'); // blurs chat input
   await page.keyboard.press('Escape'); // closes menu
   await menu.waitFor({state:'hidden'});
  }
  await activate(toggle);
  // Backdrop click is a real native interaction outside the drawer.
  const drawer=await menu.boundingBox();
  if(drawer.x>4){if(menuTouch)await page.touchscreen.tap(2,Math.floor(height/2));else await page.mouse.click(2,Math.floor(height/2));}
  else await activate(page.locator('#town-settings-close'));
  await menu.waitFor({state:'hidden'});
  await page.locator('#scene canvas').click({position:{x:Math.round(width*.35),y:dragY}});
  const start=await readPose(page);
  if(menuTouch){
   await page.locator('#touch-walk').waitFor({state:'visible'});
   const pad=await page.locator('#touch-walk').boundingBox();
   const cdp=await page.context().newCDPSession(page);
   const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
   const p={x:pad.x+pad.width/2,y:pad.y+pad.height/2,id:1};
   await touch('touchStart',[p]);try{await touch('touchMove',[{...p,y:p.y-37}]);await page.waitForTimeout(650);}finally{await touch('touchEnd',[]);}
   await page.waitForTimeout(200);
  }else{
   await page.keyboard.down('w');try{await page.waitForTimeout(500);}finally{await page.keyboard.up('w');}
  }
  const moved=await readPose(page);
  assert.ok(Math.hypot(moved.east-start.east,moved.north-start.north)>.3,'Native keyboard walking must remain available');
  await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-moved.east,p.north-moved.north)<1);
  await picture(page,evidence,'bare-weather-walk');
  report.entry={scope:'ordinary bare root, single corner menu, nested settings, chat send, close and native movement',weather,lightingDisabled:true,snowToggleRestored:true,menuTouch,drawer:bounds,hiddenIds,chatSent:true,remoteUnread:true,start,moved};
  report.traversal={top:moved,returned:moved};
 }else if(segment==='a31-front-north'){
  // Normal root, read-only profiling, ordinary station menu as segmented start.
  const state=()=>page.evaluate(()=>window.__za22Frame);
  await page.waitForFunction(()=>window.__za22Frame?.ridge?.roads===4&&window.__za22Frame?.summitProduction?.status==='idle',null,{timeout:45000});
  await page.locator('#town-panel-toggle').click();await page.locator('#jump').selectOption({label:'火车站'});
  if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();
  await page.waitForFunction(()=>{const f=window.__za22Frame?.ridge?.foot;return f&&Math.hypot(f[0]-526,f[1]-305)<1.2;},null,{timeout:20000});
  await page.waitForFunction(()=>window.__za22Frame?.summitProduction?.publicTransportBound===true,null,{timeout:150000});
  await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-526,p.north-305)<1.2);
  await face(page,evidence,0);
  await walkTo(page,evidence,[526,349.5],'base-dock',.35);
  await walkTo(page,evidence,[526,354.8],'base-exit',.35);
  await walkTo(page,evidence,[516.5,355],'base-road',.35);
  const guide=(await state()).ridge.roadGuide;assert.ok(guide.length>100&&guide.at(-1).cum>1268);
  const begin=guide.reduce((best,p,i)=>Math.hypot(p.east-516.5,p.north-355)<Math.hypot(guide[best].east-516.5,guide[best].north-355)?i:best,0);
  const end=guide.findIndex((p,i)=>i>begin&&p.north>=654);
  assert.ok(end>begin);
  function chordError(a,b,p){
   const de=b.east-a.east,dn=b.north-a.north,l2=de*de+dn*dn;
   const t=l2?Math.max(0,Math.min(1,((p.east-a.east)*de+(p.north-a.north)*dn)/l2)):0;
   return Math.hypot(p.east-a.east-t*de,p.north-a.north-t*dn);
  }
  const targets=[guide[begin]];
  for(let i=begin;i<end;){
   let j=i+1;
   while(j<end&&guide[j+1].cum-guide[i].cum<=16&&guide.slice(i+1,j+1).every(p=>chordError(guide[i],guide[j+1],p)<=.32))j++;
   targets.push(guide[j]);i=j;
  }
  for(const [i,p] of targets.entries())await walkTo(page,evidence,[p.east,p.north],'north-road-'+i,.35);
  const top=await readPose(page);
  const highWire=await waitForWire(page,evidence,p=>p?.area==='mountain'&&p.north>=650&&Math.hypot(p.east-top.east,p.north-top.north)<.8);
  await picture(page,evidence,'front-north-mountain-room');
  const peerUrl=new URL('/presence-mountain',origin);peerUrl.protocol='ws:';
  const peer=new WebSocket(peerUrl);let peerId,seen=false;
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Mountain peer join timeout')),8000);
    peer.once('error',e=>{clearTimeout(timer);reject(e);});
    peer.once('open',()=>peer.send(JSON.stringify({type:'join',name:'前山联机验收伙伴'})));
    peer.on('message',(raw,binary)=>{if(binary){if(raw[0]>0)seen=true;return;}const f=JSON.parse(raw.toString());if(f.type==='join'&&f.self===true){peerId=f.id;clearTimeout(timer);resolve();}});
   });
   const b=Buffer.alloc(12);b.writeUInt16LE(Math.round((highWire.east+1)*100),2);b.writeUInt16LE(Math.round((highWire.north-540)*100),4);b.writeUInt16LE(Math.round(highWire.height*100),6);b.writeUInt16LE(1,10);peer.send(b);
   const deadline=Date.now()+5000;while(!seen&&Date.now()<deadline)await page.waitForTimeout(50);
   assert.ok(peerId&&seen,'Actual mountain peer must receive nearby snapshot');
  }finally{peer.terminate();}
  let returned;
  for(const [i,p] of targets.slice(0,-1).reverse().entries()){
   await walkTo(page,evidence,[p.east,p.north],'north-return-'+i,.35);
   if(p.north<648){returned=await readPose(page);break;}
  }
  assert.ok(returned&&returned.north<650);
  await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-returned.east,p.north-returned.north)<.8);
  await picture(page,evidence,'front-north-town-room-return');
  report.entry={scope:'public station UI segmented arrival, native road walking across town/mountain room boundary and back; raw second peer, no summit release or public transport',targets:targets.length,highWire,secondRawPeer:seen};
  report.traversal={top,returned};
 }else if(segment==='a32-stream'){
  assert.ok(!bare);
  const state=()=>page.evaluate(()=>window.__za22Frame);
  const first=await state();assert.equal(first.terrainPreload?.mode,'worker',JSON.stringify(first.terrainPreload));assert.ok(first.terrainPreload.ms>0);assert.equal(first.summitProduction.status,'idle');assert.equal(first.summitProduction.installed.length,0);assert.equal(first.summitProduction.farVisible,true);
  await picture(page,evidence,'a32-cold-plaza');
  const startup=await page.evaluate(()=>({navigationMs:performance.now(),resources:performance.getEntriesByType('resource').filter(x=>/town-d2-r30-production-host|town-d2-r30-sector-installers/.test(x.name)).map(x=>x.name)}));
  assert.equal(startup.resources.length,0,'cold town must not download rear production chunks');
  const visit=async(label)=>{await page.locator('#town-panel-toggle').click();await page.locator('#jump').selectOption({label});if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();};
  await visit('陨石坑口');await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-2,p.north-159)<1.2);
  for(const p of [[-12,159],[-40,159]])await walkTo(page,evidence,p,'cold-crater',.55);
  await face(page,evidence,0);await picture(page,evidence,'a32-crater-north');
  assert.equal((await state()).summitProduction.status,'idle');
  await visit('山口站');
  await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-296,p.north-520)<1.2,20000);
  await page.waitForFunction(()=>window.__za22Frame?.summitProduction?.status!=='idle',null,{timeout:20000});
  await picture(page,evidence,'a32-prefetch-start');
  await page.waitForFunction(()=>window.__za22Frame?.summitProduction?.publicTransportBound===true,null,{timeout:150000});
  const assembled=await state();
  report.streaming={startup,terrainPreload:first.terrainPreload,cold:first.summitProduction,assembled:assembled.summitProduction,ridge:{roads:assembled.ridge.roads,frontRoadHandoffs:assembled.ridge.frontRoadHandoffs,transportReady:assembled.ridge.transportReady,cloudSeam:assembled.ridge.cloudSeam}};
  assert.equal(assembled.summitProduction.status,'ready',JSON.stringify(report.streaming));
  assert.equal(assembled.summitProduction.ready,true);
  assert.equal(assembled.summitProduction.canonicalPreparation?.mode,'worker',JSON.stringify(assembled.summitProduction.canonicalPreparation));
  assert.ok(assembled.summitProduction.southSlices?.count>1,JSON.stringify(assembled.summitProduction.southSlices));
  assert.ok(assembled.summitProduction.westSlices?.count>1,JSON.stringify(assembled.summitProduction.westSlices));
  assert.equal(assembled.summitProduction.westPreparation?.mode,'worker',JSON.stringify(assembled.summitProduction.westPreparation));
  assert.equal(assembled.ridge.transportReady,true,JSON.stringify(assembled.summitProduction));
  assert.equal(assembled.ridge.cloudSeam.domainReady,true,JSON.stringify(assembled.ridge.cloudSeam));
  assert.equal(assembled.summitProduction.cable.boardable,true,JSON.stringify(assembled.summitProduction.cable));
  assert.ok(assembled.summitProduction.frontAuditSlices?.count>1&&assembled.summitProduction.cable.slices?.count>1);
  assert.ok(assembled.summitProduction.hiking?.ready,JSON.stringify(assembled.summitProduction.hiking));
  assert.ok(assembled.summitProduction.hiking.markers>240&&assembled.summitProduction.hiking.maxGrade<=.70);
  assert.equal(assembled.summitProduction.southRoad.intervalComplete,true);
  assert.deepEqual(assembled.summitProduction.southRoad.boundaryExits.map(r=>Math.round(r.length)),[36,55]);
  assert.ok(assembled.ridge.frontRoadHandoffs.length===4&&assembled.ridge.frontRoadHandoffs.every(r=>r.domain==='front'&&r.installed&&r.surface.maxGrade<=.120001));
  assert.equal(assembled.summitProduction.southRoad.cutPreparation.mode,'worker');
  assert.ok(assembled.summitProduction.southRoad.cutPreparation.changed>0);
  assert.ok(assembled.summitProduction.warmup?.meshes>0&&assembled.summitProduction.warmup?.batches>0);
  assert.equal(assembled.summitProduction.farVisible,true);
  await face(page,evidence,0);await picture(page,evidence,'a32-foothill-ready');
  await walkTo(page,evidence,[296,516],'station-out',.35);await walkTo(page,evidence,[296,520],'station-return',.35);
  await picture(page,evidence,'a32-foothill-walked');
  const loaded=await page.evaluate(()=>window.__a31LoadFrames);
  report.streaming.frames=loaded;
  report.streaming.longFrames=loaded.filter(f=>f.ms>50).map(f=>({ms:f.ms,status:f.status,stage:f.stage}));
  await visit('广场南侧');await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-223,p.north-180)<1);
  await face(page,evidence,0);await picture(page,evidence,'a32-loaded-plaza');
  // Two independent Chromium processes, same actual Presence room.
  const firstBrowser=browser,firstEvidence=evidence;
  const peerBrowser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:graphicsArgs});
  try{
   browser=peerBrowser;const peer=await openTown('a32-second-browser');
   await page.waitForFunction(()=>document.querySelector('#town-presence-status')?.textContent.includes('2 人'),null,{timeout:15000});
   await peer.page.waitForFunction(()=>document.querySelector('#town-presence-status')?.textContent.includes('2 人'),null,{timeout:15000});
   const a=(await state()).weatherCycle,b=await peer.page.evaluate(()=>window.__za22Frame.weatherCycle);
   assert.equal(a.dawnEpoch,b.dawnEpoch);
   await picture(peer.page,peer.evidence,'a32-second-browser-plaza');
   report.streaming.twoBrowsers={sameDawnEpoch:a.dawnEpoch,firstStatus:await page.locator('#town-presence-status').innerText(),secondStatus:await peer.page.locator('#town-presence-status').innerText()};
  }finally{await peerBrowser.close();browser=firstBrowser;lastPage=page;lastEvidence=firstEvidence;}
  report.traversal={top:await readPose(page),returned:await readPose(page)};
  assert.ok(report.performanceSamples.every(x=>x.frames>0&&Number.isFinite(x.fps)&&Number.isFinite(x.frameMs.p99)));
 }else if(segment==='night-r3-entry'){
  const state=()=>page.evaluate(()=>window.__za22Frame);
  await page.waitForFunction(()=>window.__za22Frame?.ridge?.roads===4&&window.__za22Frame?.summitProduction?.status==='idle',null,{timeout:45000});
  const initial=await state();
  assert.deepEqual(initial.summitProduction.installed,[]);assert.equal(initial.summitProduction.cutTiles,0);
  assert.equal(initial.summitProduction.cable.boardable,false);
  assert.equal(initial.summitProduction.near,false);assert.equal(initial.summitProduction.draws,0);assert.equal(initial.ridge.transportReady,false);assert.equal(initial.ridge.cloudSeam.physicalReady,true);
  const snapshots=[];
  const take=async(label)=>{const f=await state();assert.equal(f.ridge.roads,4);assert.ok(f.calls>0&&f.triangles>0);
   const w=f.weatherCycle;assert.ok(w&&Number.isFinite(w.phase)&&w.phase>=0&&w.phase<1&&Number.isFinite(w.dawnEpoch));
   assert.ok(Number.isFinite(w.visibility)&&w.visibility>0&&w.snow>0&&f.fogFar>f.fogNear);
   snapshots.push({label,foot:f.ridge.foot,calls:f.calls,triangles:f.triangles,ridge:f.ridge,weatherCycle:w,fogNear:f.fogNear,fogFar:f.fogFar,points:f.points,summitProduction:f.summitProduction});
   await picture(page,evidence,label);};
  await take('normal-entry');
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label:'山口站'});
  if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();
  await page.waitForFunction(()=>{const f=window.__za22Frame?.ridge?.foot;return f&&Math.hypot(f[0]-296,f[1]-520)<1.2;},null,{timeout:20000});
  await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-296,p.north-520)<1.2);
  await face(page,evidence,0);
  await page.waitForFunction(()=>{const s=window.__za22Frame?.summitProduction;return s?.ready&&!s.near&&s.draws===0&&s.farVisible&&s.farDraws>0&&s.sceneOwner==='town'&&s.publicTransportBound;},null,{timeout:150000});
  await take('mountain-foot-north');
  await page.locator('#town-panel-toggle').click();await page.locator('#lighting').click();await page.locator('#town-settings-close').click();
  const prior=snapshots.at(-1).weatherCycle;
  await page.waitForFunction(p=>{const w=window.__za22Frame?.weatherCycle;return w&&w.skyColor!==p.skyColor&&w.dawnEpoch===p.dawnEpoch&&Math.abs(w.phase-p.phase)>.1;},prior,{timeout:15000});
  await take('mountain-foot-other-light');
  // The existing actual station approach is safe and near, not a claim
  // of the full 1268m road. Use ordinary keys and real wire poses.
  await walkTo(page,evidence,[296,516],'station-out',.35);
  await walkTo(page,evidence,[296,520],'station-return',.35);
  const returned=await readPose(page);await take('mountain-foot-return');
  const frames=await page.evaluate(()=>window.__a31LoadFrames);
  const loading=frames.filter(f=>f.status==='loading'||f.status==='ready').map(f=>f.ms).sort((a,b)=>a-b);
  const loadFrames={samples:loading.length,p95:loading[Math.floor((loading.length-1)*.95)],p99:loading[Math.floor((loading.length-1)*.99)],max:loading.at(-1),stages:frames.filter(f=>f.ms>100)};
  report.entry={scope:'public viewer with actual resident four-sector mount, safe far LOD and closed access; menu station arrival then native 4m out/back, not a continuous ascent',snapshots,loadFrames};
  report.traversal={top:returned,returned};
 }else if(mobileReview){
  const cdp=await page.context().newCDPSession(page),touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  assert.equal(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches),true);
  await page.locator('#touch-walk').waitFor({state:'visible',timeout:12000});
  await picture(page,evidence,'mobile-plaza-idle');
  const start=await readPose(page),pad=await page.locator('#touch-walk').boundingBox();
  assert.ok(pad);
  const p={x:pad.x+pad.width/2,y:pad.y+pad.height/2,id:1};
  await touch('touchStart',[p]);
  try{await touch('touchMove',[{...p,y:p.y-36}]);await page.waitForTimeout(650);}
  finally{await touch('touchEnd',[]);}
  await page.waitForTimeout(300);
  const walked=await readPose(page),distance=Math.hypot(walked.east-start.east,walked.north-start.north);
  // 7.5m/s ordinary walking; allow actual input dispatch/frame latency.
  assert.ok(distance>.4&&distance<7.5,JSON.stringify({start,walked,distance}));
  await page.waitForTimeout(450);const stopped=await readPose(page);
  assert.ok(Math.hypot(stopped.east-walked.east,stopped.north-walked.north)<.2);
  const yawBefore=(await waitForWire(page,evidence)).yaw;
  const anchor=await page.evaluate(()=>{
   const canvas=document.querySelector('#scene canvas'),w=innerWidth,h=innerHeight;
   for(const [x,y] of [[.65,.43],[.62,.35],[.68,.53],[.55,.39]]){const a=Math.round(w*x),b=Math.round(h*y);if(document.elementFromPoint(a,b)===canvas&&a+55<w)return {x:a,y:b,id:2};}
  });
  assert.ok(anchor,'touch look requires an unobstructed canvas');
  await touch('touchStart',[anchor]);try{await touch('touchMove',[{...anchor,x:anchor.x+42}]);await page.waitForTimeout(90);}finally{await touch('touchEnd',[]);}
  await page.waitForTimeout(350);
  const yawAfter=(await waitForWire(page,evidence)).yaw;
  assert.ok(Math.abs(yawDistance(yawBefore,yawAfter))>.015);
  const base=(await readPose(page)).cameraY;
  await page.evaluate(()=>{window.__aMobileJumpPeak=window.__za22Frame?.cameraY;window.__aMobileJumpListener=e=>{window.__aMobileJumpPeak=Math.max(window.__aMobileJumpPeak??-Infinity,e.detail.cameraY??-Infinity)};document.addEventListener('town-frame-profile',window.__aMobileJumpListener,true);});
  await page.locator('#touch-jump').tap();await page.waitForTimeout(1100);
  const peak=await page.evaluate(()=>{document.removeEventListener('town-frame-profile',window.__aMobileJumpListener,true);return window.__aMobileJumpPeak;});
  assert.ok(peak-base>.25,JSON.stringify({base,peak}));
  await picture(page,evidence,'mobile-plaza-after-input');
  await page.locator('#town-panel-toggle').tap();
  await page.locator('#jump').selectOption({label:'陨石坑口'});
  if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').tap();
  await page.waitForFunction(pattern=>{const p=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');return p&&Math.hypot(+p[1]-2,+p[2]-159)<1.2;},positionPattern.source,{timeout:45000});
  await picture(page,evidence,'mobile-crater-mouth');
  report.mobile={scope:'Chromium mobile viewport/touch emulation, not physical phone',walkDistance:distance,stopped:true,yawDelta:yawDistance(yawBefore,yawAfter),jumpRise:peak-base,crater:await readPose(page)};
  report.traversal={top:report.mobile.crater,returned:stopped};
 }else{
 await page.locator('#town-panel-toggle').click();
 await page.locator('#jump').selectOption({label:segment==='rail-buffer'?'火车站':['shankou','rail-valley'].includes(segment)?'山口站':'陨石坑口'});
 if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();
 await page.waitForFunction(({pattern,east,north})=>{
   const p=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');
   return p&&Math.hypot(+p[1]-east,+p[2]-north)<1.2;
 },{pattern:positionPattern.source,east:segment==='rail-buffer'?526:['shankou','rail-valley'].includes(segment)?296:2,north:segment==='rail-buffer'?305:['shankou','rail-valley'].includes(segment)?520:159},{timeout:45000});
 for(const [i,target] of approach[segment].entries()){
   await walkTo(page,evidence,target,segment+'-approach-'+i);
   if(segment==='water-tower'&&i===1){
     const heading=Math.atan2(-39.5933067-target[0],143.8173133-target[1]);
     await face(page,evidence,heading);
     const tilt=async(dy)=>{await page.mouse.move(dragX,dragY);await page.mouse.down();try{await page.mouse.move(dragX,dragY+dy,{steps:4});}finally{await page.mouse.up();}};
     await tilt(-65);
     await wallView('water-tower-wide',heading);
     await tilt(65);
   }
   if(segment==='supply'&&(i===2||i===3)){
     const site=road.mouthWorks.sites.find(s=>s.id==='supply-station');
     await wallView('supply-cabin-'+(i===2?'wide':'roofline'),Math.atan2(site.east-target[0],site.north-target[1]));
   }
 }
 if(joint){
   for(const [i,p]of joint.approach.slice(1).entries())await walkTo(page,evidence,[p.east,p.north],'joint-three-rail-approach-'+i,i===2||i===3?.20:.30);
   const deadline=Date.now()+60000;
   while(Date.now()<deadline){
     const f=westWindow();
     if(f?.state?.phase==='night-window'&&f.state.canEnterRestricted){report.legalWindow=f.state;break;}
     await page.waitForTimeout(350);
   }
   assert.ok(report.legalWindow,'No accepted west night-window');
   await walkTo(page,evidence,[-71,159],'joint-authorized-rim',.30);
   await picture(page,evidence,'joint-rim');
 }
 const tower=road.outerWorks.towerRoutes.find(t=>t.id===segment+'-tower');
 const scenic=road.outerWorks.landscapeRoutes.find(r=>r.id===segment);
 const reverseScenic=segment==='western-clusters';
 const industrial=(id)=>road.outerWorks.industrialRoutes.find(r=>r.id===id).points;
 const ruinsPath=segment==='industrial-ruins'?[
   ...industrial('ruined-shed'),...industrial('ruined-shed').slice(0,-1).reverse(),
   ...industrial('ore-yard').slice(1),...industrial('sealed-storehouse').slice(1),
   ...industrial('sorting-shed').slice(1),
 ]:null;
 const salvagePath=segment==='salvage-pipes'?[
   ...industrial('salvage-pipes'),...industrial('salvage-pipes').slice(0,-1).reverse(),
   ...industrial('ore-yard').slice(1),...industrial('sealed-storehouse').slice(1)
 ]:null;
 const path=jointInscription??joint?.points??salvagePath??ruinsPath??(segment==='inscription-access'?[...rail.stationWalkRoutes.find(r=>r.id==='transfer-dock').points.slice(0,5),...rail.stationWalkRoutes.find(r=>r.id==='inscription-access').points]:segment==='rail-buffer'?[[526,305],[526,312],[526,320],[526,338],[526,347],[514,352],[500,362],[482,371]].map(([east,north])=>({east,north,height:grid.heightAt(east,north)})):segment==='rail-valley'?[[296,520],[291,530],[288,531],[243,515]].map(([east,north])=>({east,north,height:grid.heightAt(east,north)})):scenic?(reverseScenic?[...scenic.points].reverse():scenic.points):segment==='outerclusters'?[[-68,220],[-68,232],[-83,235],[-98,243],[-95,261],[-90,265]].map(([east,north])=>({east,north,height:road.heightAt(east,north)})):
   segment==='outcrop'?[[-60,55],[-147,52],[-155,51],[-164,51]].map(([east,north])=>({east,north,height:road.heightAt(east,north)})):
   segment==='west-mountain'?westMountainFootway.map(([east,north])=>({east,north,height:westMountain.heightAt(east,north)??road.heightAt(east,north)})):
   segment==='northwalk'?[[-12,320],[-12,336],[-12,400],[-12,450],[-9,470],[-4,485],[2,490]].map(([east,north])=>({east,north,height:east<0?road.heightAt(east,north):grid.heightAt(east,north)})):
   segment==='wall'?[-9,-15,-21,-28].map(east=>({east,north:159,height:road.heightAt(east,159)})):
   tower?[tower.entry,...tower.stairs]:segment==='supply'?road.mouthWorks.supplyDeckRoute:
   segment==='supplyinterior'?road.mouthWorks.supplyInteriorRoute:
   segment==='guard-shed'?road.mouthWorks.guardShedRoutes.find(r=>r.id==='guard-firewood').points:
   segment==='assembly-registration'?road.mouthWorks.assemblyRoutes[0].points:
   ['transfer-dock','ore-yard-dock'].includes(segment)?rail.stationWalkRoutes.find(t=>t.id===segment).points:
   ['kengkou','freight','shankou'].includes(segment)?rail.stationWalkRoutes.find(t=>t.id===(segment==='freight'?'freight-shed':segment+'-station')).points:
   road.outerWorks.industrialRoutes.find(t=>t.id===(['gatehouse','ore-yard','cold-furnace','water-tower'].includes(segment)?segment:segment+'-plant')).points);
 async function step(point,label){
   await walkTo(page,evidence,[point.east,point.north],label,joint&&Number.isFinite(point.t)?.35:(scenic||['northwalk','west-mountain','outcrop','outerclusters'].includes(segment))?.35:.18);
   await page.waitForTimeout(joint&&Number.isFinite(point.t)?55:140);
   const pose=await readPose(page);
   assert.ok(Math.abs(pose.height-point.height)<(joint&&Number.isFinite(point.t)?.75:.39),JSON.stringify({label,pose,point}));
   if(joint||segment==='west-mountain')await appendFile(join(output,'native-validated-steps.ndjson'),JSON.stringify({label,pose,point})+'\n');
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
   if(scenic){
     const view=scenic.views.find(v=>v.index===(reverseScenic?path.length-1-i:i));
     if(view){
       const shoulders={'shoulder-west':[-208,105],'shoulder-northwest':[-216,265],'shoulder-north':[-170,304]};
       const site=road.outerWorks.sites.find(s=>s.id===view.site);
       const target=site?[site.east,site.north]:shoulders[view.site];
       await wallView(view.site,Math.atan2(target[0]-point.east,target[1]-point.north));
       if(segment==='western-shoulders'){
         const id=view.site.replace('shoulder-','rest-');
         const rest=road.outerWorks.landscapeRoutes.find(r=>r.id===id);
         const seat=road.outerWorks.scenicSeats.find(s=>s.id===id);
         assert.ok(rest&&seat);
         for(const [j,p]of rest.points.entries())await step(p,id+'-approach-'+j);
         await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('观景长椅'),null,{timeout:8000});
         await page.keyboard.press('e');
         await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('起身'),null,{timeout:8000});
         await picture(page,evidence,id+'-seated');
         await page.keyboard.press('e');
         await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#position')?.textContent??''),positionPattern.source,{timeout:8000});
         for(const [j,p]of [...rest.points].reverse().entries())await step(p,id+'-return-'+j);
       }
     }
   }
   if(segment==='inscription-access'){
     if(Math.abs(point.north-171)<.01)await wallView('transfer-deck-north-exit',0);
     if(Math.abs(point.north-176.65)<.01)await wallView('transfer-rear-stair',Math.PI);
     if(i===path.length-1)await wallView('inscription-original-table',Math.atan2(road.inscription.layout.table.east-point.east,road.inscription.layout.table.north-point.north));
   }
   if(joint&&i===joint.trailKnots-1)await picture(page,evidence,'joint-historic-from-haul-road');
   if(segment==='rail-buffer'&&i===path.length-1){
     assert.ok(rail.closedHead&&rail.serviceGeometryReady===false);
     const cap=rail.closedHead;
     await wallView('rail-buffer-closed-end',Math.atan2(cap.east-point.east,cap.north-point.north));
   }
   if(segment==='rail-valley'&&(i===2||i===path.length-1)){
     const mid=rail.samples[225];
     await wallView('rail-valley-'+(i===2?'approach':'bridge'),Math.atan2(mid.east-point.east,mid.north-point.north));
   }
   if(segment==='salvage-pipes'){
     const pipe=industrial('salvage-pipes');
     const views=[[pipe[3],'pipe-section-1'],[pipe[4],'pipe-section-2'],[pipe.at(-1),'pipe-section-3'],[industrial('sealed-storehouse')[1],'sealed-storehouse-plate']];
     const view=views.find(([p])=>p===point);
     if(view&&i<=pipe.length-1||view&&view[1]==='sealed-storehouse-plate'){
       const site=road.outerWorks.sites.find(s=>s.id===view[1]);
       await wallView(view[1]+'-wide',Math.atan2(site.east-point.east,site.north-point.north));
     }
   }
   if(segment==='industrial-ruins'){
     const landmarks=[
       ['ruined-shed',industrial('ruined-shed').at(-1)],
       ['sealed-storehouse',industrial('sealed-storehouse').at(-1)],
       ['sorting-shed',industrial('sorting-shed').at(-1)]
     ];
     const view=landmarks.find(([id,p])=>p===point);
     if(view){
       const id=view[0],site=road.outerWorks.sites.find(s=>s.id===(id==='sorting-shed'?'ore-shed-plate':id));
       await wallView(id,Math.atan2(site.east-point.east,site.north-point.north));
     }
   }
   if(segment==='outerclusters'&&(i===1||i===5)){
     const site=road.outerWorks.sites.find(s=>s.id==='outer-cluster-'+(i===1?7:6));
     await wallView('outerclusters-'+(i===1?7:6),Math.atan2(site.east-point.east,site.north-point.north));
   }
   if(segment==='outcrop'&&(i===1||i===2))await wallView('outcrop-'+(i===1?'approach':'strata'),Math.atan2(-164-point.east,51-point.north));
   if(segment==='ore-yard'&&(i===1||i===path.length-1)){
     const site=road.outerWorks.sites.find(s=>s.id==='ore-yard');
     await wallView('ore-yard-'+i,Math.atan2(site.east-point.east,site.north-point.north));
   }
   if(segment==='shankou'&&i===0)await wallView('shankou-arrival',Math.PI);
   if(segment==='west-mountain'&&i===path.length-1)await wallView('west-mountain-'+i,Math.PI/4);
   if(segment==='northwalk'&&(i===1||i===2))await wallView('northwalk-'+(i===1?'seam':'mid'),0);
   if(segment==='wall'&&i===0)await wallView('wall-town-face',-Math.PI/2);
   if(segment==='wall'&&i===path.length-1)await wallView('wall-crater-face',Math.PI/2);
 }
 const top=await readPose(page);
 if(['kengkou','gatehouse','shankou'].includes(segment)){
   const bench=segment==='gatehouse'?road.outerWorks.gatehouseSeats[0]:rail.benchSeats.find(s=>s.id===(segment==='shankou'?'山口站-1':'坑口站-1'));
   await step({east:bench.useEast,north:bench.useNorth,height:bench.height},'station-bench');
   await page.waitForFunction(label=>document.querySelector('#world-action')?.textContent?.includes(label),segment==='gatehouse'?'门房长椅':'站台长椅',{timeout:8000});
   await page.keyboard.press('e');
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('起身'),null,{timeout:8000});
   await picture(page,evidence,segment+'-seated');
   await page.keyboard.press('e');
   await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#position')?.textContent??''),positionPattern.source,{timeout:8000});
   await step(path.at(-1),'station-stand-return');
   await face(page,evidence,segment==='gatehouse'?0:segment==='shankou'?Math.PI:1.7+Math.PI);
   for(const lighting of ['雪夜','白昼']){
     if((await page.locator('#lighting').textContent())!==lighting){
       await page.locator('#town-panel-toggle').click();
       await page.locator('#lighting').click();
       await page.locator('#town-settings-close').click();
     }
     await picture(page,evidence,segment+'-'+(lighting==='雪夜'?'night':'day'));
   }
 }else if(segment==='guard-shed'){
   await face(page,evidence,-.72);
   const tilt=async(dy)=>{await page.mouse.move(dragX,dragY);await page.mouse.down();try{await page.mouse.move(dragX,dragY+dy,{steps:4});}finally{await page.mouse.up();}};
   await tilt(75);
   await wallView('guard-hearth',-.72);
   if((await page.locator('#lighting').textContent())!=='雪夜'){
     await page.locator('#town-panel-toggle').click();await page.locator('#lighting').click();await page.locator('#town-settings-close').click();
   }
   await picture(page,evidence,'guard-before-feed');
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('添柴'),null,{timeout:8000});
   await page.keyboard.press('e');
   await page.waitForFunction(()=>document.querySelector('#town-activity-status')?.textContent?.includes('火盆亮了'),null,{timeout:8000});
   await picture(page,evidence,'guard-fed');
   await page.keyboard.press('e');
   await page.waitForFunction(()=>document.querySelector('#town-activity-status')?.textContent?.includes('恢复原样'),null,{timeout:8000});
   await tilt(-75);
   await step(path[0],'guard-hearth-exit');
   const seatPath=road.mouthWorks.guardShedRoutes.find(r=>r.id==='guard-seat').points;
   for(const [i,p]of seatPath.entries())await step(p,'guard-seat-'+i);
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('哨棚长椅'),null,{timeout:8000});
   await page.keyboard.press('e');
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('起身'),null,{timeout:8000});
   await picture(page,evidence,'guard-seated');
   await page.keyboard.press('e');
   await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('#position')?.textContent??''),positionPattern.source,{timeout:8000});
   for(const [i,p]of [...seatPath].reverse().entries())await step(p,'guard-seat-return-'+i);
   await step(path.at(-1),'guard-hearth-return');
 }else if(segment==='assembly-registration'){
   await wallView('assembly-notice',168*Math.PI/180);
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('阅读入坑告示'),null,{timeout:8000});
   await page.keyboard.press('e');
   await page.locator('#place-card[open]').waitFor({timeout:8000});
   assert.equal(await page.locator('#place-title').textContent(),'入坑登记');
   await picture(page,evidence,'assembly-notice-open');
   await page.locator('#place-card .close-card').click();
 }else if(segment==='supplyinterior'){
   const windows=road.mouthWorks.supplyWindowControls;
   assert.equal(windows.length,2);
   const middle={east:(windows[0].useEast+windows[1].useEast)/2,north:(windows[0].useNorth+windows[1].useNorth)/2,height:windows[0].useHeight};
   await step(middle,'supply-window-aisle');
   for(const w of windows){
     await step({east:w.useEast,north:w.useNorth,height:w.useHeight},w.id+'-approach');
     await wallView(w.id+'-closed',Math.atan2(w.east-w.useEast,w.north-w.useNorth));
     await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('打开补给站窗户'),null,{timeout:8000});
     await page.keyboard.press('e');
     await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('关闭补给站窗户'),null,{timeout:8000});
     await picture(page,evidence,w.id+'-open');
     await page.keyboard.press('e');
     await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('打开补给站窗户'),null,{timeout:8000});
     await picture(page,evidence,w.id+'-reclosed');
     await step(middle,w.id+'-return');
   }
   await step(path.at(-1),'supply-map-return');
   await wallView('supplyinterior-map',150*Math.PI/180);
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('手绘图'),null,{timeout:8000});
   await page.keyboard.press('e');
   await page.locator('#place-card[open]').waitFor({timeout:8000});
   assert.equal(await page.locator('#place-title').textContent(),'坑区手绘图');
   await picture(page,evidence,'supplyinterior-map-open');
   await page.locator('#place-card .close-card').click();
 }else if(segment==='cold-furnace'||segment==='water-tower'){
   const target=segment==='cold-furnace'?[-177.3257912,115.4442406]:[-39.5933067,143.8173133];
   const heading=Math.atan2(target[0]-top.east,target[1]-top.north);
   await face(page,evidence,heading);
   // Native upward drag includes the roof/tank, then return to walking view.
   const dy=segment==='cold-furnace'?-110:-165;
   const tilt=async(amount)=>{
     await page.mouse.move(dragX,dragY);await page.mouse.down();
     try{await page.mouse.move(dragX,dragY+amount,{steps:5});}finally{await page.mouse.up();}
   };
   await tilt(dy);
   await wallView(segment+'-elevation',heading);
   await tilt(-dy);
 }else if(jointInscription&&jointManifest.paper){
   // Candidate has real paper controls but no approved receipt provider.
   // Aim with actual mouse input, hold longer than the real rule duration;
   // it must not grant an entry, open a card, or fall back to snow.
   const pose=await readPose(page),paper=jointManifest.paper;
   await face(page,evidence,Math.atan2(paper.east-pose.east,paper.north-pose.north));
   const angle=Math.atan2(paper.height-pose.height-1.65,Math.hypot(paper.east-pose.east,paper.north-pose.north));
   const tilt=async(amount)=>{
     let rest=amount;
     while(Math.abs(rest)>.5){const dy=Math.round(Math.max(-height*.36,Math.min(height*.36,rest)));await page.mouse.move(dragX,dragY);await page.mouse.down();try{await page.mouse.move(dragX,dragY+dy,{steps:5});}finally{await page.mouse.up();}rest-=dy;}
   };
   const dy=Math.round(-angle/.003);await tilt(dy);
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('长按拓印')&&document.querySelector('#world-action')?.textContent?.includes('暂不可用'),null,{timeout:8000});
   await page.keyboard.down('e');try{await page.waitForTimeout(2700);}finally{await page.keyboard.up('e');}
   const result=await readPose(page);
   assert.ok(result.action.includes('长按拓印')&&result.action.includes('暂不可用'));
   assert.equal(await page.locator('#place-card[open]').count(),0);
   assert.ok(Math.hypot(result.east-pose.east,result.north-pose.north)<.1);
   report.playback={scope:'actual candidate viewer; no authorized receipt provider',paperHeldMs:2700,before:pose,after:result,denied:true};
   await picture(page,evidence,'inscription-authority-unavailable');
   await tilt(-dy);
 }else if(joint){
   const last=path.at(-1),before=path.at(-2);
   await wallView('joint-historic-deck',Math.atan2(last.east-before.east,last.north-before.north));
 }else if(segment==='transfer-dock'){
   await wallView('transfer-dock-narrow',-Math.PI/2);
   await wallView('transfer-dock-standard',Math.PI/2);
 }else if(segment==='ore-yard-dock'){
   await wallView('ore-yard-dock-loading',0);
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
   const site=road.mouthWorks.sites.find(s=>s.id==='supply-station');
   // Facing along the deck to show the telescope and the joined rear gable.
   await wallView('supply-roof-lookout',Math.atan2(site.east-top.east,site.north-top.north));
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('屋顶望筒'),null,{timeout:5000});
   await page.keyboard.press('e');await page.waitForTimeout(600);
   await picture(page,evidence,'supply-scope');
   await page.keyboard.press('e');
 }
 for(const [i,point] of path.slice().reverse().slice(1).entries())await step(point,segment+'-down-'+i);
 if(segment==='west-mountain'){
   // Close the actual pit-to-new-ground loop, not only the final seam.
   for(const [i,target] of approach[segment].slice(0,-1).reverse().entries())await walkTo(page,evidence,target,'west-mountain-return-'+i,.46);
   await walkTo(page,evidence,[2,159],'west-mountain-town-return',.46);
   await waitForWire(page,evidence,p=>p?.area==='town'&&Math.hypot(p.east-2,p.north-159)<.8);
 }
 if(joint){
   await walkTo(page,evidence,[-67,159],'joint-return-outside',.35);
   await waitForWire(page,evidence,p=>p?.area==='west'&&Math.hypot(p.east+67,p.north-159)<.7);
   for(const [i,p]of joint.approach.slice(0,-1).reverse().entries())await walkTo(page,evidence,[p.east,p.north],'joint-three-rail-return-'+i,.30);
 }
 const returned=await readPose(page);
 if(segment==='shankou'){
   const b=rail.timetableReads[0];
   for(const [e,n]of [[296,511],[308,511],[b.east,b.north]])await walkTo(page,evidence,[e,n],'shankou-board-approach',.30);
   await wallView('shankou-timetable',Math.PI);
   await page.waitForFunction(()=>document.querySelector('#world-action')?.textContent?.includes('山口站时刻牌'),null,{timeout:8000});
   await page.keyboard.press('e');
   await page.locator('#place-card[open]').waitFor({timeout:8000});
   assert.equal(await page.locator('#place-title').textContent(),'山口站时刻牌');
   await picture(page,evidence,'shankou-timetable-open');
   await page.locator('#place-card .close-card').click();
   for(const [e,n]of [[308,511],[296,511],[296,520]])await walkTo(page,evidence,[e,n],'shankou-arrival-return',.3);
 }
 if(segment==='gatehouse')assert.ok(Math.abs(returned.height-path[0].height)<.08,JSON.stringify({returned,ground:path[0]}));
 await picture(page,evidence,segment+'-return');
 report.traversal={top,returned,expectedTop:path.at(-1),expectedReturn:segment==='west-mountain'?{east:2,north:159,height:grid.heightAt(2,159)}:path[0]};
 }
}catch(e){report.failure=String(e.stack||e);process.exitCode=1;try{await picture(lastPage,lastEvidence,'failed-position');}catch{}}
finally{
 measuring=false;report.errors=report.pageErrors.length+report.consoleErrors.length+report.requestFailures.length+report.httpErrors.length;
 await writeFile(join(output,'za22-live-walk.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({segment,paths:report.paths.map(x=>({name:x.name,checkpoints:x.checkpoints.length,poses:x.poses.length})),traversal:report.traversal,errors:report.errors,failure:report.failure}));
 await browser?.close();
}
