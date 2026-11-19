import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [barePath, atlasPath, outputPath, mode] = process.argv.slice(2);
assert.ok(barePath && atlasPath && outputPath && (!mode || mode === '--build-only'),
  'Usage: node compare-market-homes.mjs BARE_ROOT ATLAS_ROOT NEW_OUTPUT_DIR [--build-only]');
const roots = { bare: resolve(barePath), atlas: resolve(atlasPath) };
const output = resolve(outputPath);
const projectHtml = 'tools/voxel-tavern/jx1-market-homes.html';
const routePath = 'tools/voxel-tavern/town-blockout/market-homes-review-routes.json';
const reviewFile = 'tools/voxel-tavern/town-blockout/market-homes-review.ts';
const angles = ['street', 'north', 'east', 'south', 'west', 'interior'];
const viewport = { width: 1000, height: 650 };
const manifest = { viewport, dpr: 1, source: {}, sides: {}, pairs: [] };
const hash = content => createHash('sha256').update(content).digest('hex');

function exists(path) {
  return stat(path).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
}

assert.notEqual(roots.bare, roots.atlas, 'Pass two separate input trees');
for (const root of Object.values(roots)) {
  const subpath = relative(root, output);
  assert.ok(subpath === '..' || subpath.startsWith('..' + sep),
    'Write the proof beside and outside both input trees');
}
const routeManifest = await readFile(join(roots.bare, routePath));
assert.deepEqual(await readFile(join(roots.atlas, routePath)), routeManifest);
const ids = Object.keys(JSON.parse(routeManifest));
assert.equal(ids.length, 17, 'Surveyed route manifest must name 17 homes');
manifest.routesSha256 = hash(routeManifest);
const atlasFile = 'tools/voxel-tavern/town-blockout/market-home-atlas.ts';
assert.equal(await exists(join(roots.bare, atlasFile)), false, 'The baseline must use bare materials');
assert.equal(await exists(join(roots.atlas, atlasFile)), true, 'The variant must include the atlas module');
await mkdir(output);

const writeRecord = () => writeFile(join(output, 'paired-market-homes.json'), JSON.stringify(manifest, null, 2) + '\n');
const requireFrom = root => createRequire(join(root, 'package.json'));
const chromiumArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function buildSide(label, root) {
  const require = requireFrom(root);
  const vite = await import(pathToFileURL(require.resolve('vite')).href);
  const outDir = join(output, label);
  const anchor = '    camera: camera.position.toArray(),';
  let inserted = false;
  // Add matching diagnostics to the bundled preview only. Keep both inputs unchanged.
  await vite.build({
    root,
    base: './',
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    plugins: [{
      name: 'jx1-preview-camera-inspection',
      enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/' + reviewFile)) return null;
        assert.ok(!inserted && code.split(anchor).length === 2, 'Camera probe must match exactly once in ' + label);
        inserted = true;
        return {
          code: code.replace(anchor, anchor + `
    proof: {
      quaternion: camera.quaternion.toArray(),
      projection: camera.projectionMatrix.toArray(),
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      dpr: renderer.getPixelRatio(),
    },`),
          map: null,
        };
      },
    }],
    build: { outDir, emptyOutDir: false, reportCompressedSize: false, rollupOptions: { input: join(root, projectHtml) } },
  });
  assert.ok(inserted, 'Camera probe was not added to ' + label);
  assert.ok(await exists(join(outDir, projectHtml)), 'Vite did not produce the preview HTML for ' + label);
  manifest.source[label] = {
    reviewSha256: hash(await readFile(join(root, reviewFile))),
    interiorSha256: hash(await readFile(join(root, 'tools/voxel-tavern/town-blockout/market-home-interior.ts'))),
    ...(label === 'atlas' ? { atlasSha256: hash(await readFile(join(root, atlasFile))) } : {}),
  };
}

async function staticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname === '/favicon.ico') return response.writeHead(204).end();
      const local = /^\/(bare|atlas)\/([-\w/.]+)$/.exec(pathname);
      if (!local || local[2].split('/').some(name => name === '..')) return response.writeHead(404).end();
      const file = join(output, local[1], local[2]);
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(data);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return server;
}

async function readSide(browser, origin, label) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: manifest.dpr, reducedMotion: 'reduce' });
  const observations = { errors: [], warnings: [], frames: [] };
  manifest.sides[label] = observations;
  try {
    await context.route('**/*', route => {
      const url = route.request().url();
      return url.startsWith(origin + '/') || url.startsWith('data:') ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('pageerror', error => observations.errors.push(error.message));
    page.on('requestfailed', request => observations.errors.push(request.url() + ': ' + request.failure()?.errorText));
    page.on('response', response => {
      if (response.status() >= 400) observations.errors.push(response.status() + ' ' + response.url());
    });
    page.on('console', message => {
      if (message.type() === 'error') observations.errors.push(message.text());
      if (message.type() === 'warning') observations.warnings.push(message.text());
    });
    const response = await page.goto(origin + '/' + label + '/' + projectHtml, { waitUntil: 'load', timeout: 60000 });
    assert.equal(response?.status(), 200, 'Preview did not load for ' + label);
    await page.waitForFunction(() => window.__marketHomesReview?.stats()?.draws > 0, undefined, { timeout: 60000 });
    assert.deepEqual(await page.evaluate(() => [...window.__marketHomesReview.ids].sort()), [...ids].sort());
    observations.webgl = await page.locator('#market-review-viewport canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2');
      if (!gl) return null;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        version: gl.getParameter(gl.VERSION),
        vendor: gl.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
        renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      };
    });
    assert.ok(observations.webgl, 'A WebGL2 renderer is required');
    const shots = join(output, 'frames', label);
    await mkdir(shots, { recursive: true });
    for (const id of ids) {
      await page.evaluate(id => window.__marketHomesReview.select(id), id);
      for (const angle of angles) {
        const frame = await page.evaluate(async angle => {
          const review = window.__marketHomesReview;
          review.capture(angle);
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          const snapshot = review.snapshot();
          const canvas = document.querySelector('#market-review-viewport canvas');
          return { ...snapshot, png: canvas.toDataURL('image/png') };
        }, angle);
        assert.equal(frame.id, id);
        assert.equal(frame.current.angle, angle);
        assert.ok(Number.isInteger(frame.current.draws) && frame.current.draws > 0);
        assert.ok(Number.isInteger(frame.current.triangles) && frame.current.triangles > 0);
        assert.match(frame.png, /^data:image\/png;base64,/);
        const bytes = Buffer.from(frame.png.split(',')[1], 'base64');
        delete frame.png;
        assert.ok(bytes.length > 100, 'Rendered PNG is too short');
        const file = id.replaceAll(':', '-') + '-' + angle + '.png';
        await writeFile(join(shots, file), bytes);
        observations.frames.push({ ...frame, file: 'frames/' + label + '/' + file, pngSha256: hash(bytes) });
      }
    }
    assert.deepEqual(observations.errors, [], 'Browser or loopback errors in ' + label);
  } finally {
    await context.close();
  }
}

function pairedResults() {
  const { bare, atlas } = manifest.sides;
  assert.deepEqual(atlas.webgl, bare.webgl, 'Comparison must use the same WebGL renderer');
  assert.equal(bare.frames.length, 102);
  assert.equal(atlas.frames.length, 102);
  for (let i = 0; i < bare.frames.length; i++) {
    const left = bare.frames[i];
    const right = atlas.frames[i];
    const a = left.current;
    const b = right.current;
    const camera = state => ({ position: state.camera, angle: state.angle, ...state.proof });
    assert.deepEqual(camera(b), camera(a), 'Camera or output size changed: ' + left.id + ' ' + a.angle);
    for (const key of ['id', 'portal', 'footprint', 'lot', 'card', 'room']) {
      assert.deepEqual(right[key], left[key], 'House geometry identity changed: ' + left.id + ' ' + key);
    }
    assert.equal(a.proof.dpr, manifest.dpr);
    assert.ok(a.proof.width > 0 && a.proof.height > 0);
    manifest.pairs.push({
      id: left.id,
      angle: a.angle,
      camera: camera(a),
      before: { draws: a.draws, triangles: a.triangles, file: left.file },
      after: { draws: b.draws, triangles: b.triangles, file: right.file },
      deltaDraws: b.draws - a.draws,
      deltaTriangles: b.triangles - a.triangles,
      samePng: left.pngSha256 === right.pngSha256,
    });
  }
  const exterior = manifest.pairs.filter(pair => pair.angle !== 'interior');
  const interior = manifest.pairs.filter(pair => pair.angle === 'interior');
  manifest.summary = {
    exteriorPairs: exterior.length,
    interiorPairs: interior.length,
    exteriorDrawOrTriangleChanges: exterior.filter(pair => pair.deltaDraws || pair.deltaTriangles).length,
    exteriorPngChanges: exterior.filter(pair => !pair.samePng).length,
    interiorPngChanges: interior.filter(pair => !pair.samePng).length,
    interiorDrawDeltaRange: [
      Math.min(...interior.map(pair => pair.deltaDraws)),
      Math.max(...interior.map(pair => pair.deltaDraws)),
    ],
    interiorTriangleDeltaRange: [
      Math.min(...interior.map(pair => pair.deltaTriangles)),
      Math.max(...interior.map(pair => pair.deltaTriangles)),
    ],
  };
  assert.equal(manifest.summary.exteriorDrawOrTriangleChanges, 0, 'Interior materials changed exterior draw or triangle counts');
  assert.equal(manifest.summary.interiorPngChanges, 17, 'All 17 rooms should show the atlas and lighting change');
}

async function writeReviewPage() {
  const template = await readFile(new URL('./paired-review.html', import.meta.url), 'utf8');
  const pairs = JSON.stringify(manifest.pairs).replaceAll('<', '\\u003c');
  await writeFile(join(output, 'index.html'), template.replace('__JX1_PAIRED_FRAMES__', () => pairs));
}

let server;
let browser;
try {
  for (const [label, root] of Object.entries(roots)) await buildSide(label, root);
  if (mode === '--build-only') {
    manifest.buildOnly = true;
  } else {
    server = await staticServer();
    const { chromium } = requireFrom(roots.bare)('@playwright/test');
    browser = await chromium.launch({ headless: true, args: chromiumArgs,
      ...(process.env.JX_CHROMIUM ? { executablePath: process.env.JX_CHROMIUM } : {}) });
    manifest.browser = browser.version();
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (const label of Object.keys(roots)) await readSide(browser, origin, label);
    pairedResults();
    await writeReviewPage();
  }
} catch (error) {
  manifest.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise(accept => server.close(accept));
  await writeRecord();
  if (process.env.GITHUB_STEP_SUMMARY && manifest.summary) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, '# JX-1 paired material preview\n\n' +
      '\`\`\`json\n' + JSON.stringify(manifest.summary, null, 2) + '\n\`\`\`\n');
  }
  console.log(JSON.stringify({ output: basename(output), buildOnly: manifest.buildOnly,
    browser: manifest.browser, summary: manifest.summary, failure: manifest.failure?.split('\n')[0] }));
}
