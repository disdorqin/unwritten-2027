import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancedMesh, Matrix4, PointLight, Vector3 } from 'three';
import { buildCraterMouthWorks } from '../tools/voxel-tavern/town-blockout/town-crater-mouth-works';

const anchor = { east: -120, north: 185, rimHeight: 12, yaw: 1.364 };
// Flat surroundings survey: every point outside the bowl has ground.
const road = { anchor, heightAt: (_east: number, _north: number) => 12 };

function polar(east: number, north: number) {
  const de = east - anchor.east, dn = north - anchor.north;
  const radius = Math.hypot(de, dn);
  let bearing = Math.atan2(de, dn) * 180 / Math.PI;
  if (bearing < 0) bearing += 360;
  return { radius, bearing };
}

test('crater mouth works: the five named sites land in their surveyed bands', () => {
  const { sites } = buildCraterMouthWorks(road);
  const byId = new Map(sites.map(s => [s.id, s]));
  for (const id of ['assembly-ground', 'supply-station', 'guard-shed', 'zb35-anchor', 'fence-main-gate']) {
    assert.ok(byId.has(id), `missing site ${id}`);
  }
  const assembly = polar(byId.get('assembly-ground')!.east, byId.get('assembly-ground')!.north);
  assert.ok(assembly.radius > 64 && assembly.radius < 76, `assembly radius ${assembly.radius}`);
  assert.ok(assembly.bearing > 150 && assembly.bearing < 186, `assembly bearing ${assembly.bearing}`);
  const supply = polar(byId.get('supply-station')!.east, byId.get('supply-station')!.north);
  assert.ok(supply.radius > 68 && supply.radius < 80, `supply radius ${supply.radius}`);
  assert.ok(supply.bearing > 135 && supply.bearing < 165, `supply bearing ${supply.bearing}`);
  const shed = polar(byId.get('guard-shed')!.east, byId.get('guard-shed')!.north);
  assert.ok(shed.radius > 58 && shed.radius < 70, `shed radius ${shed.radius}`);
  assert.ok(shed.bearing > 345 || shed.bearing < 12, `shed bearing ${shed.bearing}`);
  const gate = polar(byId.get('fence-main-gate')!.east, byId.get('fence-main-gate')!.north);
  assert.ok(gate.radius > 86 && gate.radius < 94, `gate radius ${gate.radius}`);
  assert.ok(gate.bearing > 158 && gate.bearing < 172, `gate bearing ${gate.bearing}`);
  // The rusted warning plate rides the gate's right leaf (牌面 §二).
  const plate = polar(byId.get('fence-gate-sign')!.east, byId.get('fence-gate-sign')!.north);
  assert.ok(plate.radius > 86 && plate.radius < 94, `plate radius ${plate.radius}`);
  assert.ok(plate.bearing > 160 && plate.bearing < 166, `plate bearing ${plate.bearing}`);
});

test('crater mouth works: rim lamp chain has ten lamps and three real lights burn', () => {
  const { group, sites } = buildCraterMouthWorks(road);
  const lamps = sites.filter(s => s.id.startsWith('rim-lamp-'));
  assert.equal(lamps.length, 10);
  for (const lamp of lamps) {
    const { radius } = polar(lamp.east, lamp.north);
    assert.ok(radius > 59 && radius < 63, `lamp radius ${radius}`);
  }
  let lights = 0;
  group.traverse(obj => { if (obj instanceof PointLight) lights++; });
  assert.equal(lights, 3);
});

test('crater mouth works: wreckage stays on the outer slope, clear of the belt and the approach', () => {
  const { group, debrisCount } = buildCraterMouthWorks(road);
  assert.ok(debrisCount >= 40 && debrisCount <= 110, `debris ${debrisCount}`);
  let ring: InstancedMesh | undefined;
  group.traverse(obj => { if (obj instanceof InstancedMesh) ring = obj; });
  assert.ok(ring, 'wreckage instanced mesh exists');
  const m = new Matrix4();
  const v = new Vector3();
  for (let i = 0; i < debrisCount; i++) {
    ring!.getMatrixAt(i, m);
    v.setFromMatrixPosition(m);
    const { radius, bearing } = polar(v.x, -v.z);
    assert.ok(radius > 57 && radius < 98, `debris radius ${radius}`);
    assert.ok(bearing <= 84 || bearing >= 216, `debris bearing ${bearing} inside the belt arc`);
  }
});

test('crater mouth works: draw and triangle ledger stays inside the mainline-1 slice', () => {
  const { group } = buildCraterMouthWorks(road);
  let draws = 0, tris = 0;
  group.traverse(obj => {
    const mesh = obj as InstancedMesh;
    if (!('geometry' in mesh) || !mesh.geometry) return;
    draws++;
    const geo = mesh.geometry;
    const per = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    tris += mesh instanceof InstancedMesh ? per * mesh.count : per;
  });
  assert.ok(draws <= 40, `draws ${draws}`);
  assert.ok(tris <= 60000, `tris ${tris}`);
});
