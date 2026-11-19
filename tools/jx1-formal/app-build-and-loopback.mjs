import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ordinaryClock = '2026-11-20T14:15:00+08:00';
const swiftShader = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

async function build(checkout, dist, makeProbe) {
  const root = path.join(checkout, 'tools', 'voxel-tavern');
  const viewer = path.join(root, 'town-blockout', 'viewer.ts');
  const source = await readFile(viewer, 'utf8');
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
      name: 'jx1-production-loopback-fixture',
      enforce: 'pre',
      transform(code, id) {
        if (path.resolve(id) !== viewer) return null;
        injections++;
        return { code: makeProbe(code), map: null };
      },
    }],
  });
  assert.equal(injections, 1, 'Expected one viewer fixture in the build');
  assert.equal(await readFile(viewer, 'utf8'), source, 'Viewer source changed on disk');
}

export { build, serve, swiftShader };

async function loadPresence(checkout, resolvePackage) {
  resolvePackage('tsx/esm/api').register();
  const load = file => import(pathToFileURL(path.join(checkout, 'src', 'presence', file)).href);
  const [{ createPresenceServer }, { createRehearsalClockEndpoint }, { townCeremonyMidnight }] = await Promise.all([
    load('server.ts'), load('rehearsal-clock.ts'), load('ceremony-arrival.ts'),
  ]);
  const clock = createRehearsalClockEndpoint(ordinaryClock);
  return { createPresenceServer, clock, ceremonyStartAt: townCeremonyMidnight - clock.offsetMs };
}

async function serve(checkout, dist, resolvePackage, connectionLogs) {
  const { createPresenceServer, clock, ceremonyStartAt } = await loadPresence(checkout, resolvePackage);
  const requestListener = async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/presence/rehearsal-clock') {
        return clock(request, response);
      }
      if (!dist) return response.writeHead(404).end();
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
  };
  const server = await createPresenceServer({
    host: '127.0.0.1', port: 0, requestListener, ceremonyStartAt,
    connectionLog: line => connectionLogs.push(JSON.parse(line)),
  });
  assert.equal(server.address().address, '127.0.0.1');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
