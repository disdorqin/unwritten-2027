import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: node tools/verify-sky-city-browser.mjs OUTPUT');
await mkdir(output, { recursive: true });
const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { build, preview } = await import(pathToFileURL(vite));
const result = { source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim(),
  status: 'failed', errors: [], checks: [] };

const { chromium } = requireRoot('playwright');
requireRoot('tsx/esm/api').register();
const sceneModule = 'town-blockout/sky-city-';
const { buildSkyCityBuildings } = await import(pathToFileURL(path.join(root, sceneModule + 'buildings.ts')));
const { buildSkyCityTower } = await import(pathToFileURL(path.join(root, sceneModule + 'tower.ts')));

let server, browser, page;
const viewSize = { width: 760, height: 500 };
const shot = async name => {
  const header=page.locator('header');await header.evaluate(el=>{el.style.visibility='hidden'});
  try{return await page.screenshot({path:path.join(output,name+'.jpg'),quality:78})}
  finally{await header.evaluate(el=>{el.style.visibility=''})}
};
const snapshot = () => page.evaluate(() => window.lastSkyCityFrame);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

async function turn(heading) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const delta = wrap(heading - (await snapshot()).yaw);
    if (Math.abs(delta) < .005) return;
    await page.mouse.move(410, 264);
    await page.mouse.down();
    await page.mouse.move(410 + Math.round(Math.max(-220, Math.min(220, delta / .003))), 264);
    await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  }
  throw new Error('Mouse drag did not reach desired heading');
}

async function walk([x, y, z], epsilon = .30) {
  const previous = (await snapshot()).foot;
  if (Math.hypot(previous.x - x, previous.z - z) < epsilon) return previous;
  await turn(Math.atan2(x - previous.x, previous.z - z));
  try {
    await page.keyboard.down('w');
    await page.waitForFunction(({ x, z, epsilon }) => {
      const foot = window.lastSkyCityFrame?.foot;
      return foot && Math.hypot(foot.x - x, foot.z - z) < epsilon;
    }, { x, z, epsilon }, { polling: 'raf', timeout: 6_000 });
  } finally { await page.keyboard.up('w'); }
  const foot = (await snapshot()).foot;
  assert.ok(Math.abs(foot.y - y) <= .31, JSON.stringify({ expected: [x, y, z], foot }));
  return foot;
}

try {
  result.step = 'build';
  const outDir = path.join(output, 'dist');
  await build({ root, configFile: false, logLevel: 'warn', build: { outDir,
    emptyOutDir: false, rollupOptions: { input: path.join(root, 'sky-city-review.html') } } });
  server = await preview({ root, configFile: false, logLevel: 'warn', build: { outDir },
    preview: { host: '127.0.0.1', port: 0 } });
  const args = process.platform === 'win32' ? ['--use-gl=angle', '--use-angle=d3d11'] : ['--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ executablePath: process.env.SKY_CITY_CHROME, args });
  page = await browser.newPage({ viewport: viewSize });
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', console => { if (console.type() === 'error') result.errors.push(console.text()); });
  page.on('response', response => { if (response.status() >= 400) result.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = undefined;
    document.addEventListener('sky-city-frame', event => { window.lastSkyCityFrame = event.detail; });
  });
  result.step = 'render tiers';
  assert.equal((await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sky-city-review.html`)).status(), 200);
  await page.waitForFunction(() => window.lastSkyCityFrame?.tier === 'silhouette');
  result.checks.push({ summit: await snapshot() });
  await shot('01-summit');
  await page.getByRole('button', { name: '地面', exact: true }).click();
  await page.waitForFunction(() => window.lastSkyCityFrame?.tier === 'hidden');
  result.checks.push({ valley: await snapshot() });
  await page.getByRole('button', { name: '绝顶', exact: true }).click();
  await page.waitForFunction(() => window.lastSkyCityFrame?.tier === 'silhouette');
  result.step = 'flight and touchdown';
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.lastSkyCityFrame?.view === 'aircraft' && window.lastSkyCityFrame.tier === 'full',
    null, { timeout: 30_000 });
  result.checks.push({ approach: await snapshot() });
  await shot('02-approach');
  await page.waitForFunction(() => window.lastSkyCityFrame?.view === 'city', null, { timeout: 34_000 });
  const landed = await snapshot();
  assert.equal(landed.flight.phase, 'landed');
  assert.equal(landed.flight.recovery, null);
  result.checks.push({ landed });
  await shot('03-landing');
  if(process.argv.includes('--observatory')){
    result.step='observatory hall and return';
    const route=[[-14,31],[8,29],[15,20],[15,12],[15,7],[16,1],[16,-4],[16,-6]];
    for(const [x,z]of route.slice(0,6))await walk([x,0,z],.22);
    await turn(0);await shot('18-observatory-front-day');
    await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
    await shot('18-observatory-front-night');await page.keyboard.press('n');
    for(const [x,z]of route.slice(6))await walk([x,0,z],.22);
    await turn(-Math.PI/2);await shot('19-star-chart-day');
    await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
    await shot('19-star-chart-night');await page.keyboard.press('n');
    await turn(Math.PI/2);await shot('20-telescope-day');
    await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
    await shot('20-telescope-night');await page.keyboard.press('n');
    result.checks.push({observatory:await snapshot()});
    for(const [x,z]of route.slice(0,-1).reverse())await walk([x,0,z],.22);
    await walk([-14,0,37.4],.25);
    result.checks.push({returnToLanding:await snapshot()});await shot('21-return');
    assert.deepEqual(result.errors,[]);result.status='passed';
  }else if(process.argv.includes('--district')){
    result.step='new district first-person circuit';
    async function visit(name,points,heading){
      for(const [x,z] of points)await walk([x,0,z],.22);
      await turn(heading);await shot(name+'-day');
      await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
      await shot(name+'-night');result.checks.push({name,...await snapshot()});
      await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===false);
    }
    await visit('13-wing-rack',[[-14,31],[8,29],[12,29.5]],Math.PI);
    await visit('14-residences',[[12,31],[22,19],[27.8,19],[30,19]],Math.PI);
    await visit('14b-residence-front',[[35,19],[35,23],[35,32.5],[30,35]],0);
    await visit('15-greenhouse',[[35,32.5],[35,23],[35,19],[30,19],[27.3,19],[27.3,12],[27.3,5],[27.3,0],[37,-1],[39,-12],[39,-21],[39,-24.5]],0);
    await visit('16-ship-gallery',[[39,-21],[32,-18],[24,-18],[14,-16],[0,-17],[-14,-14],[-24,-17],[-32,-18],[-32,-21.5]],0);
    await visit('17-beacon',[[-32,-18],[-22,-18],[-16,-25]],0);
    assert.deepEqual(result.errors,[]);result.status='passed';
  }else{
  // B91 expanded district: ordinary WASD walking, never camera teleport.
  result.step='walk new clinic and seed storage';
  const clinic=[[-14,0,31],[8,0,29],[17,0,20],[22,0,19],[22,0,15]];
  for(const point of clinic)await walk(point);
  await turn(0);await shot('07-clinic-day');
  await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
  await shot('08-clinic-night');
  result.checks.push({clinic:await snapshot()});
  await page.keyboard.press('n');
  const seed=[[22,0,19],[27.8,0,19],[28.5,0,12],[34,0,11.3],[34,0,7.0]];
  for(const point of seed)await walk(point);
  await turn(0);await shot('09-seed-store-day');
  await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
  await shot('10-seed-store-night');result.checks.push({seedStore:await snapshot()});
  await page.keyboard.press('n');
  for(const point of [...seed].reverse().slice(1))await walk(point);
  for(const point of [...clinic].reverse().slice(2))await walk(point);
  result.step = 'walk into dormitory';
  const dorm = buildSkyCityBuildings().dormRoute;
  for (const stop of dorm) await walk(stop);
  await turn(0);
  await shot('04-dormitory');
  result.checks.push({ dormitory: await snapshot() });
  result.step = 'walk to crystal court';
  for (const stop of [...dorm].reverse()) await walk(stop);
  for (const stop of [[-13, 0, 7], [-9, 0, 5.8], [-5.7, 0, 4.2]]) await walk(stop);
  await turn(Math.atan2(5.7, 4.2));
  await page.keyboard.down('ArrowDown');
  try { await page.waitForTimeout(320); } finally { await page.keyboard.up('ArrowDown'); }
  await shot('05-crystal-court');
  await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
  await shot('11-crystal-court-night');
  result.checks.push({ crystal: await snapshot() });await page.keyboard.press('n');
  for (const stop of [[-9, 0, 5.8], [-13, 0, 7], [-13, 0, 2], [-14, 0, -11], [-11, 0, -17], [-5, 0, -19]]) await walk(stop);
  result.step = 'stairs to locked gate';
  const tower = buildSkyCityTower();
  for (const [index, stop] of tower.route.entries()) {
    if (index > 2 && index < tower.route.length - 5 && index % 2 === 1) continue;
    result.towerWaypoint = index;
    await walk(stop, .25);
  }
  await turn(0);
  await page.getByText('未央门 · 锁闭', { exact: true }).waitFor();
  await shot('06-locked-gate');
  await page.keyboard.press('n');await page.waitForFunction(()=>window.lastSkyCityFrame?.night===true);
  await shot('12-locked-gate-night');await page.keyboard.press('n');
  try {
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
  } finally { await page.keyboard.up('w'); }
  const blocked = await snapshot();
  assert.equal(blocked.view, 'city');
  assert.ok(blocked.foot.z > tower.gate[2]);
  result.checks.push({ lockedGate: blocked });
  assert.deepEqual(result.errors, []);
  result.status = 'passed';
  }
} catch (error) {
  result.failure = error.stack;
  result.last = await snapshot().catch(() => undefined);
  if (page) await shot('failed').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(path.join(output, 'sky-city-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
