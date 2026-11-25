import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferAttribute, BufferGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial } from 'three';
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
import { createUndergroundWaterState } from '../src/presence/underground-water-state.js';
import type { AcceptedUndergroundWaterSnapshot } from '../src/shared/town-c-water-snapshot-port.js';

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
  readAcceptedWater?: () => AcceptedUndergroundWaterSnapshot | undefined;
  oreVisuals?: readonly UndergroundWater90OreVisual[];
  highWaterOffsetM?: number;
}> = {}) {
  const parent = new Group();
  parent.name = 'certified-mine-domain-root';
  const mine = createUndergroundMineLayout(spec);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mine.mesh.water, 3));
  const originalWaterUv = geometry.getAttribute('uv');
  const material = new MeshBasicMaterial();
  const waterMesh = new Mesh(geometry, material);
  waterMesh.name = 'underground-mine-water';
  parent.add(waterMesh);
  const overlay = mountTownC2UndergroundWaterMinus90({
    parent, mine, waterMesh, highWaterOffsetM: fixtureHighRiseM,
    readAcceptedWater: options.readAcceptedWater, oreVisuals: options.oreVisuals,
  });
  return { parent, mine, geometry, material, waterMesh, overlay, originalWaterUv };
}

function renderCensus(parent: Group) {
  let meshes = 0, triangles = 0;
  parent.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshes++;
    const geometry = object.geometry;
    const vertices = geometry.index
      ? geometry.index.count
      : geometry.getAttribute('position')?.count ?? 0;
    triangles += vertices / 3 * (object instanceof InstancedMesh ? object.count : 1);
  });
  return { meshes, triangles };
}

test('the -90 beauty pass reuses the water triangles and adds current/wet tones without another render pass', () => {
  const f = fixture({ oreVisuals });
  const originalUv = f.originalWaterUv;
  assert.equal(originalUv, undefined);
  const census = renderCensus(f.parent);
  assert.equal(census.meshes, 7, 'host water, two high-water meshes, inlays and three ore meshes');
  assert.ok(f.waterMesh.material instanceof MeshLambertMaterial);
  const baselineMaterial = f.waterMesh.material;
  assert.equal(baselineMaterial.forceSinglePass, true);
  assert.ok(baselineMaterial.transparent);
  assert.ok(baselineMaterial.opacity < .7);
  assert.ok(baselineMaterial.map);
  assert.equal(baselineMaterial.map.wrapS, baselineMaterial.map.wrapT);
  const pixels = baselineMaterial.map.image.data as Uint8Array;
  assert.ok(new Set(pixels).size > 20, 'the static current map contains varied broken-flow tones');

  const highSurface = f.overlay.group.getObjectByName('water90-high-surface');
  const highVolume = f.overlay.group.getObjectByName('water90-high-volume-sides');
  assert.ok(highSurface instanceof Mesh);
  assert.ok(highVolume instanceof Mesh);
  assert.equal(highSurface.geometry.getAttribute('position').count, f.overlay.stats().waterMeshVertices);
  assert.equal(highSurface.material, highVolume.material);

  f.overlay.setLevel('low');
  const inlays = f.overlay.group.getObjectByName('water90-exposed-riverbed-inlays');
  assert.ok(inlays instanceof InstancedMesh);
  assert.ok(inlays.instanceColor, 'wet slabs and dry wayfinders share the original instanced draw');
  assert.ok(inlays.count <= 28);
  assert.deepEqual(renderCensus(f.parent), census);
  f.overlay.setLevel('high');
  assert.deepEqual(renderCensus(f.parent), census);
  f.overlay.setLevel('mid');
  assert.deepEqual(renderCensus(f.parent), census);
  f.overlay.dispose();
  assert.equal(f.waterMesh.material, f.material);
  assert.equal(f.geometry.getAttribute('uv'), undefined, 'the overlay removes its generated UVs');
  f.geometry.dispose();
  f.material.dispose();
});

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

test('sync consumes the certified snapshot effective level and never derives phase from a clock', () => {
  let authority: AcceptedUndergroundWaterSnapshot | undefined = {
    nightOrdinal: 2, phase: 'fall', baseLevel: 'low', pumpOffset: 2, level: 'high',
  };
  let reads = 0;
  const f = fixture({ readAcceptedWater: () => { reads++; return authority; } });
  assert.equal(f.overlay.stats().configuration, 'unconfigured');
  let stats = f.overlay.sync();
  assert.equal(reads, 1);
  assert.equal(stats.level, 'high', 'the pump-adjusted effective level wins over the natural fall phase');
  assert.equal(stats.phase, 'fall');
  assert.equal(stats.form.floodedPassages, true);

  authority = {
    nightOrdinal: 0, phase: 'rise', baseLevel: 'high', pumpOffset: -2, level: 'low',
  };
  stats = f.overlay.sync();
  assert.equal(stats.level, 'low');
  assert.equal(stats.phase, 'rise');
  assert.equal(stats.form.riverbedOpen, true);

  f.overlay.setLevel('mid', 'level');
  assert.equal(f.overlay.sync().level, 'low', 'manual fixture state cannot override the certified reader');
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

test('the real presence water state can drive the overlay without phase substituting for level', () => {
  const state = createUndergroundWaterState({ dawnEpoch: 0, now: () => 0 });
  assert.deepEqual(state.tonight(), {
    nightOrdinal: 0, phase: 'rise', baseLevel: 'high', pumpOffset: 0, level: 'high',
  });
  const f = fixture({ readAcceptedWater: () => state.tonight() });
  assert.equal(f.overlay.sync().level, 'high');
  state.shiftPump(-1);
  assert.equal(state.tonight().phase, 'rise');
  assert.equal(state.tonight().level, 'mid');
  assert.equal(f.overlay.sync().level, 'mid');
  state.shiftPump(-1);
  assert.equal(f.overlay.sync().level, 'low');
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
  const f = fixture({ readAcceptedWater: () => {
    reads++;
    return { nightOrdinal: 0, phase: 'rise', baseLevel: 'high', pumpOffset: 0, level: 'high' };
  }, oreVisuals });
  let baseDisposals = 0;
  let highDisposals = 0;
  let styleDisposals = 0;
  let mapDisposals = 0;
  f.geometry.addEventListener('dispose', () => { baseDisposals++; });
  assert.ok(f.waterMesh.material instanceof MeshLambertMaterial);
  const styledMaterial = f.waterMesh.material;
  styledMaterial.addEventListener('dispose', () => { styleDisposals++; });
  assert.ok(styledMaterial.map);
  styledMaterial.map.addEventListener('dispose', () => { mapDisposals++; });
  const high = f.overlay.group.getObjectByName('water90-high-surface');
  assert.ok(high instanceof Mesh);
  high.geometry.addEventListener('dispose', () => { highDisposals++; });
  f.overlay.sync();
  assert.equal(f.waterMesh.visible, false);
  f.overlay.dispose();
  f.overlay.dispose();
  assert.equal(f.overlay.group.parent, null);
  assert.equal(f.waterMesh.visible, true);
  assert.equal(f.waterMesh.material, f.material, 'the host material is restored, never disposed here');
  assert.equal(f.geometry.getAttribute('uv'), undefined);
  assert.equal(baseDisposals, 0, 'the domain-owned water geometry survives');
  assert.equal(highDisposals, 1);
  assert.equal(styleDisposals, 1);
  assert.equal(mapDisposals, 1);
  assert.equal(f.overlay.stats().disposed, true);
  assert.equal(f.overlay.stats().highWaterVisible, false);
  f.overlay.sync();
  f.overlay.setLevel('low');
  assert.equal(reads, 1, 'disposed overlays do not read the host again');
  f.geometry.dispose();
  f.material.dispose();
});
