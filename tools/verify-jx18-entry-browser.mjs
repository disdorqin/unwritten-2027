import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [runtimeArg, evidenceArg] = process.argv.slice(2);
if (!runtimeArg || !evidenceArg) {
  throw new Error('Usage: node tools/verify-jx18-entry-browser.mjs <built runtime checkout> <evidence directory>');
}

const runtime = resolve(runtimeArg);
const evidence = resolve(evidenceArg);
const tavern = join(runtime, 'tools/voxel-tavern');
const dist = join(tavern, 'dist');
const requireRuntime = createRequire(join(runtime, 'package.json'));
const requireTavern = createRequire(join(tavern, 'package.json'));
const { chromium, expect } = requireRuntime('@playwright/test');
const viteEntry = new URL('./dist/node/index.js', pathToFileURL(requireTavern.resolve('vite/package.json')));
const { preview } = await import(viteEntry.href);

const assets = await readdir(join(dist, 'assets'));
function assetPath(name) {
  const matching = assets.filter(file => file.startsWith(`${name}-`) && file.endsWith('.js'));
  expect(matching, `expected one production ${name} chunk`).toHaveLength(1);
  return `/assets/${matching[0]}`;
}
const viewerPath = assetPath('viewer');
const entryPath = assetPath('townBlockout');

const cases = [
  {
    name: 'wechat-android',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49',
    blockedPath: viewerPath,
  },
  {
    name: 'qq-ios',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQ/9.0.60 MQQBrowser/6.2',
    blockedPath: viewerPath,
  },
  { name: 'desktop-entry', blockedPath: entryPath },
];

function installSceneCapture() {
  const requestFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => requestFrame(time => {
    callback(time);
    if (!window.__jx18CaptureRequested || window.__jx18RenderedFrame) return;
    const canvas = document.querySelector('#scene > canvas');
    if (!canvas?.width || !canvas.height || document.body.classList.contains('town-entry-pending')) return;

    // Read the viewer's WebGL drawing buffer after its frame callback, before the compositor clears it.
    const sample = document.createElement('canvas');
    sample.width = Math.min(160, canvas.width);
    sample.height = Math.round(canvas.height * sample.width / canvas.width);
    const context = sample.getContext('2d', { willReadFrequently: true });
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    const colors = new Set();
    let opaque = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] < 240) continue;
      opaque++;
      colors.add((data[offset] >> 4) * 256 + (data[offset + 1] >> 4) * 16 + (data[offset + 2] >> 4));
    }
    if (colors.size <= 4 || opaque < sample.width * sample.height * 0.9) return;
    window.__jx18RenderedFrame = {
      width: canvas.width, height: canvas.height, sampleWidth: sample.width, sampleHeight: sample.height,
      renderedColors: colors.size, png: sample.toDataURL('image/png').split(',')[1],
    };
  });
}

async function captureRenderedScene(page, name) {
  await expect(page.locator('#scene > canvas')).toBeVisible({ timeout: 90_000 });
  await page.evaluate(() => { window.__jx18CaptureRequested = true; });
  const handle = await page.waitForFunction(() => window.__jx18RenderedFrame, undefined, {
    polling: 250, timeout: 60_000,
  });
  const { png, ...frame } = await handle.jsonValue();
  expect(frame.width).toBeGreaterThan(100);
  expect(frame.height).toBeGreaterThan(100);
  expect(frame.renderedColors).toBeGreaterThan(4);
  const image = Buffer.from(png, 'base64');
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  await writeFile(join(evidence, name + '-recovered.png'), image);
  return frame;
}

async function verifyEntry(browser, url, { name, userAgent, blockedPath }) {
  const mobile = Boolean(userAgent);
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1000, height: 700 },
    userAgent, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(installSceneCapture);
  page.setDefaultTimeout(20_000);
  const requested = [];
  const failed = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  page.on('requestfailed', request => failed.push({
    path: new URL(request.url()).pathname,
    reason: request.failure()?.errorText,
  }));
  const matchesBlockedAsset = requestUrl => requestUrl.pathname === blockedPath;
  let recoveredStatus;
  page.on('response', response => {
    if (matchesBlockedAsset(new URL(response.url())) && response.ok()) recoveredStatus = response.status();
  });
  const denyAsset = route => route.abort('blockedbyclient');
  const continueButton = page.getByRole('button', { name: '继续进入', exact: true });
  const retryButton = page.getByRole('button', { name: '重试加载', exact: true });
  const entry = page.locator('#town-entry');
  const guide = page.locator('#town-entry-guide');
  const error = entry.getByRole('alert');
  const record = { name, url, blockedPath, embeddedGuideExpected: mobile };

  try {
    await page.route(matchesBlockedAsset, denyAsset);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    expect(response?.ok()).toBe(true);
    record.userAgent = await page.evaluate(() => navigator.userAgent);

    if (mobile) {
      await expect(guide).toContainText('右上角菜单');
      await expect(guide).toContainText('在浏览器中打开');
      await expect(guide).toBeVisible();
      await expect(page.getByRole('button', { name: '复制链接', exact: true })).toBeVisible();
      await expect(page.locator('#scene > canvas')).toHaveCount(0);
      record.guideVerified = true;
      await page.screenshot({ path: join(evidence, `${name}-guide.png`) });
      expect(requested).not.toContain(viewerPath);
      await continueButton.tap();
    }

    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText('小镇没有加载成功');
    await expect(retryButton).toBeVisible();
    await expect(guide).toBeHidden();
    await expect(page.locator('#scene > canvas')).toHaveCount(0);
    await expect.poll(() => failed.find(request => request.path === blockedPath)?.reason)
      .toMatch(/^net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/);
    record.failure = failed.find(request => request.path === blockedPath);
    await page.screenshot({ path: join(evidence, `${name}-request-blocked.png`) });

    await page.unroute(matchesBlockedAsset, denyAsset);
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() && frame.url() === url }),
      mobile ? retryButton.tap() : retryButton.click(),
    ]);
    if (mobile) {
      await expect(guide).toBeVisible();
      await expect(retryButton).toBeHidden();
      await continueButton.tap();
    }
    await expect.poll(() => recoveredStatus, { timeout: 60_000 }).toBeDefined();
    record.recoveryStatus = recoveredStatus;
    await expect(entry).toBeHidden({ timeout: 90_000 });
    expect(page.url()).toBe(url);

    if (mobile) {
      const banner = page.locator('#env-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('拖动屏幕转向');
      await page.getByRole('button', { name: '关闭提示', exact: true }).tap();
      await expect(banner).toBeHidden();
    }
    record.frame = await captureRenderedScene(page, name);
  } catch (error) {
    record.error = error.message;
    await page.screenshot({ path: join(evidence, name + '-unexpected.png'), timeout: 5000 }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await writeFile(join(evidence, name + '.json'), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record));
  }
}

await mkdir(evidence, { recursive: true });
const server = await preview({
  configFile: false, root: tavern, build: { outDir: dist },
  preview: { host: '127.0.0.1', port: 0 },
});
try {
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const failures = [];
    for (const entryCase of cases) {
      const url = 'http://127.0.0.1:' + port + '/town-blockout.html?jx18=' + entryCase.name;
      try {
        await verifyEntry(browser, url, entryCase);
      } catch (error) {
        failures.push(new Error(entryCase.name + ': ' + error.message, { cause: error }));
      }
    }
    if (failures.length) throw new AggregateError(failures, 'JX-18 browser cases failed');
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done()));
}
