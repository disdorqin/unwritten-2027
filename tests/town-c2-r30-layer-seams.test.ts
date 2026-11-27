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

type Point = Readonly<{ east: number; north: number; height: number }>;
const assertPointClose = (actual: Point, expected: Point) => {
  for (const key of ['east', 'north', 'height'] as const) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} != ${expected[key]}`);
  }
};

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
    assert.ok(Number.isFinite(frame.localEntry.height) && Number.isFinite(frame.localExit.height));
  }
  assert.deepEqual(c2R30LayerFrames.minus140.localEntry, { east: 0, north: 2, height: 0 });
  assert.deepEqual(c2R30LayerFrames.minus140.localExit, { east: 0, north: 196, height: 0 });
  assert.deepEqual(c2R30LayerFrames.minus165.localEntry, { east: 1, north: 0, height: 0 });
  assert.deepEqual(c2R30LayerFrames.minus165.localExit, { east: 179, north: 0, height: 0 });
  assert.deepEqual(c2R30LayerFrames.minus190.localEntry, { east: 0, north: 0.5, height: 0 });
  assert.deepEqual(c2R30LayerFrames.minus190.localExit, { east: 0, north: 125.4, height: -2.4 });
  // Metadata only: local point heights already carry the palace floor offset.
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

    const badYaw = resolveSeam(layer, { ...certified(layer), yaw: Infinity });
    assert.equal(badYaw.resolved, false);
  }
});

test('C2 R04 certified transform matches C r30LayerWorld for positive north, yaw and room datum', () => {
  const frame = certified('minus140');
  const resolved = resolveSeam('minus140', frame);
  assert.equal(resolved.resolved, true);
  if (!resolved.resolved) return;
  // yaw=0 keeps north positive; no second z/north negation.
  assert.deepEqual(resolved.worldEntry, { east: -119, height: -90, north: 191 });
  assert.deepEqual(resolved.worldExit, { east: -119, height: -90, north: 385 });

  const quarter = resolveSeam('minus140', { ...frame, yaw: Math.PI / 2 });
  assert.equal(quarter.resolved, true);
  if (quarter.resolved) {
    assertPointClose(quarter.worldEntry, { east: -121, height: -90, north: 189 });
    assertPointClose(quarter.worldExit, { east: -315, height: -90, north: 189 });
  }

  const palaceFrame = {
    ...certified('minus190'),
    worldOffset: { east: -119, height: -187.6, north: 189 },
  };
  const deep = resolveSeam('minus190', palaceFrame);
  assert.equal(deep.resolved, true);
  if (deep.resolved) {
    assertPointClose(deep.worldEntry, { east: -119, height: -187.6, north: 189.5 });
    assertPointClose(deep.worldExit, { east: -119, height: -190, north: 314.4 });
  }
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

test('C2 R04 invalid certified frames cannot wire a seam or surface return', () => {
  const seam140to165 = c2R30SeamLinks.find(link => link.id === 'minus140-to-minus165')!;
  const lift = c2R30SeamLinks.find(link => link.id === 'deep-lift-return')!;
  const invalid165: C2CertifiedLayerFrame[] = [
    { ...certified('minus165'), certifiedBy: '  ' },
    { ...certified('minus165'), worldOffset: { east: Infinity, height: -165, north: 0 } },
    { ...certified('minus165'), worldOffset: { east: 0, height: NaN, north: 0 } },
    { ...certified('minus165'), worldOffset: { east: 0, height: -165, north: -Infinity } },
    { ...certified('minus165'), yaw: NaN },
    { ...certified('minus165'), yaw: Infinity },
  ];
  assert.equal(canWireSeam(seam140to165, {
    minus140: certified('minus140'), minus165: certified('minus140'),
  }), false);
  for (const minus165 of invalid165) {
    assert.equal(canWireSeam(seam140to165, {
      minus140: certified('minus140'), minus165,
    }), false);
  }
  assert.equal(canWireSeam(lift, { minus190: certified('minus165') }), false);
  for (const frame of invalid165) {
    assert.equal(canWireSeam(lift, { minus190: { ...frame, layer: 'minus190' } }), false);
  }
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
  assert.equal(audit.framesCertified, false);
  assert.equal(audit.productionReady, false);
  assert.ok(audit.layers.length === 3 && audit.links.length >= 4);
  assert.match(audit.claim, /local fixtures/);

  const allCertified = c2R30SeamAudit({
    minus140: certified('minus140'),
    minus165: certified('minus165'),
    minus190: certified('minus190'),
  });
  assert.equal(allCertified.allLocalFixtures, false);
  assert.equal(allCertified.framesCertified, true);
  assert.equal(allCertified.productionReady, false);
  assert.match(allCertified.claim, /C\/A room registration and real openings/);
  for (const layer of allCertified.layers) {
    assert.equal(layer.resolution.resolved, true);
  }

  const invalidThird = c2R30SeamAudit({
    minus140: certified('minus140'),
    minus165: certified('minus165'),
    minus190: { ...certified('minus190'), yaw: Infinity },
  });
  assert.equal(invalidThird.framesCertified, false);
  assert.equal(invalidThird.productionReady, false);
});
