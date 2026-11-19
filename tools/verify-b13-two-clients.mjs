import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build, height, near, serveClientAsset, swiftShader, timeoutMs, width } from './b13-browser-fixture.mjs';

const doorIds = ['district:513:366', 'district:550:412'];
const ordinaryClock = '2026-11-20T14:15:00+08:00';
const names = ['B13 甲', 'B13 乙'];
const enterLabel = '进入屋舍空间';
const returnLabel = '出门 · 返回来时的屋门';
const runtimeFiles = [
  'src/presence/server.ts',
  'src/presence/shared-home-space.ts',
  'tools/voxel-tavern/town-blockout/viewer.ts',
  'tools/voxel-tavern/town-blockout/town-presence.ts',
];
const fixture = `
if (import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
    new URLSearchParams(location.search).has('b13TwoClients')) {
  let stageUsed = false;
  let frames = 0;
  let lastFrame: { calls: number; triangles: number; cameraY: number } | undefined;
  let lastAvatarRender = 0;
  let watchingAvatars = false;
  renderer.domElement.addEventListener('town-frame-profile', event => {
    frames++;
    lastFrame = (event as CustomEvent).detail;
    const avatars = scene.getObjectByName('town-presence-avatars');
    if (avatars && !watchingAvatars) {
      watchingAvatars = true;
      const original = avatars.onAfterRender;
      avatars.onAfterRender = (...args) => {
        original.apply(avatars, args);
        if (args[2] === camera) lastAvatarRender = frames + 1;
      };
    }
  });
  Object.defineProperty(window, '__b13TwoClients', { value: {
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
    // Frame the real remote avatar for screenshots without moving either player.
    facePeer(id: number) {
      const peer = presence.getSnowballPeers().find(other => other.id === id);
      if (!peer || !homeReturn || houseDoorTravel || !walking) throw new Error('No shared-room peer to frame');
      yaw = Math.atan2(peer.east - x, peer.north - n);
      pitch = -.15;
    },
    sample() {
      const avatars = scene.getObjectByName('town-presence-avatars') as InstancedMesh | undefined;
      return {
        east: x, north: n, ground, yaw, walking, home: homeReturn?.id ?? null,
        travelling: houseDoorTravel, mask: camera.layers.mask, frames, lastFrame, lastAvatarRender,
        avatarParts: avatars?.visible ? avatars.count : 0,
        selfId: presence.selfId(), name: presence.playerName(),
        peers: presence.getSnowballPeers().map(({ id, name, east, north, height, yaw }) =>
          ({ id, name, east, north, height, yaw })),
        action: actionButton.hidden ? '' : actionButton.textContent,
      };
    },
  } });
}
`;

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
      await serveClientAsset(checkout, dist, pathname, response);
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

async function readFrame(page, required) {
  return (await page.waitForFunction((condition) => {
    const pose = window.__b13TwoClients?.sample();
    if (!pose || !pose.walking || pose.travelling || !pose.lastFrame?.calls || !pose.lastFrame?.triangles) return;
    if (pose.frames <= (condition.after ?? 0)) return;
    if ('home' in condition && pose.home !== condition.home) return;
    if ('mask' in condition && pose.mask !== condition.mask) return;
    if ('selfId' in condition && pose.selfId !== condition.selfId) return;
    if (condition.joined && !pose.selfId) return;
    if (condition.noPeer && pose.peers.some(peer => peer.id === condition.noPeer)) return;
    if (condition.peer && (pose.peers.length !== 1 || !pose.peers.some(peer =>
      peer.id === condition.peer.id && peer.name === condition.peer.name &&
      Math.hypot(peer.east - condition.peer.east, peer.north - condition.peer.north) <= .2 &&
      Math.abs(peer.height - condition.peer.ground) <= .03))) return;
    if (condition.avatar && !(pose.avatarParts > 0 && pose.lastAvatarRender === pose.frames)) return;
    if (condition.minNorth !== undefined && pose.north < condition.minNorth) return;
    if (condition.action && !pose.action?.includes(condition.action)) return;
    return pose;
  }, required, { timeout: timeoutMs })).jsonValue();
}

async function saveScreenshot(page, output, result, state) {
  const filename = `${result.id.replaceAll(':', '-')}-${state}.png`;
  const png = await page.screenshot({ path: path.join(output, filename), animations: 'disabled', timeout: timeoutMs });
  assert.ok(png.length > 10_000, `${state} screenshot is too small to contain a rendered scene`);
  result.screenshots[state] = filename;
}

async function startClient(browser, url, result) {
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
  page.on('websocket', socket => {
    if (socket.url() !== url.replace(/^http/, 'ws') + '/presence') return;
    socket.on('framereceived', ({ payload }) => {
      if (Buffer.isBuffer(payload) && payload.length === 1 + payload[0] * 12) result.wire.snapshots++;
      if (typeof payload === 'string') {
        const message = JSON.parse(payload);
        if (message.type === 'join' && message.self) result.wire.joinIds.push(message.id);
      }
    });
    socket.on('framesent', ({ payload }) => {
      if (Buffer.isBuffer(payload) && payload.length === 12) result.wire.poses++;
    });
  });
  await page.addInitScript(name => {
    localStorage.setItem('unwritten.presence.name.v1', name);
    window.__b13DoorKeys = [];
    addEventListener('keydown', event => {
      if (['KeyE', 'KeyW', 'KeyS'].includes(event.code)) {
        window.__b13DoorKeys.push({ code: event.code, trusted: event.isTrusted, repeat: event.repeat });
      }
    });
  }, result.name);
  try {
    const response = await page.goto(`${url}/town-blockout.html?profile&b13TwoClients`, {
      waitUntil: 'domcontentloaded', timeout: timeoutMs,
    });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => Boolean(window.__b13TwoClients), null, { timeout: timeoutMs });
    await page.locator('#jump').selectOption({ label: '东北纪念馆' });
    const outdoors = await readFrame(page, { home: null, mask: 1, joined: true });
    const door = await page.evaluate(id => window.__b13TwoClients.stage(id), result.id);
    result.door = door;
    result.approach = await readFrame(page, {
      after: outdoors.frames, home: null, mask: 1, selfId: outdoors.selfId, action: enterLabel,
    });
    near(result.approach.east, door.x, .05, 'Approach east');
    near(result.approach.north, door.n, .05, 'Approach north');
    assert.equal(result.approach.name, result.name);
    return { context, page, result };
  } catch (error) {
    result.lastObserved = await page.evaluate(() => window.__b13TwoClients?.sample()).catch(() => null);
    await context.close();
    throw error;
  }
}

function peerOf(frame) {
  return { id: frame.selfId, name: frame.name, east: frame.east, north: frame.north, ground: frame.ground };
}

function roomCondition(client, extra = {}) {
  return { home: client.result.id, mask: 2, selfId: client.result.approach.selfId, ...extra };
}

async function enter(client) {
  const { page, result } = client;
  await page.bringToFront();
  await page.keyboard.press('e');
  result.inside = await readFrame(page, roomCondition(client, { after: result.approach.frames }));
  near(result.inside.east, 625.18, .05, 'Shared-room spawn east');
  near(result.inside.north, 493.64, .05, 'Shared-room spawn north');
  near(result.inside.ground, 150, .01, 'Shared-room ground');
}

async function walkWhile(client, key, condition) {
  const { page } = client;
  await page.bringToFront();
  await page.keyboard.down(key);
  try {
    return await readFrame(page, roomCondition(client, condition));
  } finally {
    await page.keyboard.up(key);
  }
}

async function frameRemote(client, other, output) {
  const { page, result } = client;
  await page.bringToFront();
  const condition = roomCondition(client, { peer: peerOf(other.result.spread) });
  const synchronized = await readFrame(page, condition);
  await page.evaluate(id => window.__b13TwoClients.facePeer(id), other.result.approach.selfId);
  result.mutual = await readFrame(page, { ...condition, after: synchronized.frames + 2, avatar: true });
  const nameplate = page.locator('.town-presence-nameplate').filter({ hasText: other.result.name });
  await nameplate.waitFor({ state: 'visible', timeout: timeoutMs });
  await saveScreenshot(page, output, result, 'mutual');
}

async function returnOriginal(client, key, output) {
  const { page, result } = client;
  const { door, approach, mutual } = result;
  const threshold = await walkWhile(client, key, { after: mutual.frames, action: returnLabel });
  result.threshold = threshold;
  assert.ok(threshold.north < mutual.north - .15, 'Keyboard input moved toward the shared-room exit');
  await page.keyboard.press('e');
  const returned = await readFrame(page, { after: threshold.frames + 2, home: null, mask: 1, selfId: approach.selfId });
  result.returned = returned;
  near(returned.east, door.x, 1e-6, 'Original door return east');
  near(returned.north, door.n, 1e-6, 'Original door return north');
  near(returned.ground, approach.ground, 1e-6, 'Original door return resolved ground');
  near(Math.atan2(Math.sin(returned.yaw - door.exitYaw), Math.cos(returned.yaw - door.exitYaw)),
    0, 1e-6, 'Original door outward yaw');
  await saveScreenshot(page, output, result, 'returned');
  result.input = await page.evaluate(() => window.__b13DoorKeys);
  const keys = result.input.filter(event => !event.repeat);
  assert.deepEqual(keys.map(event => event.code), key === 'w' ? ['KeyE', 'KeyW', 'KeyW', 'KeyE'] : ['KeyE', 'KeyS', 'KeyE']);
  assert.ok(keys.every(event => event.trusted), 'Entry, separation, walk and return inputs must be trusted');
  assert.deepEqual(result.wire.joinIds, [approach.selfId], 'The browser must join only once over WebSocket');
  assert.ok(result.wire.poses > 0 && result.wire.snapshots > 0, 'The browser must exchange binary pose and snapshot frames');
  assert.deepEqual(result.errors, [], 'Viewer raised errors');
}

async function checkBrowser(browser, url, output, evidence) {
  const clients = [];
  try {
    for (const [index, id] of doorIds.entries()) {
      evidence.step = `join-${id}`;
      const result = { id, name: names[index], screenshots: {}, errors: [], wire: { joinIds: [], poses: 0, snapshots: 0 } };
      evidence.results.push(result);
      clients.push(await startClient(browser, url, result));
    }
    const [alpha, beta] = clients;
    const alphaId = alpha.result.approach.selfId;
    const betaId = beta.result.approach.selfId;
    assert.notEqual(alphaId, betaId, 'The two contexts must hold distinct server sessions');

    evidence.step = 'enter-different-doors';
    await enter(alpha);
    await enter(beta);
    evidence.step = 'separate-in-the-same-room';
    await walkWhile(alpha, 'w', { after: alpha.result.inside.frames, minNorth: alpha.result.inside.north + 2.4 });
    alpha.result.spread = await readFrame(alpha.page, roomCondition(alpha, { after: alpha.result.inside.frames + 3 }));
    await beta.page.bringToFront();
    beta.result.spread = await readFrame(beta.page, roomCondition(beta));
    assert.ok(alpha.result.spread.north - beta.result.spread.north >= 2.3);

    evidence.step = 'reciprocal-live-avatars';
    await frameRemote(alpha, beta, output);
    await frameRemote(beta, alpha, output);
    evidence.step = 'return-alpha';
    await returnOriginal(alpha, 'w', output); // Alpha's proof camera faces south.
    const alphaOut = await readFrame(alpha.page, { home: null, mask: 1, selfId: alphaId, noPeer: betaId });
    await beta.page.bringToFront();
    const betaIn = await readFrame(beta.page, roomCondition(beta, { after: beta.result.mutual.frames, noPeer: alphaId }));
    evidence.roomBoundary = { alphaOut, betaIn };
    evidence.step = 'return-beta';
    await returnOriginal(beta, 's', output); // Beta's proof camera faces north.
    evidence.step = 'synchronize-both-original-doors';
    evidence.outdoorReturns = [];
    for (const [client, other] of [[alpha, beta], [beta, alpha]]) {
      await client.page.bringToFront();
      evidence.outdoorReturns.push(await readFrame(client.page, {
        after: client.result.returned.frames, home: null, mask: 1, selfId: client.result.approach.selfId,
        peer: peerOf(other.result.returned),
      }));
    }
    evidence.step = 'passed';
  } finally {
    if (evidence.step !== 'passed') {
      for (const { page, result } of clients) {
        result.lastObserved = await page.evaluate(() => ({
          pose: window.__b13TwoClients?.sample(), input: window.__b13DoorKeys,
        })).catch(() => null);
      }
    }
    for (const { context } of clients) await context.close();
  }
}

async function transportInputs(checkout, resolvePackage) {
  const load = relative => import(pathToFileURL(path.join(checkout, relative)).href);
  const town = file => load(`tools/voxel-tavern/town-blockout/${file}.ts`);
  const viewerRequire = createRequire(path.join(checkout, 'tools', 'voxel-tavern', 'package.json'));
  const { Group } = viewerRequire('three');
  const [{ createTerrainGrid }, { buildPineCamp }, { createTownRailway }, { addScenery }, { addDistrictHousing },
    { buildExtensionStreets }, { sharedHomeSpawn }, motion, { isSharedHomePosition }] = await Promise.all([
    town('terrain'), town('town-pine-camp'), town('town-railway'), town('scenery'), town('district-layout'),
    town('extension-streets'), town('landmark-shared-home'), town('town-presence-motion'), load('src/presence/shared-home-space.ts'),
  ]);
  const landscape = new Group();
  const grid = createTerrainGrid();
  const pine = buildPineCamp(grid);
  const railway = createTownRailway(grid, () => 0);
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    }) }) },
  });
  let scenery;
  try {
    scenery = addScenery(landscape, grid, pine.keepClear);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
  const districts = addDistrictHousing(landscape, grid, scenery.blocked, railway.keepClear);
  const extensions = buildExtensionStreets(grid, railway.keepClear, districts.keepClear);
  const doors = doorIds.map(id => {
    const door = extensions.housePortals.find(portal => portal.id === id);
    assert.ok(door, `Production registry lacks ${id}`);
    return door;
  });
  const { WebSocket } = resolvePackage('ws');
  return { doors, WebSocket, sharedHomeSpawn, isSharedHomePosition, ...motion };
}

async function joinTransport(url, name, transport) {
  const { WebSocket, visitPresenceSnapshot, writePresencePose, presenceRecordBytes } = transport;
  const socket = new WebSocket(url.replace(/^http/, 'ws') + '/presence', { origin: url });
  const snapshots = [];
  let sequence = 0;
  const controls = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} join timed out`)), 7000);
    socket.once('error', error => { clearTimeout(timer); reject(error); });
    socket.on('message', (data, binary) => {
      if (!binary) {
        const message = JSON.parse(data.toString());
        if (message.type === 'join' && message.self) {
          clearTimeout(timer);
          resolve(message);
        }
        return;
      }
      const snapshot = [];
      if (visitPresenceSnapshot(data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
        (id, east, north, height, yaw, seq) => snapshot.push({ id, east, north, height, yaw, seq }))) snapshots.push(snapshot);
    });
  });
  socket.once('open', () => socket.send(JSON.stringify({ type: 'join', name })));
  try {
    const joined = await controls;
    assert.equal(joined.name, name);
    return { socket, snapshots, id: joined.id, send(pose) {
      const bytes = new DataView(new ArrayBuffer(presenceRecordBytes));
      writePresencePose(pose, ++sequence, bytes);
      socket.send(bytes.buffer);
    } };
  } catch (error) {
    socket.terminate();
    throw error;
  }
}

async function waitForSnapshot(client, after, predicate, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = client.snapshots.slice(after).find(predicate);
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`${label} snapshot timed out; got ${JSON.stringify(client.snapshots.slice(after))}`);
}

async function checkTransport(checkout, resolvePackage, url, evidence) {
  const transport = await transportInputs(checkout, resolvePackage);
  const { doors, sharedHomeSpawn, isSharedHomePosition } = transport;
  const clients = [];
  const poseAtDoor = door => ({ east: door.x, north: door.n, height: door.ground, yaw: door.exitYaw });
  const stands = doors.map(poseAtDoor);
  const room = { east: sharedHomeSpawn.x, north: sharedHomeSpawn.n, height: sharedHomeSpawn.ground, yaw: sharedHomeSpawn.yaw };
  const rooms = [{ ...room, north: room.north + 2.4 }, room];
  const equalPose = (a, b) => Math.hypot(a.east - b.east, a.north - b.north, a.height - b.height) <= .01 &&
    Math.abs(Math.atan2(Math.sin(a.yaw - b.yaw), Math.cos(a.yaw - b.yaw))) <= .0001;
  const pairing = (left, right, poses, label) => Promise.all([
    waitForSnapshot(left, left.snapshots.length, rows => rows.some(row => row.id === right.id && equalPose(row, poses[1])), `${label} left`),
    waitForSnapshot(right, right.snapshots.length, rows => rows.some(row => row.id === left.id && equalPose(row, poses[0])), `${label} right`),
  ]);
  assert.ok(rooms.every(pose => isSharedHomePosition(pose.east, pose.north, pose.height)));
  assert.ok(stands.every(pose => !isSharedHomePosition(pose.east, pose.north, pose.height)));
  evidence.doors = doors;
  evidence.transport = { checkpoints: {} };
  try {
    for (const name of names) clients.push(await joinTransport(url, name, transport));
    const [alpha, beta] = clients;
    assert.notEqual(alpha.id, beta.id);
    evidence.transport.sessions = clients.map(({ id }, index) => ({ id, name: names[index] }));
    async function moveTogether(poses, label) {
      const frames = pairing(alpha, beta, poses, label);
      clients.forEach((client, index) => client.send(poses[index]));
      evidence.transport.checkpoints[label] = await frames;
    }
    await moveTogether(stands, 'distinct-door-poses');
    await moveTogether(rooms, 'shared-room-reciprocal-poses');
    const separated = Promise.all([
      waitForSnapshot(alpha, alpha.snapshots.length, rows => rows.length === 0, 'alpha outdoors visibility'),
      waitForSnapshot(beta, beta.snapshots.length, rows => rows.length === 0, 'beta indoors visibility'),
    ]);
    alpha.send(stands[0]);
    evidence.transport.checkpoints['one-client-outside'] = await separated;
    await moveTogether(stands, 'distinct-original-door-poses');
  } finally {
    for (const client of clients) client.socket.close();
    await Promise.all(clients.map(client => once(client.socket, 'close', { signal: AbortSignal.timeout(3000) })));
  }
}

const [sourcePath, outputPath, option] = process.argv.slice(2);
assert.ok(sourcePath && outputPath && [undefined, '--build-only', '--transport-only'].includes(option),
  'Usage: node verify-b13-two-clients.mjs CHECKOUT OUTPUT_DIR [--build-only|--transport-only]');
const checkout = path.resolve(sourcePath);
const output = path.resolve(outputPath);
const temporary = await mkdtemp(path.join(tmpdir(), 'town-b13-two-clients-'));
const resolvePackage = createRequire(path.join(checkout, 'package.json'));
let browser;
let server;
const evidence = {
  status: 'starting', mode: option ?? 'browser', clock: ordinaryClock,
  runtimeCommit: process.env.B13_RUNTIME_COMMIT ?? null, browser: null,
  viewport: { width, height, dpr: 1 }, results: [], connectionLogs: [],
};
await mkdir(output, { recursive: true });
try {
  evidence.runtimeBlobs = Object.fromEntries(await Promise.all(runtimeFiles.map(async file => {
    const bytes = await readFile(path.join(checkout, file));
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    return [file, sha];
  })));
  const dist = option === '--transport-only' ? null : path.join(temporary, 'dist');
  if (dist) {
    evidence.step = 'build-rehearsal-viewer';
    await build(checkout, dist, fixture);
  }
  if (option === '--build-only') {
    evidence.status = 'build-only';
    console.log('Rehearsal viewer build and unchanged source verified.');
  } else {
    evidence.step = 'serve-loopback-production-presence';
    const started = await serve(checkout, dist, resolvePackage, evidence.connectionLogs);
    server = started.server;
    if (option === '--transport-only') {
      evidence.step = 'two-websocket-clients';
      await checkTransport(checkout, resolvePackage, started.url, evidence);
      evidence.status = 'transport-passed';
      evidence.step = 'passed';
      console.log('Two real WebSocket clients exchanged original-door and shared-room poses.');
    } else {
      evidence.step = 'launch-browser';
      const { chromium } = resolvePackage('@playwright/test');
      browser = await chromium.launch({ args: swiftShader, executablePath: process.env.B13_CHROMIUM_PATH });
      evidence.browser = browser.version();
      await checkBrowser(browser, started.url, output, evidence);
      evidence.status = 'browser-passed';
      console.log('Two Chromium clients saw each other in the shared room and each walked out through its own door.');
    }
    const joins = evidence.connectionLogs.filter(log => log.step === 'join' && log.result === 'ok');
    assert.equal(joins.length, 2);
    assert.ok(joins.every(log => log.transport === 'ws'));
    assert.notEqual(joins[0].peer, joins[1].peer);
  }
} catch (error) {
  evidence.status = 'failed';
  evidence.failure = error.message;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  try {
    if (browser) await browser.close();
    if (server) await server.close();
  } finally {
    await writeFile(path.join(output, 'b13-two-clients.json'), JSON.stringify(evidence, null, 2) + '\n');
    await rm(temporary, { recursive: true, force: true });
  }
}
