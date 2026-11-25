import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
});

await page.route('**/town-za22-cloud-route.ts*', async route => {
  const response = await route.fetch();
  const body = (await response.text()).replace(/return \{\s*scene,\s*action,\s*update,\s*updateView,/,
    'return { __enterSummit() { world ??= mountMountain(); mode = "summit"; }, scene, action, update, updateView,');
  await route.fulfill({ response, body });
});

const injection = String.raw`
const originalRender = renderer.render.bind(renderer);
const cloudRender = { frames: 0, totalMs: 0 };
renderer.render = (targetScene, targetCamera) => {
  const started = performance.now();
  originalRender(targetScene, targetCamera);
  if (targetScene === cloudRoute.scene) {
    cloudRender.frames++;
    cloudRender.totalMs += performance.now() - started;
  }
};
let cameraLock;
const lockCamera = () => {
  if (cameraLock) { camera.position.set(...cameraLock.position); camera.lookAt(...cameraLock.target); }
  requestAnimationFrame(lockCamera);
};
requestAnimationFrame(lockCamera);
window.__d2Perf = { cloudRoute, camera, renderer,
  async mount() {
    cloudRoute.__enterSummit();
    const world = cloudRoute.assembly() ? { assembly: cloudRoute.assembly(), extras: cloudRoute.extras() } : null;
    const assembly = world.assembly, extras = world.extras;
    const [{ createTownD2MainSummitCloudWall }, { createTownD2MainSummitSnowRidges },
      { createMainSummitTrail }, { northRidgeCableAnchors }, { cloudPavilionSites }, { summitAssemblyAnchor }] = await Promise.all([
      import('/tools/voxel-tavern/town-blockout/town-d2-main-summit-cloud-wall.ts'),
      import('/tools/voxel-tavern/town-blockout/town-d2-main-summit-snow-ridges.ts'),
      import('/tools/voxel-tavern/town-blockout/main-summit-trail.ts'),
      import('/tools/voxel-tavern/town-blockout/north-ridge-350-terrain.ts'),
      import('/tools/voxel-tavern/town-blockout/main-summit-pavilion-site.ts'),
      import('/tools/voxel-tavern/town-blockout/main-summit-assembly.ts'),
    ]);
    const trail = createMainSummitTrail(assembly.block.heightAt, assembly.arrivalHeight).points;
    const cable = northRidgeCableAnchors.map(([east, north]) => {
      const localEast = east - summitAssemblyAnchor.east, localNorth = north - summitAssemblyAnchor.north;
      return { east: localEast, north: localNorth, height: assembly.block.heightAt(localEast, localNorth) ?? 347 };
    });
    const pavilions = cloudPavilionSites.map(site => ({ east: site.east, north: site.north, radius: 26 }));
    const glide = extras.glideRings.map(ring => ({ east: ring.east, north: ring.north, height: ring.height }));
    const icefall = { east: extras.icefall.topAnchor.east, north: extras.icefall.topAnchor.north, radius: 22 };
    const cloud = createTownD2MainSummitCloudWall({ heightAt: assembly.block.heightAt, trailPoints: trail,
      exclusions: [{ kind: 'cable', points: cable, radius: 20 }, ...pavilions.map(item => ({ kind: 'pavilion', ...item })),
        { kind: 'icefall', ...icefall }, { kind: 'glide', points: glide, radius: 20 }] });
    const snow = createTownD2MainSummitSnowRidges({ heightAt: assembly.block.heightAt, trailPoints: trail,
      exclusions: [{ kind: 'polyline', points: cable, radius: 20, clearance: 20 },
        { kind: 'polyline', points: glide, radius: 20, clearance: 20 },
        ...pavilions.map(item => ({ kind: 'circle', ...item, clearance: 20 })),
        { kind: 'circle', ...icefall, clearance: 20 },
        { kind: 'rectangle', west: 35, east: 85, south: 960, north: 1040, clearance: 20 }] });
    assembly.group.add(cloud.group, snow.group);
    window.__d2Cloud = cloud; window.__d2Snow = snow;
    return { cloud: cloud.stats, snow: snow.stats };
  },
  pose() {
    const p = window.__d2Cloud.placements.find(item => item.family === 'cloud-wall');
    const ce = p.east - 12, cn = p.north - 18, eye = p.height - 2;
    x = 300 + ce; n = 676 + cn; ground = eye; yaw = Math.atan2(p.east - ce, p.north - cn);
    pitch = Math.atan2(p.height - eye, Math.hypot(p.east - ce, p.north - cn));
    airHeight = undefined; seated = undefined; walking = false;
    walkCurrent.set(x, ground, -n); walkPrevious.copy(walkCurrent);
    cameraLock = { position: [x, ground + 1.62, -n], target: [300 + p.east, p.height, -676 - p.north] };
    camera.position.set(...cameraLock.position);
    camera.lookAt(...cameraLock.target);
    return { east: x, north: n, ground, yaw, pitch, target: { east: 300 + p.east, north: 676 + p.north, height: p.height } };
  },
  async fps(milliseconds = 5000) {
    cloudRender.frames = 0; cloudRender.totalMs = 0;
    const frames = [], start = performance.now();
    await new Promise(resolve => {
      const tick = now => { frames.push(now); if (now - start >= milliseconds) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const elapsed = frames.at(-1) - frames[0];
    return { frames: frames.length, elapsedMs: elapsed, fps: (frames.length - 1) * 1000 / elapsed,
      firstFrameMs: frames[0], lastFrameMs: frames.at(-1),
      cloudRenderFrames: cloudRender.frames, cloudRenderTotalMs: cloudRender.totalMs,
      cloudRenderAverageMs: cloudRender.totalMs / cloudRender.frames,
      cloudRenderFps: cloudRender.frames * 1000 / cloudRender.totalMs };
  },
  info() { renderer.render(cloudRoute.scene, camera); return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
};
`;
await page.route('**/viewer.ts*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + injection });
});
await page.goto('http://127.0.0.1:3000/tools/voxel-tavern/town-blockout.html', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => Boolean(window.__d2Perf), null, { timeout: 120000 });
await page.waitForTimeout(3500);
const stats = await page.evaluate(() => window.__d2Perf.mount());
const pose = await page.evaluate(() => window.__d2Perf.pose());
await page.waitForTimeout(1000);
const info = await page.evaluate(() => window.__d2Perf.info());
const fps = await page.evaluate(() => window.__d2Perf.fps(5000));
console.log(JSON.stringify({ viewport: { width: 1280, height: 720 }, renderer: 'SwiftShader', pose, stats, info, fps, errors }, null, 2));
await browser.close();
