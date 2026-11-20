import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [outputArg] = process.argv.slice(2);
assert.ok(outputArg, 'Usage: node tools/verify-main-summit-approach-browser.mjs <output-directory>');
const outputDir = path.resolve(outputArg);
const repo = fileURLToPath(new URL('..', import.meta.url));
const assemblySha = '016ffb2c6fa941940fd3343251b986fe28bec649';
const tavern = 'tools/voxel-tavern';
const approach = tavern + '/town-blockout/main-summit-approach.ts';
const fixture = path.join(repo, 'tools/fixtures/main-summit-approach-browser.patch');
const viteRequire = createRequire(path.join(repo, tavern, 'package.json'));
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
const temp = await mkdtemp(path.join(tmpdir(), 'unwritten-p11-'));
const snapshot = path.join(temp, 'snapshot');
const archive = path.join(temp, 'assembly.tar');
const errors = [];
let server;
let browser;

try {
  execFileSync('git', ['cat-file', '-e', assemblySha + '^{commit}'], { cwd: repo });
  await mkdir(snapshot);
  execFileSync('git', [
    'archive', '--output', archive, assemblySha, 'src', 'tools/fixtures/main-summit-snow-belt-survey.json',
    tavern + '/package.json', tavern + '/main-summit-review.html', tavern + '/town-blockout',
  ], { cwd: repo });
  execFileSync('tar', ['-xf', archive, '-C', snapshot]);
  await copyFile(path.join(repo, approach), path.join(snapshot, approach));
  await symlink(path.join(repo, 'node_modules'), path.join(snapshot, 'node_modules'), 'junction');
  await symlink(path.join(repo, tavern, 'node_modules'), path.join(snapshot, tavern, 'node_modules'), 'junction');
  execFileSync('git', ['apply', '--unidiff-zero', fixture], { cwd: snapshot });

  const serverRoot = path.join(snapshot, tavern);
  server = await createServer({
    configFile: false, root: serverRoot, cacheDir: path.join(temp, 'vite-cache'), server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const bind = server.httpServer.address();
  assert.ok(bind && typeof bind === 'object');
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  await mkdir(outputDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(request.url() + ' ' + request.failure()?.errorText));
  const state = () => page.evaluate(() => window.__p1Review.getState());
  const rows = {};
  await page.goto('http://127.0.0.1:' + bind.port + '/main-summit-review.html');
  await page.waitForFunction(() => window.__p11Audit && window.__p1Review.getState().frame > 4, null, { timeout: 25_000 });
  await page.locator('#cloud-station').click();
  rows.terminalStart = await state();
  const survey = await page.evaluate(() => window.__p11Audit.survey);
  const signs = await page.evaluate(() => window.__p11Audit.signs());
  console.log(JSON.stringify({ survey, signs }));
  assert.ok(survey.gate.traversable && survey.stamp.traversable && survey.unsupportedSigns === 0);
  assert.deepEqual(signs.map(sign => sign.meshes), [3, 3, 3]);
  const photo = async (name, sign) => {
    await page.evaluate(sign => window.__p11Audit.look(sign ?? undefined), sign ?? null);
    const before = await state();
    await page.waitForFunction(frame => window.__p1Review.getState().frame >= frame + 3, before.frame);
    await page.screenshot({ path: path.join(outputDir, name + '.png') });
    await page.evaluate(() => window.__p11Audit.look());
  };
  const walk = async (key, target, predicate) => {
    console.log('Walk', key, target);
    await page.keyboard.down(key);
    try {
      await (await page.waitForFunction(predicate, target, { timeout: 29_000 })).dispose();
    } finally {
      await page.keyboard.up(key);
    }
    return state();
  };
  const eastAtLeast = (x) => window.__p1Review.getState().east >= x;
  const eastAtMost = (x) => window.__p1Review.getState().east <= x;
  const northAtLeast = (n) => window.__p1Review.getState().north >= n;
  const northAtMost = (n) => window.__p1Review.getState().north <= n;
  await photo('terminal-sign', 0);
  rows.turn = await walk('w', -12.75, northAtLeast);
  rows.apron = await walk('a', .13, eastAtMost);
  await photo('gate-turn-sign', 1);
  rows.branchTurn = await walk('s', -17, northAtMost);
  rows.monument = await walk('d', 5.03, eastAtLeast);
  await page.keyboard.press('e');
  rows.stamp = await state();
  assert.equal(rows.stamp.assembly.registration, 'cloud-stamp');
  await photo('front-monument');
  await photo('monument-wayfinding', 2);
  rows.branchReturn = await walk('a', .13, eastAtMost);
  rows.gateArrival = await walk('w', 20, northAtLeast);
  assert.equal(rows.gateArrival.seamCrossings - rows.terminalStart.seamCrossings, 1);
  await photo('gate-arrival');
  rows.apronReturn = await walk('s', -12.75, northAtMost);
  rows.returnTurn = await walk('d', 35.8, eastAtLeast);
  rows.terminalReturn = await walk('s', -35.5, northAtMost);
  assert.equal(rows.terminalReturn.seamCrossings - rows.terminalStart.seamCrossings, 2);
  assert.ok(rows.terminalReturn.maxAcceptedStep <= .43);
  assert.equal(rows.terminalReturn.blocked - rows.terminalStart.blocked, 0);
  await photo('terminal-return');
  const reduced = Object.fromEntries(Object.entries(rows).map(([name, step]) =>
    [name, {
      ...step.assembly.worldFeet, blocked: step.blocked, seamCrossings: step.seamCrossings,
      maxAcceptedStep: step.maxAcceptedStep, registration: step.assembly.registration,
    }]));
  const output = { assemblySha, browser: browser.version(), survey, signs, rows: reduced, errors };
  await writeFile(path.join(outputDir, 'browser.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  assert.deepEqual(errors, []);
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await server?.close();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
}
