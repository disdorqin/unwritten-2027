import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.S4_URL ?? 'http://127.0.0.1:4173/tools/voxel-tavern/orbital-travel-review.html?proof=1';
const output = resolve(process.env.S4_OUTPUT ?? 'artifacts/orbital-travel');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.S4_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const proof = { browser: browser.version(), errors: [], captures: [], anchors: [], routes: [], trips: [] };
const page = await browser.newPage({ viewport: { width: 1050, height: 760 } });
page.on('pageerror', error => proof.errors.push(error.message));
page.on('requestfailed', request => proof.errors.push(request.url() + ' ' + request.failure()?.errorText));
const labels = [['starport', '星港'], ['crater-bottom', '坑底'], ['summit', '绝顶'], ['plaza', '广场']];

const current = () => page.locator('#current').evaluate(node => ({
  domain: node.dataset.domain, room: node.dataset.room, visited: node.dataset.visited,
  east: Number(node.dataset.east), north: Number(node.dataset.north), yaw: Number(node.dataset.yaw),
  height: Number(node.dataset.height), steps: Number(node.dataset.physicalSteps),
  rooms: Number(node.dataset.completedRooms),
}));

async function capture(file) {
  await page.screenshot({ path: resolve(output, file) });
  proof.captures.push({ file, ...await current() });
}

async function rotate(target) {
  const { yaw } = await current();
  const delta = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  if (Math.abs(delta) <= .045) return;
  const key = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(([original, angle]) => {
      const now = Number(document.querySelector('#current').dataset.yaw);
      return Math.abs(now - original) >= Math.abs(angle) - .025;
    }, [yaw, delta], { timeout: 6000 });
  } finally { await page.keyboard.up(key); }
}

async function walkTo(x, n) {
  for (let step = 0; step < 35; step++) {
    const start = await current();
    const east = x - start.east, north = n - start.north;
    const distance = Math.hypot(east, north);
    if (distance <= .17) return start;
    await rotate(Math.atan2(-east, north));
    const stride = Math.min(1.35, distance - .075);
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(([startE, startN, length]) => {
        const { dataset } = document.querySelector('#current');
        return Math.hypot(Number(dataset.east) - startE, Number(dataset.north) - startN) >= length;
      }, [start.east, start.north, stride], { timeout: 6500 });
    } finally { await page.keyboard.up('w'); }
  }
  throw new Error(`Could not reach reviewed footpoint ${x},${n}`);
}

const button = label => page.getByRole('button', { name: label, exact: true });

try {
  await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForFunction(() => document.querySelector('#current').dataset.domain === 'local-fixture-starport');
  for (const [site, label] of [['starport', '星港'], ['core', '地宫门']]) {
    await button('验收定位 · ' + label).click();
    await page.keyboard.press('e');
    assert.equal(await page.locator('#result').evaluate(node => node.value), '未解锁');
    assert.equal((await current()).domain, 'local-fixture-' + site);
    await capture(`locked-${site}.png`);
  }

  await button('试走太空章').click();
  for (const [id, label] of labels) {
    const before = await current();
    await button('验收定位 · ' + label).click();
    assert.equal((await current()).visited, before.visited);
    const near = await walkTo(0, 0);
    assert.ok(near.visited.split(',').includes(id) && near.steps > before.steps);
    proof.anchors.push({ id, before: before.visited, ...near });
  }

  await button('验收定位 · 星港').click();
  await page.keyboard.press('e');
  assert.equal((await current()).room, 'airlock');
  const route = JSON.parse(await page.locator('#current').getAttribute('data-route'));
  for (const [index, step] of route.entries()) {
    const state = await walkTo(step.x, step.n);
    proof.routes.push({ target: step, ...state });
    if ([0, 6, 9, 13, 16].includes(index)) await capture(`tour-${state.room}.png`);
  }
  const firstVisitOrder = [...new Set(proof.routes.map(({ room }) => room).filter(Boolean))];
  assert.deepEqual(firstVisitOrder, ['airlock', 'living', 'cockpit', 'observation', 'teleport']);
  assert.equal((await current()).rooms, 5);
  assert.equal((await current()).visited.split(',').length, 4);

  for (const [id, label] of labels) {
    await page.locator('#hub').getByRole('button', { name: label, exact: true }).click();
    const landed = await current();
    assert.equal(landed.domain, 'local-fixture-' + id);
    assert.ok(Math.hypot(landed.east, landed.north) < .01);
    await walkTo(0, -2.25);
    await page.keyboard.press('e');
    const back = await current();
    assert.equal(back.room, 'airlock');
    assert.notEqual(back.north, route.at(-1).n);
    proof.trips.push({ id, landed, back });
    await capture(`return-${id}.png`);
    if (id !== 'plaza') {
      for (const waypoint of [1, 3, 4, 11, 15, 16]) await walkTo(route[waypoint].x, route[waypoint].n);
    }
  }
  assert.deepEqual(proof.errors, []);
} catch (error) {
  proof.failure = error instanceof Error ? error.stack : String(error);
  await capture('failure.png').catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, 'orbital-travel.json'), JSON.stringify(proof, null, 2) + '\n');
  await browser.close();
}
