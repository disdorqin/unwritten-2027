import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = 'http://127.0.0.1:5218/tools/voxel-tavern/fr15-spatial-weather-preview.html';
const OUT = '.evidence/fr15-preview';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push('PAGEERROR ' + String(error)));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__FR15_PREVIEW__?.ready, null, { timeout: 60000 });
await page.waitForTimeout(300);

const report = { shots: [], layout: [], readings: {}, pageErrors, consoleErrors };

const snap = async (name) => {
  await page.waitForTimeout(220);
  const state = await page.evaluate(() => window.__FR15_PREVIEW__.state());
  report.shots.push({ name, weather: state.weather, mode: state.mode, transect: state.transect, maxSeverityStep: state.maxSeverityStep });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return state;
};

await page.evaluate(() => window.__FR15_PREVIEW__.setWeather('whiteout'));
await page.evaluate(() => window.__FR15_PREVIEW__.setMode('visibility'));
const whiteoutNorth = await snap('whiteout-visibility-north');

await page.evaluate(() => window.__FR15_PREVIEW__.setWeather('clear-snow'));
const clearNorth = await snap('clear-snow-visibility-north');

await page.evaluate(() => window.__FR15_PREVIEW__.setMode('snow'));
await page.evaluate(() => window.__FR15_PREVIEW__.setWeather('wind'));
await snap('wind-snow-north');

await page.evaluate(() => window.__FR15_PREVIEW__.setWeather('whiteout'));
await page.evaluate(() => window.__FR15_PREVIEW__.setMode('severity'));
await snap('whiteout-severity-north');

await page.evaluate(() => window.__FR15_PREVIEW__.setMode('snow'));
await page.evaluate(() => window.__FR15_PREVIEW__.setTransect('east'));
await snap('whiteout-snow-east');

const byId = (state) => Object.fromEntries(state.landmarks.map((row) => [row.id, row]));
const whiteout = byId(whiteoutNorth);
const clear = byId(clearNorth);
report.readings = {
  whiteout: Object.fromEntries(Object.entries(whiteout).map(([id, value]) => [id, {
    region: value.region, severity: +value.severity.toFixed(3), snow: +value.intensity.toFixed(2),
    visibility: +value.visibilityMeters.toFixed(1), wind: +value.windStrength.toFixed(2),
  }])),
  clear: Object.fromEntries(Object.entries(clear).map(([id, value]) => [id, {
    region: value.region, severity: +value.severity.toFixed(3), snow: +value.intensity.toFixed(2),
    visibility: +value.visibilityMeters.toFixed(1), wind: +value.windStrength.toFixed(2),
  }])),
  maxSeverityStep: { whiteoutNorth: whiteoutNorth.maxSeverityStep, clearNorth: clearNorth.maxSeverityStep },
};

report.layout = await page.evaluate(() => ({
  map: { width: document.querySelector('#map')?.clientWidth, height: document.querySelector('#map')?.clientHeight },
  readoutRows: document.querySelectorAll('#readout tr').length,
  summary: document.querySelector('#summary')?.textContent?.replace(/\s+/g, ' ').trim(),
  clock: document.querySelector('#clock')?.textContent,
}));

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();

const ridge = ['town', 'foothill', 'alpine', 'summit'];
const ridgeRises = ridge.every((id, index) => index === 0
  || report.readings.whiteout[id].severity >= report.readings.whiteout[ridge[index - 1]].severity);
const craterAndEdge = report.readings.whiteout.crater.severity >= .9
  && report.readings.whiteout.edge.severity >= .9;
const townVis = report.readings.whiteout.town.visibility;
const highVis = Math.max(...['alpine', 'summit', 'crater', 'edge'].map((id) => report.readings.whiteout[id].visibility));
console.log(JSON.stringify({
  shots: report.shots.length,
  maxSeverityStep: report.readings.maxSeverityStep,
  whiteoutReadings: report.readings.whiteout,
  townVisibility: townVis,
  worstExposedVisibility: highVis,
  ridgeRises,
  craterAndEdge,
  pageErrors,
  consoleErrors,
}, null, 2));
