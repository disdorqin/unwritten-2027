import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [checkoutArg, outputArg] = process.argv.slice(2);
assert.ok(checkoutArg && outputArg, 'Usage: node verify-main-summit-posts-browser.mjs <checkout> <output>');
const checkout = path.resolve(checkoutArg);
const output = path.resolve(outputArg);
const viteRoot = path.join(checkout, 'tools', 'voxel-tavern');
const lookup = createRequire(path.join(checkout, 'package.json'));
const { chromium } = lookup('playwright');
const { createServer } = await import(pathToFileURL(lookup.resolve('vite')).href);
const viewport = { width: 960, height: 620 };
const keys = [['w', 'KeyW'], ['a', 'KeyA'], ['s', 'KeyS'], ['d', 'KeyD']];
const sourceRevisions = {
  assembly: '016ffb2c6fa941940fd3343251b986fe28bec649',
  approach: '9392a79f9bef0143239f50db097348ba24123d63',
};
const assemblySources = {
  'main-summit-assembly.ts': 'e1d7b99180ee79ded84052688667eab006ea0a74',
  'main-summit-block.ts': 'a0dd7b83be27a461a177dd6032114aef96bef6d2',
  'main-summit-cable-scene.ts': '95d088a9602ae8def03a37267eaec4c1ce09e55e',
  'main-summit-cable-stations.ts': '4b79c0e649ead51576799fb8951f30f48c34b7df',
  'main-summit-cable.ts': '0a4155cbd332a50c1e53018d9e8798f5598cda46',
  'main-summit-pavilion-site.ts': 'e7271b2d17fe0b314a81eb1c5d1a5ddfdcf77901',
  'main-summit-pavilions.ts': '25ed2b763991454087db82a5482bffd949d4e776',
  'main-summit-registration.ts': '80b739784292592010f61552bc7325034d8ff33a',
  'main-summit-snow-belt.ts': '0abc7feec9b8f266cdf50dd3e9fcf81c8772d87e',
  'main-summit-snow-mesh.ts': '6e08a95d1588f03ed73246eb4e32e3c8a38b5222',
  'main-summit-snow-transition.ts': 'b4a9a80ac9cafb1d28d62fd5b545ef5c45a158cd',
  'main-summit-trail.ts': 'ecbe4f054fe7a16f827d4e5fa8cdc6a66db8bb3c',
  'north-ridge-350-terrain.ts': 'a98e2dbef612f2c94ca813d01a0c5ac6bb7e6ae6',
  'town-physics-clock.ts': '61c21e8d1f9ffa718a0eaebd7585f654efb3da83',
};
const blockout = 'tools/voxel-tavern/town-blockout/';
const results = [];
const errors = [];
let server, browser, page, failure;
let browserVersion, provenance;

function git(args) {
  return execFileSync('git', args, { cwd: checkout, encoding: 'utf8', timeout: 5_000 }).trim();
}

function verifySources() {
  const expected = [
    ...Object.entries(assemblySources).map(([file, blob]) => [blockout + file, blob]),
    ['tools/fixtures/main-summit-snow-belt-survey.json', '95aa66e250c29e5b13ec39c3f1ea67fb10356d96'],
    [blockout + 'main-summit-approach.ts', 'dd8cae15aa91f272cf3d0b6c848812597e824bd6'],
  ];
  const files = Object.fromEntries(expected.map(([file, blob]) => {
    const actual = git(['hash-object', file]);
    assert.equal(actual, blob, `Pinned proof source changed: ${file}`);
    return [file, actual];
  }));
  for (const file of [blockout + 'main-summit-posts.ts', blockout + 'main-summit-posts-review.ts',
    'tools/voxel-tavern/main-summit-posts-review.html', 'tools/verify-main-summit-posts-browser.mjs']) {
    files[file] = git(['hash-object', file]);
  }
  return { sources: sourceRevisions, checkout: git(['rev-parse', 'HEAD']), files };
}

const state = () => page.evaluate(() => window.__p5Review.getState());
const gap = (a, b) => Math.hypot(a.east - b.east, a.north - b.north);

async function walkTo(target, [key, code]) {
  const before = await state();
  const distance = gap(before, target);
  assert.ok(distance > 0);
  await page.evaluate(({ target, code }) => window.__p5Review.aim(target.east, target.north, code), { target, code });
  await page.keyboard.down(key);
  let after;
  try {
    after = await page.evaluate(distance => window.__p5Review.advance(distance / window.__p5Review.speed), distance);
  } finally { await page.keyboard.up(key); }
  assert.equal(after.resets, before.resets, 'The position reset during a keyboard leg.');
  assert.equal(after.rejected, before.rejected, `${before.active} ${code} was blocked: ${JSON.stringify(after)}`);
  assert.ok(after.accepted > before.accepted && after.frame > before.frame);
  assert.ok(gap(after, target) < .002, `Did not reach waypoint: ${JSON.stringify({ target, after })}`);
  assert.ok(Math.abs(after.walked - before.walked - distance) < .002);
  return { code, target, before, after };
}

async function review(id) {
  await page.locator('#' + id).click();
  const { route, post } = await page.evaluate(() => ({ route: window.__p5Review.route(), post: window.__p5Review.post() }));
  const start = await state();
  assert.equal(start.active, id);
  assert.ok(gap(start, route[0]) < .002);
  const result = { id, post, route, start, forward: [], reverse: [] };
  results.push(result);
  for (const [index, target] of route.slice(1).entries()) result.forward.push(await walkTo(target, keys[index % keys.length]));
  await page.evaluate(({ east, north }) => window.__p5Review.aim(east, north, 'KeyW', -.30), post.stand);
  result.approach = await state();
  assert.ok(result.approach.drawnParts.includes(id) && result.approach.draws > 0 && result.approach.triangles > 0);
  assert.ok(gap(result.approach, post.visitor) < .002);
  result.screenshot = `p5-${id}.png`;
  await page.screenshot({ path: path.join(output, result.screenshot), timeout: 20_000 });
  for (const [index, target] of route.slice(0, -1).reverse().entries()) {
    result.reverse.push(await walkTo(target, keys[(index + 2) % keys.length]));
  }
  result.returned = await state();
  assert.ok(gap(result.returned, start) < .002);
  assert.ok(result.returned.maxStep <= .43);
  assert.equal(result.returned.resets, start.resets);
}

await mkdir(output, { recursive: true });
try {
  provenance = verifySources();
  server = await createServer({
    root: viteRoot, configFile: false, logLevel: 'error',
    optimizeDeps: { entries: ['main-summit-posts-review.html'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [checkout] } },
  });
  await server.listen();
  const address = server.httpServer.address();
  const executablePath = process.env.CHROMIUM_PATH ??
    (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({
    executablePath, headless: true, timeout: 20_000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  browserVersion = browser.version();
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => { errors.push(String(error)); });
  await page.goto(`http://127.0.0.1:${address.port}/main-summit-posts-review.html?proof=1`, { timeout: 30_000 });
  await page.waitForFunction(() => window.__p5Review?.getState().frame > 0, undefined, { timeout: 30_000 });
  for (const id of ['gatekeeper', 'dispatcher', 'pavilion-keeper']) await review(id);
  assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error.stack ?? error);
  if (page) await page.screenshot({ path: path.join(output, 'p5-aborted.png'), timeout: 3_000 }).catch(() => {});
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(path.join(output, 'p5-main-summit-posts-evidence.json'), JSON.stringify({
    passed: !failure, browser: browserVersion, viewport, provenance, results, errors, failure,
  }, null, 2) + '\n');
}
if (failure) throw new Error(failure);
console.log(`P-5 passed three keyboard approaches and returns in Chromium ${browserVersion}.`);
