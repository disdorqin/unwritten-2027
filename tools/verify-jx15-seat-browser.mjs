import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, serve, swiftShader } from './jx1-formal/app-build-and-loopback.mjs';

const [baselineRoot, candidateRoot, outputRoot] = process.argv.slice(2).map(dir => resolve(dir));
assert.ok(baselineRoot && candidateRoot && outputRoot,
  'Usage: verify-jx15-seat-browser.mjs BASELINE_CHECKOUT CANDIDATE_CHECKOUT EVIDENCE_DIR');
const requireBaseline = createRequire(join(baselineRoot, 'package.json'));
const { chromium } = requireBaseline('@playwright/test');
const viewport = { width: 1000, height: 650 };
const lockedEye = [224.64, 14.43, -165.0625];
const lookAt = [242, 12.121, -146.711];

function replaceOnce(code, marker, next) {
  assert.equal(code.split(marker).length, 2, 'Expected exactly one viewer marker: ' + marker);
  return code.replace(marker, next);
}

function addProof(code) {
  const setup = `
import { BoxGeometry as Jx15Box, InstancedMesh as Jx15Instances, MeshLambertMaterial as Jx15Material, Matrix4 as Jx15Matrix } from 'three';
import { theaterPhotoPositions as jx15Seats } from './community-theater';
import { voxelPersonParts as jx15Parts } from './town-voxel-person';
import { avatarRootOffset as jx15Offset, writeAvatarPart as jx15Write } from './town-presence-pose';
const jx15Enabled = import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
  new URLSearchParams(location.search).has('jx15SeatProof');
let jx15Crowd: import('three').InstancedMesh | undefined;
if (jx15Enabled) {
  const colors = [0xf1c8a7, 0x302723, 0x67423d, 0xc28f62, 0x454a58, 0xa16650, 0x595c44, 0x7b492a];
  const sample = new Jx15Instances(new Jx15Box(), new Jx15Material(), 36 * jx15Parts.length);
  const values = new Float32Array(16);
  values[15] = 1;
  const matrix = new Jx15Matrix();
  jx15Seats.slice(0, 36).forEach((seat, seatIndex) => {
    jx15Parts.forEach((part, partIndex) => {
      const index = seatIndex * jx15Parts.length + partIndex;
      jx15Write(values, 0, part, 1, seat.east, seat.height + jx15Offset(1), -seat.north, 1, 0, 0, 0);
      sample.setMatrixAt(index, matrix.fromArray(values));
      sample.setColorAt(index, new Color(colors[part[2]]));
    });
  });
  sample.name = 'JX-15 rehearsal: first three rows seated';
  sample.frustumCulled = false;
  jx15Crowd = sample;
  scene.add(sample);
  (window as any).__jx15SeatProof = { request: null, result: null, frames: 0, since: 0 };
}
`;
  code = replaceOnce(code, "const scene = new Scene();", "const scene = new Scene();\n" + setup);
  code = replaceOnce(code, 'setNight(true);\ntimeOfDay.onclick', 'setNight(!jx15Enabled);\ntimeOfDay.onclick');
  code = replaceOnce(code, '  const wideView = !walking', `
  const jx15State = jx15Enabled ? (window as any).__jx15SeatProof : undefined;
  const jx15View = jx15State?.request;
  if (jx15View) {
    const rearSeat = jx15Seats[42];
    if (jx15View === 'fixed') camera.position.set(${lockedEye.join(', ')});
    else camera.position.set(rearSeat.east, rearSeat.height + 1.03, -rearSeat.north);
    camera.lookAt(${lookAt.join(', ')});
  }
  const wideView = !walking`);
  return replaceOnce(code, '} else renderer.render(scene, camera);', `} else {
        renderer.render(scene, camera);
        if (jx15View && jx15Crowd) {
          if (!jx15State.frames++) jx15State.since = performance.now();
          if (performance.now() - jx15State.since >= 400 && jx15State.frames >= 2 && architecture.has('stage')) {
            const seat = jx15Seats[42];
            jx15State.result = {
              view: jx15View, position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
              aspect: camera.aspect, fov: camera.fov, width: renderer.domElement.width, height: renderer.domElement.height,
              seat, audience: 36, avatarParts: jx15Crowd.count, frames: jx15State.frames, daylight: !nightMode,
              draws: renderer.info.render.calls, triangles: renderer.info.render.triangles,
              png: renderer.domElement.toDataURL('image/png').split(',')[1],
            };
            jx15State.request = null;
          }
        }
      }`);
}

async function capture(browser, root, variant, temp) {
  const dist = join(temp, variant);
  console.log(variant + ': build the isolated theater viewer');
  await build(root, dist, addProof);
  const logs = [];
  const { server, url } = await serve(root, dist, createRequire(join(root, 'package.json')), logs);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(url + '/town-blockout.html?jx15SeatProof', {
      waitUntil: 'domcontentloaded', timeout: 120_000,
    });
    assert.ok(response?.ok(), variant + ' viewer must load');
    await page.waitForFunction(() => (window).__jx15SeatProof, undefined, { timeout: 120_000, polling: 300 });
    const samples = [];
    for (const view of ['fixed', 'rear-seat']) {
      const handle = await page.evaluateHandle(async requested => {
        const state = (window).__jx15SeatProof;
        state.result = null;
        state.frames = 0;
        state.request = requested;
        const until = performance.now() + 75_000;
        while (!state.result && performance.now() < until) {
          await new Promise(done => setTimeout(done, 120));
        }
        return state.result;
      }, view);
      const result = await handle.jsonValue();
      await handle.dispose();
      assert.ok(result, variant + ' no rendered frame ' + view);
      const { png, ...frame } = result;
      const bytes = Buffer.from(png, 'base64');
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.ok(bytes.length > 5000 && frame.draws > 0 && frame.triangles > 0, 'Expected a drawn scene');
      assert.deepEqual([frame.width, frame.height], [viewport.width, viewport.height]);
      assert.equal(frame.audience, 36);
      assert.ok(frame.daylight && frame.frames >= 2, 'Expected a settled daytime view');
      assert.ok(frame.avatarParts > 36);
      const filename = variant + '-' + view + '.png';
      await writeFile(join(outputRoot, filename), bytes);
      console.log(variant + ': captured ' + view + ' at Y' + frame.position[1]);
      samples.push({ ...frame, filename, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    assert.deepEqual(errors, []);
    return { samples, errors, presence: logs.filter(row => row.step === 'join' || row.step === 'session') };
  } finally {
    try { await context.close(); }
    finally { await server.close(); }
  }
}

await mkdir(outputRoot, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), 'jx15-seat-'));
const evidence = {};
let browser;
try {
  browser = await chromium.launch({ args: swiftShader });
  evidence.chromium = browser.version();
  evidence.baseline = await capture(browser, baselineRoot, 'baseline', temp);
  evidence.candidate = await capture(browser, candidateRoot, 'candidate', temp);
  const [oldFixed, oldSeat] = evidence.baseline.samples;
  const [newFixed, newSeat] = evidence.candidate.samples;
  for (const key of ['position', 'quaternion', 'fov', 'aspect', 'width', 'height']) {
    assert.deepEqual(newFixed[key], oldFixed[key], 'Matched camera field ' + key);
  }
  assert.deepEqual(newFixed.position, lockedEye);
  assert.ok(oldSeat.position.every((value, index) => Math.abs(value - lockedEye[index]) < 1e-9));
  assert.equal(newSeat.position[0], oldSeat.position[0]);
  assert.equal(newSeat.position[2], oldSeat.position[2]);
  assert.ok(Math.abs(newSeat.position[1] - 14.73) < 1e-9, 'Expected the raised seat eye point');
  evidence.status = 'matched-browser-frames';
} catch (error) {
  evidence.error = error.stack ?? String(error);
  throw error;
} finally {
  await writeFile(join(outputRoot, 'jx15-seat-browser.json'), JSON.stringify(evidence, null, 2) + '\n');
  try { await browser?.close(); }
  finally { await rm(temp, { recursive: true, force: true }); }
}
