import assert from 'node:assert/strict';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const url = new URL(process.env.EXPANSION_URL ?? '');
assert.equal(url.protocol, 'http:');
assert.ok(url.hostname === '127.0.0.1' || url.hostname === 'localhost', 'Use a runner-local preview');
assert.equal(url.pathname, '/tools/voxel-tavern/town-expansion-review.html');
const output = process.env.EXPANSION_OUTPUT;
assert.ok(output, 'EXPANSION_OUTPUT is required');
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const layout = { width: 1040, height: 760 };
const record = {
  baselineSha: process.env.EXPANSION_BASELINE_SHA,
  candidateSha: process.env.EXPANSION_CANDIDATE_SHA,
  viewport: layout,
  scope: 'Isolated Chromium preview fixture',
  checks: [],
  screenshots: [],
  pageErrors: [],
  requestFailures: [],
  httpErrors: [],
  consoleWarnings: [],
};
const screenshotDir = join(output, 'screenshots');
await mkdir(screenshotDir, { recursive: true });

async function writeEvidence() {
  await writeFile(join(output, 'expansion-record.json'), JSON.stringify(record, null, 2) + '\n');
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const body = [
    '## Underground and orbital candidate browser evidence',
    '',
    '- Result: ' + (record.failure ? 'failed — ' + record.failure.replace(/[\r\n]+/g, ' ') : 'passed'),
    '- Browser: ' + (record.browser ?? 'not started'),
    '- Checks / screenshots: ' + record.checks.length + ' / ' + record.screenshots.length,
    '- Page errors / request failures / HTTP errors: ' +
      [record.pageErrors.length, record.requestFailures.length, record.httpErrors.length].join(' / '),
    '',
    '| Selected fixture state | Draws | Triangles |',
    '|---|---:|---:|',
    ...record.screenshots.map(({ label, draws, triangles }) => '| ' + label + ' | ' + draws + ' | ' + triangles + ' |'),
    '',
    'Measurements are from the isolated review canvas under Chromium software rendering.',
  ].join('\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, body + '\n');
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  record.browser = browser.version();
  const context = await browser.newContext({ viewport: layout, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const requestUrl = route.request().url();
    if (requestUrl === url.origin + '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    return requestUrl.startsWith(url.origin + '/') || requestUrl.startsWith('data:')
      ? route.continue()
      : route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => record.pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      record.consoleWarnings.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('requestfailed', request => {
    record.requestFailures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (response.status() >= 400) record.httpErrors.push({ url: response.url(), status: response.status() });
  });

  const response = await page.goto(url.href, { waitUntil: 'load', timeout: 90_000 });
  assert.equal(response?.status(), 200);
  const viewport = page.locator('#review-viewport');
  await viewport.locator('canvas').waitFor({ state: 'visible', timeout: 25_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('#review-viewport');
    return Number(element?.dataset.draws) > 0 && Number(element?.dataset.triangles) > 0;
  }, undefined, { timeout: 20_000 });

  const location = page.locator('#review-location');
  const status = page.locator('#review-status');
  const action = name => page.locator('#review-actions').getByRole('button', { name, exact: true });
  async function check(label, expectedLocation, expectedStatus, screenshot) {
    const where = (await location.textContent())?.trim() ?? '';
    const message = (await status.textContent())?.trim() ?? '';
    assert.match(where, expectedLocation, label + ': unexpected review location ' + where);
    if (expectedStatus) assert.match(message, expectedStatus, label + ': unexpected status ' + message);
    const frame = await viewport.evaluate(element => ({
      draws: Number(element.dataset.draws),
      triangles: Number(element.dataset.triangles),
    }));
    assert.ok(Number.isInteger(frame.draws) && frame.draws > 0, label + ': no WebGL draws');
    assert.ok(Number.isInteger(frame.triangles) && frame.triangles > 0, label + ': no WebGL triangles');
    const evidence = { label, location: where, status: message, ...frame };
    record.checks.push(evidence);
    if (screenshot) {
      const path = 'screenshots/' + screenshot + '.png';
      await page.locator('main').screenshot({ path: join(output, path), timeout: 20_000 });
      record.screenshots.push({ ...evidence, path });
    }
  }
  async function click(label) {
    await action(label).click({ timeout: 10_000 });
  }
  async function verifyNoAction(label) {
    assert.equal(await action(label).count(), 0, 'Unexpected action: ' + label);
  }

  await check('Three crater terraces', /陨星原.*三层环台/, undefined, '01-crater');
  await click('查看坑底绞盘');
  await check('Covered shaft on the surface', /陨星原.*井口/, /和平模式|盖板.*[闭关]/, '02-covered-shaft');
  await verifyNoAction('乘吊笼下井');
  await click('转绞盘并走查首坠');
  await check('First fall reaches the pool without damage', /矿洞首段.*井底潭/, /首坠.*(?:伤害|受伤)\D*0/, '03-first-fall');
  await click('检查主巷至营地');
  await check('198 samples from pool to camp', /矿洞首段.*营地/, /198.*(?:通过|可走)/, '04-camp');
  await verifyNoAction('乘吊笼返回坑底');
  await click('返回井底潭走查点');
  await check('198 samples along the reverse route', /矿洞首段.*井底潭/, /198/, '05-reverse-to-pool');
  await click('乘吊笼返回坑底');
  await check('Cage ascends and leaves the shaft open', /陨星原.*井口/, /吊笼上行.*盖板保持开启/, '06-cage-return');
  await verifyNoAction('转绞盘并走查首坠');
  await click('乘吊笼下井');
  await check('Cage can descend again', /矿洞首段.*井底潭/, /吊笼下行/, undefined);

  await page.locator('#review-orbital').click({ timeout: 10_000 });
  await check('Starport gate starts closed', /星港太空门.*外门/, /试验门.*关闭/, undefined);
  await click('经当前门进入气闸');
  await check('Locked starport rejects entry', /星港太空门.*外门/, /仍锁定/, '07-starport-locked');
  await click('选取另一外门夹具');
  await click('经当前门进入气闸');
  await check('Locked core gate rejects entry', /地宫核心舱门.*外门/, /仍锁定/, '08-core-locked');
  await click('选取另一外门夹具');
  await click('打开试验门旗标');
  await click('经当前门进入气闸');
  await check('Starport arrives at its designated airlock port', /气闸舱.*返程门/, /星港.*抵达对应气闸口/, '09-starport-airlock');
  await click('返回地宫');
  await check('Starport side refuses the wrong return', /气闸舱.*返程门/, /不在对应门口/, undefined);
  await click('检视驾驶舱');
  await check('Cockpit shows the console and front window', /驾驶舱.*控制台.*舷窗/, /控制台.*手位/, '10-cockpit');
  await click('检视星港侧门前点');
  await click('返回星港');
  await check('Starport gate returns to starport', /星港太空门.*外门/, /星港.*返回对应地面门口/, undefined);
  await click('选取另一外门夹具');
  await click('经当前门进入气闸');
  await check('Core gate arrives at its designated airlock port', /气闸舱.*返程门/, /地宫.*抵达对应气闸口/, '11-core-airlock');
  await click('返回星港');
  await check('Core side refuses the wrong return', /气闸舱.*返程门/, /不在对应门口/, undefined);
  await click('检视地宫侧门前点');
  await click('返回地宫');
  await check('Core gate returns to the core', /地宫核心舱门.*外门/, /地宫.*返回对应地面门口/, undefined);

  assert.ok(record.screenshots.length >= 6);
  assert.deepEqual(record.pageErrors, [], 'Uncaught browser errors');
  assert.deepEqual(record.consoleWarnings.filter(({ type }) => type === 'error'), [], 'Browser console errors');
  assert.deepEqual(record.requestFailures, [], 'Failed candidate requests');
  assert.deepEqual(record.httpErrors, [], 'HTTP errors for candidate requests');
} catch (error) {
  record.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeEvidence();
  console.log(JSON.stringify({ checks: record.checks.length, screenshots: record.screenshots.length, failure: record.failure }));
}
