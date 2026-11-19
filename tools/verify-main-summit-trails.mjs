import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = new URL(process.env.P3_URL ?? 'http://127.0.0.1:5813/tools/voxel-tavern/main-summit-trails-review.html');
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Use a runner-local preview');
assert.equal(url.pathname, '/tools/voxel-tavern/main-summit-trails-review.html');
url.searchParams.set('proof', '1');
const output = process.env.P3_OUTPUT ?? process.argv[2];
assert.ok(output, 'Set P3_OUTPUT to the browser evidence directory');
await mkdir(output, { recursive: true });

const viewport = { width: 768, height: 432 };
const sections = ['above-cloud', 'through-cloud', 'below-cloud'];
const screenshotPaths = [];
const errors = [];
const report = { viewport, errors, screenshotPaths, walk: {}, sled: {} };
const walkSamples = [];
const sledSamples = [];

function round(value) {
  return Number(value.toFixed(6));
}

function horizontalDistance(left, right) {
  return Math.hypot(right.east - left.east, right.north - left.north);
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual}, expected ${expected} ± ${tolerance}`);
}

function assertPosition(actual, expected, label) {
  for (const axis of ['east', 'north', 'height']) {
    assertNear(actual[axis], expected[axis], 1e-6, `${label} ${axis}`);
  }
}

function summarizePath(samples) {
  let horizontalMetres = 0;
  let surfaceMetres = 0;
  let maxSampledGrade = 0;
  let maxChordGrade = 0;
  let turnSamples = 0;

  for (let index = 1; index < samples.length; index++) {
    const from = samples[index - 1];
    const to = samples[index];
    const horizontal = horizontalDistance(from.position, to.position);
    const rise = Math.abs(to.position.height - from.position.height);
    const routeMetres = to.distance - from.distance;
    assert.ok(routeMetres >= -1e-6, `Route progress dropped at sample ${index}`);
    horizontalMetres += horizontal;
    surfaceMetres += Math.hypot(horizontal, rise);
    if (horizontal > 0.05) maxChordGrade = Math.max(maxChordGrade, rise / horizontal);

    // A straight chord cut across a switchback is shorter than the ground run.
    // Compare elevation against the movement along the route at those samples.
    const routeRun = Math.sqrt(Math.max(0, routeMetres ** 2 - rise ** 2));
    const crossesTurn = horizontal < routeRun * 0.97;
    if (crossesTurn) turnSamples++;
    const run = crossesTurn ? routeRun : horizontal;
    if (run > 0.05) maxSampledGrade = Math.max(maxSampledGrade, rise / run);
  }

  return {
    samples: samples.length,
    horizontalMetres: round(horizontalMetres),
    surfaceMetres: round(surfaceMetres),
    maxSampledGrade: round(maxSampledGrade),
    maxChordGrade: round(maxChordGrade),
    turnSamples,
  };
}

let browser;
try {
  browser = await chromium.launch({ headless: true, args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ] });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
  });
  page.on('requestfailed', request => errors.push({
    type: 'requestfailed', url: request.url(), message: request.failure()?.errorText,
  }));
  page.on('response', response => {
    if (response.status() >= 400) errors.push({ type: 'http', url: response.url(), status: response.status() });
  });

  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 60_000 });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => typeof window.p3?.snapshot === 'function', undefined, { timeout: 15_000 });
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 15_000 });

  const state = () => page.evaluate(() => window.p3.snapshot());
  const advance = (ms, draw = false) => page.evaluate(async ([duration, paint]) => {
    await window.p3.advance(duration, paint);
    return window.p3.snapshot();
  }, [ms, draw]);

  async function takeScreenshot(name) {
    const current = await advance(0, true);
    assert.ok(current.render.draws > 0 && current.render.triangles > 0, `${name}: expected rendered geometry`);
    const path = `${name}.png`;
    await page.screenshot({ path: join(output, path), timeout: 20_000 });
    screenshotPaths.push({ path, mode: current.mode, position: current.position, render: current.render });
  }

  function walkSample(snapshot) {
    return { distance: snapshot.walk.distance, position: snapshot.position };
  }

  function sledSample(snapshot) {
    return {
      distance: snapshot.sled.distance, position: snapshot.position, mode: snapshot.mode,
      section: snapshot.sled.section, speed: snapshot.sled.speed, elapsedMs: snapshot.sled.elapsedMs,
      finished: snapshot.sled.finished,
    };
  }

  // Substeps run inside the browser so the probe does not pay a transport round trip for each sample.
  function sampleBlock(kind, stepMs, steps, endDistance, section = null) {
    return page.evaluate(async ({ kind, stepMs, steps, endDistance, section }) => {
      const samples = [];
      for (let index = 0; index < steps; index++) {
        await window.p3.advance(stepMs, false);
        const current = window.p3.snapshot();
        const route = current[kind];
        samples.push({
          distance: route.distance, position: current.position, mode: current.mode,
          section: route.section, speed: route.speed, elapsedMs: route.elapsedMs, finished: route.finished,
        });
        if (route.finished || route.distance >= endDistance || (section !== null && route.section !== section)) break;
      }
      return samples;
    }, { kind, stepMs, steps, endDistance, section });
  }

  await page.locator('[data-p3-action="walk"]').click();
  const walkStart = await state();
  assert.equal(walkStart.mode, 'walk');
  assertNear(walkStart.position.height, 347, 0.01, 'Cloud-deck walk start height');
  assertNear(walkStart.walk.distance, 0, 1e-6, 'Walk start distance');
  assert.ok(walkStart.walk.totalDistance >= 5_400, 'Walk is at least 5.4 km');
  const idleWalk = await advance(1_000);
  assertPosition(idleWalk.position, walkStart.position, 'No-input walk position');
  await takeScreenshot('01-cloud-deck-walk-start');

  walkSamples.push(walkSample(walkStart));
  const walkEndDistance = walkStart.walk.totalDistance;
  const walkStepMs = 250;
  let walkSimulatedMs = 0;
  let walkMidpointCaptured = false;
  await page.keyboard.down('KeyW');
  try {
    while (walkSamples.at(-1).distance < walkEndDistance - 1e-5 && walkSimulatedMs < 3_600_000) {
      const midOrEnd = walkMidpointCaptured ? walkEndDistance - 1e-5 : walkEndDistance / 2;
      const block = await sampleBlock('walk', walkStepMs, 60, midOrEnd);
      assert.ok(block.at(-1).distance > walkSamples.at(-1).distance, 'Walk stalled while holding W');
      walkSamples.push(...block);
      walkSimulatedMs += block.length * walkStepMs;

      if (!walkMidpointCaptured && walkSamples.at(-1).distance >= midOrEnd) {
        await page.keyboard.up('KeyW');
        const stopped = await state();
        assertPosition((await advance(1_000)).position, stopped.position, 'Walk position after releasing W');
        await takeScreenshot('02-walk-midway');
        walkMidpointCaptured = true;
        await page.keyboard.down('KeyW');
      }
    }
  } finally {
    await page.keyboard.up('KeyW');
  }
  const walkFinish = await state();
  const pavilionAnchors = walkFinish.walk.pavilionAnchors.map(anchor => anchor.position ?? anchor);
  const observedPavilions = pavilionAnchors.map(anchor => ({
    ...anchor,
    nearestBrowserSampleMetres: round(Math.min(...walkSamples.map(({ position }) =>
      Math.hypot(horizontalDistance(anchor, position), anchor.height - position.height)))),
  }));
  report.walk = {
    input: 'KeyW press, release and resume', simulatedMs: walkSimulatedMs, stepMs: walkStepMs,
    routeMetres: walkEndDistance, routeMaxGrade: walkFinish.walk.maxGrade,
    start: walkSample(walkStart), finish: walkSample(walkFinish), pavilionAnchors: observedPavilions,
    ...summarizePath(walkSamples),
  };
  assert.ok(walkMidpointCaptured, 'W moved the player through the walk midway point');
  assertNear(walkFinish.walk.distance, walkEndDistance, 1e-5, 'Walk travelled full length');
  assertNear(walkFinish.position.height, 800, 0.01, 'Summit walk finish height');
  assert.ok([report.walk.maxSampledGrade, report.walk.routeMaxGrade].every(grade => grade <= 0.120001),
    `Walk grade exceeded 12% (browser ${report.walk.maxSampledGrade}, survey ${report.walk.routeMaxGrade})`);
  assert.equal(observedPavilions.length, 2, 'Two pavilion anchors are registered');
  for (const anchor of observedPavilions) {
    assert.ok(anchor.height >= 380 && anchor.height <= 560, 'Pavilion is in the cloud belt');
    assert.ok(anchor.nearestBrowserSampleMetres <= 30, 'Browser walk reaches the pavilion vicinity');
  }
  await takeScreenshot('03-summit-walk-finish');

  await page.locator('[data-p3-action="sled"]').click();
  const sledReady = await state();
  assert.equal(sledReady.mode, 'sled-ready');
  assertNear(sledReady.position.height, 800, 0.01, 'Summit sled start height');
  assertNear(sledReady.sled.distance, 0, 1e-6, 'Sled ready distance');
  assert.ok(sledReady.sled.totalDistance >= 6_000, 'Sled course is at least 6 km');
  const idleSled = await advance(2_000);
  assert.equal(idleSled.mode, 'sled-ready');
  assertPosition(idleSled.position, sledReady.position, 'No-input sled position');
  await page.keyboard.press('KeyE');
  const sledStart = await state();
  assert.equal(sledStart.mode, 'sled');
  assert.equal(sledStart.sled.section, sections[0]);
  sledSamples.push(sledSample(sledStart));
  await takeScreenshot('04-sled-above-cloud');

  const sledStepMs = 100;
  let sledSimulatedMs = 0;
  while (!sledSamples.at(-1).finished && sledSimulatedMs < 660_000) {
    const previous = sledSamples.at(-1);
    const section = previous.section;
    const block = await sampleBlock('sled', sledStepMs, 100, sledReady.sled.totalDistance, section);
    sledSamples.push(...block);
    sledSimulatedMs += block.length * sledStepMs;
    const sample = sledSamples.at(-1);
    assert.ok(sample.finished || sample.elapsedMs > previous.elapsedMs, 'Sled replay clock stopped before arrival');
    if (sample.section !== section && sections.includes(sample.section)) {
      const index = sections.indexOf(sample.section);
      await takeScreenshot(`0${4 + index}-sled-${sample.section}`);
    }
  }
  const sledFinish = await state();
  const timingSeconds = sledFinish.sled.elapsedMs / 1000;
  const phaseResults = [];
  for (const sample of sledSamples) {
    const last = phaseResults.at(-1);
    if (last?.section === sample.section) {
      last.finish = sample;
      last.peakSpeed = Math.max(last.peakSpeed, sample.speed);
    } else {
      phaseResults.push({ section: sample.section, start: sample, finish: sample, peakSpeed: sample.speed });
    }
  }
  report.sled = {
    input: 'KeyE mount followed by timed simulation', timeSeconds: timingSeconds, stepMs: sledStepMs,
    timingEstimateSeconds: [180, 240], meetsTimingEstimate: timingSeconds >= 180 && timingSeconds <= 240,
    routeMetres: sledReady.sled.totalDistance, elapsedMs: sledFinish.sled.elapsedMs,
    sampledPeakSpeed: Math.max(...sledSamples.map(sample => sample.speed)),
    observedPeakSpeed: sledFinish.sled.maxSpeed, speedCeiling: sledFinish.sled.cap,
    dropMetres: round(sledStart.position.height - sledFinish.position.height),
    start: sledSample(sledStart), finish: sledSample(sledFinish), phases: phaseResults,
    ...summarizePath(sledSamples),
  };
  assert.equal(sledFinish.mode, 'sled-finished');
  assert.equal(sledFinish.sled.finished, true);
  assertNear(sledFinish.sled.distance, sledReady.sled.totalDistance, 1e-5, 'Sled travelled full length');
  assertNear(sledFinish.position.height, 18, 0.01, 'Sled foothill finish fixture height');
  assertNear(report.sled.dropMetres, 782, 0.01, 'Sled observed descent');
  assert.deepEqual(phaseResults.map(phase => phase.section), sections);
  assertNear(phaseResults[1].start.position.height, 560, 2, 'Sled entry into the cloud');
  assertNear(phaseResults[2].start.position.height, 380, 2, 'Sled exit from the cloud');
  assert.ok(Number.isFinite(timingSeconds) && timingSeconds > 0, 'Sled completion timer was recorded');
  assert.ok(report.sled.sampledPeakSpeed <= report.sled.observedPeakSpeed + 1e-6,
    'Sled replay peak accounts for the browser speed samples');
  assert.ok(report.sled.observedPeakSpeed <= report.sled.speedCeiling + 1e-6, 'Sled respects its speed ceiling');
  await takeScreenshot('07-sled-foothill-finish');
  assert.deepEqual(errors, []);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (report.failure) report.samplesBeforeFailure = { walk: walkSamples.length, sled: sledSamples.length };
  await writeFile(join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'motion-samples.json'), JSON.stringify({ walk: walkSamples, sled: sledSamples }) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
