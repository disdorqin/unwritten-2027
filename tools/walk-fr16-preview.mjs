import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'http://127.0.0.1:5219/tools/voxel-tavern/fr16-weather-snow-preview.html';
const OUT = '.evidence/fr16-preview';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push('PAGEERROR ' + String(error)));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
try {
  await page.waitForFunction(() => window.__FR16_PREVIEW__?.ready, null, { timeout: 60000 });
} catch (error) {
  await page.screenshot({ path: `${OUT}/failure.png` });
  console.error(JSON.stringify({ pageErrors, consoleErrors, error: String(error) }, null, 2));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(900);

const report = { shots: [], pageErrors, consoleErrors };

const snap = async (name) => {
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => window.__FR16_PREVIEW__.state());
  report.shots.push({ name, zone: state.zone, weather: state.weather, state });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return state;
};

await page.evaluate(() => window.__FR16_PREVIEW__.setWeather('whiteout'));
await page.evaluate(() => window.__FR16_PREVIEW__.setZone('town'));
const townWhiteout = await snap('town-whiteout');

await page.evaluate(() => window.__FR16_PREVIEW__.setWeather('clear-snow'));
const townClear = await snap('town-clear-snow');

await page.evaluate(() => window.__FR16_PREVIEW__.setWeather('whiteout'));
const whiteout = { town: townWhiteout };
for (const id of ['foothill', 'alpine', 'summit', 'crater']) {
  await page.evaluate((next) => window.__FR16_PREVIEW__.setZone(next), id);
  await page.waitForTimeout(1200);
  whiteout[id] = await page.evaluate(() => window.__FR16_PREVIEW__.state());
}

await page.evaluate(() => window.__FR16_PREVIEW__.setWeather('wind'));
let windAlpine;
for (const id of ['foothill', 'alpine', 'summit', 'crater']) {
  await page.evaluate((next) => window.__FR16_PREVIEW__.setZone(next), id);
  const state = await snap(`${id}-wind`);
  if (id === 'alpine') windAlpine = state;
}

await page.evaluate(() => window.__FR16_PREVIEW__.setZone('town'));
const windTown = await snap('town-wind');

await page.evaluate(() => window.__FR16_PREVIEW__.setWeather('whiteout'));
await page.evaluate(() => window.__FR16_PREVIEW__.setZone('summit'));
const summitWhiteout = await snap('summit-whiteout');

const layout = await page.evaluate(() => ({
  hud: { width: document.querySelector('#hud')?.clientWidth, height: document.querySelector('#hud')?.clientHeight },
  readouts: [...document.querySelectorAll('.readout strong')].map((node) => node.textContent),
  canvas: { width: document.querySelector('canvas')?.clientWidth, height: document.querySelector('canvas')?.clientHeight },
}));

report.readings = {
  whiteout: Object.fromEntries(Object.entries(whiteout).map(([id, value]) => [id, {
    region: value.field.region,
    severity: +value.field.severity.toFixed(3),
    intensity: +value.field.intensity.toFixed(2),
    visibility: +value.field.visibilityMeters.toFixed(1),
    wind: +value.field.windStrength.toFixed(2),
    density: +value.density.toFixed(3),
  }])),
  clear: {
    town: {
      intensity: +townClear.field.intensity.toFixed(2),
      visibility: +townClear.field.visibilityMeters.toFixed(1),
      density: +townClear.density.toFixed(3),
    },
  },
  windAlpine: {
    intensity: +windAlpine.field.intensity.toFixed(2),
    visibility: +windAlpine.field.visibilityMeters.toFixed(1),
    wind: +windAlpine.field.windStrength.toFixed(2),
    density: +windAlpine.density.toFixed(3),
  },
  windTown: {
    wind: +windTown.field.windStrength.toFixed(2),
    density: +windTown.density.toFixed(3),
  },
  layout,
};

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();

const w = report.readings.whiteout;
const checks = {
  townMilderThanFoothill: w.town.intensity < w.foothill.intensity,
  ridgeRises: w.town.intensity < w.foothill.intensity && w.foothill.intensity < w.alpine.intensity && w.alpine.intensity < w.summit.intensity,
  craterSevere: w.crater.severity >= .9 && w.crater.intensity > w.town.intensity,
  townVisibilityOpen: w.town.visibility > 55,
  summitVisibilityWhiteout: w.summit.visibility <= 13,
  densityBudgetDrops: w.summit.density < w.town.density && w.summit.density >= .4,
  clearSnowNotWhiteout: report.readings.clear.town.visibility > 200,
  windAlpineStronger: report.readings.windAlpine.wind > report.readings.windTown.wind,
};
console.log(JSON.stringify({ shots: report.shots.length, readings: report.readings, checks, pageErrors, consoleErrors }, null, 2));
if (Object.values(checks).some((value) => !value) || pageErrors.length || consoleErrors.length) process.exitCode = 1;
