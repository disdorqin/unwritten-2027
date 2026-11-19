import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const url = new URL(process.env.JX_URL ?? '');
assert.equal(url.origin, 'http://127.0.0.1:4329');
assert.equal(url.pathname, '/tools/voxel-tavern/jx1-market-homes.html');
const output = process.env.JX_OUTPUT;
assert.ok(output, 'JX_OUTPUT is required');

const viewport = { width: 1000, height: 650 };
const angles = ['street', 'north', 'east', 'south', 'west'];
const walkCount = 9;
const routePath = 'tools/voxel-tavern/town-blockout/market-homes-review-routes.json';
const evidence = {
  baselineSha: process.env.JX_BASELINE_SHA,
  candidateSha: process.env.JX_CANDIDATE_SHA,
  url: url.href,
  viewport,
  deviceScaleFactor: 1,
  rendering: 'Chromium headless, ANGLE and SwiftShader',
  coverage: 'exact exterior and isolated candidate interior preview',
  ids: [],
  walkPlan: [],
  shots: [],
  walks: [],
  pageErrors: [],
  consoleWarnings: [],
  requestFailures: [],
  httpErrors: [],
};
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

function checkStats(stats) {
  const draws = stats?.draws ?? stats?.calls;
  const triangles = stats?.triangles ?? stats?.tris;
  assert.ok(Number.isInteger(draws) && draws > 0, 'A rendered frame needs a positive draw count');
  assert.ok(Number.isInteger(triangles) && triangles > 0, 'A rendered frame needs a positive triangle count');
  return { ...stats, draws, triangles };
}

function measuredWalkPlan(ids, routes) {
  assert.deepEqual(Object.keys(routes).sort(), [...ids].sort(), 'Surveyed routes must match the 17 doors');
  return ids.map(id => {
    const route = routes[id];
    assert.ok(Array.isArray(route) && route.length >= 2 && route.every(point =>
      Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)), 'Invalid surveyed route for ' + id);
    const meters = route.slice(1).reduce((sum, [east, north], i) =>
      sum + Math.hypot(east - route[i][0], north - route[i][1]), 0);
    assert.ok(meters > 0, 'The approach route must move for ' + id);
    return { id, meters };
  }).sort((a, b) => a.meters - b.meters || a.id.localeCompare(b.id)).slice(0, walkCount);
}

function escapeCell(value) {
  return String(value ?? '').replace(/[\r\n|]+/g, ' ');
}

function durationLimit(promise, timeMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timed out')), timeMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function observePage(page, record) {
  page.on('pageerror', error => record.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') {
      record.consoleWarnings.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('requestfailed', request => {
    record.requestFailures.push({ url: request.url(), reason: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (response.status() >= 400) record.httpErrors.push({ url: response.url(), status: response.status() });
  });
}

function isolateRequests(context) {
  return context.route('**/*', route => {
    const requestUrl = route.request().url();
    if (requestUrl === url.origin + '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    return requestUrl.startsWith(url.origin + '/') || requestUrl.startsWith('data:')
      ? route.continue()
      : route.abort('blockedbyclient');
  });
}

async function verifyMobile(browser) {
  const viewport = { width: 390, height: 844 };
  const test = evidence.mobile = {
    viewport, deviceScaleFactor: 2,
    selection: 'Playwright selectOption on the native DOM select',
    input: 'Chromium touch emulation, actual taps on camera and walk buttons',
    shots: [], touchEvents: [], pageErrors: [], consoleWarnings: [], requestFailures: [], httpErrors: [],
  };
  const context = await browser.newContext({
    viewport, deviceScaleFactor: test.deviceScaleFactor, isMobile: true, hasTouch: true,
    reducedMotion: 'reduce',
  });
  try {
    await isolateRequests(context);
    const page = await context.newPage();
    observePage(page, test);
    await page.addInitScript(() => {
      const touchEvents = [];
      window.__jx1ObservedTouches = touchEvents;
      document.addEventListener('pointerdown', event => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button?.matches('[data-camera], #market-review-walk')) return;
        touchEvents.push({
          control: button.dataset.camera ?? 'walk',
          pointerType: event.pointerType, trusted: event.isTrusted,
        });
      }, { capture: true });
    });

    const response = await page.goto(url.href, { waitUntil: 'load', timeout: 90_000 });
    assert.equal(response?.status(), 200);
    await page.waitForFunction(() => {
      const api = window.__marketHomesReview;
      if (!api) return false;
      const { draws, triangles } = api.stats();
      return draws > 0 && triangles > 0;
    }, undefined, { timeout: 60_000 });
    assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    assert.ok(await page.evaluate(() => navigator.maxTouchPoints > 0));
    const picker = page.locator('#market-review-home');
    const viewportElement = page.locator('#market-review-viewport');
    const canvas = viewportElement.locator('canvas');
    await canvas.waitFor({ state: 'visible', timeout: 30_000 });
    const optionIds = await picker.locator('option').evaluateAll(options => options.map(option => option.value));
    assert.deepEqual(optionIds, evidence.ids, 'The mobile DOM selector must contain all 17 doors');
    test.doorCount = optionIds.length;
    test.layout = await page.evaluate(() => {
      const box = document.querySelector('#market-review-viewport canvas').getBoundingClientRect();
      return {
        cssWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        devicePixelRatio,
        canvas: { left: box.left, right: box.right, width: box.width, height: box.height },
      };
    });
    assert.equal(test.layout.cssWidth, viewport.width, 'The preview must use the phone viewport, not the wide desktop layout');
    assert.equal(test.layout.devicePixelRatio, test.deviceScaleFactor);
    assert.ok(test.layout.scrollWidth <= test.layout.cssWidth + 1, 'Phone layout must not scroll horizontally');
    assert.ok(test.layout.canvas.left >= 0 && test.layout.canvas.right <= test.layout.cssWidth + 1 &&
      test.layout.canvas.width > 0 && test.layout.canvas.height > 0, 'Phone canvas must fit in the viewport');

    const { id, meters } = evidence.walkPlan[0];
    const otherIds = optionIds.filter(other => other !== id);
    const representative = [id, otherIds[0], otherIds.at(-1)];
    assert.equal(new Set(representative).size, 3);
    test.representative = representative;
    await mkdir(join(output, 'mobile'), { recursive: true });
    for (const [index, door] of representative.entries()) {
      await picker.selectOption(door);
      assert.equal(await page.evaluate(() => window.__marketHomesReview.snapshot().id), door);
      for (const angle of ['north', 'interior']) {
        await page.locator('[data-camera="' + angle + '"]').tap();
        await page.waitForFunction(expected => window.__marketHomesReview.stats().angle === expected, angle);
        const snapshot = await page.evaluate(() => window.__marketHomesReview.snapshot());
        assert.equal(snapshot.id, door);
        assert.equal(snapshot.current.angle, angle);
        const stats = checkStats(snapshot.current);
        const path = 'mobile/' + String(index + 1) + '-' + angle + '.png';
        await canvas.screenshot({ path: join(output, path), timeout: 20_000 });
        test.shots.push({ door, angle, path, stats });
      }
    }

    await picker.selectOption(id);
    const walk = page.locator('#market-review-walk');
    const status = page.locator('#market-review-status');
    await page.evaluate(() => {
      const picker = document.querySelector('#market-review-home');
      const walk = document.querySelector('#market-review-walk');
      const lock = { wasDisabled: false };
      window.__jx1ObservedRouteLock = lock;
      const observer = new MutationObserver(() => {
        if (walk.disabled && picker.disabled) lock.wasDisabled = true;
      });
      observer.observe(walk, { attributes: true, attributeFilter: ['disabled'] });
    });
    await walk.tap();
    const returned = id + ' · 街至门 ' + meters.toFixed(2) + ' m · 绕行室内并原门返回街面';
    await page.waitForFunction(expected =>
      document.querySelector('#market-review-status').textContent === expected &&
      !document.querySelector('#market-review-home').disabled &&
      !document.querySelector('#market-review-walk').disabled, returned, { timeout: 90_000 });
    assert.equal(await status.textContent(), returned);
    assert.equal(await page.evaluate(() => window.__jx1ObservedRouteLock.wasDisabled), true,
      'The UI must show both controls locked during the touch-triggered replay');
    assert.equal(await page.evaluate(() => window.__marketHomesReview.snapshot().id), id);
    const path = 'mobile/return.png';
    await canvas.screenshot({ path: join(output, path), timeout: 20_000 });
    test.walk = { id, meters, status: returned, controlsLockedThenReleased: true, path };
    test.touchEvents = await page.evaluate(() => window.__jx1ObservedTouches);
    assert.deepEqual(test.touchEvents.map(({ control }) => control), [
      'north', 'interior', 'north', 'interior', 'north', 'interior', 'walk',
    ]);
    assert.ok(test.touchEvents.every(({ pointerType, trusted }) => pointerType === 'touch' && trusted),
      'All seven camera and walk button actions must originate from trusted touch pointers');
    assert.deepEqual(test.pageErrors, []);
    assert.deepEqual(test.httpErrors, []);
    assert.deepEqual(test.requestFailures, []);
    assert.deepEqual(test.consoleWarnings.filter(entry => entry.type === 'error'), []);
    test.passed = true;
  } finally {
    await context.close();
  }
}

async function writeEvidence() {
  const content = JSON.stringify(evidence, null, 2) + '\n';
  await writeFile(join(output, 'record.json'), content);
  const overview = [
    '## JX-1 candidate preview browser evidence',
    '',
    '- Integration source: ' + evidence.baselineSha,
    '- Published candidate source: ' + evidence.candidateSha,
    '- Browser: ' + (evidence.browser ?? 'startup failed'),
    '- Houses: ' + evidence.ids.length + '/17',
    '- Exterior images: ' + evidence.shots.filter(shot => angles.includes(shot.angle)).length + '/85',
    '- Interior images: ' + evidence.shots.filter(shot => shot.angle === 'interior').length + '/17',
    '- Walks completed: ' + evidence.walks.filter(walk => walk.result?.ok === true).length + '/9',
    '- Fixed street-camera comparisons: ' + evidence.walks.filter(walk => walk.sameCamera).length + '/9',
    '- Mobile candidate UI (390 × 844, DPR 2): ' + (evidence.mobile?.passed ? 'passed' : 'not passed'),
    '- Mobile DOM door options: ' + (evidence.mobile?.doorCount ?? 0) + '/17',
    '- Mobile camera screenshots / trusted taps: ' + (evidence.mobile?.shots.length ?? 0) + '/6 and ' +
      (evidence.mobile?.touchEvents.length ?? 0) + '/7',
    '- Mobile touch-triggered isolated return loop: ' + (evidence.mobile?.walk?.id ?? 'not recorded'),
    '- Page errors: ' + evidence.pageErrors.length,
    '- Failed network requests: ' + evidence.requestFailures.length,
    '- HTTP errors: ' + evidence.httpErrors.length,
    '- Result: ' + (evidence.failure ? 'failed — ' + escapeCell(evidence.failure) : 'passed'),
    '',
    '| Door ID | Street draws | Street triangles | Indoor image | Surveyed approach (m) | Walk | Same-camera Δ draws / triangles |',
    '|---|---:|---:|---|---:|---|---:|',
    ...evidence.ids.map(id => {
      const street = evidence.shots.find(shot => shot.id === id && shot.angle === 'street');
      const indoor = evidence.shots.some(shot => shot.id === id && shot.angle === 'interior');
      const walk = evidence.walks.find(item => item.id === id);
      return '| ' + escapeCell(id) + ' | ' + (street?.stats.draws ?? '—') +
        ' | ' + (street?.stats.triangles ?? '—') + ' | ' + (indoor ? 'yes' : '—') +
        ' | ' + (walk?.meters.toFixed(2) ?? '—') + ' | ' +
        (walk ? (walk.result?.ok === true ? 'passed' : 'failed') : '—') + ' | ' +
        (walk?.sameCamera ? walk.sameCamera.deltaDraws + ' / ' + walk.sameCamera.deltaTriangles : '—') + ' |';
    }),
    '',
    'Mobile evidence covers the isolated review UI and its route replay. Native select options use Playwright selectOption; camera and walk buttons use trusted touch pointers.',
    'The matching street-camera snapshots compare the isolated candidate renderer before and after each walk. They are separate from integration-baseline or production measurements.',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, overview + '\n');
  }
}

await mkdir(join(output, 'screenshots'), { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  evidence.browser = browser.version();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: evidence.deviceScaleFactor,
    reducedMotion: 'reduce',
  });
  // This fixture and its assets run only on the checker's own loopback server.
  await isolateRequests(context);
  const page = await context.newPage();
  observePage(page, evidence);
  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => {
    const api = window.__marketHomesReview;
    return api && Array.isArray(api.ids) &&
      ['select', 'capture', 'walk', 'stats', 'snapshot'].every(key => typeof api[key] === 'function');
  }, undefined, { timeout: 60_000 });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(async () => {
    const stats = await window.__marketHomesReview.stats();
    return (stats?.draws ?? stats?.calls) > 0 && (stats?.triangles ?? stats?.tris) > 0;
  }, undefined, { timeout: 30_000 });
  evidence.ids = await page.evaluate(() => [...window.__marketHomesReview.ids]);
  assert.equal(evidence.ids.length, 17, 'Exactly 17 market doors must be registered');
  assert.ok(evidence.ids.every(id => typeof id === 'string' && id.trim()), 'Door IDs must be named');
  assert.equal(new Set(evidence.ids).size, 17, 'Door IDs must be unique');
  evidence.walkPlan = measuredWalkPlan(evidence.ids, JSON.parse(await readFile(routePath, 'utf8')));
  evidence.firstFrame = {
    stats: checkStats(await page.evaluate(() => window.__marketHomesReview.stats())),
    snapshot: await page.evaluate(() => window.__marketHomesReview.snapshot()),
  };

  async function select(id) {
    await page.evaluate(id => window.__marketHomesReview.select(id), id);
  }

  async function captureFrame(angle) {
    const frame = await page.evaluate(async angle => {
      const review = window.__marketHomesReview;
      const selection = await review.capture(angle);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { selection, snapshot: await review.snapshot(), stats: await review.stats() };
    }, angle);
    return { ...frame, stats: checkStats(frame.stats) };
  }

  async function screenshot(id, index, angle) {
    const frame = await captureFrame(angle);
    const path = 'screenshots/' + String(index + 1).padStart(2, '0') + '-' + angle + '.png';
    await canvas.screenshot({ path: join(output, path), timeout: 20_000 });
    evidence.shots.push({ id, angle, path, ...frame });
  }

  for (const [index, id] of evidence.ids.entries()) {
    await select(id);
    for (const angle of angles) await screenshot(id, index, angle);
    await screenshot(id, index, 'interior');
  }

  for (const { id, meters } of evidence.walkPlan) {
    await select(id);
    const before = await captureFrame('street');
    const started = performance.now();
    const walk = { id, meters, before };
    evidence.walks.push(walk);
    try {
      const result = await durationLimit(
        page.evaluate(() => window.__marketHomesReview.walk()), 90_000, 'Interior walk ' + id,
      );
      walk.elapsedMs = Math.round(performance.now() - started);
      walk.result = result;
      assert.equal(result?.ok, true, 'Interior walk failed for ' + id);
      assert.equal(result.id, id, 'The preview must walk the selected house');
      assert.equal(result.sameDoor, id, 'The walk must return through the selected door');
      assert.ok(Math.abs(result.approach - meters) < .001, 'Walk does not match the surveyed approach');
      assert.deepEqual(result.phases.map(phase => phase.name),
        ['street-to-door', 'inside-loop', 'same-door-to-street']);
      assert.ok(result.phases.every(phase => Number.isInteger(phase.steps) && phase.steps > 0),
        'Each walk phase must record actual collision samples');
      assert.deepEqual(result.phases[0].from, result.phases[2].to, 'The walk must return to its initial street point');
      assert.deepEqual(result.phases[0].to, result.phases[2].from, 'Entry and exit must share the surveyed door point');
      const after = await captureFrame('street');
      assert.equal(before.stats.angle, 'street');
      assert.equal(after.stats.angle, 'street');
      assert.ok(Array.isArray(before.stats.camera) && before.stats.camera.length === 3 &&
        before.stats.camera.every(Number.isFinite), 'Street camera must expose all three coordinates');
      assert.deepEqual(after.stats.camera, before.stats.camera, 'Street camera position must be identical');
      assert.equal(before.snapshot.id, id);
      assert.equal(after.snapshot.id, id);
      walk.sameCamera = {
        before, after,
        deltaDraws: after.stats.draws - before.stats.draws,
        deltaTriangles: after.stats.triangles - before.stats.triangles,
      };
    } catch (error) {
      walk.elapsedMs = Math.round(performance.now() - started);
      walk.error = String(error);
      throw error;
    }
  }
  assert.equal(evidence.shots.filter(shot => angles.includes(shot.angle)).length, 85);
  assert.equal(evidence.shots.filter(shot => shot.angle === 'interior').length, 17);
  assert.equal(evidence.walks.filter(walk => walk.result?.ok === true).length, walkCount);
  assert.equal(evidence.walks.filter(walk => walk.sameCamera).length, walkCount);
  assert.deepEqual(evidence.pageErrors, [], 'No uncaught page errors are expected');
  assert.deepEqual(evidence.httpErrors, [], 'No HTTP errors are expected for this preview');
  assert.deepEqual(evidence.requestFailures, [], 'All isolated candidate requests must complete');
  await context.close();
  await verifyMobile(browser);
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeEvidence();
  console.log(JSON.stringify({
    houses: evidence.ids.length,
    exterior: evidence.shots.filter(shot => angles.includes(shot.angle)).length,
    interior: evidence.shots.filter(shot => shot.angle === 'interior').length,
    walks: evidence.walks.filter(walk => walk.result?.ok === true).length,
    mobile: evidence.mobile?.passed === true,
    mobileTouches: evidence.mobile?.touchEvents.length ?? 0,
    failure: evidence.failure,
  }));
}
