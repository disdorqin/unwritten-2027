import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:4178';
const out = process.argv[3];
if (!out) throw new Error('Pass the output directory as the second argument');
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const errors = [];
const evidence = { browser: browser.version(), cases: [], errors };
await mkdir(out, { recursive: true });

try {
  for (const [width, height] of [[1000, 650], [320, 540]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url() + ' ' + request.failure()?.errorText));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(response.url() + ' HTTP ' + response.status());
    });
    await page.goto(new URL('/flight-fuel-review.html', origin).href);
    const panel = page.getByRole('region', { name: '星尘粉燃料' });
    await panel.waitFor();
    for (const [id, expected] of Object.entries({
      full: { ratio: 1, time: '10:00 满推', rate: '1×', notice: '' },
      half: { ratio: 0.5, time: '05:00 满推', rate: '0.5×', notice: '' },
      low: { ratio: 0.1, time: '01:00 满推', rate: '0.5×', notice: '余量低' },
      empty: { ratio: 0, time: '00:00 满推', rate: '0×', notice: '已耗尽' },
    })) {
      await page.locator('#' + id).click();
      const actual = await panel.evaluate(element => ({
        ratio: element.querySelector('meter').value,
        time: element.querySelector('output').value,
        rate: element.querySelector('strong').textContent,
        notice: element.querySelector('[role="status"]').textContent,
      }));
      assert.deepEqual(actual, expected, `${width}/${id}`);
      const box = await panel.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, 'Fuel meter must fit the viewport');
      await panel.screenshot({ path: path.join(out, `${width}-${id}.png`) });
      evidence.cases.push({ width, height, state: id, ...actual });
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
}
console.log(`${evidence.cases.length} browser fuel readings passed · ${evidence.browser}`);
