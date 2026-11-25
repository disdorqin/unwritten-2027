import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [reference, shifted] = process.argv.slice(2);
assert.ok(reference && shifted, 'Usage: node --import tsx compare-stall5-market.mjs RELEASE CANDIDATE');
const folder = 'tools/voxel-tavern/town-blockout';
const noOp = () => {};
const draw = new Proxy({
  createLinearGradient: () => ({ addColorStop: noOp }),
  createRadialGradient: () => ({ addColorStop: noOp }),
  measureText: text => ({ width: 12 * text.length }),
}, { get: (methods, key) => methods[key] ?? noOp });
globalThis.document = { createElement: () => ({ getContext: () => draw, toDataURL: () => 'data:,' }) };

async function readMarket(root) {
  const load = name => import(pathToFileURL(resolve(root, folder, name + '.ts')).href);
  const { layout } = await load('terrain');
  const { buildMarketLandmark } = await load('landmark-market');
  const { readWalkGeometry } = await load('landmark-kit');
  const { marketStalls } = await load('market-fair');
  const plot = layout.plots.find(row => row.id === 'market-stalls');
  const group = buildMarketLandmark(plot);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const nodes = [];
  group.traverse(node => nodes.push(node));
  return { group, nodes, stalls: marketStalls, colliders: readWalkGeometry(group).colliders };
}

const before = await readMarket(reference);
const after = await readMarket(shifted);
assert.deepEqual(before.group.userData.marketStallIds, after.group.userData.marketStallIds);
assert.deepEqual(before.group.userData.marketDiningTables, after.group.userData.marketDiningTables);
assert.deepEqual(before.group.userData.zodiacOx, after.group.userData.zodiacOx);
assert.equal(before.stalls.length, 17);
assert.equal(before.stalls[5].id, 'market-stall-5');
assert.deepEqual(after.stalls, before.stalls.map((row, index) => index === 5
  ? { ...row, north: row.north - 1.25, spot: { ...row.spot, n: row.spot.n - 1.25 } } : row));

function countTranslated(before, after, stride, depthIndex) {
  assert.equal(before.length, after.length);
  let count = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    assert.equal(i % stride, depthIndex, 'Unexpected change on another coordinate');
    assert.ok(Math.abs(after[i] - before[i] - 1.25) < .00003, 'Unexpected southward displacement');
    count++;
  }
  return count;
}

assert.equal(before.nodes.length, after.nodes.length);
const translated = { nodes: 0, vertices: 0, instances: 0, colliders: 0 };
for (const [i, a] of before.nodes.entries()) {
  const b = after.nodes[i];
  assert.equal(a.name, b.name);
  assert.equal(a.type, b.type);
  translated.nodes += countTranslated(a.position.toArray(), b.position.toArray(), 3, 2);
  if (a.isMesh) {
    const aa = a.geometry.getAttribute('position').array;
    const bb = b.geometry.getAttribute('position').array;
    translated.vertices += countTranslated(aa, bb, 3, 2);
  }
  if (a.isInstancedMesh) {
    translated.instances += countTranslated(a.instanceMatrix.array, b.instanceMatrix.array, 16, 14);
    assert.deepEqual(a.instanceColor?.array, b.instanceColor?.array);
  }
}
assert.equal(before.colliders.length, after.colliders.length);
for (const [i, a] of before.colliders.entries()) {
  const b = after.colliders[i];
  const min = countTranslated(a.min, b.min, 3, 2);
  const max = countTranslated(a.max, b.max, 3, 2);
  assert.equal(min, max);
  translated.colliders += min;
}
assert.ok(translated.vertices && translated.instances && translated.colliders);
console.log(JSON.stringify({ stalls: after.stalls.length, colliders: after.colliders.length, translated, moved: after.stalls[5].spot }));
