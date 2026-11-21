import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

const checkout = process.cwd();
const evidence = process.argv[2];
assert.ok(evidence,
  'Usage: node tools/verify-main-summit-expedition-build.mjs <absolute-D-drive-evidence-directory>');
const output = path.resolve(evidence);
assert.ok(/^[dD]:[/\\]/.test(output) && output.includes('.evidence'),
  'Do not generate scene builds in a Windows C: temp tree or overwrite the main release');

const htmlEntry = path.join(checkout, 'tools', 'voxel-tavern', 'main-summit-expedition-review.html');
await build({
  root: path.join(checkout, 'tools', 'voxel-tavern'),
  configFile: false,
  mode: 'town-rehearsal',
  cacheDir: path.join(output, '.vite-cache'),
  build: { target: 'esnext', outDir: output, emptyOutDir: true,
    rollupOptions: { input: { mountainExpedition: htmlEntry } } },
});
const pageName = 'main-summit-expedition-review.html';
const html = await readFile(path.join(output, pageName), 'utf8');
assert.ok(html.includes('七轮实体建模审查'));
assert.ok(!html.includes('/@fs/'), 'Compiled references must be distributable files, not Vite development filesystem URLs');
assert.ok(!(await readdir(output)).includes('town-blockout.html'),
  'Isolated build must not bundle a second whole-town entrypoint');

const assets = await readdir(path.join(output, 'assets'));
const bundles = assets.filter(name => name.endsWith('.js'));
const images = assets.filter(name => name.endsWith('.png'));
assert.ok(bundles.length >= 1 && bundles.length <= 3);
assert.ok(images.length >= 4, 'All four unique embedded reference concept images must survive production build');
const source = (await Promise.all(bundles.map(name =>
  readFile(path.join(output, 'assets', name), 'utf8')))).join('\n');
for (const symbol of ['main-summit-expedition-sites', 'cloud-bell-1', 'nine-cloud-bell-array',
  'main-summit-cable-machine-workshop', 'main-summit-expedition-local-dynamics']) {
  assert.ok(source.includes(symbol), 'Missing authored model in production bundle: ' + symbol);
}
const jsBytes = (await Promise.all(bundles.map(name => stat(path.join(output, 'assets', name))))).reduce(
  (sum, file) => sum + file.size, 0);
console.log(JSON.stringify({
  passed: true, entry: pageName, jsBundles: bundles.length,
  conceptImages: images.length, jsBytes,
  output,
}));
