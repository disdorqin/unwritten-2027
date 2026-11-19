import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const doorIds = ['district:513:366', 'district:550:412'];
const ordinaryClock = Date.parse('2026-11-20T14:15:00+08:00');
const width = 1000;
const height = 650;
const timeoutMs = 60_000;
const swiftShader = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const anchor = 'overview.onclick = () => mode(false);';
const fixture = `
if (import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
    new URLSearchParams(location.search).has('b13DoorBaseline')) {
  let stageUsed = false;
  let frames = 0;
  let lastFrame: { calls: number; triangles: number; cameraY: number } | undefined;
  renderer.domElement.addEventListener('town-frame-profile', event => {
    frames++;
    lastFrame = (event as CustomEvent).detail;
  });
  Object.defineProperty(window, '__b13DoorBaseline', { value: {
    stage: async (id: string) => {
      if (stageUsed || !walking || homeReturn || houseDoorTravel) throw new Error('B13 setup is unavailable');
      stageUsed = true;
      await prepareExtensionStreets();
      const door = homeDoors.get(id);
      if (!door) throw new Error('B13 door is unavailable: ' + id);
      if (!settleTownLanding(door.x, door.n, door.ground)) throw new Error('B13 stand is not walkable: ' + id);
      if (Math.hypot(x - door.x, n - door.n) > .05) throw new Error('B13 stand required a fallback: ' + id);
      yaw = door.exitYaw + Math.PI;
      pitch = 0;
      renderer.domElement.focus({ preventScroll: true });
      return { ...door };
    },
    sample: () => ({
      east: x, north: n, ground, yaw, walking, home: homeReturn?.id ?? null,
      travelling: houseDoorTravel, mask: camera.layers.mask, frames, lastFrame,
      action: actionButton.hidden ? '' : actionButton.textContent,
      hud: document.getElementById('position')?.textContent,
    }),
  } });
}
`;

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

async function build(checkout, dist) {
  const root = path.join(checkout, 'tools', 'voxel-tavern');
  const viewer = path.join(root, 'town-blockout', 'viewer.ts');
  const source = await readFile(viewer, 'utf8');
  assert.equal(source.split(anchor).length, 2, 'Expected the viewer hook anchor exactly once');
  const resolvePackage = createRequire(path.join(root, 'package.json'));
  const vitePackage = resolvePackage.resolve('vite/package.json');
  const { exports: viteExports } = JSON.parse(await readFile(vitePackage, 'utf8'));
  const viteModule = typeof viteExports['.'] === 'string' ? viteExports['.'] : viteExports['.'].import;
  const { build: viteBuild } = await import(pathToFileURL(path.resolve(path.dirname(vitePackage), viteModule)).href);
  let injections = 0;
  await viteBuild({
    root,
    mode: 'town-rehearsal',
    build: { outDir: dist },
    plugins: [{
      name: 'b13-original-door-loopback-fixture',
      enforce: 'pre',
      transform(code, id) {
        if (path.resolve(id) !== viewer) return null;
        assert.equal(code.split(anchor).length, 2);
        injections++;
        return { code: code.replace(anchor, anchor + fixture), map: null };
      },
    }],
  });
  assert.equal(injections, 1, 'Expected one viewer fixture in the build');
  assert.equal(await readFile(viewer, 'utf8'), source, 'Viewer source changed on disk');
}

async function serve(checkout, dist) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/presence/rehearsal-clock') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return response.end(JSON.stringify({ ceremonyEpochMs: ordinaryClock }));
      }
      if (pathname === '/presence' || pathname.startsWith('/presence/')) {
        return response.writeHead(503).end('Presence outside this single-client check');
      }
      if (pathname === '/favicon.ico') return response.writeHead(204).end();
      const name = pathname === '/' ? 'town-blockout.html' : pathname.slice(1);
      let filename = path.resolve(dist, name);
      if (!filename.startsWith(dist + path.sep)) return response.writeHead(400).end();
      let size;
      try {
        size = (await stat(filename)).size;
      } catch {
        if (!/^models\/[\w-]+\.glb$/.test(name)) return response.writeHead(404).end();
        filename = path.join(checkout, 'public', name);
        size = (await stat(filename)).size;
      }
      response.writeHead(200, {
        'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream',
        'Content-Length': size,
      });
      createReadStream(filename).on('error', () => response.destroy()).pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(404).end();
      else response.destroy();
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function readFrame(page, required) {
  return (await page.waitForFunction((condition) => {
    const pose = window.__b13DoorBaseline?.sample();
    if (!pose || !pose.walking || pose.travelling || !pose.lastFrame?.calls || !pose.lastFrame?.triangles) return;
    if (pose.frames <= (condition.after ?? 0)) return;
    if ('home' in condition && pose.home !== condition.home) return;
    if ('mask' in condition && pose.mask !== condition.mask) return;
    if (condition.action && !pose.action?.includes(condition.action)) return;
    return pose;
  }, required, { timeout: timeoutMs })).jsonValue();
}

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual}, expected ${expected} ±${tolerance}`);
}

async function saveScreenshot(page, output, result, state) {
  const filename = `${result.id.replaceAll(':', '-')}-${state}.png`;
  await page.screenshot({ path: path.join(output, filename), animations: 'disabled', timeout: timeoutMs });
  result.screenshots[state] = filename;
}

async function checkDoor(browser, url, id, output, result) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /建筑清单读取失败|栋替换模型加载失败|Loading extension streets/.test(message.text())) {
      result.errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.__b13DoorKeys = [];
    addEventListener('keydown', event => {
      if (event.code === 'KeyE' || event.code === 'KeyS') {
        window.__b13DoorKeys.push({ code: event.code, trusted: event.isTrusted, repeat: event.repeat });
      }
    });
  });
  try {
    result.step = 'open';
    const response = await page.goto(`${url}/town-blockout.html?profile&b13DoorBaseline`, {
      waitUntil: 'domcontentloaded', timeout: timeoutMs,
    });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => Boolean(window.__b13DoorBaseline), null, { timeout: timeoutMs });
    await page.locator('#jump').selectOption({ label: '东北纪念馆' });
    const openAir = await readFrame(page, { home: null, mask: 1 });
    // This sole placement sets up the audited stand. The subsequent inputs use
    // the real keyboard listener and the same movement code as a player.
    result.step = 'stage-original-door';
    const door = await page.evaluate(doorId => window.__b13DoorBaseline.stage(doorId), id);
    result.door = door;
    const approach = await readFrame(page, { after: openAir.frames, home: null, mask: 1, action: '进入屋舍空间' });
    result.approach = approach;
    near(approach.east, door.x, .05, 'Approach east');
    near(approach.north, door.n, .05, 'Approach north');
    result.step = 'press-e-to-enter';
    await page.keyboard.press('e');
    const inside = await readFrame(page, { after: approach.frames, home: id, mask: 2 });
    result.inside = inside;
    near(inside.east, 625.18, .05, 'Shared-room spawn east');
    near(inside.north, 493.64, .05, 'Shared-room spawn north');
    near(inside.ground, 150, .01, 'Shared-room ground');
    await saveScreenshot(page, output, result, 'inside');
    result.step = 'walk-to-original-door';
    await page.keyboard.down('s');
    let threshold;
    try {
      threshold = await readFrame(page, { after: inside.frames, home: id, mask: 2, action: '出门 · 返回来时的屋门' });
    } finally {
      await page.keyboard.up('s');
    }
    result.threshold = threshold;
    assert.ok(threshold.north < inside.north - .15, 'S moved toward the shared-room exit');
    result.step = 'press-e-to-return';
    await page.keyboard.press('e');
    const returned = await readFrame(page, { after: threshold.frames + 2, home: null, mask: 1 });
    result.returned = returned;
    near(returned.east, door.x, .05, 'Original door return east');
    near(returned.north, door.n, .05, 'Original door return north');
    near(returned.ground, approach.ground, .05, 'Original door return ground');
    near(Math.atan2(Math.sin(returned.yaw - door.exitYaw), Math.cos(returned.yaw - door.exitYaw)),
      0, .01, 'Original door outward yaw');
    await saveScreenshot(page, output, result, 'returned');
    result.step = 'check-trusted-input';
    const input = await page.evaluate(() => window.__b13DoorKeys);
    result.input = input;
    assert.deepEqual(input.filter(key => !key.repeat).map(key => [key.code, key.trusted]),
      [['KeyE', true], ['KeyS', true], ['KeyE', true]]);
    assert.deepEqual(result.errors, [], 'Viewer raised errors');
    result.step = 'passed';
  } finally {
    if (result.step !== 'passed') {
      result.lastObserved = await page.evaluate(() => ({
        pose: window.__b13DoorBaseline?.sample(),
        input: window.__b13DoorKeys,
      })).catch(() => null);
    }
    await context.close();
  }
}

const [sourcePath, outputPath, option] = process.argv.slice(2);
assert.ok(sourcePath && outputPath && (!option || option === '--build-only'),
  'Usage: node verify-b13-original-door.mjs CHECKOUT OUTPUT_DIR [--build-only]');
const checkout = path.resolve(sourcePath);
const output = path.resolve(outputPath);
const temporary = await mkdtemp(path.join(tmpdir(), 'town-b13-loopback-'));
let browser;
let server;
const evidence = {
  status: 'building', browser: null, viewport: { width, height, dpr: 1 },
  clock: new Date(ordinaryClock).toISOString(), results: [],
};
await mkdir(output, { recursive: true });
try {
  const dist = path.join(temporary, 'dist');
  await build(checkout, dist);
  if (!option) {
    const resolvePackage = createRequire(path.join(checkout, 'package.json'));
    const { chromium } = resolvePackage('@playwright/test');
    const executablePath = process.env.B13_CHROMIUM_PATH;
    evidence.status = 'launching-browser';
    browser = await chromium.launch({ args: swiftShader, executablePath });
    evidence.browser = browser.version();
    evidence.status = 'starting-loopback';
    const started = await serve(checkout, dist);
    server = started.server;
    evidence.status = 'checking-doors';
    for (const id of doorIds) {
      const result = { id, step: 'starting-context', screenshots: {}, errors: [] };
      evidence.results.push(result);
      try {
        await checkDoor(browser, started.url, id, output, result);
        console.log(`Passed E entry and E original-door return: ${id}`);
      } catch (error) {
        result.failure = error.message;
        console.error(`${id} failed at ${result.step}: ${error.message}`);
      }
    }
    evidence.status = evidence.results.every(result => result.step === 'passed' && !result.failure) ? 'passed' : 'failed';
    if (evidence.status === 'failed') process.exitCode = 1;
  } else {
    evidence.status = 'build-only';
    console.log('Rehearsal viewer build and untouched source verified.');
  }
} catch (error) {
  evidence.failure = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'b13-original-door.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
