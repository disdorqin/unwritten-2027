import assert from 'node:assert/strict';
import test from 'node:test';
const { buildFrontRidgeProxy, FRONT_RIDGE_PROXY } = await import('../tools/voxel-tavern/town-blockout/town-front-ridge-proxy.ts');

test('front-ridge proxy: true height, toe on the reserve band, skirt buried', () => {
  const group = buildFrontRidgeProxy();
  assert.equal(group.children.length, 1, 'proxy must be a single draw (teeth baked into the same geometry)');
  const mesh = group.children[0] as import('three').Mesh;
  const position = (mesh.geometry as import('three').BufferGeometry).getAttribute('position');
  let maxY = -Infinity, minY = Infinity, minNorth = Infinity, peakEastAtMax = 0;
  for (let v = 0; v < position.count; v++) {
    const y = position.getY(v);
    if (y > maxY) { maxY = y; peakEastAtMax = position.getX(v); }
    minY = Math.min(minY, y);
    minNorth = Math.min(minNorth, -position.getZ(v));
  }
  assert.ok(maxY > 344 && maxY <= 392, `crown+teeth ${maxY.toFixed(1)} must read as the 350 ridge with 20-45 m teeth`);
  assert.ok(Math.abs(peakEastAtMax - FRONT_RIDGE_PROXY.peakEast) <= 160, 'highest tooth must stay near the peak meridian');
  let crownVerts = 0;
  for (let v = 0; v < position.count; v++) if (Math.abs(position.getX(v) - 320) < 30 && position.getY(v) >= 344 && position.getY(v) <= 362) crownVerts++;
  assert.ok(crownVerts > 0, 'wall crown band still present under the teeth');
  assert.equal(minNorth, FRONT_RIDGE_PROXY.toeNorth, 'nothing may stand south of the reserve-band toe');
  assert.ok(minY <= -60, 'skirt must bury below ground');
});
