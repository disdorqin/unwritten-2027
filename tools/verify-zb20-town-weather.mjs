import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg = '.', outputArg = 'zb20-town-weather-evidence', mode] = process.argv.slice(2);
assert.ok(!mode || mode === '--build-only', 'Third argument must be --build-only');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const require = createRequire(path.join(checkout, 'package.json'));
const toolRoot = path.join(checkout, 'tools', 'voxel-tavern');
const minute = 60_000;
const timeout = 120_000;
const trace = { mode: mode ?? 'browser', states: [], presence: [], pageErrors: [] };
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
};

async function readWeather(page, phase, intensity) {
  const handle = await page.waitForFunction(({ intensity, phase }) => {
    const probe = window.__zb20Weather;
    const frame = probe.frames.at(-1);
    const scene = probe.scenes.find(candidate => candidate.getObjectByName('Drifting snow'));
    const meter = document.querySelector('.town-temperature progress');
    const hud = meter?.closest('.town-temperature');
    if (!frame || !scene || !hud || hud.hidden || !hud.getClientRects().length ||
        Math.abs(frame.snowIntensity - intensity) > .005) return false;
    const particles = [];
    scene.traverse(object => {
      if (object.isPoints && object.material?.uniforms?.windVelocity && object.material.uniforms.windOffset) {
        particles.push({
          name: object.name, id: object.uuid, visible: object.visible,
          velocity: object.material.uniforms.windVelocity.value.toArray(),
          count: object.geometry.drawRange.count,
        });
      }
    });
    return {
      phase, frame, particles, sky: scene.background.getHexString(),
      fog: [scene.fog.near, scene.fog.far],
      hud: { percent: meter.value, max: meter.max, label: hud.querySelector('label span:not([aria-hidden])')?.textContent.trim() },
      start: document.querySelector('#jump')?.value,
    };
  }, { intensity, phase }, { timeout });
  try { return await handle.jsonValue(); } finally { await handle.dispose(); }
}

async function exercise(dist) {
  require('tsx/esm/api').register();
  const importPresence = file => import(pathToFileURL(path.join(checkout, 'src/presence', file)).href);
  const [
    { createPresenceServer }, { createRehearsalClockEndpoint }, { townCeremonyMidnight }, { townOutdoorWeatherAt },
  ] = await Promise.all([
    importPresence('server.ts'), importPresence('rehearsal-clock.ts'),
    importPresence('ceremony-arrival.ts'), importPresence('town-outdoor-weather.ts'),
  ]);
  const rehearsal = createRehearsalClockEndpoint('2026-11-20T14:15:00+08:00');
  const dawn = Date.now() - minute;
  let weatherClock = dawn;
  const requestListener = async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/presence/rehearsal-clock') return rehearsal(request, response);
      if (pathname === '/favicon.ico') return response.writeHead(204).end();
      const name = pathname === '/' ? 'town-blockout.html' : pathname.slice(1);
      let filename = path.resolve(dist, name);
      if (!filename.startsWith(dist + path.sep)) return response.writeHead(400).end();
      let file;
      try {
        file = await stat(filename);
      } catch {
        if (!/^models\/[\w-]+\.glb$/.test(name)) return response.writeHead(404).end();
        filename = path.join(checkout, 'public', name);
        file = await stat(filename);
      }
      if (!file.isFile()) return response.writeHead(404).end();
      response.writeHead(200, {
        'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream',
        'Content-Length': file.size,
      });
      createReadStream(filename).on('error', () => response.destroy()).pipe(response);
    } catch (error) {
      if (!response.headersSent) response.writeHead(404).end();
      else response.destroy(error);
    }
  };
  const server = await createPresenceServer({
    host: '127.0.0.1', port: 0, requestListener, connectionLog() {},
    ceremonyStartAt: townCeremonyMidnight - rehearsal.offsetMs,
    outdoorWeather: { dawnEpoch: dawn, nowEpochMs: () => weatherClock },
  });
  let browser;
  try {
    const { chromium } = require('@playwright/test');
    browser = await chromium.launch({
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    page.on('pageerror', error => trace.pageErrors.push(String(error)));
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname !== '/presence') return;
      socket.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;
        try {
          const message = JSON.parse(payload);
          if (message.type === 'join' && message.self && message.townOutdoorWeather) {
            trace.presence.push({ kind: 'join', state: message.townOutdoorWeather });
          } else if (message.kind === 'town-outdoor-weather') {
            trace.presence.push({ kind: 'change', state: message.state });
          }
        } catch {
          // Other frames are outside this trace.
        }
      });
    });
    await page.addInitScript(() => {
      const scenes = [];
      const frames = [];
      const devtools = new EventTarget();
      devtools.addEventListener('observe', event => {
        if (event.detail?.isScene) scenes.push(event.detail);
      });
      window.__THREE_DEVTOOLS__ = devtools;
      window.__zb20Weather = { scenes, frames };
      document.addEventListener('town-frame-profile', event => {
        frames[0] = event.detail;
      }, true);
    });
    assert.equal(server.address().address, '127.0.0.1');
    const response = await page.goto(`http://127.0.0.1:${server.address().port}/town-blockout.html?profile=1`, {
      waitUntil: 'domcontentloaded', timeout,
    });
    assert.ok(response?.ok(), 'Town preview did not serve its real page');
    for (const [label, weather, offset, intensity, fogFar] of [
      ['clear', 'clear-snow', 0, 1, 1300],
      ['wind', 'wind', 31, 2.45, 890],
      ['whiteout', 'whiteout', 41, 4, 30],
      ['retreat', 'wind', 51, 2.45, 890],
    ]) {
      weatherClock = dawn + minute * offset;
      const state = townOutdoorWeatherAt(weatherClock, dawn);
      assert.equal(state.weather, weather);
      const sample = await readWeather(page, label, intensity);
      trace.states.push(sample);
      assert.equal(sample.start, '广场南侧');
      assert.equal(sample.particles.length, 1);
      const [snow] = sample.particles;
      assert.equal(snow.name, 'Drifting snow');
      assert.equal(snow.visible, true);
      assert.equal(snow.id, trace.states[0].particles[0].id);
      assert.ok(snow.count > 0);
      const speed = state.windStrength * .4 * 12;
      assert.ok(Math.abs(snow.velocity[0] - state.windEast * speed) < .0001, JSON.stringify(sample));
      assert.ok(Math.abs(snow.velocity[1] + state.windNorth * speed) < .0001, JSON.stringify(sample));
      assert.ok(Math.abs(sample.fog[1] - fogFar) < .1, JSON.stringify(sample));
      assert.equal(sample.fog[1], sample.frame.fogFar);
      assert.equal(sample.sky, weather === 'whiteout' ? 'd8e2e9' : trace.states[0].sky);
      assert.equal(sample.hud.label, '体温');
      assert.equal(sample.hud.max, 100);
      assert.ok(sample.hud.percent > 0 && sample.hud.percent <= 100);
      if (label !== 'retreat') await page.screenshot({ path: path.join(output, `${label}.png`) });
    }
    assert.deepEqual(trace.presence.map(({ kind, state }) => [kind, state.weather]),
      [['join', 'clear-snow'], ['change', 'wind'], ['change', 'whiteout'], ['change', 'wind']]);
    assert.deepEqual(trace.pageErrors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
}

await mkdir(output, { recursive: true });
const dist = await mkdtemp(path.join(tmpdir(), 'zb20-town-weather-'));
try {
  const vite = path.join(toolRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const build = spawnSync(process.execPath, [vite, 'build', '--mode', 'town-rehearsal', '--outDir', dist],
    { cwd: toolRoot, stdio: 'inherit' });
  if (build.error) throw build.error;
  assert.equal(build.status, 0);
  trace.build = 'passed';
  if (mode !== '--build-only') await exercise(dist);
  trace.passed = true;
} catch (error) {
  trace.failure = String(error);
  throw error;
} finally {
  await writeFile(path.join(output, 'weather-evidence.json'), JSON.stringify(trace, null, 2) + '\n');
  await rm(dist, { recursive: true, force: true });
}
