import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  c2R30LayerFrames, c2R30LightingBudget, c2R30SeamAudit, c2R30SeamLinks,
  canWireSeam, resolveSeam, type C2CertifiedLayerFrame,
} from '../tools/voxel-tavern/town-blockout/town-c2-r30-layer-seams.js';

const certified = (layer: 'minus140' | 'minus165' | 'minus190'): C2CertifiedLayerFrame => ({
  layer, status: 'c-certified',
  worldOffset: { east: -119, height: -90, north: 189 },
  yaw: 0, certifiedBy: 'C-window-test',
});

test('C2 R04 declares all three deep layers as local fixtures with the right depths', () => {
  const layers = Object.keys(c2R30LayerFrames);
  assert.deepEqual(layers.sort(), ['minus140', 'minus165', 'minus190']);
  assert.equal(c2R30LayerFrames.minus140.depthMetres, -140);
  assert.equal(c2R30LayerFrames.minus165.depthMetres, -165);
  assert.equal(c2R30LayerFrames.minus190.depthMetres, -190);
  for (const frame of Object.values(c2R30LayerFrames)) {
    assert.equal(frame.status, 'local-fixture');
    assert.equal(frame.axisMapping, 'x=east,y=height,z=-north');
    assert.ok(Number.isFinite(frame.localEntry.east) && Number.isFinite(frame.localExit.north));
  }
  // -190 uses the palace floor datum, matching the D-owned shell.
  assert.equal(c2R30LayerFrames.minus190.floorDatum, -2.4);
});

test('C2 R04 seam resolution fails closed without a real C-certified frame', () => {
  for (const layer of ['minus140', 'minus165', 'minus190'] as const) {
    const none = resolveSeam(layer);
    assert.equal(none.resolved, false);
    if (!none.resolved) assert.equal(none.reason, 'no-certified-frame');

    const wrongLayer = resolveSeam(layer, certified('minus140'));
    assert.equal(wrongLayer.resolved, layer === 'minus140');

    const emptyAuthor = resolveSeam(layer, { ...certified(layer), certifiedBy: '  ' });
    assert.equal(emptyAuthor.resolved, false);

    const badOffset = resolveSeam(layer, {
      ...certified(layer), worldOffset: { east: NaN, height: 0, north: 0 },
    });
    assert.equal(badOffset.resolved, false);
  }
});

test('C2 R04 certified frame rotates local ENY and keeps the layer floor offset', () => {
  const frame = certified('minus140');
  const resolved = resolveSeam('minus140', frame);
  assert.equal(resolved.resolved, true);
  if (!resolved.resolved) return;
  // yaw=0: world = offset + (east, floor, -north).
  assert.deepEqual(resolved.worldEntry, { east: -119 + 0, height: -90 + 0, north: 189 - 2 });
  assert.deepEqual(resolved.worldExit, { east: -119 + 0, height: -90 + 0, north: 189 - 196 });

  const quarter = resolveSeam('minus140', { ...frame, yaw: Math.PI / 2 });
  assert.equal(quarter.resolved, true);
  if (quarter.resolved) {
    assert.ok(Math.abs(quarter.worldEntry.east - (-119 + 0 * 0 + (-2 - 0) * 1)) < 1e-6);
    assert.equal(quarter.worldEntry.height, -90);
  }

  const deep = resolveSeam('minus190', certified('minus190'));
  assert.equal(deep.resolved, true);
  if (deep.resolved) assert.equal(deep.worldEntry.height, -90 + -2.4);
});

test('C2 R04 production wiring requires both seam ends certified', () => {
  const seam140to165 = c2R30SeamLinks.find(link => link.id === 'minus140-to-minus165')!;
  assert.equal(canWireSeam(seam140to165, {}), false);
  assert.equal(canWireSeam(seam140to165, { minus140: certified('minus140') }), false);
  assert.equal(canWireSeam(seam140to165, {
    minus140: certified('minus140'), minus165: certified('minus165'),
  }), true);

  const ferry = c2R30SeamLinks.find(link => link.id === 'minus140-ferry')!;
  assert.equal(canWireSeam(ferry, {}), true, 'local ferry route needs no world frame');

  const lift = c2R30SeamLinks.find(link => link.id === 'deep-lift-return')!;
  assert.equal(canWireSeam(lift, {}), false);
  assert.equal(canWireSeam(lift, { minus190: certified('minus190') }), true,
    'surface return is C-owned, so only the deep end needs certification');
});

test('C2 R04 lighting budgets stay bounded and the vault stays unlit', () => {
  assert.equal(c2R30LightingBudget.minus140.warmPools, 1);
  assert.equal(c2R30LightingBudget.minus165.warmPools, 2);
  assert.equal(c2R30LightingBudget.minus190.warmPools, 0);
  assert.equal(c2R30LightingBudget.minus190.selfLitOnly, true);
  for (const budget of Object.values(c2R30LightingBudget)) {
    assert.ok(budget.warmPools <= 2);
  }
});

test('C2 R04 audit reports all-local fixtures and no production claim by default', () => {
  const audit = c2R30SeamAudit();
  assert.equal(audit.allLocalFixtures, true);
  assert.equal(audit.productionReady, false);
  assert.ok(audit.layers.length === 3 && audit.links.length >= 4);
  assert.match(audit.claim, /local fixtures/);

  const allCertified = c2R30SeamAudit({
    minus140: certified('minus140'),
    minus165: certified('minus165'),
    minus190: certified('minus190'),
  });
  assert.equal(allCertified.allLocalFixtures, false);
  assert.equal(allCertified.productionReady, true);
  for (const layer of allCertified.layers) {
    assert.equal(layer.resolution.resolved, true);
  }
});
