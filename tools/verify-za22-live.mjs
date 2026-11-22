import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [origin, output, segment = 'all'] = process.argv.slice(2);
assert.ok(origin && output, 'Use the production-preview loopback URL and an evidence directory');
const bare = process.env.ZA22_BARE === '1';
const url = new URL(bare ? '/' : '/?profile', origin);
assert.equal(url.protocol, 'http:');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(['spawn', 'a1-shots', 'a1-station', 'a1-full', 'a2-shots', 'a3-shots', 'a4-shots', 'station', 'cloud', 'gate', 'crater', 'all'].includes(segment), segment);

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

async function walkTo(page, evidence, target, label) {
  const [east, north] = target;
  let after = await readPose(page);
  for (let attempt = 0; attempt < 6; ++attempt) {
    assert.ok(Number.isFinite(after.east) && Number.isFinite(after.north), JSON.stringify(after));
    const from = after;
    const dx = east - from.east, dn = north - from.north;
    const distance = Math.hypot(dx, dn);
    if (distance <= .46) {
      evidence.checkpoints.push({ label, target, ...from, wire: evidence.poses.at(-1) });
      console.log(JSON.stringify({ phase: label, east: from.east, north: from.north, y: from.height }));
      return;
    }
    const desired = Math.atan2(dx, dn);
    await face(page, evidence, desired);
    // For small final corrections use the slow backward movement, avoiding double-W sprint.
    const backwards = distance < 1.4;
    if (backwards) await face(page, evidence, desired + Math.PI);
    const key = backwards ? 's' : 'w';
    const fast = distance > 9 && segment !== 'a4-shots';
    if (fast) await page.keyboard.down('Shift');
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ pattern, start, east, north, dx, dn, distance }) => {
        const point = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        if (!point) return false;
        const x = Number(point[1]), n = Number(point[2]);
        if (Math.hypot(x - east, n - north) <= .32) return true;
        const forward = ((x - start.east) * dx + (n - start.north) * dn) / distance;
        return forward >= distance;
      }, { pattern: positionPattern.source, start: from, east, north, dx, dn, distance },
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

async function follow(page, evidence, knots, prefix) {
  for (const [index, target] of knots.entries()) await walkTo(page, evidence, target, `${prefix}-${index + 1}`);
}

async function action(page, label, timeout = 20_000) {
  await page.waitForFunction(text => {
    const button = document.querySelector('#world-action');
    return button && !button.hidden && button.textContent.includes(text);
  }, label, { timeout });
  await page.keyboard.press('e');
}

async function card(page, title) {
  await page.waitForFunction(text => {
    const label = document.querySelector('#place-title');
    return label?.closest('dialog')?.open && label.textContent.includes(text);
  }, title, { timeout: 12_000 });
}

async function sampleFrameCadence(page, evidence, label) {
  // rAF frame cadence is a browser scheduling proxy, NOT a GPU timer query.
  const reading = await page.evaluate(async () => {
    const gaps = [];
    let previous;
    const started = performance.now();
    return await new Promise(resolve => {
      const sample = now => {
        if (previous !== undefined) gaps.push(now - previous);
        previous = now;
        if (now - started >= 2000) {
          const sorted = gaps.slice().sort((a, b) => a - b);
          const average = gaps.reduce((sum, gap) => sum + gap, 0) / Math.max(1, gaps.length);
          resolve({
            frames: gaps.length, durationMs: now - started,
            meanFrameMs: average,
            p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))],
            rafFps: average > 0 ? 1000 / average : 0,
            source: 'native browser requestAnimationFrame cadence; not GPU FPS',
          });
        } else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  evidence.cadence ??= {};
  evidence.cadence[label] = reading;
  console.log(JSON.stringify({ phase: 'native-cadence', label, ...reading }));
}

async function snapshot(page, evidence, label) {
  await page.screenshot({ path: join(output, `${label}.png`), timeout: 45_000 });
  evidence.checkpoints.push({ label, lighting: await page.locator('#lighting').textContent(),
    ...await readPose(page), wire: evidence.poses.at(-1) });
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: graphicsArgs,
  });
  report.browser = browser.version();
  if (segment === 'spawn') {
    const { page, evidence } = await openTown('spawn');
    await sampleFrameCadence(page, evidence, 'plaza');
    // Persist real measurements before screenshots or a slow GPU driver can stall teardown.
    await writeFile(join(output, 'spawn-native-cadence.json'), `${JSON.stringify({
      url: url.href, gpu: report.gpu, browser: report.browser, checkpoint: evidence.checkpoints[0],
      cadence: evidence.cadence, errorsSeen: {
        page: report.pageErrors, console: report.consoleErrors,
        failedRequests: report.requestFailures, http: report.httpErrors,
      },
    }, null, 2)}\n`);
    await page.screenshot({ path: join(output, 'spawn-bare.png'), timeout: 16_000 });
    evidence.checkpoints.push({ label: 'spawn-bare', ...await readPose(page), wire: evidence.poses.at(-1) });
  }
  if (segment === 'a1-shots') {
    const { page, evidence } = await openTown('a1-shots');
    // These three points are actual in-game destination anchors, not injected
    // test positions. The screenshots remain first-person WebGL frames.
    const views = [
      { id:'plaza-exit', label:'西南河畔街巷', east:161.5, north:165.5, yaw:-1.15 },
      { id:'approach-mid', label:'羊圈', east:70, north:215, yaw:-2.25 },
      { id:'west-gate', label:'陨石坑口', east:2, north:159, yaw:-1.57 },
    ];
    for (const view of views) {
      await page.locator('#town-panel-toggle').click();
      await page.locator('#jump').selectOption({ label: view.label });
      await page.waitForFunction(({pattern,east,north})=>{
        const p=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');
        return p && Math.hypot(+p[1]-east,+p[2]-north)<1.5;
      },{pattern:positionPattern.source,east:view.east,north:view.north},{timeout:45_000});
      await face(page,evidence,view.yaw);
      // Night is the initial town state. A real UI toggle switches to day.
      if ((await page.locator('#lighting').textContent()) !== '雪夜') {
        await page.locator('#town-panel-toggle').click();
        await page.locator('#lighting').click();
        await page.locator('#town-settings-close').click();
      }
      await snapshot(page,evidence,view.id+'-night');
      await page.locator('#town-panel-toggle').click();
      await page.locator('#lighting').click();
      await page.locator('#town-settings-close').click();
      assert.equal(await page.locator('#lighting').textContent(),'白昼','day scene toggle failed');
      await snapshot(page,evidence,view.id+'-day');
    }
    report.startupEvidence={
      validSpawn:true, actualJumpDestinations:await page.locator('#jump option').count(),
      canvasVisible:await page.locator('#scene canvas').isVisible(),
      firstPersonHud:await page.locator('#position').textContent(),
    };
  }
  if (segment === 'a2-shots') {
    const { page, evidence } = await openTown('a2-shots');
    const views = [
      {id:'town-to-crater',label:'羊圈',east:70,north:215,yaw:Math.atan2(-190,-30)},
      // The normal 山口 destination currently resolves via legal-spawn safety
      // to E290/N300, NOT its nominal E300/N665 mount. Preserve the real
      // safe point, and report the discrepancy instead of faking a camera.
      {id:'mountain-gate-to-crater',label:'山口',east:290,north:300,yaw:Math.atan2(-410,-115)},
      {id:'rim-to-bowl',label:'陨石坑口',east:2,north:159,yaw:Math.atan2(-53,26),walk:[[-12,159],[-43,159],[-67,159]]},
    ];
    for (const view of views) {
      await page.locator('#town-panel-toggle').click();
      await page.locator('#jump').selectOption({label:view.label});
      await page.waitForFunction(({east,north,pattern})=>{
        const m=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');
        return m && Math.hypot(+m[1]-east,+m[2]-north)<1.5;
      },{east:view.east,north:view.north,pattern:positionPattern.source},{timeout:45_000});
      if (view.walk) await follow(page,evidence,view.walk,view.id+'-real-walk');
      await face(page,evidence,view.yaw);
      if ((await page.locator('#lighting').textContent())!=='雪夜') {
        await page.locator('#town-panel-toggle').click();
        await page.locator('#lighting').click();
        await page.locator('#town-settings-close').click();
      }
      await snapshot(page,evidence,view.id+'-night');
      await page.locator('#town-panel-toggle').click();
      await page.locator('#lighting').click();
      await page.locator('#town-settings-close').click();
      assert.equal(await page.locator('#lighting').textContent(),'白昼');
      await snapshot(page,evidence,view.id+'-day');
    }
    report.startupEvidence={
      activeProductionCanvas:await page.locator('#scene canvas').isVisible(),
      realJumpDestinations:await page.locator('#jump option').count(),
      realSpawn:true, normalEntry:true, measuredCameraPoses:6,
      referenceSource:'B-01 meteor-crater-walk-mesh; color-only canonical mount',
    };
    assert.ok(report.startupEvidence.activeProductionCanvas);
    assert.ok(report.startupEvidence.realJumpDestinations>0);
  }
  if (segment === 'a3-shots') {
    const {page,evidence}=await openTown('a3-shots');
    const sites=[
      {id:'ejecta-boulder-2m',from:[[-12,159],[-43,159],[-67,159],[-67.5,142]],
        rock:[-69.59,138.47],yaw:Math.atan2(-2.09,-3.53),nominalSurfaceDistance:2.1},
      {id:'wreckage-ring-5m',from:[[-12,159],[-40,159],[-35,185],[-45,199],[-51,201]],
        rock:[-54.37,206.74],yaw:Math.atan2(-3.37,5.74),nominalSurfaceDistance:4.5},
    ];
    for(const site of sites){
      await page.locator('#town-panel-toggle').click();
      await page.locator('#jump').selectOption({label:'陨石坑口'});
      await page.waitForFunction(pattern=>{
        const m=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');
        return m&&Math.abs(+m[1]-2)<1&&Math.abs(+m[2]-159)<1;
      },positionPattern.source,{timeout:45_000});
      await follow(page,evidence,site.from,site.id+'-walk');
      await face(page,evidence,site.yaw);
      const foot=await readPose(page);
      evidence.checkpoints.push({label:site.id+'-rock-survey',
        rockWorld:site.rock,footWorld:[foot.east,foot.north],
        centerDistance:Math.hypot(foot.east-site.rock[0],foot.north-site.rock[1]),
        nominalSurfaceDistance:site.nominalSurfaceDistance,
        note:'2m/5m nearest-surface approximation from canon rock geometry; raw center distance reported'});
      if((await page.locator('#lighting').textContent())!=='雪夜'){
        await page.locator('#town-panel-toggle').click();
        await page.locator('#lighting').click();
        await page.locator('#town-settings-close').click();
      }
      await snapshot(page,evidence,site.id+'-night');
      await page.locator('#town-panel-toggle').click();
      await page.locator('#lighting').click();
      await page.locator('#town-settings-close').click();
      assert.equal(await page.locator('#lighting').textContent(),'白昼');
      await snapshot(page,evidence,site.id+'-day');
    }
    report.startupEvidence={
      realSpawn:true,actualDestinations:await page.locator('#jump option').count(),
      activeCanvas:await page.locator('#scene canvas').isVisible(), screenshots:4};
  }
  if (segment === 'a4-shots') {
    const {page,evidence}=await openTown('a4-shots');
    const buildings=[
      {id:'kengkou-station', ref:'station-built-canon', target:[-44.5,168],
        route:[[-12,159],[-40,159],[-44.5,166]]},
      {id:'instrument-workshop',ref:'docs/参考图/crater/ref-06-instrument-workshop.webp',
        target:[-49.72,132.04],route:[[-12,159],[-29,159],[-36,145]]},
      {id:'supply-station',ref:'docs/参考图/crater/ref-01-supply-station-CORE.webp',
        target:[-83,121],route:[[-12,159],[-39,159],[-58,135],[-74,126]]},
      {id:'smelting-workshop',ref:'docs/参考图/crater/ref-09-smelting-workshop.webp',
        target:[-159.95,106.59],route:[[-12,159],[-39,159],[-61,128],[-88,103],[-111,85],[-137,84]]},
    ];
    for(const building of buildings){
      await page.locator('#town-panel-toggle').click();
      await page.locator('#jump').selectOption({label:'陨石坑口'});
      await page.waitForFunction(pattern=>{
        const m=new RegExp(pattern).exec(document.querySelector('#position')?.textContent??'');
        return m&&Math.abs(+m[1]-2)<1&&Math.abs(+m[2]-159)<1;
      },positionPattern.source,{timeout:45_000});
      await follow(page,evidence,building.route,building.id+'-walk');
      const p=await readPose(page);
      const yaw=Math.atan2(building.target[0]-p.east,building.target[1]-p.north);
      await face(page,evidence,yaw);
      evidence.checkpoints.push({label:building.id+'-reference',reference:building.ref,
        buildingCenter:building.target,actualFoot:[p.east,p.north],
        centerDistance:Math.hypot(building.target[0]-p.east,building.target[1]-p.north)});
      if((await page.locator('#lighting').textContent())!=='雪夜'){
        await page.locator('#town-panel-toggle').click();
        await page.locator('#lighting').click();
        await page.locator('#town-settings-close').click();
      }
      await snapshot(page,evidence,building.id+'-night');
      await page.locator('#town-panel-toggle').click();
      await page.locator('#lighting').click();
      await page.locator('#town-settings-close').click();
      await snapshot(page,evidence,building.id+'-day');
    }
    report.startupEvidence={
      canvasVisible:await page.locator('#scene canvas').isVisible(),
      jumpDestinations:await page.locator('#jump option').count(),
      expectedBuildingPairs:buildings.length,
      liveFirstPersonMode:true};
  }
  if (segment === 'a1-station') {
    const { page, evidence } = await openTown('a1-station');
    await page.locator('#town-panel-toggle').click();
    await page.locator('#jump').selectOption({ label: '陨石坑口' });
    await page.waitForFunction(pattern => {
      const match = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
      return match && Math.abs(+match[1]-2)<1 && Math.abs(+match[2]-159)<1;
    },positionPattern.source,{timeout:45_000});
    // Walk the *actual* west-domain crossing on foot, through the town gate
    // and to the mined-out station platform, rather than teleporting to a
    // test-only coordinate. A collision error must abort without fake shots.
    await follow(page,evidence,[[-12,159],[-30,159],[-43.5,159],[-44.5,168]],'a1-kengkou-walk');
    await face(page,evidence,-1.35);
    await snapshot(page,evidence,'kengkou-station-front-night');
    await page.locator('#town-panel-toggle').click();
    await page.locator('#lighting').click();
    await page.locator('#town-settings-close').click();
    assert.equal(await page.locator('#lighting').textContent(),'白昼');
    await snapshot(page,evidence,'kengkou-station-front-day');
    report.startupEvidence={validSpawn:true,canvasVisible:await page.locator('#scene canvas').isVisible(),
      jumpCount:await page.locator('#jump option').count(),frontWalked:true};
  }
  if (segment === 'a1-full') {
    const {page,evidence}=await openTown('a1-full');
    // A-1 acceptance: every knot in the canon westShore route is reached
    // by real W/Shift movement, never a jump/menu teleport.
    await follow(page,evidence,westShore,'a1-from-plaza-to-west');
    await follow(page,evidence,[[-12,159],[-30,159],[-43.5,159],[-44.5,168]],'a1-west-to-kengkou');
    await face(page,evidence,-1.35);
    await snapshot(page,evidence,'a1-full-kengkou-night');
    await page.locator('#town-panel-toggle').click();
    await page.locator('#lighting').click();
    await page.locator('#town-settings-close').click();
    await snapshot(page,evidence,'a1-full-kengkou-day');
    report.startupEvidence={fullWalkNoTeleport:true,landedInWest:evidence.poses.at(-1)?.area==='west',
      checkpoints:evidence.checkpoints.length,
      canvasVisible:await page.locator('#scene canvas').isVisible(),
      jumpCount:await page.locator('#jump option').count()};
    assert.equal(report.startupEvidence.landedInWest,true,'did not reach the real Kengkou west domain');
  }
  if (segment !== 'crater' && segment !== 'spawn' && segment !== 'a1-shots' && segment !== 'a1-station' && segment !== 'a1-full' && segment !== 'a2-shots' && segment !== 'a3-shots' && segment !== 'a4-shots') {
    const { page, evidence } = await openTown('cable');
    await follow(page, evidence, station, 'station');
    if (segment === 'station') {
      await action(page, '老闸');
      await card(page, '北岭缆车');
      await snapshot(page, evidence, 'station');
    } else {
      await action(page, '乘缆车一线前往云海台', 620_000);
      await page.waitForFunction(() => document.querySelector('#position')?.textContent?.includes('缆车一线'),
        null, { timeout: 135_000 });
      await snapshot(page, evidence, 'cable-boarding');
      await page.waitForFunction(() => {
        const riding = document.querySelector('#position')?.textContent?.includes('缆车一线');
        const height = window.__za22Frame?.cameraY;
        return riding && height > 80 && height < 300;
      }, null, { timeout: 90_000 });
      await snapshot(page, evidence, 'cable-moving');

      await page.waitForFunction(({ pattern, destination }) => {
        const pose = new RegExp(pattern).exec(document.querySelector('#position')?.textContent ?? '');
        return pose && Math.hypot(Number(pose[1]) - destination[0], Number(pose[2]) - destination[1]) < 1
          && Math.abs((window.__za22Frame?.cameraY ?? 0) - 348.65) < .55;
      }, { pattern: positionPattern.source, destination: cloudStop }, { timeout: 210_000 });
      await waitForWire(page, evidence, pose => pose?.area === 'mountain' && Math.abs(pose.height - 347) < .7);
      await snapshot(page, evidence, 'cloud-cable-arrival');
      if (segment === 'cloud' || segment === 'all') {
        await follow(page, evidence, cloudRunway, 'cloud-runway');
        await action(page, '查看星港坪装配和起飞线');
        await card(page, '星港坪');
        await snapshot(page, evidence, 'cloud-runway');
      }
      if (segment === 'gate' || segment === 'all') {
        if (segment === 'all') {
          await page.keyboard.press('Escape');
          await walkTo(page, evidence, cloudRunway[0], 'return-to-cloud-walkway');
        }
        await follow(page, evidence, gate, 'gate');
        await action(page, '查看山门班次');
        await card(page, '山门');
        await snapshot(page, evidence, 'mountain-gate');
      }
    }
  }
  if (segment === 'crater' || segment === 'all') {
    const { page, evidence, westWindow } = await openTown('crater');
    if (segment === 'crater' && process.env.C3_CRATER_MOUTH_JUMP === '1') {
      // Explicitly opt-in diagnostic only: normal crater/all suites still
      // require the continuous west-shore walk from plaza and will fail if
      // scenery blocks it. C-3 isolated crater section: the previously used town-west
      // approach halts at E207.6/N180 behind other windows' road furniture.
      // Use the existing in-game “陨石坑口” location chooser ONLY to reach
      // the upstream end, then all crater checks remain native W walking
      // with real Presence samples. This is NOT proof of a continuous
      // spawn-to-crater walking route; the 'all' path still covers that.
      await page.locator('#town-panel-toggle').click();
      await page.locator('#jump').selectOption({ label: '陨石坑口' });
      // The production jump may itself dismiss the modal. Close it ONLY
      // if still open; both unconditional toggle (reopens) and close (hidden)
      // were verified as wrong on different native input phases.
      if(await page.locator('#town-settings').evaluate(dialog=>dialog.open))
        await page.locator('#town-settings-close').click();
      assert.equal(await page.locator('#town-settings').evaluate(dialog=>dialog.open),false);
      const via=await readPose(page);
      assert.ok(Math.hypot(via.east-2,via.north-159)<1.0,
        'Real in-app jump to crater mouth did not land: '+JSON.stringify(via));
      evidence.checkpoints.push({
        label:'in-game-town-jump-to-crater-mouth-not-full-west-shore-walk',
        ...via, wire:evidence.poses.at(-1),
      });
    } else {
      await follow(page, evidence, westShore, 'west-shore');
    }
    await follow(page, evidence, crater, 'crater');
    await face(page, evidence, -Math.PI / 2);
    const rim = await readPose(page);
    assert.ok(rim.east < -70.55 && Math.abs(rim.north - 159) < .5 && Math.abs(rim.height - 10.7773) < .5,
      JSON.stringify(rim));
    await snapshot(page, evidence, 'crater-entrance');
    await waitForWire(page, evidence, pose => pose?.area === 'west' && pose.east < -70.55);
    const deadline = Date.now() + 620_000;
    while (Date.now() < deadline) {
      const frame = westWindow();
      if (frame?.state?.canEnterRestricted) {
        const now = frame.joinEpoch + Date.now() - frame.joinReceivedAt;
        if (frame.state.morningBellAt - now > 15_000) {
          evidence.craterWindow = { ...frame.state, now };
          break;
        }
      }
      await page.waitForTimeout(600);
    }
    assert.ok(evidence.craterWindow, 'The west Presence room did not report an open crater window');
    await walkTo(page, evidence, [-72.1, 159], 'crater-crossed-lip');
    await waitForWire(page, evidence, pose => pose?.area === 'west' && pose.east < -71.8);
    await face(page, evidence, -Math.PI / 2);
    await snapshot(page, evidence, 'crater-inside');
    await walkTo(page, evidence, [-67, 159], 'crater-return');
    await snapshot(page, evidence, 'crater-return');
  }
  assert.equal(report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length + report.httpErrors.length, 0);
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  if (lastPage && !lastPage.isClosed()) {
    // Preserve DOM-entry state; the entry controller catches lazy-import
    // rejection, so it may show the fallback without any JS pageerror.
    try { report.entryDiagnostics = await lastPage.evaluate(() => ({
      bodyClass: document.body.className,
      readyState: document.readyState,
      entryHidden: document.getElementById('town-entry')?.hidden,
      loadingHidden: document.getElementById('town-entry-loading')?.hidden,
      failureHidden: document.getElementById('town-entry-error')?.hidden,
      retryHidden: document.getElementById('town-entry-retry')?.hidden,
      jumpCount: document.querySelectorAll('#jump option').length,
      canvasCount: document.querySelectorAll('#scene canvas').length,
      statusText: document.getElementById('town-entry')?.textContent?.slice(0,400),
    })); } catch (diagnosticError) {
      report.entryDiagnosticError = String(diagnosticError);
    }
    try {
      report.lastPose = await readPose(lastPage);
      await lastPage.screenshot({ path: join(output, 'failed-position.png'), timeout: 10_000 });
    } catch {}
  }
  process.exitCode = 1;
} finally {
  measuring = false;
  report.errors = report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length + report.httpErrors.length;
  await writeFile(join(output, 'za22-live-walk.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ segment, paths: report.paths.map(path => ({ name: path.name, checkpoints: path.checkpoints.length,
    frames: path.poses.length, last: path.checkpoints.at(-1) })), errors: report.errors, failure: report.failure }));
  await browser?.close();
}
