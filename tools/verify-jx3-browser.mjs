import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const [baseline, candidate, output] = process.argv.slice(2).map(value => path.resolve(value));
assert.ok(baseline && candidate && output, 'Pass baseline checkout or frozen evidence directory, candidate checkout, and output path.');
const frozenReference = process.env.JX3_REUSE_BASELINE === '44542495628' ? {
  run: 44542495628, artifact: 14541047246, sha: '352aa49b825d88c432ef2dd0a9dd04a5c86441c3',
  candidate: process.env.JX3_CANDIDATE_SHA ?? '5bb1a3f0658b6cba4d28563c0b165c1c373e37da',
} : undefined;
const viewSize = { width: 1000, height: 650 };
const frozenClock = Date.parse('2026-12-31T14:00:00+08:00');
const frameTimeout = 120_000;
const pairedWeather = ['weatherTier', 'snowIntensity', 'snowCover', 'fogNear', 'fogFar'];
const viewportOptions = { viewport: viewSize, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'zh-CN' };
const exteriorTarget = [126, 13, -115];
const outside = [
  ['west', [95, 18, -115]], ['east', [157, 18, -115]],
  ['north', [126, 18, -146]], ['south', [126, 18, -84]],
];
const travel = [
  [118.1, 115.1], [121.4, 115.4, 'entry'], [122.5, 120.3, 'display'],
  [122.5, 117], [126.3, 117], [126.3, 120.2, 'partition'], [126.3, 117],
  [130, 117], [130, 120.2, 'packing'], [130, 117], [121.4, 115.4], [116.8, 115],
];
// Workshop porch's west edge is E117.575; with a .27 m body radius, the body is out before E117.305.
const outsideEastLimit = 117.25;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const anchor = 'overview.onclick = () => mode(false);';
const faceAnchor = 'function faceFrom(east: number, north: number, height: number, heading: number, tilt: number) {';
const facePatch = `${faceAnchor}\n  if (jx3FixedPortrait) ({ east, north, height, heading, tilt } = jx3FixedPortrait);`;
const weatherAnchor = 'const weather = townSnowWeatherForFrame(ceremonyState);';
const weatherPatch = `const weather = townSnowWeatherForFrame(jx3Capture
    ? { ...ceremonyState, now: ${frozenClock}, phase: 'ordinary' }
    : ceremonyState);`;
const coverAnchor = "visualSnowCover = ceremonyState.phase === 'ordinary'";
const coverPatch = `visualSnowCover = jx3Capture ? weather.targetCover : ceremonyState.phase === 'ordinary'`;
const buildingAnchor = "if (location.protocol !== 'file:') loadBuildings().catch(error => console.error('建筑清单读取失败', error));";
const buildingPatch = `const jx3Buildings = location.protocol === 'file:' ? Promise.resolve()
  : loadBuildings().catch(error => console.error('建筑清单读取失败', error));`;
const instrumentation = `
let jx3FixedPortrait: { east: number; north: number; height: number; heading: number; tilt: number } | undefined;
const jx3Capture = import.meta.env.MODE === 'town-rehearsal' && new URLSearchParams(location.search).has('jx3Capture');
if (jx3Capture) {
  Object.defineProperty(window, '__jx3', { value: {
    ready: () => jx3Buildings,
    sample: () => ({ east: x, north: n, ground, yaw, pitch, walking, home: homeReturn?.id ?? null,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), aspect: camera.aspect, fov: camera.fov } }),
    aim: (heading: number, tilt = 0) => {
      if (!lookAllowed()) throw new Error('Walking view cannot be aimed');
      turnView(heading - yaw, tilt - pitch);
    },
    overview: (position: [number, number, number], target: [number, number, number]) => {
      if (!mode(false)) throw new Error('Overview unavailable');
      camera.position.set(...position);
      controls.target.set(...target);
      controls.update();
    },
    portrait: (pose?: typeof jx3FixedPortrait) => {
      if (pose && (!walking || Math.hypot(pose.east - x, pose.north - n) > .45 ||
          Math.abs(pose.height - camera.position.y) > .25)) throw new Error('Portrait lacks a nearby walked camera');
      jx3FixedPortrait = pose;
    },
  } });
}`;

function gitInfo(checkout) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function build(checkout) {
  const root = path.join(checkout, 'tools', 'voxel-tavern');
  const viewer = path.join(root, 'town-blockout', 'viewer.ts');
  const original = await readFile(viewer, 'utf8');
  const injections = [[anchor, `${anchor}\n${instrumentation}`], [faceAnchor, facePatch],
    [weatherAnchor, weatherPatch], [coverAnchor, coverPatch], [buildingAnchor, buildingPatch]];
  let patched = original;
  for (const [needle, addition] of injections) {
    assert.equal(patched.split(needle).length, 2, `${viewer}: missing or repeated anchor ${needle}`);
    patched = patched.replace(needle, addition);
  }
  try {
    await writeFile(viewer, patched);
    const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'town-rehearsal'], {
      cwd: root, stdio: 'inherit', timeout: 240_000,
    });
    assert.equal(result.status, 0, String(result.error ?? `${viewer}: Vite did not complete`));
  } finally {
    await writeFile(viewer, original);
  }
  return { dist: path.join(root, 'dist'), sha: gitInfo(checkout),
    fixtureSha256: createHash('sha256').update(JSON.stringify(injections)).digest('hex'),
    patchedViewerSha256: createHash('sha256').update(patched).digest('hex') };
}

async function startServer(checkout, dist) {
  const traffic = { clock: 0, presenceOther: [], assets: [] };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      if (pathname === '/presence/rehearsal-clock') {
        traffic.clock++;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ ceremonyEpochMs: frozenClock }));
      }
      if (pathname === '/presence' || pathname.startsWith('/presence/')) {
        traffic.presenceOther.push({ method: req.method, pathname });
        return res.writeHead(503).end('Presence not under test');
      }
      if (pathname === '/favicon.ico') return res.writeHead(204).end();
      const name = pathname === '/' ? 'town-blockout.html' : pathname.slice(1);
      let root = dist;
      let filename = path.resolve(root, name);
      if (!filename.startsWith(`${root}${path.sep}`)) return res.writeHead(400).end();
      let size;
      try { size = (await stat(filename)).size; }
      catch {
        if (!/^models\/[\w-]+\.glb$/.test(name)) return res.writeHead(404).end();
        root = path.join(checkout, 'public');
        filename = path.join(root, name);
        size = (await stat(filename)).size;
      }
      traffic.assets.push({ pathname, size });
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Content-Length': size });
      createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(404).end();
      else res.destroy();
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}`, traffic };
}

const renderFrames = (page, count = 8) => page.evaluate(async ({ count, timeout }) => {
  const canvas = document.querySelector('#scene canvas');
  if (!canvas) throw new Error('Production scene canvas missing');
  return new Promise((resolve, reject) => {
    const events = [];
    const stop = () => { clearTimeout(timer); canvas.removeEventListener('town-frame-profile', frame); };
    const frame = event => {
      events.push({ ...event.detail, hud: document.querySelector('#position')?.textContent ?? '' });
      if (events.length === count) { stop(); resolve(events); }
    };
    const timer = setTimeout(() => { stop(); reject(new Error(`Received ${events.length}/${count} render frames`)); }, timeout);
    canvas.addEventListener('town-frame-profile', frame);
  });
}, { count, timeout: frameTimeout });

const sample = page => page.evaluate(() => window.__jx3.sample());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function matchCamera(old, newer) {
  const allOld = [...old.position, ...old.quaternion, old.aspect, old.fov];
  const allNew = [...newer.position, ...newer.quaternion, newer.aspect, newer.fov];
  return allOld.every((value, index) => Math.abs(value - allNew[index]) < 1e-7);
}

async function drive(page, east, north) {
  await wait(370); // Prevent the production double-W sprint threshold from affecting a new leg.
  const before = await sample(page);
  if (Math.hypot(east - before.east, north - before.north) < .18) return { before, arrived: before, observed: 0 };
  await page.evaluate(({ east, north }) => {
    const pose = window.__jx3.sample();
    window.__jx3.aim(Math.atan2(east - pose.east, north - pose.north));
    window.__jx3Arrival = { best: Math.hypot(east - pose.east, north - pose.north), observed: 0 };
  }, { east, north });
  let endpoint;
  try {
    await page.keyboard.down('w');
    endpoint = await page.evaluate(({ east, north }) => new Promise((resolve, reject) => {
      const canvas = document.querySelector('#scene canvas');
      const watch = window.__jx3Arrival;
      function cleanup() { clearTimeout(timer); canvas.removeEventListener('town-frame-profile', inspect); }
      function inspect() {
        const pose = window.__jx3.sample();
        watch.observed++;
        watch.best = Math.min(watch.best, Math.hypot(east - pose.east, north - pose.north));
        if (watch.best <= .23) { cleanup(); resolve({ observed: watch.observed, position: [pose.east, pose.north] }); }
      }
      const timer = setTimeout(() => {
        cleanup();
        const { east: stoppedEast, north: stoppedNorth } = window.__jx3.sample();
        reject(Error(`Walking to ${east}/${north}: best distance ${watch.best.toFixed(3)} after ${watch.observed} frames at E${stoppedEast.toFixed(3)}/N${stoppedNorth.toFixed(3)}`));
      }, 180_000);
      canvas.addEventListener('town-frame-profile', inspect);
      inspect();
    }), { east, north });
  } finally {
    await page.keyboard.up('w');
  }
  await renderFrames(page, 3);
  const arrived = await sample(page);
  assert.ok(Math.hypot(east - arrived.east, north - arrived.north) <= .45, `Overshot ${east}/${north}`);
  return { before, arrived, ...endpoint };
}

async function run(checkout, label, browser) {
  const log = message => console.log(`[jx3 ${label}] ${message}`);
  log(`build starting ${gitInfo(checkout)}`);
  const built = await build(checkout);
  log(`build ready ${built.sha}`);
  const { server, url, traffic } = await startServer(checkout, built.dist);
  const context = await browser.newContext(viewportOptions);
  const presenceSockets = [];
  await context.routeWebSocket(`${url.replace('http:', 'ws:')}/presence`, route => {
    presenceSockets.push(route.url());
    void route.close({ code: 1000, reason: 'Isolated single-player JX-3 render' });
  });
  const page = await context.newPage();
  const errors = [];
  const nonPresence = pathname => !pathname.startsWith('/presence');
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/建筑清单读取失败|栋替换模型加载失败/.test(message.text())) errors.push(message.text());
  });
  page.on('requestfailed', request => {
    const why = request.failure()?.errorText;
    if (nonPresence(new URL(request.url()).pathname) && why !== 'net::ERR_ABORTED') errors.push(`${why} ${request.url()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && nonPresence(new URL(response.url()).pathname)) errors.push(`${response.status()} ${response.url()}`);
  });
  const dir = path.join(output, label);
  await mkdir(dir, { recursive: true });
  const screenshots = [];
  const interiorErrors = [];
  let walkError;
  const waypoints = [];
  async function checkpoint(stage) {
    const file = path.join(dir, 'evidence.json');
    await writeFile(`${file}.tmp`, JSON.stringify({
      stage, tested: built, browser: browser.version(), viewportOptions, screenshots, waypoints,
      walkError, interiorErrors, errors, presenceSockets, traffic,
      clock: new Date(frozenClock).toISOString(), acceptance: 'Loopback production preview in rehearsal mode, isolated single-player. Frozen weather profile and visual target cover. Walking uses keyboard.',
    }, null, 2));
    await rename(`${file}.tmp`, file);
  }
  async function image(id, group) {
    const frames = await renderFrames(page, 4);
    assert.ok(frames.every(frame => frame.calls > 0 && frame.triangles > 0));
    const pose = await sample(page);
    const file = `${group}-${id}.png`;
    await page.screenshot({ path: path.join(dir, file), animations: 'disabled', timeout: frameTimeout });
    assert.ok(matchCamera((await sample(page)).camera, pose.camera), `Camera moved: ${file}`);
    screenshots.push({ id, group, file, pose, frames });
    await checkpoint(`captured ${file}`);
    log(`captured ${file} at ${pose.camera.position.map(number => number.toFixed(3)).join(',')} draws=${frames.at(-1).calls} tris=${frames.at(-1).triangles}`);
  }
  async function nativeStreet() {
    if ((await sample(page)).walking) await page.locator('#overview').click();
    await page.locator('#jump').evaluate(select => {
      const destination = Array.from(select.options).find(option => option.label === '灯坊');
      if (!destination) throw new Error('Native 灯坊 destination missing');
      select.value = destination.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('#walk')?.getAttribute('aria-pressed') === 'true' &&
      /东 108\.0 m · 北 114\.0 m/.test(document.querySelector('#position')?.textContent ?? ''), null, { timeout: frameTimeout });
  }
  try {
    await checkpoint('loading scene');
    const reply = await page.goto(`${url}/town-blockout.html?profile&jx3Capture`, { waitUntil: 'domcontentloaded', timeout: frameTimeout });
    assert.equal(reply?.status(), 200);
    await page.waitForFunction(() => Boolean(window.__jx3), null, { timeout: frameTimeout });
    await page.evaluate(async timeout => {
      let timer;
      try {
        await Promise.race([window.__jx3.ready(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Building queue did not settle')), timeout);
        })]);
      } finally { clearTimeout(timer); }
    }, frameTimeout);
    assert.deepEqual(errors, [], `${label} did not load the production assets`);
    log(`production scene ready and building queue settled ${traffic.assets.length} HTTP responses`);
    await checkpoint('scene ready');
    await nativeStreet();
    await image('street', 'exterior');
    const street = screenshots[0].pose.camera.position;
    assert.ok(Math.abs(street[1] - 10.65) < .05, 'Native street viewpoint is different from the historical one');
    for (const [id, position] of outside) {
      await page.evaluate(({ position, target }) => window.__jx3.overview(position, target), { position, target: exteriorTarget });
      await image(id, 'exterior');
    }
    if (label === 'candidate') {
      const forecourt = [
        ['cistern', [112.9, 12.5, -121.1], [119.3, 11.1, -121.1]],
        ['firewood-and-pennant', [112.9, 12.4, -109.5], [119.1, 12.0, -108.9]],
      ];
      for (const [id, position, target] of forecourt) {
        await page.evaluate(({ position, target }) => window.__jx3.overview(position, target), { position, target });
        await image(id, 'forecourt');
      }
    }
    try {
      await nativeStreet();
      for (const [east, north, imageId] of travel) {
        log(`walking ${waypoints.length + 1}/${travel.length} toward E${east}/N${north}`);
        const leg = await drive(page, east, north);
        waypoints.push({ target: [east, north], ...leg });
        await checkpoint(`walking ${waypoints.length}/${travel.length}`);
        log(`arrived E${leg.arrived.east.toFixed(3)}/N${leg.arrived.north.toFixed(3)} after ${leg.observed} frames`);
        if (imageId) {
          try {
            await page.evaluate(({ east, north }) => window.__jx3.portrait({
              east, north, height: 11.8, heading: Math.atan2(126 - east, 116 - north), tilt: 0,
            }), { east, north });
            await image(imageId, 'interior');
          } catch (error) {
            interiorErrors.push({ id: imageId, error: String(error) });
            await checkpoint(`interior ${imageId} failed`);
          } finally {
            await page.evaluate(() => window.__jx3.portrait());
          }
        }
      }
      const endpoint = await sample(page);
      assert.ok(endpoint.walking && endpoint.east < outsideEastLimit && Math.abs(endpoint.north - 115) <= .45,
        `The player has not cleared the outside porch: E${endpoint.east}/N${endpoint.north}`);
      log(`verified outside porch at E${endpoint.east.toFixed(3)}/N${endpoint.north.toFixed(3)}`);
    } catch (error) {
      walkError = String(error);
      log(`walking stopped: ${walkError}`);
    }
    assert.ok(traffic.clock > 0, 'No rehearsal clock request was observed');
    assert.deepEqual(errors, [], `${label} page/asset requests failed`);
  } finally {
    await checkpoint('capture ended');
    await context.close();
    await new Promise(resolve => server.close(resolve));
  }
  return { screenshots, waypoints, walkError, interiorErrors, tested: built, browser: browser.version() };
}

async function verifyFrozenBaseline() {
  const before = JSON.parse(await readFile(path.join(baseline, 'evidence.json'), 'utf8'));
  assert.equal(before.tested.sha, frozenReference.sha);
  assert.equal(before.clock, new Date(frozenClock).toISOString());
  assert.deepEqual(before.viewportOptions, viewportOptions);
  assert.deepEqual(before.errors, []);
  assert.equal(before.walkError, undefined);
  assert.deepEqual(before.interiorErrors, []);
  assert.equal(before.waypoints.length, travel.length);
  const exit = before.waypoints.at(-1).arrived;
  assert.ok(exit.walking && exit.east < outsideEastLimit && Math.abs(exit.north - 115) <= .45);
  assert.deepEqual(before.screenshots.map(image => `${image.group}-${image.id}`).sort(),
    ['exterior-street', ...outside.map(([id]) => `exterior-${id}`),
      ...travel.filter(([, , id]) => id).map(([, , id]) => `interior-${id}`)].sort());
  for (const image of before.screenshots) {
    assert.equal(image.file, `${image.group}-${image.id}.png`);
    assert.ok((await stat(path.join(baseline, image.file))).size > 0);
  }
  assert.equal(gitInfo(candidate), frozenReference.candidate);
  return before;
}

const oldEvidence = frozenReference ? await verifyFrozenBaseline() : undefined;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
await mkdir(output, { recursive: true });
try {
  const before = oldEvidence ?? await run(baseline, 'baseline', browser);
  if (oldEvidence) {
    assert.equal(browser.version(), before.browser, 'Frozen baseline and candidate need the same Chromium version');
    await writeFile(path.join(output, 'reference.json'), JSON.stringify({ ...frozenReference, tested: before.tested,
      browser: before.browser, viewport: before.viewportOptions, files: before.screenshots.map(image => image.file),
    }, null, 2));
  }
  const after = await run(candidate, 'candidate', browser);
  assert.equal(after.tested.fixtureSha256, before.tested.fixtureSha256, 'Capture fixture changed between source trees');
  const exterior = before.screenshots.filter(image => image.group === 'exterior');
  assert.equal(exterior.length, 5);
  const matches = exterior.map(old => {
    const item = after.screenshots.find(image => image.id === old.id && image.group === 'exterior');
    assert.ok(item, `Missing candidate exterior ${old.id}`);
    assert.ok(matchCamera(item.pose.camera, old.pose.camera), `Camera mismatch at ${old.id}`);
    for (const field of pairedWeather) {
      assert.equal(item.frames.at(-1)[field], old.frames.at(-1)[field], `${field} mismatch at ${old.id}`);
    }
    return { id: old.id, baseline: old.frames.at(-1), candidate: item.frames.at(-1) };
  });
  const details = before.screenshots.filter(image => image.group === 'interior').map(old => {
    const item = after.screenshots.find(image => image.id === old.id && image.group === 'interior');
    return { id: old.id, matchedCamera: Boolean(item) && matchCamera(item.pose.camera, old.pose.camera),
      baselineCamera: old.pose.camera, candidateCamera: item?.pose.camera,
      baseline: old.frames.at(-1), candidate: item?.frames.at(-1) };
  });
  await writeFile(path.join(output, 'paired.json'), JSON.stringify({ matches, details,
    interiorErrors: { baseline: before.interiorErrors, candidate: after.interiorErrors },
    walk: { baseline: before.waypoints.length, candidate: after.waypoints.length, baselineError: before.walkError, candidateError: after.walkError },
  }, null, 2));
  for (const { id, baseline, candidate } of [...matches, ...details]) {
    console.log(`${id}: draws ${baseline.calls} → ${candidate?.calls ?? 'missing'}, tris ${baseline.triangles} → ${candidate?.triangles ?? 'missing'}`);
  }
  console.log(`Key-controlled route: ${before.waypoints.length}/${travel.length} baseline, ${after.waypoints.length}/${travel.length} candidate`);
  assert.equal(before.waypoints.length, travel.length, before.walkError);
  assert.equal(after.waypoints.length, travel.length, after.walkError);
  assert.equal(before.walkError, undefined, before.walkError);
  assert.equal(after.walkError, undefined, after.walkError);
  assert.equal(details.length, 4, 'The baseline needs all four interior views');
  assert.ok(details.every(view => view.matchedCamera), 'The candidate needs all four matched interior views');
  for (const view of details) {
    for (const field of pairedWeather) assert.equal(view.candidate[field], view.baseline[field], `${field} mismatch at ${view.id}`);
  }
} finally {
  await browser.close();
}
