import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = 'http://127.0.0.1:5210/tools/voxel-tavern/fr10-weather-cycle-preview.html';
const OUT = '.evidence/fr10-preview';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR ' + String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__FR10_PREVIEW__ && window.__FR10_PREVIEW__.ready, null, { timeout: 60000 });
await page.waitForTimeout(400);
await page.evaluate(() => window.__FR10_PREVIEW__.pause());

const report = { phases: [], continuity: null, dom: null, pageErrors, consoleErrors };

const shots = [
  [0, 'sunrise'], [.03, 'morning'], [.2, 'day'], [.47, 'afternoon'],
  [.578, 'sunset'], [.6, 'nightfall'], [.66, 'early-night'], [.78, 'deep-night'], [.96, 'predawn'],
];
for (const [phase, name] of shots) {
  await page.evaluate((p) => window.__FR10_PREVIEW__.setPhase(p), phase);
  await page.waitForTimeout(220);
  const state = await page.evaluate(() => window.__FR10_PREVIEW__.state());
  const dom = await page.evaluate(() => ({
    clock: document.querySelector('#clock')?.textContent,
    phase: document.querySelector('#phase')?.textContent,
    night: document.querySelector('#night')?.textContent,
    lamp: document.querySelector('#lamp')?.textContent,
    elev: document.querySelector('#elev')?.textContent,
    fog: document.querySelector('#fog')?.textContent,
  }));
  report.phases.push({ phase, name, state, dom });
  await page.screenshot({ path: `${OUT}/${String(phase).replace('.', '_')}-${name}.png` });
}

// Play the full cycle fast, sampling the browser-visible state to prove continuity end to end.
await page.evaluate(() => { window.__FR10_PREVIEW__.setPhase(0); window.__FR10_PREVIEW__.setSpeed(60); window.__FR10_PREVIEW__.play(); });
const samples = [];
for (let i = 0; i < 110; i += 1) {
  const sample = await page.evaluate(() => {
    const s = window.__FR10_PREVIEW__.sample();
    return {
      phase: s.phase, lamp: s.lampLevel, sun: s.sunIntensity, ambient: s.ambientIntensity,
      sky: s.skyColor, fogNearScale: s.fogNearScale, fogFarScale: s.fogFarScale,
      elevation: s.sunElevationDeg, nightSide: !s.daylight,
    };
  });
  samples.push(sample);
  await page.waitForTimeout(60);
}
await page.evaluate(() => window.__FR10_PREVIEW__.pause());

const channelDelta = (a, b) => {
  let worst = 0;
  for (const shift of [16, 8, 0]) {
    worst = Math.max(worst, Math.abs(((a >> shift) & 255) - ((b >> shift) & 255)));
  }
  return worst;
};
let worst = { color: 0, lamp: 0, intensity: 0, elevation: 0, fog: 0 };
for (let i = 1; i < samples.length; i += 1) {
  const a = samples[i - 1];
  const b = samples[i];
  worst = {
    color: Math.max(worst.color, channelDelta(a.sky, b.sky)),
    lamp: Math.max(worst.lamp, Math.abs(a.lamp - b.lamp)),
    intensity: Math.max(worst.intensity, Math.abs(a.sun - b.sun), Math.abs(a.ambient - b.ambient)),
    elevation: Math.max(worst.elevation, Math.abs(a.elevation - b.elevation)),
    fog: Math.max(worst.fog, Math.abs(a.fogNearScale - b.fogNearScale), Math.abs(a.fogFarScale - b.fogFarScale)),
  };
}
report.continuity = {
  sampleCount: samples.length,
  phaseSpan: samples[samples.length - 1].phase - samples[0].phase,
  nightSamples: samples.filter((s) => s.nightSide).length,
  worst,
};

report.dom = await page.evaluate(() => ({
  phaseButtons: [...document.querySelectorAll('#phase-buttons button')].map((b) => b.textContent),
  markerLeft: document.querySelector('#cycle-marker')?.style.left,
  readouts: [...document.querySelectorAll('.readouts b')].map((b) => b.textContent),
}));
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

await browser.close();
console.log(JSON.stringify({
  shots: report.phases.length,
  continuity: report.continuity,
  dom: report.dom,
  pageErrors,
  consoleErrors,
}, null, 2));
