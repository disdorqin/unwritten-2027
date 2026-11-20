import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const url = new URL(process.env.EXPANSION_URL ?? '');
assert.equal(url.protocol, 'http:');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname, '/tools/voxel-tavern/town-expansion-review.html');
assert.ok(process.env.EXPANSION_OUTPUT);
const output = join(process.env.EXPANSION_OUTPUT, 'q1-perspective');
await mkdir(output, { recursive: true });
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');
const record = { scope: 'Audited perspective of original isolated S-1 candidate meshes', captures: [], errors: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  record.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1040, height: 760 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') record.errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  assert.equal((await page.goto(url.href, { waitUntil: 'load' }))?.status(), 200);
  await page.locator('#review-orbital').click();
  await page.locator('#review-viewport canvas').waitFor();
  const support = await page.evaluate(async () => {
    const threeUrl = performance.getEntriesByType('resource').find(entry => /\/three\.js(?:\?|$)/.test(entry.name))?.name;
    if (!threeUrl) throw new Error('Three.js was not loaded by the original fixture');
    const THREE = await import(threeUrl);
    const folder = '/tools/voxel-tavern/town-blockout/';
    const [{ createOrbitalReview }, { createOrbitalEarlyRooms }] = await Promise.all([
      import(folder + 'town-expansion-review-orbital.ts'), import(folder + 'orbital-early-rooms.ts'),
    ]);
    let view;
    createOrbitalReview(next => { view = next; }).show();
    const outer = [];
    for (const [id, label] of [['starport', '星港太空门'], ['core', '地宫核心舱门']]) {
      view.actions.find(([name]) => name === '经当前门进入气闸')[1]();
      if (!view.location.startsWith(label) || view.status !== '试验门仍锁定。') throw new Error('Unexpected gate state: ' + label);
      outer.push({ id, group: view.group, state: view.status });
      if (id === 'starport') view.actions.find(([name]) => name === '选取另一外门夹具')[1]();
    }
    const airlock = createOrbitalEarlyRooms().group;
    const scenes = new Map([
      ...outer.map(({ id, group, state }) => [id, { group, frame: group, state,
        front: [0, 1.65, 1.38], rear: [0, 1.65, -2.72] }]),
      ['starport-airlock', { group: airlock, frame: airlock.getObjectByName('orbital-starport-frame'),
        front: [-3.81, 1.65, .35] }],
      ['core-airlock', { group: airlock, frame: airlock.getObjectByName('orbital-core-vault-frame'),
        front: [3.81, 1.65, .35] }],
    ]);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1622);
    scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x444151, 2));
    const fill = new THREE.DirectionalLight(0xffeccb, 2);
    fill.position.set(-3, 7, 4);
    scene.add(fill);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1040, 585);
    renderer.domElement.id = 'q1-camera-view';
    renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
    document.body.append(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(58, 16 / 9, .05, 30);
    let displayed;
    window.captureQ1Ring = (id, side) => {
      const { group, frame, state, ...eyes } = scenes.get(id);
      if (displayed) scene.remove(displayed);
      scene.add(group);
      displayed = group;
      group.updateWorldMatrix(true, true);
      const ring = frame.getObjectByName('town-chronicle-ring');
      const door = frame.getObjectByName('closed-door-surface');
      const center = ring.localToWorld(new THREE.Vector3());
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(ring.matrixWorld);
      camera.position.fromArray(eyes[side]);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const params = ring.geometry.parameters;
      const radius = (params.innerRadius + params.outerRadius) / 2;
      const pointAt = angle => ring.localToWorld(new THREE.Vector3(
        radius * Math.cos(angle * Math.PI / 180), radius * Math.sin(angle * Math.PI / 180), 0));
      const nearest = angle => new THREE.Raycaster(camera.position,
        pointAt(angle).sub(camera.position).normalize()).intersectObjects([ring, door])[0]?.object.name;
      let rearSamples = 0;
      const missingFront = [];
      for (let angle = .5; angle < 360; angle++) {
        const front = pointAt(angle).addScaledVector(normal, 1.15);
        if (!new THREE.Raycaster(front, normal.clone().negate()).intersectObject(ring).length) missingFront.push(angle);
        const from = pointAt(angle).addScaledVector(normal, -1.15);
        if (new THREE.Raycaster(from, normal).intersectObject(ring).length) rearSamples++;
      }
      renderer.render(scene, camera);
      return { state, position: camera.position.toArray(), center: center.toArray(), normal: normal.toArray(),
        gapNdc: pointAt(45).project(camera).toArray(), arcHit: nearest(225.5), gapHit: nearest(45), missingFront, rearSamples,
        color: ring.material.color.getHexString(), roughness: ring.material.roughness,
        start: params.thetaStart * 180 / Math.PI, sweep: params.thetaLength * 180 / Math.PI,
        draws: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    };
    return { sharedOuterFixture: outer[0].group === outer[1].group, airlockFramesDistinct: scenes.get('starport-airlock').frame !== scenes.get('core-airlock').frame };
  });
  assert.deepEqual(support, { sharedOuterFixture: true, airlockFramesDistinct: true });
  record.fixtures = support;
  const captures = [['starport', 'front'], ['core', 'front'], ['starport-airlock', 'front'], ['core-airlock', 'front'],
    ['starport', 'rear'], ['core', 'rear']];
  for (const [id, side] of captures) {
    const result = await page.evaluate(([fixture, view]) => window.captureQ1Ring(fixture, view), [id, side]);
    assert.equal(result.color, '68867e');
    assert.equal(result.roughness, .96);
    assert.equal(Math.round(result.start), 65);
    assert.equal(Math.round(result.sweep), 320);
    assert.deepEqual(result.missingFront, Array.from({ length: 40 }, (_, offset) => 25.5 + offset));
    assert.equal(result.rearSamples, 0);
    assert.ok(result.draws > 0 && result.triangles > 0);
    if (side === 'front') {
      assert.ok(result.gapNdc[0] > 0 && result.gapNdc[0] < 1 && result.gapNdc[1] > 0 && result.gapNdc[1] < 1);
      assert.equal(result.arcHit, 'town-chronicle-ring');
      assert.equal(result.gapHit, 'closed-door-surface');
    }
    const file = id + '-' + side + '.png';
    await page.locator('#q1-camera-view').screenshot({ path: join(output, file) });
    record.captures.push({ file, ...result });
  }
  assert.deepEqual(record.errors, []);
} catch (error) {
  record.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'perspective-record.json'), JSON.stringify(record, null, 2) + '\n');
  await browser?.close();
  console.log(JSON.stringify({ captures: record.captures.length, failure: record.failure }));
}
