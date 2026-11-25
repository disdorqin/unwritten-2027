import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const channel = 'p3-r2-proof';
const phases = ['downhill', 'reverse'];
const sha = /^[a-f0-9]{40}$/i;
const number = Number.isFinite;
const point = value => value && [value.east, value.north, value.y].every(number);
const horizontal = (a, b) => Math.hypot(a.east - b.east, a.north - b.north);
const samePosition = (a, b) => a.east === b.east && a.north === b.north && a.y === b.y;
const nativeInputs = new Set(['keydown', 'keyup', 'pointerdown', 'pointermove', 'touchstart', 'touchmove', 'touchend']);
const epsilon = 1e-6; // Floating-point slack for motion algebra, not a seam-height criterion.

function validateManifest(manifest, expected) {
  assert.ok(manifest && manifest.viewer === 'town-blockout' && manifest.mount === 'production', 'Production viewer telemetry is absent');
  for (const key of ['buildSha', 'routeSha']) {
    assert.match(expected?.[key] ?? '', sha, `Pin the expected ${key}`);
    assert.equal(manifest[key], expected[key], `Wrong ${key}`);
  }
  for (const key of ['gateId', 'upperRoute', 'lowerRoute', 'collisionId', 'bottomId']) {
    assert.ok(typeof expected[key] === 'string' && expected[key].trim(), `Pin the expected ${key} from the mounted production route`);
    assert.equal(manifest[key], expected[key], `Wrong ${key}`);
  }
  assert.notEqual(manifest.upperRoute, manifest.lowerRoute, 'The upper and actual R2 traces must be distinguishable');
}

function validateAttempt(attempt, phase, manifest) {
  const reverse = phase === 'reverse';
  assert.ok(Array.isArray(attempt?.steps) && attempt.steps.length >= 2, `Missing native physics trace for ${phase}`);
  assert.ok(Array.isArray(attempt.inputs) && attempt.inputs.length > 0, `Missing actual browser input for ${phase}`);
  assert.ok(attempt.inputs.every(event => event.trusted === true && nativeInputs.has(event.type) && number(event.atMs)),
    `Non-native or invalid input for ${phase}`);
  const steps = attempt.steps;
  const crossings = [];
  const bottoms = [];
  let previous;
  let travelled = 0;
  let lowerDistance = 0;
  let airborne = 0;
  let collisions = 0;
  let collisionChecks = 0;
  for (const step of steps) {
    assert.ok(Number.isSafeInteger(step.tick) && step.tick >= 0 && number(step.atMs) &&
      number(step.simSeconds) && number(step.dtSeconds) && step.dtSeconds > 0, 'Invalid native physics tick');
    assert.ok(point(step.from) && point(step.to) && number(step.speed) && step.speed >= 0 &&
      number(step.sweptMetres) && step.sweptMetres >= 0 && typeof step.airborne === 'boolean' &&
      typeof step.airborneBefore === 'boolean' && typeof step.discontinuity === 'boolean' &&
      typeof step.fromRoute === 'string' && typeof step.toRoute === 'string' &&
      Number.isSafeInteger(step.collisionChecks) && step.collisionChecks >= 0 &&
      Array.isArray(step.contacts) && step.contacts.length <= step.collisionChecks, 'Missing E/N/Y, speed, native air or collision data');
    if (previous) {
      assert.equal(step.tick, previous.tick + 1, 'Missing or duplicate native physics tick');
      assert.ok(step.atMs >= previous.atMs && Math.abs(step.simSeconds - previous.simSeconds - step.dtSeconds) <= epsilon,
        'Physics clock gap or reset');
      assert.ok(samePosition(step.from, previous.to) && step.fromRoute === previous.toRoute, 'Discontinuous world position or route between ticks');
    }
    assert.equal(step.discontinuity, false, 'Native trace reported a reset or teleport');
    const displacement = horizontal(step.from, step.to);
    assert.ok(displacement <= step.sweptMetres + epsilon, 'Movement exceeded the native swept distance');
    assert.ok(displacement === 0 || step.collisionChecks > 0, 'A travelled tick lacks native collision evidence');
    collisionChecks += step.collisionChecks;
    airborne += Number(step.airborne || step.airborneBefore);
    for (const contact of step.contacts) {
      assert.ok(typeof contact.id === 'string' && contact.id.length && typeof contact.blocking === 'boolean',
        'Missing collision identity or blocking decision');
      collisions++;
      if (contact.blocking) {
        assert.ok(reverse && contact.id === manifest.collisionId, 'Unexpected blocking collision');
      }
    }

    if (step.gate !== null) {
      assert.equal(step.gate?.id, manifest.gateId, 'Unexpected gate marker');
      assert.ok(step.sweptMetres > 0 && step.collisionChecks > 0, 'No native movement and collision attempt at the gate');
      assert.equal(step.gate.direction, reverse ? 'reverse' : 'downhill', 'Incorrect direction observed at the gate');
      assert.equal(step.gate.result, reverse ? 'rejected' : 'accepted', 'Gate result does not match the intended physical direction');
      assert.equal(step.fromRoute, reverse ? manifest.lowerRoute : manifest.upperRoute, 'Gate was approached from the wrong physical route');
      assert.equal(step.toRoute, manifest.lowerRoute, 'Gate did not enter or remain on the lower route');
      if (crossings.length === 0) {
        assert.ok(previous && travelled > 0, 'Missing actual approach to the gate');
        assert.ok(attempt.inputs.some(input => input.atMs <= step.atMs), 'No trusted input prior to gate attempt');
      }
      if (!reverse) {
        assert.ok(displacement > 0 && step.speed > 0, 'Downhill crossing stalled');
        assert.equal(crossings.length, 0, 'Downhill gate transitioned multiple times');
      }
      crossings.push(step);
    } else {
      assert.equal(step.fromRoute, step.toRoute, 'Route changed without the native gate event');
    }

    if (crossings.length && step.tick > crossings[0].tick && step.fromRoute === manifest.lowerRoute) {
      lowerDistance += displacement;
    }
    if (step.bottom !== null) {
      assert.equal(step.bottom, manifest.bottomId, 'Unrecognized downstream endpoint marker');
      assert.ok(!reverse && step.toRoute === manifest.lowerRoute && crossings.length &&
        step.tick > crossings[0].tick && lowerDistance > 0, 'Missing sustained lower-route travel before the bottom');
      bottoms.push(step);
    }
    travelled += displacement;
    previous = step;
  }
  assert.equal(steps[0].fromRoute, reverse ? manifest.lowerRoute : manifest.upperRoute, 'Trace starts on the wrong route');
  assert.ok(crossings.length > 0, 'No native gate crossing decision was captured');
  assert.equal(airborne, 0, 'An actual physics tick was airborne');
  if (reverse) {
    assert.ok(crossings.some(step => step.contacts.some(contact => contact.id === manifest.collisionId && contact.blocking)),
      'Reverse refusal did not include a blocking gate contact');
    assert.ok(previous.tick > crossings[0].tick && previous.toRoute === manifest.lowerRoute, 'Missing post-refusal sample on the approach side');
  } else {
    assert.ok(bottoms.length > 0, 'R2 bottom was never reached in the same downhill attempt');
  }

  return {
    ticks: steps.length, airborne, collisionChecks, collisions, gateAttempts: crossings.length, distanceMetres: travelled, lowerDistanceMetres: lowerDistance,
    gate: { tick: crossings[0].tick, atMs: crossings[0].atMs, from: crossings[0].from, to: crossings[0].to, speed: crossings[0].speed },
    bottom: bottoms[0] ? { tick: bottoms[0].tick, to: bottoms[0].to, speed: bottoms[0].speed } : null,
  };
}

export function verifyCapture(capture, expected) {
  assert.equal(capture?.schema, 1, 'Missing P-3 R2 live capture schema');
  assert.ok(new URL(capture.url).pathname.endsWith('/town-blockout.html'), 'Evidence did not come from the release viewer entry');
  validateManifest(capture.manifest, expected);
  assert.equal(capture.manifests, 1, 'Live viewer remounted, reloaded, or sent no manifest');
  assert.ok(typeof capture.browser === 'string' && capture.browser.trim(), 'Missing browser version');
  assert.ok(typeof capture.video === 'string' && capture.video === basename(capture.video) &&
    capture.video.endsWith('.webm'), 'Missing continuous Playwright video');
  assert.deepEqual(capture.errors, [], 'Browser reported a load or capture error');
  const downhill = validateAttempt(capture.attempts?.downhill, 'downhill', capture.manifest);
  const reverse = validateAttempt(capture.attempts?.reverse, 'reverse', capture.manifest);
  assert.ok(capture.attempts.downhill.steps.at(-1).atMs < capture.attempts.reverse.steps[0].atMs,
    'Both attempts must be distinct on the same live browser clock');
  const seamOffsets = capture.seamOffsets ?? [];
  assert.ok(Array.isArray(seamOffsets) && seamOffsets.every(row => row.label && number(row.offsetMetres)),
    'Invalid seam-height registration');
  return { status: 'passed', downhill, reverse, seamOffsets };
}

async function record(url, out, expected) {
  const entry = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(entry.hostname) && entry.protocol === 'http:', 'Use the local production composition');
  assert.ok(entry.pathname.endsWith('/town-blockout.html'), 'Open the actual town viewer');
  entry.searchParams.set('p3-r2-proof', '1');
  await mkdir(out, { recursive: true });
  const require = createRequire(join(resolve(process.env.P3_PROJECT_ROOT ?? '.'), 'package.json'));
  const { chromium } = require('@playwright/test');
  const input = createInterface({ input: process.stdin, output: process.stdout });
  const capture = { schema: 1, url: entry.href, manifests: 0, errors: [], attempts: {}, seamOffsets: expected.seamOffsets ?? [] };
  let browser, context, page;
  try {
    browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    capture.browser = browser.version();
    context = await browser.newContext({ viewport: { width: 768, height: 432 }, recordVideo: { dir: out } });
    page = await context.newPage();
    page.on('pageerror', error => capture.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') capture.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) capture.errors.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => capture.errors.push(`${request.url()} ${request.failure()?.errorText}`));
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
    await page.addInitScript(({ eventName, types }) => {
      let manifest, manifests = 0, active;
      Object.defineProperty(window, '__p3R2ProofCapture', {
        value: {
          manifest: () => ({ manifest, manifests }),
          arm: () => { active = { steps: [], inputs: [] }; },
          take: () => { const result = active; active = undefined; return result; },
        },
      });
      window.addEventListener(eventName, ({ detail }) => {
        if (detail?.kind === 'manifest') {
          manifest = structuredClone(detail.data);
          manifests++;
        } else if (detail?.kind === 'step' && active) {
          active.steps.push(structuredClone({ ...detail.data, atMs: performance.now() }));
        }
      });
      for (const type of types) {
        window.addEventListener(type, event => {
          if (active && event.isTrusted) active.inputs.push({
            type, trusted: true, atMs: performance.now(), code: event.code ?? null,
          });
        }, { capture: true, passive: true });
      }
    }, { eventName: channel, types: [...nativeInputs] });
    const response = await page.goto(entry.href, { waitUntil: 'load', timeout: 60_000 });
    assert.equal(response?.status(), 200);
    await page.locator('canvas').first().waitFor({ state: 'visible' });
    try {
      await page.waitForFunction(() => window.__p3R2ProofCapture?.manifest().manifests === 1, undefined, { timeout: 20_000 });
    } catch {
      throw new Error('The host did not expose the mounted production P-3/R2 gate and native runtime probe');
    }
    Object.assign(capture, await page.evaluate(() => window.__p3R2ProofCapture.manifest()));
    validateManifest(capture.manifest, expected);
    for (const phase of phases) {
      await input.question(`Press Enter when ready to record ${phase}; then play in the browser. `);
      await page.evaluate(() => window.__p3R2ProofCapture.arm());
      await input.question(`Press Enter after the actual ${phase} attempt, leaving the viewer open. `);
      capture.attempts[phase] = await page.evaluate(() => window.__p3R2ProofCapture.take());
    }
    Object.assign(capture, await page.evaluate(() => window.__p3R2ProofCapture.manifest()));
    capture.url = page.url();

  } catch (error) {
    capture.errors.push(error.message);
    throw error;
  } finally {
    input.close();
    try {
      const video = page?.video();
      await context?.close();
      if (video) capture.video = basename(await video.path());
    } catch (error) {
      capture.errors.push(`Video preservation: ${error.message}`);
    }
    try {
      await browser?.close();
    } finally {
      await writeFile(join(out, 'p3-r2-capture.json'), JSON.stringify(capture) + '\n');
    }
  }
  return capture;
}

async function verifyBundle(capture, expected, directory) {
  const result = verifyCapture(capture, expected);
  const video = await stat(join(directory, capture.video));
  assert.ok(video.isFile() && video.size > 0, 'Continuous video is empty or missing');
  return { ...result, videoBytes: video.size };
}

async function main([command, first, second, third]) {
  if (command === 'verify' && first && second) {
    const capture = JSON.parse(await readFile(first, 'utf8'));
    const expected = JSON.parse(await readFile(second, 'utf8'));
    console.log(JSON.stringify(await verifyBundle(capture, expected, dirname(resolve(first))), null, 2));
  } else if (command === 'record' && first && second && third) {
    const expected = JSON.parse(await readFile(third, 'utf8'));
    const capture = await record(first, second, expected);
    const result = JSON.stringify(await verifyBundle(capture, expected, second), null, 2);
    await writeFile(join(second, 'p3-r2-result.json'), result + '\n');
    console.log(result);
  } else {
    throw new Error('Usage: p3-r2-proof.mjs verify <capture.json> <expected.json> | record <viewer-url> <output-dir> <expected.json>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
