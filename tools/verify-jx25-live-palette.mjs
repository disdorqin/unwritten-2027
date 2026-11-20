import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';

const files = {
  'town-npc.ts': '7ef40cc0f3591d8c31418ccfd6d665a8d9d29166',
  'town-npc-residents.ts': 'e54aa401b07dda51cece7db7220701226da568fd',
  'town-npc-stations.ts': 'b570e6ee6fad1cef7944e5aafc806944400c41e8',
  'town-voxel-person.ts': '5e885d743755ed306a43a17ead13c1163660716d',
  'viewer.ts': '72cc9c1d1eb946211844850a95392381c5a8871d',
};
for (const [file, expected] of Object.entries(files)) {
  const buffer = readFileSync(new URL(`./voxel-tavern/town-blockout/${file}`, import.meta.url));
  const blob = createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
  assert.equal(blob, expected, `source blob drift in ${file}`);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    return nextLoad(url, context);
  },
});

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Pass the JX-19 live station geometry JSON.');
const bytes = readFileSync(inputPath);
const input = JSON.parse(bytes.toString());
assert.equal(input.basis, '75859a094757c5dcee8b874eef86ec37f4204907');
assert.equal(input.staged.length, 6);

const { Color, Matrix4, Quaternion, Scene, Vector3 } = createRequire(new URL('./voxel-tavern/package.json', import.meta.url))('three');
const { createTownNpcActivity } = await import('./voxel-tavern/town-blockout/town-npc.ts');
const { createTerrainGrid } = await import('./voxel-tavern/town-blockout/terrain.ts');
const { voxelPersonParts } = await import('./voxel-tavern/town-blockout/town-voxel-person.ts');
const grid = createTerrainGrid();
const scene = new Scene();
const npc = createTownNpcActivity({ scene }, grid.heightAt);
const batch = scene.getObjectByName('town-npc-shared-skins');
assert.ok(batch?.isInstancedMesh);
const before = batch.count;
const actors = npc.snowballTargets.map(({ label: name, x, z, y }) => ({ name, anchor: [x, -z, y], source: 'fixed' }));
for (const row of input.staged) {
  const actor = { name: row.name, anchor: row.station.actor, source: 'station' };
  actors.push(actor);
  assert.ok(npc.registerResident(row.name, () => row.station).available());
}
assert.ok(batch.count > before);
assert.equal(scene.children.length, 1);
assert.equal(batch.geometry.type, 'BoxGeometry');

const signatureBuckets = new Map(actors.map(actor => [actor.name, []]));
const matrix = new Matrix4();
const color = new Color();
const position = new Vector3();
const scale = new Vector3();
const rotation = new Quaternion();
let visibleParts = 0;
for (let i = 0; i < batch.count; i++) {
  batch.getMatrixAt(i, matrix);
  // Three r183 returns unit scales when decomposing a zero-determinant matrix.
  if (matrix.determinant() === 0) continue;
  matrix.decompose(position, rotation, scale);
  visibleParts++;
  const matches = actors.filter(({ anchor: [east, north] }) => Math.hypot(position.x - east, position.z + north) < .9);
  assert.equal(matches.length, 1, `ownership for rendered instance ${i}`);
  batch.getColorAt(i, color);
  signatureBuckets.get(matches[0].name).push({ scale: scale.toArray().map(value => +value.toFixed(4)), color: `#${color.getHexString()}` });
}

const picked = new Set(['钟铁生', '樊樵', '柳三弦', '苏小满', '翁寒江']);
const rendered = actors.map(actor => {
  const parts = signatureBuckets.get(actor.name);
  assert.deepEqual(parts[0].scale, voxelPersonParts[0][1]);
  return { ...actor, bodyColor: parts[0].color, visibleParts: parts.length,
    accessoryParts: parts.length - voxelPersonParts.length,
    shapeColorSha256: createHash('sha256').update(JSON.stringify(parts)).digest('hex'),
    matchesNamedJx19Role: picked.has(actor.name) };
});
assert.equal(rendered.length, 14);
assert.equal(new Set(rendered.map(row => row.bodyColor)).size, 14);
assert.equal(new Set(rendered.map(row => row.shapeColorSha256)).size, 14);
assert.equal(rendered.filter(row => row.matchesNamedJx19Role).length, 5);
assert.equal(batch.count - visibleParts, 4 * rendered.filter(actor => actor.source === 'fixed').length);
console.log(JSON.stringify({
  base: input.basis,
  stationSourceSha256: createHash('sha256').update(bytes).digest('hex'),
  files,
  batch: { name: batch.name, geometry: batch.geometry.type, activeSlots: batch.count, visibleParts },
  rendered,
}, null, 2));
