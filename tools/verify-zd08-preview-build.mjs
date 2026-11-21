import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const output = process.argv[2];
assert.ok(output, 'Usage: node tools/verify-zd08-preview-build.mjs <D-drive-evidence-output>');
const outDir = path.resolve(output);
assert.ok(/^[dD]:[/\\]/.test(outDir) && outDir.includes('.devspace-evidence'),
  'The isolated preview must build into D-drive evidence, not the main app or a C: cache');

const entry = path.join(root, 'tools', 'voxel-tavern', 'main-summit-snow-wing-review.html');
await build({
  root: path.join(root, 'tools', 'voxel-tavern'),
  configFile: false,
  cacheDir: path.join(outDir, '.vite-cache'),
  mode: 'town-rehearsal',
  build: {
    target: 'esnext',
    emptyOutDir: true,
    outDir,
    rollupOptions: { input: { snowWingReview: entry } },
  },
});
const pagePath = path.join(outDir, 'main-summit-snow-wing-review.html');
const html = await readFile(pagePath, 'utf8');
assert.ok(!(await readdir(outDir)).includes('town-blockout.html'),
  'The single-scene acceptance build must not bundle the unrelated production town');
assert.ok(html.includes('course-help'));
assert.ok(html.includes('雪翼试飞'));
const assetFiles = (await readdir(path.join(outDir, 'assets'))).filter(name => name.endsWith('.js'));
assert.ok(assetFiles.length >= 1);
const bundle = (await Promise.all(assetFiles.map(name =>
  readFile(path.join(outDir, 'assets', name), 'utf8')))).join('\n');
for (const marker of ['nine-ring-course-furnishings', '九环试飞', 'review-flight', 'nightPreview']) {
  assert.ok(bundle.includes(marker), 'Preview bundle omitted a required real feature: ' + marker);
}
const totalBytes = (await Promise.all(assetFiles.map(name => stat(path.join(outDir, 'assets', name))))).reduce(
  (sum, entry) => sum + entry.size, 0);
console.log(JSON.stringify({ passed: true, entry: path.basename(pagePath),
  jsBundles: assetFiles.length, jsBytes: totalBytes, checked: 4, output: outDir }));
