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

async function captureRenderedScene(page, name) {
  const canvas = page.locator('#scene > canvas');
  await expect(canvas).toBeVisible({ timeout: 90_000 });
  // Sample the composited canvas, after WebGL has drawn the town rather than merely inserted a node.
  let screenshot;
  let regions;
  await expect.poll(async () => {
    screenshot = await canvas.screenshot({ timeout: 15_000 });
    regions = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const context = new OffscreenCanvas(16, 16).getContext('2d');
      context.drawImage(image, image.width * 0.2, image.height * 0.25, image.width * 0.6, image.height * 0.5, 0, 0, 16, 16);
      image.close();
      const { data } = context.getImageData(0, 0, 16, 16);
      const colors = new Set();
      for (let offset = 0; offset < data.length; offset += 4) {
        colors.add(`${data[offset] >> 4},${data[offset + 1] >> 4},${data[offset + 2] >> 4}`);
      }
      return colors.size;
    }, screenshot.toString('base64'));
    return regions;
  }, { timeout: 30_000 }).toBeGreaterThan(4);
  await writeFile(join(evidence, `${name}-recovered.png`), screenshot);
  return regions;
}

async function verifyEntry(browser, url, { name, userAgent, blockedPath }) {
  const mobile = Boolean(userAgent);
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1000, height: 700 },
    userAgent, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const requested = [];
  const failed = [];
  page.on('request', request => requested.push(new URL(request.url()).pathname));
  page.on('requestfailed', request => failed.push({
    path: new URL(request.url()).pathname,
    reason: request.failure()?.errorText,
  }));
  const matchesBlockedAsset = requestUrl => requestUrl.pathname === blockedPath;
  const denyAsset = route => route.abort('blockedbyclient');
  const continueButton = page.getByRole('button', { name: '继续进入', exact: true });
  const retryButton = page.getByRole('button', { name: '重试加载', exact: true });
  const entry = page.locator('#town-entry');
  const guide = page.locator('#town-entry-guide');
  const error = entry.getByRole('alert');

  try {
    await page.route(matchesBlockedAsset, denyAsset);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    expect(response?.ok()).toBe(true);

    if (mobile) {
      await expect(guide).toContainText('右上角菜单');
      await expect(guide).toContainText('在浏览器中打开');
      await expect(guide).toBeVisible();
      await expect(page.getByRole('button', { name: '复制链接', exact: true })).toBeVisible();
      await expect(page.locator('#scene > canvas')).toHaveCount(0);
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
    await page.screenshot({ path: join(evidence, `${name}-request-blocked.png`) });

    await page.unroute(matchesBlockedAsset, denyAsset);
    const actualDelivery = page.waitForResponse(response =>
      new URL(response.url()).pathname === blockedPath && response.ok(), { timeout: 60_000 });
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() && frame.url() === url }),
      mobile ? retryButton.tap() : retryButton.click(),
    ]);
    if (mobile) {
      await expect(guide).toBeVisible();
      await expect(retryButton).toBeHidden();
      await continueButton.tap();
    }
    const delivered = await actualDelivery;
    await expect(entry).toBeHidden({ timeout: 90_000 });
    expect(page.url()).toBe(url);

    if (mobile) {
      const banner = page.locator('#env-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('拖动屏幕转向');
      await page.getByRole('button', { name: '关闭提示', exact: true }).tap();
      await expect(banner).toBeHidden();
    }
    const regions = await captureRenderedScene(page, name);
    const record = { name, url, userAgent: await page.evaluate(() => navigator.userAgent), blockedPath,
      failure: failed.find(request => request.path === blockedPath), recoveryStatus: delivered.status(), renderedColors: regions };
    await writeFile(join(evidence, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify(record));
  } catch (error) {
    await page.screenshot({ path: join(evidence, `${name}-unexpected.png`), timeout: 5000 }).catch(() => {});
    throw error;
  } finally {
    await context.close();
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
    for (const entryCase of cases) {
      const url = `http://127.0.0.1:${port}/town-blockout.html?jx18=${entryCase.name}`;
      await verifyEntry(browser, url, entryCase);
    }
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done()));
}
