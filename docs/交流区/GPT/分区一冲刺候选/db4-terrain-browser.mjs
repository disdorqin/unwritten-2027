import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checkout = path.resolve(process.argv[2] ?? '.');
const output = path.resolve(process.argv[3] ?? 'db4-webgl-proof');
const viewerRoot = path.join(checkout, 'tools/voxel-tavern');
const options = process.argv.slice(4);
const baselineSha = process.env.DB4_BASELINE ?? '75859a094757c5dcee8b874eef86ec37f4204907';
const sourcePath = 'tools/voxel-tavern/town-blockout/terrain-mesh.ts';
const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8' });
const baseline = git('show', baselineSha + ':' + sourcePath);
const candidate = await readFile(path.join(checkout, sourcePath), 'utf8');
assert.notEqual(candidate, baseline, 'Apply the DB-4 candidate to the checkout first');
const baselineModule = path.join(viewerRoot, 'town-blockout/.db4-baseline.ts');
const requireViewer = createRequire(path.join(viewerRoot, 'package.json'));
const vitePackage = requireViewer.resolve('vite/package.json');
const { exports: viteExports } = JSON.parse(await readFile(vitePackage, 'utf8'));
const viteModule = typeof viteExports['.'] === 'string' ? viteExports['.'] : viteExports['.'].import;
const { build } = await import(pathToFileURL(path.resolve(path.dirname(vitePackage), viteModule)).href);

const entry = `
import { AmbientLight, Color, DirectionalLight, Fog, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createTerrainGrid } from '../town-blockout/terrain';
import { addTerrainMeshes as before } from '../town-blockout/.db4-baseline';
import { addTerrainMeshes as after } from '../town-blockout/terrain-mesh';

window.measureTerrain = async variant => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: false });
  if (!gl) throw new Error('WebGL2 unavailable');
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const bufferData = gl.bufferData.bind(gl);
  const uploads = [];
  gl.bufferData = (target, data, usage) => {
    const start = performance.now();
    bufferData(target, data, usage);
    uploads.push({ target, bytes: typeof data === 'number' ? data : data.byteLength,
      usage, wallMs: performance.now() - start });
  };

  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(1000, 650);
  const scene = new Scene();
  scene.background = new Color('#adc2dd');
  scene.fog = new Fog('#adc2dd', 360, 1300);
  scene.add(new AmbientLight('#8aaee5', 1.02));
  const sun = new DirectionalLight('#a9bde9', 1.45);
  sun.position.set(-90, 150, 60);
  scene.add(sun);
  const camera = new PerspectiveCamera(58, 1000 / 650, .1, 1400);
  camera.position.set(543.6, 11.893461799621578 + 1.65, -412);
  camera.lookAt(camera.position.x - 1, camera.position.y, camera.position.z);
  const prepare = (variant === 'before' ? before : after)(scene, createTerrainGrid());
  // The first outdoors render used the previous frame's tint, per viewer timing.
  prepare(543.6, 412, false, false, .020584909090909095);
  uploads.length = 0;
  const start = performance.now();
  renderer.render(scene, camera);
  const renderJsMs = performance.now() - start;
  const { calls, triangles } = renderer.info.render;
  const drawBufferUploads = uploads.filter(record => record.target === gl.ARRAY_BUFFER);
  const pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
  const pixelSha256 = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  return {
    variant, calls, triangles, renderJsMs, pixelSha256,
    bytes: drawBufferUploads.reduce((sum, record) => sum + record.bytes, 0),
    uploadCount: drawBufferUploads.length,
    uploadWallMs: drawBufferUploads.reduce((sum, record) => sum + record.wallMs, 0),
    uploads, glError: gl.getError(), glVersion: gl.getParameter(gl.VERSION),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, dpr: devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
};
`;

const fixture = await mkdtemp(path.join(viewerRoot, '.db4-webgl-'));
const bundle = path.join(output, 'bundle');
await mkdir(output, { recursive: true });
const buildInfo = { baselineSha, candidateHead: git('rev-parse', 'HEAD').trim(), candidateGitHash: git('hash-object', sourcePath).trim() };
try {
  await writeFile(path.join(fixture, 'index.html'), '<!doctype html><meta charset="UTF-8"><title>DB-4 terrain GL</title><canvas></canvas><script type="module" src="./entry.js"></script>');
  await writeFile(path.join(fixture, 'entry.js'), entry);
  await build({
    root: fixture, configFile: false, publicDir: false, base: './',
    build: { outDir: bundle, emptyOutDir: true, sourcemap: true },
    plugins: [{
      name: 'db4-original-terrain',
      resolveId(id) {
        return id === '../town-blockout/.db4-baseline' ? baselineModule : null;
      },
      load(id) {
        return id === baselineModule ? baseline : null;
      },
    }],
  });
  await writeFile(path.join(output, 'build.json'), JSON.stringify(buildInfo, null, 2) + '\n');
} finally {
  await rm(fixture, { recursive: true, force: true });
}

if (!options.includes('--build-only')) {
  const requireRoot = createRequire(path.join(checkout, 'package.json'));
  const { chromium } = requireRoot('@playwright/test');
  const measurements = [];
  const errors = [];
  for (const variant of ['before', 'after']) {
    // Separate cold browser processes make either variant independent.
    const browser = await chromium.launch({
      executablePath: process.env.DB4_CHROMIUM || undefined,
      channel: process.env.DB4_CHANNEL || undefined,
      headless: !options.includes('--headed'),
      args: options.includes('--swiftshader') ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 650 }, deviceScaleFactor: 1 });
      page.on('pageerror', error => errors.push({ variant, error: error.message }));
      page.on('console', message => {
        if (message.type() === 'error') errors.push({ variant, error: message.text() });
      });
      // The localhost hostname is intercepted entirely within the fresh browser context.
      await page.route('http://127.0.0.1/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (!/^\/(?:index\.html|assets\/[\w.-]+)$/.test(pathname)) return route.fulfill({ status: 404 });
        return route.fulfill({
          body: await readFile(path.join(bundle, pathname.slice(1))),
          contentType: pathname.endsWith('.html') ? 'text/html' : 'text/javascript',
        });
      });
      await page.goto('http://127.0.0.1/index.html');
      await page.waitForFunction(() => typeof window.measureTerrain === 'function');
      const result = await page.evaluate(name => window.measureTerrain(name), variant);
      measurements.push({ ...result, browser: browser.version() });
      await page.screenshot({ path: path.join(output, variant + '.png') });
    } finally {
      await browser.close();
    }
  }
  await writeFile(path.join(output, 'raw-webgl.json'), JSON.stringify({ ...buildInfo, measurements, errors }, null, 2) + '\n');
  const [before, after] = measurements;
  assert.deepEqual(errors, []);
  for (const result of measurements) {
    assert.deepEqual([result.glError, result.calls, result.triangles, result.width, result.height, result.dpr],
      [0, 33, 270336, 1000, 650, 1]);
    assert.match(result.glVersion, /WebGL 2/);
  }
  assert.deepEqual([before.uploadCount, before.bytes, after.uploadCount, after.bytes], [4, 76723200, 132, 30007296]);
  assert.equal(after.pixelSha256, before.pixelSha256);
  console.log(JSON.stringify({ before: { calls: before.calls, triangles: before.triangles, bytes: before.bytes },
    after: { calls: after.calls, triangles: after.triangles, bytes: after.bytes }, renderer: after.renderer, pixelsEqual: true }));
}
