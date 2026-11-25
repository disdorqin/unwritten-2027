import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Light, Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

// Salvage of lane-a 976ab6d / 453422e (ruling 2026-11-21 17:30, disposition A):
// the GPT A outerworks set retires whole; three pieces land on the mainline
// modules — E actions, the ground tripod scope, and the V3 ejecta/midground
// plus the two-span rope-stay. The ejecta layout is the V3 original with a
// mechanical keep-out: a placement whose footprint would swallow a mainline
// fence post or the town-era wall is skipped, never nudged.
const anchor = { east: -120, north: 185 };

function polar(east: number, north: number) {
  const de = east - anchor.east, dn = north - anchor.north;
  const radius = Math.hypot(de, dn);
  let bearing = Math.atan2(de, dn) * 180 / Math.PI;
  if (bearing < 0) bearing += 360;
  return { radius, bearing };
}

function counts(group: { traverse(cb: (node: unknown) => void): void }) {
  let draws = 0, triangles = 0, lights = 0;
  group.traverse(node => {
    if ((node as Light).isLight) lights++;
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh & { count?: number };
    draws++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) * (mesh.count ?? 1) / 3;
  });
  return { draws, triangles, lights };
}

function mount() {
  const terrain = createTerrainGrid();
  return mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
}

// The mainline fence ring radius by bearing — same bands as the outer-works
// builder (gate segment 146-184 rides at r90 through the mouth-works).
function ringRadius(bearing: number) {
  if (bearing >= 108 && bearing < 142) return 102;
  if (bearing >= 142 && bearing < 146) return 102 + (90 - 102) * (bearing - 142) / 4;
  if (bearing >= 146 && bearing < 184) return 90;
  if (bearing >= 184 && bearing < 190) return 90 + (104 - 90) * (bearing - 184) / 6;
  if (bearing >= 190 && bearing < 224) return 104;
  if (bearing >= 224 && bearing < 230) return 104 + (97 - 104) * (bearing - 224) / 6;
  return 97;
}

const road = mount();

test('salvage ejecta: V3 layout, nine fence conflicts skipped, zero violations left', () => {
  const placements = road.ejecta.placements;
  assert.equal(placements.length, 109, 'V3 laid 121 placements; 9 ejecta + 3 char fence conflicts are skipped');
  const kinds = new Map<string, number>();
  for (const p of placements) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  assert.equal(kinds.get('ejecta'), 51, 'V3 laid 60 boulders; 9 fence conflicts are skipped');
  assert.ok((kinds.get('blackstone') ?? 0) >= 40, 'rim black stones survive');
  assert.ok((kinds.get('char') ?? 0) >= 15, 'scorch decals survive (flat decals may sit on a post)');
  const group = road.group.getObjectByName('za36-crater-ejecta-landmarks');
  assert.ok(group, 'ejecta group mounted');
  const ledger = counts(group);
  assert.equal(ledger.draws, 4, 'ejecta stays in four material batches');
  assert.ok(ledger.triangles < 7500, `ejecta triangles ${ledger.triangles}`);
  // Recompute the fence re-check criterion from the mounted road itself:
  // a boulder violates when its footprint clears a post by < 1 m, the ring
  // curve by < 0.5 m, or the wall line by < 1 m.
  const posts = [...road.outerWorks.fencePosts, ...road.mouthWorks.fencePosts].map(post => {
    const rad = post.bearing * Math.PI / 180;
    return { east: anchor.east + post.radius * Math.sin(rad), north: anchor.north + post.radius * Math.cos(rad) };
  });
  for (const p of placements.filter(q => q.kind === 'ejecta')) {
    const postClear = Math.min(...posts.map(q => Math.hypot(p.east - q.east, p.north - q.north))) - p.footprint;
    const { radius, bearing } = polar(p.east, p.north);
    const ringClear = Math.abs(radius - ringRadius(bearing)) - p.footprint;
    const wallClear = p.north >= 13 && p.north <= 307 ? Math.abs(p.east + 18) - p.footprint : Infinity;
    assert.ok(postClear >= 1, `boulder (${p.east.toFixed(1)}, ${p.north.toFixed(1)}) clears posts by ${postClear.toFixed(2)}`);
    assert.ok(ringClear >= .5, `boulder (${p.east.toFixed(1)}, ${p.north.toFixed(1)}) clears the ring by ${ringClear.toFixed(2)}`);
    assert.ok(wallClear >= 1, `boulder (${p.east.toFixed(1)}, ${p.north.toFixed(1)}) clears the wall by ${wallClear.toFixed(2)}`);
  }
});

test('salvage midground: V3 layout lands whole, fifty-eight placements', () => {
  assert.equal(road.midground.placements.length, 58);
  const group = road.group.getObjectByName('za36-crater-midground');
  assert.ok(group, 'midground group mounted');
  const ledger = counts(group);
  assert.equal(ledger.draws, 5, 'midground stays in five material batches');
  assert.ok(ledger.triangles < 30000, `midground triangles ${ledger.triangles}`);
});

test('salvage rope-stay: two-span working rope with the steady anchor contract', () => {
  const stay = road.ropeStay;
  assert.ok(stay, 'rope-stay mounted');
  assert.ok(road.group.getObjectByName('za36-winch-rope-stay'));
  assert.ok(road.group.getObjectByName('za36-stay-working-rope'), 'working span');
  assert.ok(road.group.getObjectByName('za36-stay-working-rope-return'), 'return span');
  const anchorData = stay.group.userData.steadyRopeAnchor as { actionKey?: string; pendingAuthority?: boolean };
  assert.equal(anchorData.actionKey, 'hold-E');
  assert.equal(anchorData.pendingAuthority, true);
  const rates = stay.group.userData.ropeRatesReference as { onePlayer?: number; twoPlayers?: number };
  assert.deepEqual(rates, { onePlayer: 1, twoPlayers: 1.8 });
  stay.setTension(true);
  assert.equal(stay.group.userData.ropeTaut, true);
  stay.setTension(false);
  assert.equal(stay.group.userData.ropeTaut, false);
  const ledger = counts(stay.group);
  assert.ok(ledger.draws <= 12, `rope-stay draws ${ledger.draws}`);
  assert.ok(ledger.triangles < 3000, `rope-stay triangles ${ledger.triangles}`);
});

test('salvage survey M1: station on the rim north high point, clear of the shed', () => {
  const m1 = road.surveyM1;
  assert.ok(m1, 'survey M1 mounted');
  assert.ok(road.group.getObjectByName('crater-survey-m1'));
  const { radius, bearing } = polar(m1.site.east, m1.site.north);
  assert.ok(bearing > 355 || bearing < 5, `M1 bearing ${bearing}`);
  assert.ok(radius > 82 && radius < 86, `M1 radius ${radius}`);
  const shed = road.mouthWorks.sites.find(s => s.id === 'guard-shed');
  assert.ok(shed);
  assert.ok(Math.hypot(m1.site.east - shed.east, m1.site.north - shed.north) > 15,
    'M1 stands clear of the guard shed');
  const ledger = counts(m1.group);
  assert.ok(ledger.draws <= 6, `M1 draws ${ledger.draws}`);
  assert.ok(ledger.triangles < 2000, `M1 triangles ${ledger.triangles}`);
});

test('salvage crater actions: five spots probe, firewood toggles, night lights follow', () => {
  // Fresh mount: this test flips firewood and night state.
  const fresh = mount();
  const actions = fresh.craterActions.actions;
  assert.deepEqual(actions.map(a => a.id), ['registration', 'map', 'telescope', 'firewood', 'survey']);
  for (const spot of actions) {
    assert.equal(fresh.craterActions.actionAt(spot.east, spot.north, spot.height)?.id, spot.id,
      `probe at the ${spot.id} spot`);
  }
  assert.equal(fresh.craterActions.actionAt(0, 0, fresh.heightAt(0, 0) ?? 0), undefined,
    'no crater action at the plaza');
  const scope = actions.find(a => a.id === 'telescope');
  assert.ok(scope);
  assert.ok(Math.abs(scope.east + 76.05) < .6 && Math.abs(scope.north - 123.07) < .6,
    `tripod re-anchored beside the supply station (${scope.east.toFixed(2)}, ${scope.north.toFixed(2)})`);
  assert.equal(fresh.craterActions.firewood(), true);
  assert.equal(fresh.craterActions.firewood(), false);
  const lights: { intensity: number }[] = [];
  fresh.mouthWorks.group.traverse(node => { if ((node as Light).isLight) lights.push(node as Light); });
  fresh.outerWorks.group.traverse(node => { if ((node as Light).isLight) lights.push(node as Light); });
  assert.equal(lights.length, 4, 'mouth 3 + north tower 1');
  fresh.craterActions.setNight(false);
  assert.deepEqual(lights.map(l => l.intensity), [0, 0, 0, 0], 'day: all four crater lights off');
  fresh.craterActions.setNight(true);
  assert.deepEqual(lights.map(l => l.intensity).sort((a, b) => a - b), [5, 5.5, 6, 14],
    'night: yard 5.5, door 5, brazier 6, tower 14');
});
