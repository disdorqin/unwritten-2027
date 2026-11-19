import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const url = new URL(process.env.P4_URL ?? 'http://127.0.0.1:5814/tools/voxel-tavern/main-summit-p4-review.html');
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Use a runner-local preview');
assert.equal(url.pathname, '/tools/voxel-tavern/main-summit-p4-review.html');
url.searchParams.set('proof', '1');
const output = process.env.P4_OUTPUT ?? process.argv[2];
assert.ok(output, 'Set P4_OUTPUT to the evidence directory');
await mkdir(output, { recursive: true });

const newProfile = { cloudStamped: false, summitStamped: false, summitRegistered: false, snowWingEligible: false };
const cloudProfile = { ...newProfile, cloudStamped: true };
const stampedProfile = { ...cloudProfile, summitStamped: true };
const registeredProfile = { ...stampedProfile, summitRegistered: true, snowWingEligible: true };
const viewport = { width: 840, height: 472 };
const errors = [];
const stages = {};
const screenshots = [];
const report = { viewport, errors, stages, screenshots };

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.P4_CHROMIUM_PATH || undefined, args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ] });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
  });
  page.on('requestfailed', request => errors.push({ type: 'requestfailed', url: request.url(), message: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) errors.push({ type: 'http', url: response.url(), status: response.status() });
  });

  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 45_000 });
  assert.equal(response?.status(), 200);
  const waitForProof = () => page.waitForFunction(() => typeof window.p4?.snapshot === 'function', undefined, { timeout: 15_000 });
  await waitForProof();
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 15_000 });

  const state = () => page.evaluate(() => window.p4.snapshot());
  const action = page.locator('#action');
  const status = page.locator('#status');
  function assertAt(snapshot, east, north, height, label) {
    const tolerance = 0.18;
    for (const [axis, expected] of Object.entries({ east, north, height })) {
      assert.ok(Math.abs(snapshot.position[axis] - expected) <= tolerance,
        `${label} ${axis}: expected ${expected} but received ${snapshot.position[axis]}`);
    }
  }
  async function walk(key, milliseconds) {
    await page.keyboard.down(key);
    try {
      await page.evaluate(duration => window.p4.advance(duration), milliseconds);
    } finally {
      await page.keyboard.up(key);
    }
    return state();
  }
  async function capture(name) {
    const snapshot = await state();
    assert.ok(snapshot.render.draws > 0 && snapshot.render.triangles > 0, `${name}: expected rendered geometry`);
    const file = `${name}.png`;
    await page.screenshot({ path: join(output, file), timeout: 15_000 });
    screenshots.push(file);
    stages[name] = snapshot;
    return snapshot;
  }
  async function assertHidden() {
    assert.equal(await action.isVisible(), false);
    assert.equal((await state()).action, null);
  }

  assert.deepEqual((await state()).profile, newProfile);
  await assertHidden();
  await page.keyboard.press('e');
  assert.deepEqual((await state()).profile, newProfile, 'Cloud stamp cannot be granted outside its approach');
  const lowerPoint = await walk('w', 1562.5);
  assertAt(lowerPoint, 306, 659, 347, 'Cloud-deck stamp approach');
  assert.equal(await action.isVisible(), true);
  assert.equal(await action.getAttribute('data-action'), 'cloud-stamp');
  await page.keyboard.press('e');
  const lower = await capture('01-cloud-stamp-only');
  assert.equal(lower.lastAction, 'cloud-stamp');
  assert.deepEqual(lower.profile, cloudProfile);
  await assertHidden();

  await page.locator('[data-p4-area="summit"]').click();
  const beforeArrival = await capture('02-before-summit-arrival');
  assertAt(beforeArrival, 30, 982, 800, 'Surveyed P-3 summit trail landing');
  assert.equal(beforeArrival.mountCount, 2);
  assert.equal(beforeArrival.arrived, false);
  await assertHidden();
  await page.keyboard.press('e');
  assert.deepEqual((await state()).profile, cloudProfile);

  await walk('d', 10156.25);
  const arrived = await walk('w', 7100);
  assertAt(arrived, 62.5, 1004.72, 800, 'Summit entry');
  assert.equal(arrived.arrived, true);
  assert.equal(arrived.insideHut, false);
  await assertHidden();
  await capture('03-summit-arrival');

  await walk('s', 2100);
  const summitMarker = await walk('a', 3906.25);
  assertAt(summitMarker, 50, 998, 800, 'Summit monument approach');
  assert.equal(await action.getAttribute('data-action'), 'summit-stamp');
  await page.keyboard.press('e');
  const upper = await capture('04-summit-stamp-only');
  assert.deepEqual(upper.profile, stampedProfile, 'Stamps alone do not enable snow wings');
  assert.equal(upper.lastAction, 'summit-stamp');

  await walk('d', 3906.25);
  await walk('w', 2100);
  const interior = await walk('w', 1950);
  assertAt(interior, 62.5, 1010.96, 800, 'Summit hut interior');
  assert.equal(interior.insideHut, true);
  assert.equal(interior.collisions, 0, 'Entry center should clear the hut colliders');
  await assertHidden();
  await capture('05-summit-hut-interior');

  const desk = await walk('w', 950);
  assertAt(desk, 62.5, 1014, 800, 'Snow-wing registrar approach');
  assert.equal(desk.action, 'register-summit');
  assert.equal(await action.isVisible(), true);
  await capture('06-registration-available');
  await page.keyboard.press('e');
  const registered = await capture('07-registration-and-eligibility');
  assert.equal(registered.lastAction, 'register-summit');
  assert.deepEqual(registered.profile, registeredProfile);
  assert.match(await status.textContent(), /可领取雪翼/);
  await assertHidden();
  await page.keyboard.press('e');
  assert.deepEqual((await state()).profile, registeredProfile);

  await page.locator('[data-p4-area="cloud-deck"]').click();
  let remounted = await state();
  assert.equal(remounted.mountCount, 3);
  assert.equal(remounted.area, 'cloud-deck');
  assert.deepEqual(remounted.profile, registeredProfile);
  await page.locator('[data-p4-area="summit"]').click();
  remounted = await capture('08-remounted-profile');
  assert.equal(remounted.mountCount, 4);
  assert.equal(remounted.arrived, false);
  assert.deepEqual(remounted.profile, registeredProfile);
  await assertHidden();

  await page.reload({ waitUntil: 'load', timeout: 45_000 });
  await waitForProof();
  const reloaded = await capture('09-reloaded-profile');
  assert.equal(reloaded.mountCount, 1);
  assert.equal(reloaded.area, 'cloud-deck');
  assert.deepEqual(reloaded.profile, registeredProfile);
  await assertHidden();
  assert.deepEqual(errors, [], 'Browser run should have no page or resource errors');
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await writeFile(join(output, 'browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close();
}
