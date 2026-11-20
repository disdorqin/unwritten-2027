import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>button { min-width: 120px; min-height: 52px; touch-action: none; }</style>
<button id="field">场景点击</button>
<button id="snowball-primary">雪团</button>
<button id="snowfight-build">堆墙</button>
<output id="stock"></output>
<script type="module">
  import { createTownSnowControls, bindTownSnowButtons } from '/tools/voxel-tavern/town-blockout/town-snow-controls.ts';
  import { createSnowballStock, snowResourceLimit, snowWallBuildLayers } from '/src/shared/snow-stock.ts';

  const actions = [];
  const input = [];
  const stock = createSnowballStock(() => {
    document.querySelector('#stock').value = String(stock.amount());
  });
  let buildMode = false;
  let layers = 0;
  for (let i = 0; i < 48; i++) stock.gather();

  const controls = createTownSnowControls({
    canUseSnow: () => true,
    canGather: () => stock.amount() < snowResourceLimit,
    gather() { if (stock.gather()) actions.push('gather'); },
    canInteract: () => true,
    interact() { actions.push('interact'); },
    throwSnowball() { if (stock.spendThrow()) actions.push('throw'); },
    buildMode: () => buildMode,
    setBuildMode(enabled) { buildMode = enabled; actions.push('toggle'); return true; },
    placeWall() {
      const settle = stock.reserveWall();
      const accepted = Boolean(settle && layers < snowWallBuildLayers);
      settle?.(accepted);
      if (accepted) layers++;
      actions.push(accepted ? 'place' : 'reject');
    },
  });
  bindTownSnowButtons(controls, document.querySelector('#snowball-primary'), document.querySelector('#snowfight-build'));
  document.querySelector('#field').addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button === 0) controls.primary();
  });
  addEventListener('keydown', event => { if (controls.keyDown(event.code, event.repeat)) event.preventDefault(); });
  addEventListener('keyup', event => { if (controls.keyUp(event.code)) event.preventDefault(); });
  for (const name of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click']) {
    addEventListener(name, event => input.push({
      name, key: event.code, pointer: event.pointerType, trusted: event.isTrusted,
    }), { capture: true });
  }
  let previous = performance.now();
  function frame(now) {
    controls.update((now - previous) / 1000);
    previous = now;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.readSnowFixture = () => ({ stock: stock.amount(), buildMode, layers, actions, input });
</script>`;

const vite = await createServer({
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'zb15-browser-fixture',
    configureServer(server) {
      server.middlewares.use('/__zb15-controls', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(fixture);
      });
    },
  }],
});

let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert.equal(typeof address, 'object');
  const url = `http://127.0.0.1:${address.port}/__zb15-controls`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  const read = page => page.evaluate(() => window.readSnowFixture());
  const waitForStockCap = page => page.waitForFunction(() => document.querySelector('#stock').value === '50', undefined, {
    timeout: 8_000,
  });

  const desktop = await browser.newPage();
  await desktop.goto(url);
  await desktop.waitForFunction(() => typeof window.readSnowFixture === 'function');
  const desktopBefore = await read(desktop);
  await desktop.keyboard.press('KeyE');
  await desktop.keyboard.down('KeyE');
  await waitForStockCap(desktop);
  await desktop.keyboard.up('KeyE');
  assert.deepEqual((await read(desktop)).actions, ['interact', 'gather', 'gather']);
  await desktop.locator('#field').click();
  assert.equal((await read(desktop)).stock, 49);
  await desktop.keyboard.press('KeyB');
  for (let i = 0; i < 4; i++) await desktop.locator('#field').click();
  const desktopAfter = await read(desktop);
  assert.deepEqual(desktopAfter.actions, ['interact', 'gather', 'gather', 'throw', 'toggle', 'place', 'place', 'place', 'reject']);
  assert.deepEqual([desktopAfter.stock, desktopAfter.layers, desktopAfter.buildMode], [40, 3, true]);
  assert.ok(desktopAfter.input.some(event => event.pointer === 'mouse' && event.trusted));
  assert.ok(desktopAfter.input.some(event => event.key === 'KeyE' && event.trusted));
  await desktop.close();

  const mobile = await browser.newPage({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 680 } });
  await mobile.goto(url);
  await mobile.waitForFunction(() => typeof window.readSnowFixture === 'function');
  const mobileBefore = await read(mobile);
  const snow = mobile.locator('#snowball-primary');
  const point = await snow.boundingBox();
  const session = await mobile.context().newCDPSession(mobile);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x + point.width / 2, y: point.y + point.height / 2 }],
  });
  await waitForStockCap(mobile);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual((await read(mobile)).actions, ['gather', 'gather']);
  await snow.tap();
  assert.equal((await read(mobile)).stock, 49);
  await mobile.locator('#snowfight-build').tap();
  await snow.tap();
  const mobileAfter = await read(mobile);
  assert.deepEqual(mobileAfter.actions, ['gather', 'gather', 'throw', 'toggle', 'place']);
  assert.deepEqual([mobileAfter.stock, mobileAfter.layers, mobileAfter.buildMode], [46, 1, true]);
  assert.ok(mobileAfter.input.some(event => event.pointer === 'touch' && event.trusted));
  console.log(JSON.stringify({
    scope: 'isolated browser DOM with repository input and stock modules; no production world or network',
    desktop: { before: desktopBefore, after: desktopAfter },
    mobile: { before: mobileBefore, after: mobileAfter },
  }, null, 2));
} finally {
  await browser?.close();
  await vite.close();
}
