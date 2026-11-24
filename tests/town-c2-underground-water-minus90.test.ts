import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import {
  adaptUndergroundWater90, mountTownC2UndergroundWaterMinus90,
  type UndergroundWater90Authority, type UndergroundWater90OreVisual,
} from '../tools/voxel-tavern/town-blockout/town-c2-underground-water-minus90.js';
import {
  createUndergroundMineLayout, type UndergroundMineSpec,
} from '../tools/voxel-tavern/town-blockout/underground-mine-layout.js';
import {
  isWaterGated, keyProgressSites,
} from '../src/shared/underground-water.js';

const spec: UndergroundMineSpec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5, openBackForExpansion: true, crystalGate: true },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};

const fixtureHighRiseM = 1;

const oreVisuals: readonly UndergroundWater90OreVisual[] = [
  { id: 'fixture/underwater', kind: 'underwater', at: [0, -91, 2] },
  { id: 'fixture/riverbed', kind: 'riverbed', at: [0, -90.2, 10], normal: [0, 1, 0] },
];

function fixture(options: Readonly<{
  readWater?: () => UndergroundWater90Authority | null | undefined;
  oreVisuals?: readonly UndergroundWater90OreVisual[];
  highWaterOffsetM?: number;
}> = {}) {
  const parent = new Group();
  parent.name = 'certified-mine-domain-root';
  const mine = createUndergroundMineLayout(spec);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mine.mesh.water, 3));
  const material = new MeshBasicMaterial();
  const waterMesh = new Mesh(geometry, material);
  waterMesh.name = 'underground-mine-water';
  parent.add(waterMesh);
  const overlay = mountTownC2UndergroundWaterMinus90({
    parent, mine, waterMesh, highWaterOffsetM: fixtureHighRiseM, ...options,
  });
  return { parent, mine, geometry, material, waterMesh, overlay };
}

test('the sole adapter maps all -90 forms and defaults missing authority to explicit mid/unconfigured', () => {
  const missing = adaptUndergroundWater90(undefined);
  assert.equal(missing.level, 'mid');
  assert.equal(missing.phase, undefined);
  assert.equal(missing.configured, false);
  assert.equal(missing.waterMode, 'baseline');
  assert.deepEqual(missing.form, {
    floodedPassages: false, underwaterOre: false, riverbedOpen: false, ferryRunning: false,
  });

  const high = adaptUndergroundWater90({ level: 'high', phase: 'rise' }, fixtureHighRiseM);
  assert.equal(high.waterMode, 'raised');
  assert.equal(high.surfaceRiseM, fixtureHighRiseM);
  assert.deepEqual(high.form, {
    floodedPassages: true, underwaterOre: true, riverbedOpen: false, ferryRunning: false,
  });
  const low = adaptUndergroundWater90({ level: 'low', phase: 'fall' });
  assert.equal(low.waterMode, 'hidden');
  assert.deepEqual(low.form, {
    floodedPassages: false, underwaterOre: false, riverbedOpen: true, ferryRunning: false,
  });
  assert.deepEqual(adaptUndergroundWater90({ level: 'mid' }).form, missing.form);

  const malformed = { level: 'high', phase: 'not-a-phase' } as unknown as UndergroundWater90Authority;
  assert.equal(adaptUndergroundWater90(malformed).configured, false);
  assert.equal(adaptUndergroundWater90(malformed).level, 'mid');
});

test('high/mid/low switch the real water mesh, knee-rise volume, shortcut and wet/dry ore markers', () => {
  const f = fixture({ oreVisuals });
  const baseline = Array.from(f.mine.mesh.water);
  assert.equal(f.overlay.stats().configuration, 'unconfigured');
  assert.equal(f.overlay.stats().level, 'mid');
  assert.equal(f.overlay.stats().waterMeshVertices, baseline.length / 3);
  assert.equal(f.waterMesh.visible, true);
  assert.equal(f.overlay.stats().highWaterVisible, false);
  assert.equal(f.overlay.stats().riverbedShortcutVisible, false);

  f.overlay.setLevel('high', 'rise');
  assert.equal(f.waterMesh.visible, false);
  assert.equal(f.overlay.stats().highWaterVisible, true);
  assert.equal(f.overlay.stats().underwaterOreMarkers, 1);
  assert.equal(f.overlay.stats().riverbedOreMarkers, 0);
  const highSurface = f.overlay.group.getObjectByName('water90-high-surface');
  assert.ok(highSurface instanceof Mesh);
  const positions = highSurface.geometry.getAttribute('position');
  for (let i = 0; i < baseline.length; i += 3) {
    assert.equal(positions.getX(i / 3), baseline[i]);
    assert.ok(Math.abs(positions.getY(i / 3) - baseline[i + 1] - fixtureHighRiseM) < 1e-5);
    assert.equal(positions.getZ(i / 3), baseline[i + 2]);
  }
  assert.ok(f.overlay.group.getObjectByName('water90-high-volume-sides') instanceof Mesh);

  f.overlay.setLevel('mid', 'level');
  assert.equal(f.waterMesh.visible, true);
  assert.equal(f.overlay.stats().highWaterVisible, false);
  assert.equal(f.overlay.stats().underwaterOreMarkers, 0);
  assert.equal(f.overlay.stats().riverbedOreMarkers, 0);
  assert.equal(f.overlay.stats().riverbedShortcutVisible, false);

  f.overlay.setLevel('low', 'fall');
  assert.equal(f.waterMesh.visible, false);
  assert.equal(f.overlay.stats().highWaterVisible, false);
  assert.equal(f.overlay.stats().riverbedShortcutVisible, true);
  assert.equal(f.overlay.stats().underwaterOreMarkers, 0);
  assert.equal(f.overlay.stats().riverbedOreMarkers, 1);
  assert.ok(f.overlay.group.getObjectByName('water90-exposed-riverbed-inlays'));
  assert.deepEqual(Array.from(f.mine.mesh.water), baseline, 'the authoritative layout is never rewritten');
  f.overlay.dispose();
  f.geometry.dispose();
  f.material.dispose();
});

test('sync preserves host level/phase without deriving a night sequence and drops absent authority to mid', () => {
  let authority: UndergroundWater90Authority | undefined = { level: 'high', phase: 'fall' };
  let reads = 0;
  const f = fixture({ readWater: () => { reads++; return authority; } });
  assert.equal(f.overlay.stats().configuration, 'unconfigured');
  let stats = f.overlay.sync();
  assert.equal(reads, 1);
  assert.equal(stats.level, 'high', 'phase fall must not be converted into a low level');
  assert.equal(stats.phase, 'fall');
  assert.equal(stats.form.floodedPassages, true);

  authority = { level: 'low', phase: 'rise' };
  stats = f.overlay.sync();
  assert.equal(stats.level, 'low');
  assert.equal(stats.phase, 'rise');
  assert.equal(stats.form.riverbedOpen, true);

  f.overlay.setLevel('mid', 'level');
  assert.equal(f.overlay.sync().level, 'low', 'the injected host remains the single source');
  authority = undefined;
  stats = f.overlay.sync();
  assert.equal(stats.level, 'mid');
  assert.equal(stats.phase, undefined);
  assert.equal(stats.configuration, 'unconfigured');
  assert.equal(f.waterMesh.visible, true);
  f.overlay.dispose();
  f.geometry.dispose();
  f.material.dispose();
});

test('no water state locks key progress or changes mine collision/route geometry', () => {
  const f = fixture();
  assert.ok(f.mine.expansion?.gate);
  const probes: readonly (readonly [number, number, number])[] = [
    f.mine.anchors.campRecovery.position,
    [0, -91, f.mine.expansion.gate.position[2] - 2],
    ...f.mine.expansion.route,
    ...f.mine.deepFixtures.map(fixture => fixture.foot),
  ];
  const passages = () => probes.map(([x, , z]) =>
    f.mine.queryPassage(x, z, spec.walker.radius, spec.walker.standingHeight, 'open'));
  const rock = Array.from(f.mine.mesh.rock);
  const rail = Array.from(f.mine.mesh.rail);
  const before = passages();
  for (const level of ['high', 'mid', 'low'] as const) {
    f.overlay.setLevel(level);
    assert.deepEqual(passages(), before, level + ' must not alter movement support');
    assert.deepEqual(Array.from(f.mine.mesh.rock), rock);
    assert.deepEqual(Array.from(f.mine.mesh.rail), rail);
    assert.equal(f.overlay.stats().colliders, 0);
  }
  for (const site of keyProgressSites) assert.equal(isWaterGated(site), false, site);
  f.overlay.dispose();
  f.geometry.dispose();
  f.material.dispose();
});

test('dispose is idempotent, restores the host water mesh and releases only overlay-owned resources', () => {
  let reads = 0;
  const f = fixture({ readWater: () => { reads++; return { level: 'high' }; }, oreVisuals });
  let baseDisposals = 0;
  let highDisposals = 0;
  f.geometry.addEventListener('dispose', () => { baseDisposals++; });
  const high = f.overlay.group.getObjectByName('water90-high-surface');
  assert.ok(high instanceof Mesh);
  high.geometry.addEventListener('dispose', () => { highDisposals++; });
  f.overlay.sync();
  assert.equal(f.waterMesh.visible, false);
  f.overlay.dispose();
  f.overlay.dispose();
  assert.equal(f.overlay.group.parent, null);
  assert.equal(f.waterMesh.visible, true);
  assert.equal(baseDisposals, 0, 'the domain-owned water geometry survives');
  assert.equal(highDisposals, 1);
  assert.equal(f.overlay.stats().disposed, true);
  assert.equal(f.overlay.stats().highWaterVisible, false);
  f.overlay.sync();
  f.overlay.setLevel('low');
  assert.equal(reads, 1, 'disposed overlays do not read the host again');
  f.geometry.dispose();
  f.material.dispose();
});
