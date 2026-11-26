import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const [segment, evidencePath] = process.argv.slice(2);
assert.ok(['gate','north','west','supply','instrument','smelter','kengkou','gatehouse','wall','northwalk','supplyinterior','freight','shankou','outcrop','outerclusters','ore-yard','transfer-dock','ore-yard-dock','guard-shed','assembly-registration','cold-furnace','water-tower','western-clusters','eastern-cluster','western-shoulders','industrial-ruins'].includes(segment) && evidencePath,
  'Usage: node tools/verify-a-r30-native-local.mjs <segment> <evidence directory>');
const run = promisify(execFile);
const repo = fileURLToPath(new URL('../', import.meta.url));
const viewer = join(repo, 'tools', 'voxel-tavern');
const output = resolve(evidencePath);
await mkdir(output, { recursive: true });
const source = (await run('git', ['rev-parse', 'HEAD'], { cwd: repo, windowsHide: true })).stdout.trim();
const sourceTree = (await run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repo, windowsHide: true })).stdout.trim();
const lock = join(output,'.native-run-lock');
// A relay retry must not start a second production build. The evidence
// directory identifies one execution; a genuine rerun uses a new path.
try {
  await mkdir(lock);
} catch (error) {
  if(error.code==='EEXIST')throw new Error('Native evidence path already locked; inspect existing process/report before retrying: '+output);
  throw error;
}
try {
  const [oldSource,oldTree,raw]=await Promise.all(['source-commit.txt','source-tree.txt','za22-live-walk.json'].map(n=>readFile(join(output,n),'utf8')));
  const old=JSON.parse(raw);
  if(oldSource.trim()===source&&oldTree.trim()===sourceTree&&old.segment===segment&&!old.failure&&old.errors===0&&old.traversal){
    console.log(JSON.stringify({reusedCompletedEvidence:true,source,segment,output}));
    await rm(lock,{recursive:true,force:true});
    process.exit(0);
  }
} catch(error) {
  if(error.code!=='ENOENT'&&!(error instanceof SyntaxError)){
    await rm(lock,{recursive:true,force:true});
    throw error;
  }
}
await writeFile(join(lock,'pid.txt'),String(process.pid));
const temporary = await mkdtemp(join(repo, '.za22-live-proof-'));
const web = join(temporary, 'web');
const compiled = join(temporary, 'server');
const cwdRequire = createRequire(join(repo, 'package.json'));
const viewerRequire = createRequire(join(viewer, 'package.json'));
const vite = join(dirname(viewerRequire.resolve('vite/package.json')), 'bin', 'vite.js');
const tsc = join(dirname(cwdRequire.resolve('typescript/package.json')), 'bin', 'tsc');
const hardware = process.env.ZA22_HARDWARE === '1';
const installedChrome = process.platform === 'win32' ? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync) : undefined;
const chrome = process.env.CHROMIUM_PATH || installedChrome;
const host = '127.0.0.1';
const media = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json'], ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'], ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.svg', 'image/svg+xml'],
  ['.mp3', 'audio/mpeg'], ['.ogg', 'audio/ogg'], ['.wav', 'audio/wav'],
]);
let frontend;
let presence;
let driver;
const sockets = new Set();

function startNode(args, env, additional = {}) {
  return spawn(process.execPath, args, { cwd: repo, env: { ...process.env, ...env },
    windowsHide: true, stdio: 'inherit', ...additional });
}

function finish(child) {
  return new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`Node exited ${code ?? signal}`)));
  });
}

async function usePort(server) {
  await new Promise((done, reject) => server.once('error', reject).listen(0, host, done));
  return server.address().port;
}

async function freePort() {
  const reservation = createServer();
  const port = await usePort(reservation);
  await new Promise(done => reservation.close(done));
  return port;
}

function routePresence(url, ports) {
  const pathname = new URL(url, 'http://127.0.0.1').pathname;
  if (pathname === '/presence-mountain' || pathname.startsWith('/presence-mountain/'))
    return { hostname: host, port: ports.mountain, path: url.replace(/^\/presence-mountain/, '/presence') };
  if (pathname === '/presence-west' || pathname.startsWith('/presence-west/'))
    return { hostname: host, port: ports.west, path: url.replace(/^\/presence-west/, '/presence') };
  if (pathname === '/presence-sky' || pathname.startsWith('/presence-sky/'))
    return { hostname: host, port: ports.sky, path: url.replace(/^\/presence-sky/, '/presence') };
  if (pathname === '/presence' || pathname.startsWith('/presence/'))
    return { hostname: host, port: ports.town, path: url };
  return undefined;
}

function servePreview(ports, commit) {
  const server = createServer((incoming, outgoing) => {
    const route = routePresence(incoming.url, ports);
    if (route) {
      const forwarded = request({ ...route, method: incoming.method, headers: incoming.headers }, response => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      });
      forwarded.on('error', () => {
        if (!outgoing.headersSent) outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(forwarded);
      return;
    }
    const pathname = decodeURIComponent(new URL(incoming.url, 'http://127.0.0.1').pathname);
    if (pathname === '/healthz') { outgoing.end(`town-preview ${commit}`); return; }
    if (pathname === '/favicon.ico' && !existsSync(join(web, 'favicon.ico'))) { outgoing.writeHead(204).end(); return; }
    const root = pathname.startsWith('/models/') ? join(repo, 'public') : web;
    const file = resolve(root, pathname === '/' ? 'town-blockout.html' : pathname.slice(1));
    if (!file.startsWith(root + sep)) { outgoing.writeHead(404).end(); return; }
    stat(file).then(info => {
      if (!info.isFile()) { outgoing.writeHead(404).end(); return; }
      outgoing.writeHead(200, { 'content-type': media.get(extname(file)) ?? 'application/octet-stream',
        'content-length': info.size });
      if (incoming.method === 'HEAD') outgoing.end();
      else createReadStream(file).on('error', () => outgoing.destroy()).pipe(outgoing);
    }).catch(() => outgoing.writeHead(404).end());
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (incoming, downstream, head) => {
    const route = routePresence(incoming.url, ports);
    if (!route) { downstream.destroy(); return; }
    const upstream = connect(route.port, route.hostname, () => {
      const rows = [`${incoming.method} ${route.path} HTTP/${incoming.httpVersion}`];
      for (let i = 0; i < incoming.rawHeaders.length; i += 2)
        rows.push(`${incoming.rawHeaders[i]}: ${incoming.rawHeaders[i + 1]}`);
      upstream.write(rows.join('\r\n') + '\r\n\r\n');
      if (head.length) upstream.write(head);
      downstream.pipe(upstream).pipe(downstream);
    });
    upstream.on('error', () => downstream.destroy());
    downstream.on('close', () => upstream.destroy());
  });
  return server;
}

async function waitForPresence(port, child) {
  for (let attempt = 0; attempt < 120; ++attempt) {
    if (child.exitCode !== null) throw new Error(`Presence exited ${child.exitCode}`);
    const ready = await new Promise(done => {
      const socket = connect({ host, port, timeout: 1_000 });
      socket.once('connect', () => { socket.destroy(); done(true); });
      socket.once('error', () => done(false));
      socket.once('timeout', () => { socket.destroy(); done(false); });
    });
    if (ready) return;
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error('Live Presence was not ready after 30 seconds');
}

try {
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: repo, windowsHide: true });
  const commit = stdout.trim();
  await writeFile(join(output, 'source-commit.txt'), `${commit}\n`);
  const tree = (await run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repo, windowsHide: true })).stdout;
  await writeFile(join(output, 'source-tree.txt'), tree);
  await finish(startNode([vite, 'build', '--mode', 'town-preview', '--outDir', web], {}, { cwd: viewer }));
  // Presence now has a separate start.ts: compile the complete NodeNext graph,
  // not just index.ts, whose JS-suffixed dependency is otherwise left un-emitted.
  await finish(startNode([tsc, '-p', 'tsconfig.server.json', '--outDir', compiled], {}));
  const ports = { town: await freePort(), mountain: await freePort(), west: await freePort(), sky: await freePort() };
  frontend = servePreview(ports, commit);
  const port = await usePort(frontend);
  const base = `http://${host}:${port}`;
  presence = startNode([join(compiled, 'presence', 'index.js')], {
    NODE_ENV: 'production', PRESENCE_HOST: host, PRESENCE_PORT: String(ports.town),
    PRESENCE_MOUNTAIN_PORT: String(ports.mountain), PRESENCE_WEST_PORT: String(ports.west),
    PRESENCE_SKY_PORT: String(ports.sky),
    TOWN_NIGHT_SCHEDULE: JSON.stringify({
      dawnEpoch: Date.now() - 390_000, beaconOffsetsAfterDusk: Array(12).fill(60_000), cueFreshnessMs: 2_000,
    }),
    TOWN_NIGHT_BEACON_RECEIPT: join(temporary, 'town-night-beacon-receipt.json'),
  });
  await Promise.all(Object.values(ports).map(assigned => waitForPresence(assigned, presence)));
  driver = startNode(['--import','tsx',join(repo,'tools','verify-a-r30-native-walk.mjs'),base,output,segment], {
    ...(chrome ? {CHROMIUM_PATH:chrome}:{}),ZA22_HARDWARE:hardware?'1':'0',
  });
  await finish(driver);
} finally {
  for (const child of [driver, presence]) if (child?.exitCode === null) child.kill();
  for (const socket of sockets) socket.destroy();
  frontend?.close();
  try { await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
  finally { await rm(lock,{recursive:true,force:true}); }
}
