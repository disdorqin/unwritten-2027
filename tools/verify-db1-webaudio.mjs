import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import ts from 'typescript';

const originalPlayer = 'tools/voxel-tavern/tower-chime.ts';
const originalHook = 'tools/voxel-tavern/town-blockout/town-hook-one.ts';
const dataURL = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const asModule = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const hookURL = dataURL(asModule(await readFile(originalHook, 'utf8')));
const playerSource = await readFile(originalPlayer, 'utf8');
const sourceSha256 = createHash('sha256').update(playerSource).digest('hex');
const player = asModule(playerSource);
assert.ok(player.includes('export function playOrdinaryNinthBell'), 'Apply the registered audio candidate before running');
const hookImport = /['"]\.\/town-blockout\/town-hook-one['"]/;
assert.match(player, hookImport);
const playerURL = dataURL(player.replace(hookImport, JSON.stringify(hookURL)));

const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = process.env.DB1_CHROMIUM_PATH ?? (existsSync(windowsChrome) ? windowsChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async url => {
    const { playOrdinaryNinthBell } = await import(url);
    const sampleRate = 48_000;
    async function render(sourceInListenerSpace, wetMix) {
      const context = new OfflineAudioContext(2, 12 * sampleRate, sampleRate);
      // Build the production node graph before offline rendering starts. All
      // nodes and timing calls are native; only the live-context state guard is
      // bypassed while this offline graph is being assembled.
      const offlineGraph = new Proxy(context, {
        get(target, key) {
          if (key === 'state') return 'running';
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const at = context.currentTime;
      playOrdinaryNinthBell(offlineGraph, 0.4, { sourceInListenerSpace, gainDb: -8, wetMix });
      const samples = await context.startRendering();
      const left = samples.getChannelData(0), right = samples.getChannelData(1);
      const onsetSample = left.findIndex((value, index) => Math.max(Math.abs(value), Math.abs(right[index])) > 1e-8);
      function rms(channel, start, end) {
        const segment = channel.subarray(Math.round(start * sampleRate), Math.round(end * sampleRate));
        return Math.sqrt(segment.reduce((total, value) => total + value * value, 0) / segment.length);
      }
      return {
        onsetFromCallMs: 1000 * (onsetSample / sampleRate - at),
        foreground: [rms(left, 0.5, 1.2), rms(right, 0.5, 1.2)],
        earlyTail: [rms(left, 5.8, 6.8), rms(right, 5.8, 6.8)],
        lateTail: [rms(left, 8.8, 9.8), rms(right, 8.8, 9.8)],
        finalSilence: [rms(left, 11.6, 12), rms(right, 11.6, 12)],
      };
    }
    return {
      sampleRate,
      westAtLeft: await render([-30, 10, 0], 0.3),
      westAtRight: await render([30, 10, 0], 0.3),
      westAtLeftDryOnly: await render([-30, 10, 0], 0),
    };
  }, playerURL);

  assert.ok(result.westAtLeft.foreground[0] > result.westAtLeft.foreground[1], 'West-left source must favor the left ear');
  assert.ok(result.westAtRight.foreground[1] > result.westAtRight.foreground[0], 'West-right source must favor the right ear');
  for (const render of [result.westAtLeft, result.westAtRight, result.westAtLeftDryOnly]) {
    assert.ok(render.onsetFromCallMs >= 444 && render.onsetFromCallMs < 500, 'Actual audio onset must follow the scheduled delay');
    assert.deepEqual(render.finalSilence, [0, 0], 'The disconnected graph must return to silence');
  }
  assert.ok(result.westAtLeft.earlyTail[0] > 0, 'Wet signal must outlast the oscillator');
  assert.ok(result.westAtLeft.lateTail[0] > 0, 'Wet signal must remain during the late decay');
  assert.ok(result.westAtLeft.earlyTail[0] > result.westAtLeft.lateTail[0], 'The tail must decay');
  assert.deepEqual(result.westAtLeftDryOnly.earlyTail, [0, 0], 'Dry signal must already be silent');
  console.log(JSON.stringify({ chromium: browser.version(), sourceSha256, ...result }, null, 2));
} finally {
  await browser.close();
}
