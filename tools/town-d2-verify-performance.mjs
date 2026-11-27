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

try {
  // Expose only a test entry. The production route still mounts its mountain
  // through mountMainSummitAssembly() with no test-specific layers or options.
  await page.route('**/town-za22-cloud-route.ts*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/return \{\s*scene,\s*action,\s*update,\s*updateView,/,
      'return { __enterSummit() { world ??= mountMountain(); mode = "summit"; }, scene, action, update, updateView,');
    await route.fulfill({ response, body });
  });

  const injection = String.raw`
const originalRender = renderer.render.bind(renderer);
const cloudRender = { frames: 0, totalMs: 0 };
let cameraLock;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const visibleInHierarchy = object => {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
};
renderer.render = (targetScene, targetCamera) => {
  // The production frame rewrites the camera before render(); apply the test
  // pose here so both the sampled frame and the timed draw use the same camera.
  if (targetScene === cloudRoute.scene && cameraLock) {
    camera.position.set(...cameraLock.position);
    camera.lookAt(...cameraLock.target);
  }
  const started = performance.now();
  originalRender(targetScene, targetCamera);
  if (targetScene === cloudRoute.scene) {
    cloudRender.frames++;
    cloudRender.totalMs += performance.now() - started;
  }
};
window.__d2Perf = {
  cloudRoute, camera, renderer,
  mount() {
    cloudRoute.__enterSummit();
    const assembly = cloudRoute.assembly();
    assert(assembly?.r30Mounted === true, 'Production summit did not mount R30.');
    const r30 = assembly.r30;
    assert(r30?.ropeway, 'Production R30 ropeway is missing.');
    const legacy = {
      coarseVisible: visibleInHierarchy(assembly.block.coarse),
      cloudVisible: visibleInHierarchy(assembly.clouds.group),
      walkwayVisible: visibleInHierarchy(assembly.group.getObjectByName('main-summit-walkway')),
      cableVisible: visibleInHierarchy(assembly.group.getObjectByName('main-summit-cable')),
    };
    assert(!legacy.coarseVisible && !legacy.cloudVisible && !legacy.walkwayVisible,
      'A legacy coarse/cloud/walkway layer is still visible.');
    assert(!legacy.cableVisible, 'The legacy cable is still visible.');
    assert(assembly.cable === r30.ropeway.cable, 'The active cable is not the R30 cable.');
    assert(assembly.stations === r30.ropeway.stations, 'The active stations are not the R30 stations.');
    const stats = r30.stats();
    return {
      r30Mounted: assembly.r30Mounted,
      activeCable: 'R30',
      legacy,
      mountedParts: assembly.mountedParts(),
      r30Stats: {
        terrainMode: stats.terrainMode,
        arrivalHeight: stats.arrivalHeight,
        subPackages: stats.subPackages,
        budget: stats.budget,
        collisionSpacing: stats.collision.spacing,
      },
    };
  },
  poses() {
    const assembly = cloudRoute.assembly();
    const tread = assembly.r30.group.getObjectByName('town-d2-r30-trail-tread');
    assert(tread?.geometry, 'Production R30 trail tread is missing.');
    const positions = tread.geometry.getAttribute('position');
    assert(positions.count > 0 && positions.count % 2 === 0, 'Invalid R30 tread sections.');
    const anchor = assembly.r30.stats().worldAnchor;
    const centres = [];
    // Each resampled R30 tread section stores its two edge vertices; their
    // midpoint is the actual production centreline, not an old cloud placement.
    for (let index = 0; index < positions.count; index += 2) {
      const east = anchor.east + (positions.getX(index) + positions.getX(index + 1)) / 2;
      const north = anchor.north - (positions.getZ(index) + positions.getZ(index + 1)) / 2;
      const localEast = east - anchor.east, localNorth = north - anchor.north;
      const ground = assembly.trailSurfaceAt(localEast, localNorth, bodyRadius);
      if (ground === undefined || assembly.blocked(localEast, localNorth, ground, bodyRadius, bodyHeight)) continue;
      centres.push({ east, north, ground });
    }
    assert(centres.length > 3, 'No walkable production R30 trail points were found.');
    const nearest = (predicate, targetHeight) => centres
      .map((point, index) => ({ point, index, delta: Math.abs(point.ground - targetHeight) }))
      .filter(item => predicate(item.point.ground))
      .sort((a, b) => a.delta - b.delta)[0];
    const selected = [
      ['gate', nearest(height => height <= 355, assembly.arrivalHeight)],
      ['summit', nearest(height => height >= 790, 800)],
      ['cloud-belt', nearest(height => height >= 380 && height <= 560, 470)],
    ];
    return selected.map(([id, item]) => {
      assert(item, 'Missing production walkable camera point: ' + id);
      const here = item.point;
      const ahead = centres[Math.min(centres.length - 1, item.index + 4)];
      assert(ahead && Math.hypot(ahead.east - here.east, ahead.north - here.north) > 1,
        'Missing forward camera target: ' + id);
      const target = { east: ahead.east, north: ahead.north, height: ahead.ground + eye + 1.25 };
      const yaw = Math.atan2(target.east - here.east, target.north - here.north);
      const pitch = Math.atan2(target.height - (here.ground + eye),
        Math.hypot(target.east - here.east, target.north - here.north));
      assert(Number.isFinite(yaw) && Number.isFinite(pitch) && yaw !== 0 && pitch !== 0,
        'Camera yaw/pitch must be computed from a non-degenerate target: ' + id);
      return { id, east: here.east, north: here.north, ground: here.ground, yaw, pitch, target };
    });
  },
  pose(id) {
    const pose = this.poses().find(item => item.id === id);
    assert(pose, 'Unknown production camera pose: ' + id);
    resetMovement();
    x = pose.east; n = pose.north; ground = pose.ground; yaw = pose.yaw; pitch = pose.pitch;
    airHeight = undefined; seated = undefined; walking = false;
    walkCurrent.set(x, ground, -n); walkPrevious.copy(walkCurrent); walkRender.copy(walkCurrent);
    cameraLock = {
      position: [x, ground + eye, -n],
      target: [pose.target.east, pose.target.height, -pose.target.north],
    };
    camera.position.set(...cameraLock.position);
    camera.lookAt(...cameraLock.target);
    return pose;
  },
  info() {
    renderer.render(cloudRoute.scene, camera);
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  },
  async fps(milliseconds = 5000) {
    cloudRender.frames = 0; cloudRender.totalMs = 0;
    const frames = [], start = performance.now();
    await new Promise(resolve => {
      const tick = now => {
        frames.push(now);
        if (now - start >= milliseconds) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsedMs = frames.at(-1) - frames[0];
    assert(cloudRender.frames > 0 && elapsedMs > 0, 'No production cloud-scene frames were sampled.');
    return {
      frames: frames.length,
      elapsedMs,
      productionRafFps: (frames.length - 1) * 1000 / elapsedMs,
      cloudSceneRenderFrames: cloudRender.frames,
      cloudSceneRenderTotalMs: cloudRender.totalMs,
      cloudSceneRenderAverageMs: cloudRender.totalMs / cloudRender.frames,
    };
  },
};
`;
  await page.route('**/viewer.ts*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + injection });
  });
  await page.goto('http://127.0.0.1:3000/tools/voxel-tavern/town-blockout.html', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__d2Perf), null, { timeout: 120000 });
  await page.waitForTimeout(3500);

  const assembly = await page.evaluate(() => window.__d2Perf.mount());
  const poses = await page.evaluate(() => window.__d2Perf.poses());
  const cameras = [];
  for (const pose of poses) {
    await page.evaluate(id => window.__d2Perf.pose(id), pose.id);
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => window.__d2Perf.info());
    const fps = await page.evaluate(() => window.__d2Perf.fps(5000));
    const screenshot = `docs/交流区/GPT/town-d2-r30-production-2026-11-26/rework-${pose.id}.png`;
    await page.screenshot({ path: screenshot });
    cameras.push({ pose, ...info, ...fps, screenshot });
  }
  console.log(JSON.stringify({
    viewport: { width: 1280, height: 720 },
    renderer: 'SwiftShader',
    browser: 'system Chrome',
    entry: 'createZa22CloudRoute -> mountMainSummitAssembly(default)',
    assembly,
    cameras,
    errors,
  }, null, 2));
} finally {
  await browser.close();
}
