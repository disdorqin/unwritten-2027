import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deriveShotManifest } from './shot-manifest.mjs';

const [frozenPath, stagedPath, outputPath, ...flags] = process.argv.slice(2);
assert.ok(frozenPath && stagedPath && outputPath && flags.every(flag => ['--manifest-only', '--build-only', '--sample'].includes(flag)),
  'Usage: node capture-town.mjs FROZEN_ROOT STAGED_ROOT NEW_OUTPUT_DIR [--manifest-only | --build-only] [--sample]');
assert.ok(!(flags.includes('--manifest-only') && flags.includes('--build-only')));
const roots = { frozen: resolve(frozenPath), staged: resolve(stagedPath) };
const output = resolve(outputPath);
assert.notEqual(roots.frozen, roots.staged);
for (const root of Object.values(roots)) {
  const difference = relative(root, output);
  assert.ok(difference === '..' || difference.startsWith('..' + sep), 'Output must be beside both source trees');
}
const viewer = 'town-blockout/viewer.ts';
const serverMode = 'town-rehearsal';
const fixedClock = Date.parse('2026-11-20T14:15:00+08:00');
const requireFrom = root => createRequire(join(root, 'package.json'));
const sha256 = content => createHash('sha256').update(content).digest('hex');
const evidence = { scope: 'local fixed-camera production-source rendering only', passes: {} };
const ports = [];
let browser;

function hookSource(side, requested) {
  const enabled = "import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' " +
    "&& new URLSearchParams(location.search).has('b04FixedCamera')";
  return {
    header: `
const b04FixedCamera = ${enabled};
type B04Shot = { position: [number, number, number]; target: [number, number, number] };
let b04Frame: { shot: B04Shot; frames: [number, number][]; accept: (frame: unknown) => void } | undefined;
`,
    allowlist: side === 'staged' ? `const verifiedMarketHomeIds = new Set<string>(b04FixedCamera ? ${JSON.stringify(requested)} : []);` : '',
    expose: `
if (b04FixedCamera) {
  Object.defineProperty(window, '__b04FixedCamera', { value: {
    staged: ${side === 'staged' ? '[...districts.marketHomes.keys()].sort()' : '[]'},
    atlasReady: () => ${side === 'staged' ? `[...districts.marketHomes.values()].every(home => {
      let applied = false;
      home.group.traverse(object => {
        const mesh = object as Mesh;
        if (mesh.isMesh && mesh.geometry.hasAttribute('marketHomeTile')) applied = true;
      });
      return applied;
    })` : 'true'},
    capture(shot: B04Shot) {
      if (b04Frame || walking || homeReturn) throw new Error('Fixed-camera capture requires an idle local viewer');
      return new Promise(accept => { b04Frame = { shot, frames: [], accept }; });
    },
  } });
}
`,
    pose: `
  if (b04Frame) {
    camera.position.set(...b04Frame.shot.position);
    camera.lookAt(...b04Frame.shot.target);
  }
`,
    collect: `
  if (b04Frame) {
    const frame = b04Frame;
    frame.frames.push([renderer.info.render.calls, renderer.info.render.triangles]);
    if (frame.frames.length === 8) {
      b04Frame = undefined;
      frame.accept({
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        projection: camera.projectionMatrix.toArray(),
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        dpr: renderer.getPixelRatio(),
        frames: frame.frames.slice(-3),
        png: renderer.domElement.toDataURL('image/png'),
      });
    }
  }
`,
  };
}

function changeOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, 'Expected exactly one viewer anchor: ' + anchor);
  return source.replace(anchor, () => replacement);
}

async function buildSide(side, manifest) {
  const checkout = roots[side];
  const root = join(checkout, 'tools/voxel-tavern');
  const file = join(root, viewer);
  const checkSource = async () => {
    for (const [name, digest] of Object.entries(manifest.sourceSha256[side])) {
      assert.equal(sha256(await readFile(join(root, 'town-blockout', name))), digest, side + '/' + name + ' changed');
    }
  };
  await checkSource();
  const resolvePackage = requireFrom(checkout);
  const vitePackage = resolvePackage.resolve('vite/package.json');
  const { exports: viteExports } = JSON.parse(await readFile(vitePackage, 'utf8'));
  const entry = typeof viteExports['.'] === 'string' ? viteExports['.'] : viteExports['.'].import;
  const { build } = await import(pathToFileURL(resolve(dirname(vitePackage), entry)).href);
  const injection = hookSource(side, manifest.requested);
  let applied = false;
  const dist = join(output, 'build-' + side);
  await build({
    root,
    mode: serverMode,
    logLevel: 'warn',
    build: { outDir: dist, emptyOutDir: false, reportCompressedSize: false },
    plugins: [{
      name: 'b04-local-matched-frame',
      enforce: 'pre',
      transform(code, id) {
        if (resolve(id) !== file) return null;
        assert.ok(!applied);
        const grid = 'const grid = createTerrainGrid();';
        const overview = 'overview.onclick = () => mode(false);';
        const rolling = '  const wideView = !walking && camera.position.y > (widePanorama ? 232 : 248);';
        const render = '} else renderer.render(scene, camera);';
        code = changeOnce(code, grid, injection.header + grid);
        code = changeOnce(code, overview, overview + injection.expose);
        code = changeOnce(code, rolling, injection.pose + rolling);
        code = changeOnce(code, render, '} else {\n  renderer.render(scene, camera);' + injection.collect + '\n}');
        if (side === 'staged') {
          code = changeOnce(code, 'const verifiedMarketHomeIds = new Set<string>();', injection.allowlist);
        }
        applied = true;
        return { code, map: null };
      },
    }],
  });
  assert.ok(applied, 'Viewer hook was not included in ' + side);
  await checkSource();
  assert.ok(await stat(join(dist, 'town-blockout.html')));
  return dist;
}

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
};

async function serve(side, dist) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/presence/rehearsal-clock') {
        return response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ceremonyEpochMs: fixedClock }));
      }
      if (pathname === '/presence' || pathname.startsWith('/presence/')) return response.writeHead(503).end();
      if (pathname === '/favicon.ico') return response.writeHead(204).end();
      const filename = resolve(dist, '.' + pathname);
      if (!filename.startsWith(dist + sep)) return response.writeHead(400).end();
      let asset = filename;
      let stats;
      try {
        stats = await stat(asset);
      } catch {
        if (!/^\/models\/[\w-]+\.glb$/.test(pathname)) return response.writeHead(404).end();
        asset = join(roots[side], 'public', pathname.slice(1));
        stats = await stat(asset);
      }
      if (!stats.isFile()) return response.writeHead(404).end();
      response.writeHead(200, { 'Content-Type': mime[extname(asset)] ?? 'application/octet-stream', 'Content-Length': stats.size });
      createReadStream(asset).on('error', () => response.destroy()).pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(404).end();
      else response.destroy();
    }
  });
  await new Promise((accept, reject) => server.once('error', reject).listen(0, '127.0.0.1', accept));
  ports.push(server);
  return 'http://127.0.0.1:' + server.address().port;
}

async function captureSide(side, dist, manifest, shots) {
  const origin = await serve(side, dist);
  const { width, height, dpr } = manifest.settings;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
  const target = join(output, 'frames', side);
  await mkdir(target, { recursive: true });
  const observed = { frames: [], exceptions: [], consoleErrors: [], failedResponses: [] };
  evidence.passes[side] = observed;
  try {
    await context.route('**/*', route => {
      const url = route.request().url();
      return url.startsWith(origin + '/') || url.startsWith('data:') ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(fixedClock));
    page.on('pageerror', error => observed.exceptions.push(error.message));
    page.on('console', event => {
      if (event.type() === 'error' && !event.text().startsWith('Failed to load resource:')) observed.consoleErrors.push(event.text());
    });
    page.on('response', response => {
      if (response.status() >= 400 && !new URL(response.url()).pathname.startsWith('/presence')) {
        const issue = response.status() + ' ' + new URL(response.url()).pathname;
        if (!observed.failedResponses.includes(issue)) observed.failedResponses.push(issue);
      }
    });
    await page.goto(origin + '/town-blockout.html?profile&b04FixedCamera', { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__b04FixedCamera, undefined, { timeout: 90000 });
    const actual = await page.evaluate(() => window.__b04FixedCamera.staged);
    assert.deepEqual(actual, side === 'staged' ? manifest.active : []);
    await page.waitForFunction(() => window.__b04FixedCamera.atlasReady(), undefined, { timeout: 90000 });
    observed.gpu = await page.locator('#scene canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl ? gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : '';
    });
    for (const shot of shots.filter(view => view.sides.includes(side))) {
      const frame = await page.evaluate(shot => Promise.race([
        window.__b04FixedCamera.capture(shot),
        new Promise((_, reject) => setTimeout(() => reject(new Error('No render at ' + shot.id + ' ' + shot.view)), 90000)),
      ]), shot);
      const { png, frames, ...camera } = frame;
      assert.deepEqual(camera.position, shot.position, shot.id + '/' + shot.view);
      assert.deepEqual([camera.width, camera.height, camera.dpr], [width, height, dpr]);
      assert.equal(frames.length, 3);
      for (const frame of frames) assert.ok(frame.every(count => Number.isInteger(count) && count > 0));
      assert.match(png, /^data:image\/png;base64,/);
      const bytes = Buffer.from(png.split(',')[1], 'base64');
      assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [width, height]);
      const basename = shot.id.replaceAll(':', '-') + '-' + shot.view + '.png';
      await writeFile(join(target, basename), bytes);
      observed.frames.push({ id: shot.id, view: shot.view, camera, frames, filename: 'frames/' + side + '/' + basename, sha256: sha256(bytes) });
    }
    assert.deepEqual(observed.exceptions, [], side + ' uncaught runtime errors');
    assert.deepEqual(observed.consoleErrors.filter(error => /THREE\.WebGLProgram|GL_INVALID|shader error/i.test(error)), [],
      side + ' uncaught graphics errors');
  } finally {
    await context.close();
  }
}

function buildPairs() {
  const frozen = evidence.passes.frozen;
  const staged = evidence.passes.staged;
  assert.ok(frozen.gpu && frozen.gpu === staged.gpu, 'Both browsers must use the same WebGL2 renderer');
  const stagedByShot = new Map(staged.frames.map(frame => [frame.id + '/' + frame.view, frame]));
  const median = (frame, metric) => frame.frames.map(values => values[metric]).sort((a, b) => a - b)[1];
  evidence.exteriorPairs = frozen.frames.map(before => {
    const after = stagedByShot.get(before.id + '/' + before.view);
    assert.ok(after);
    assert.deepEqual(after.camera, before.camera, before.id + '/' + before.view + ' camera mismatch');
    return { id: before.id, view: before.view, frozen: before.filename, staged: after.filename,
      drawDelta: median(after, 0) - median(before, 0), triangleDelta: median(after, 1) - median(before, 1) };
  });
  evidence.interiorFrames = staged.frames.filter(frame => frame.view === 'interior').length;
}

await mkdir(output);
try {
  const manifest = await deriveShotManifest(roots.frozen, roots.staged);
  await writeFile(join(output, 'shot-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  evidence.plan = {
    exteriorPairs: manifest.shots.filter(shot => shot.sides.length === 2).length,
    interiorFrames: manifest.active.length,
    requested: manifest.requested,
    active: manifest.active,
    held: manifest.held,
  };
  if (!flags.includes('--manifest-only')) {
    const dist = {};
    for (const side of Object.keys(roots)) dist[side] = await buildSide(side, manifest);
    evidence.built = true;
    if (!flags.includes('--build-only')) {
      const { chromium } = requireFrom(roots.frozen)('@playwright/test');
      browser = await chromium.launch({
        headless: true,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        ...(process.env.JX_CHROMIUM ? { executablePath: process.env.JX_CHROMIUM } : {}),
      });
      evidence.browser = browser.version();
      const sample = new Set(['old-town:137:168', 'old-town:158:184', 'old-town:179:155', 'old-town:188:65']);
      const shots = flags.includes('--sample') ? manifest.shots.filter(shot => sample.has(shot.id)) : manifest.shots;
      evidence.requestedShots = shots.length;
      for (const side of Object.keys(roots)) await captureSide(side, dist[side], manifest, shots);
      buildPairs();
    }
  }
} catch (error) {
  evidence.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const server of ports) await new Promise(accept => server.close(accept));
  await writeFile(join(output, 'capture-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  const plan = evidence.plan && {
    exteriorPairs: evidence.plan.exteriorPairs,
    interiorFrames: evidence.plan.interiorFrames,
    requested: evidence.plan.requested.length,
    active: evidence.plan.active.length,
    held: evidence.plan.held,
  };
  console.log(JSON.stringify({ plan, built: evidence.built, browser: evidence.browser,
    exteriorPairs: evidence.exteriorPairs?.length, interiorFrames: evidence.interiorFrames, failure: evidence.failure?.split('\n')[0] }));
}
