import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
      sharedRoomVisible: Boolean(sharedHome?.visible),
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
      name: 'b13-loopback-fixture',
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
    if ('westOf' in condition && pose.east >= condition.westOf) return;
    return pose;
  }, required, { timeout: timeoutMs })).jsonValue();
}

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual}, expected ${expected} ±${tolerance}`);
}

export { build, near, ordinaryClock, readFrame, serve, swiftShader, timeoutMs, width, height };
