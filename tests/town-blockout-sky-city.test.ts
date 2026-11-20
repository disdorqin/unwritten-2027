import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, NearestFilter, SRGBColorSpace, Vector3, type BoxGeometry, type DataTexture,
  type Mesh, type MeshLambertMaterial } from 'three';
import { createSkyCityApproach, createSkyCityLanding } from '../tools/voxel-tavern/town-blockout/sky-city-approach';
import { createSkyCitySite } from '../tools/voxel-tavern/town-blockout/sky-city-site';
import { mountSkyCity, skyCityTier, type SkyCityFoot } from '../tools/voxel-tavern/town-blockout/sky-city';

test('valley has no island and the summit loads one low-detail mesh before the close flight view', () => {
  const layer = new Group();
  const city = mountSkyCity(layer);
  city.show(skyCityTier('ground', 0));
  assert.equal(layer.children.length, 0);
  city.show(skyCityTier('summit', 45));
  const silhouette = layer.children[0]!;
  const meshes: Mesh[] = [];
  silhouette.traverse(object => { if ((object as Mesh).isMesh) meshes.push(object as Mesh); });
  assert.equal(meshes.length, 1);
  assert.ok((meshes[0]!.geometry.index?.count ?? meshes[0]!.geometry.attributes.position!.count) / 3 < 2_000);
  city.update(11);
  assert.notEqual(silhouette.rotation.y, 0);
  city.show(skyCityTier('aircraft', 145));
  assert.equal(layer.children.length, 1);
  assert.notEqual(layer.children[0], silhouette);
  assert.equal(silhouette.parent, null);
  city.show('hidden');
  assert.equal(layer.children.length, 0);
  city.dispose();
});

test('the locked gate keeps its original dimensions and releases the pixel finish with the full model', () => {
  const city = mountSkyCity(new Group());
  city.show('full');
  const full = city.footModel()!;
  const gate = full.group.getObjectByName('sky-city-locked-gate')!;
  const slab = gate.getObjectByName('solid-door-surface') as Mesh<BoxGeometry, MeshLambertMaterial>;
  assert.ok(slab?.isMesh);
  const { width, height, depth } = slab.geometry.parameters;
  assert.deepEqual([width, height, depth], [2.64, 3.35, .30]);
  assert.equal(slab.position.y, height / 2);
  assert.ok(gate.getObjectByName('town-chronicle-ring'));
  assert.equal(full.obstructs(gate.position.x, gate.position.z, gate.position.y, .28), true);

  const map = slab.material.map as DataTexture;
  assert.ok(map?.isDataTexture);
  assert.equal(map.magFilter, NearestFilter);
  assert.equal(map.minFilter, NearestFilter);
  assert.equal(map.generateMipmaps, false);
  assert.equal(map.colorSpace, SRGBColorSpace);
  const uv = slab.geometry.getAttribute('uv');
  // BoxGeometry's last two faces are the full-width front and rear of the slab.
  for (const face of slab.geometry.groups.slice(4)) {
    const vertices = Array.from({ length: face.count }, (_, i) => slab.geometry.index!.getX(face.start + i));
    const u = vertices.map(index => uv.getX(index));
    const v = vertices.map(index => uv.getY(index));
    assert.ok(Math.abs((Math.max(...u) - Math.min(...u)) * map.image.width + 1 - width * 24) < 1);
    assert.ok(Math.abs((Math.max(...v) - Math.min(...v)) * map.image.height + 1 - height * 24) < 1);
  }

  let mapDisposals = 0;
  map.addEventListener('dispose', () => { mapDisposals++; });
  city.show('silhouette');
  city.show('full');
  assert.equal(city.footModel(), full);
  assert.equal(mapDisposals, 0);
  city.dispose();
  city.dispose();
  assert.equal(mapDisposals, 1);
});

test('a translated and turned site aligns the reveal silhouette, landing surface and locked gate', () => {
  const site = createSkyCitySite({ east: -318, north: 912, height: 785 }, .64);
  const layer = new Group();
  site.place(layer);
  const city = mountSkyCity(layer);
  const localNorth = site.toWorld({ x: 0, y: 0, z: -1 });
  const heading = Math.atan2(localNorth.east - site.origin.east, localNorth.north - site.origin.north);
  assert.ok(Math.abs(heading - site.yaw) < 1e-10);

  city.show('silhouette');
  city.update(11);
  const silhouette = layer.children[0]!;
  const sightline = silhouette.localToWorld(new Vector3(0, 3, 0));
  const sightTarget = site.toWorld({ x: silhouette.position.x, y: silhouette.position.y + 3, z: 0 });
  assert.ok(sightline.distanceTo(new Vector3(sightTarget.east, sightTarget.height, -sightTarget.north)) < 1e-9);

  city.show('full');
  const model = city.footModel()!;
  const landing = createSkyCityLanding(site, { islandFloorAt: model.floorAt, islandBlocked: model.obstructs });
  const localLane = new Vector3(-14, 0, 36);
  const lane = site.toWorld(localLane);
  assert.ok(model.group.localToWorld(localLane.clone()).distanceTo(new Vector3(lane.east, lane.height, -lane.north)) < 1e-9);
  const local = site.toLocal(lane);
  assert.ok(localLane.distanceTo(new Vector3(local.x, local.y, local.z)) < 1e-9);
  assert.ok(landing.onLane(lane));
  assert.deepEqual(landing.surfaceAt(lane.east, lane.north), { height: lane.height, kind: 'roof', slopeDegrees: 0, obstacleAhead: 0 });
  assert.equal(landing.canDisembark(lane), true);
  assert.equal(landing.canDisembark({ ...lane, height: lane.height - .01 }), true);
  assert.equal(landing.canDisembark({ ...lane, height: lane.height - 40 }), false);
  assert.equal(landing.canDisembark({ ...lane, height: lane.height + .1 }), false);
  assert.equal(landing.blocked(lane, .35), false);
  const offLane = site.toWorld({ x: -13, y: 0, z: -18 });
  assert.equal(landing.onLane(offLane), false);
  assert.equal(landing.canDisembark(offLane), false);
  assert.equal(landing.surfaceAt(offLane.east, offLane.north)?.obstacleAhead, 2);
  assert.equal(landing.surfaceAt(localLane.x, -localLane.z), undefined);

  const [x, y, z] = model.gate;
  const gate = site.toWorld({ x, y, z });
  assert.equal(landing.blocked(gate, .28), true);
  city.dispose();
});

test('an actual glide lands on the city and its floors lead into the dormitory and up to a locked gate', t => {
  const city = mountSkyCity(new Group());
  city.show('full');
  const model = city.footModel()!;
  const aircraft = createSkyCityApproach({ islandFloorAt: model.floorAt, islandBlocked: model.obstructs });
  assert.equal(aircraft.launch(), true);
  let state = aircraft.snapshot();
  for (let i = 0; i < 1_800 && state.stage === 'flight'; i++) state = aircraft.advance(1 / 60);
  assert.equal(state.stage, 'walking');
  assert.equal(state.flight?.recovery, null);
  const spawn = { x: state.feet.east, y: 0, z: -state.feet.north };
  const [gx, gy, gz] = model.gate;

  function travel(foot: SkyCityFoot, route: readonly (readonly [number, number, number])[]) {
    for (const [x, y, z] of route) {
      const start = foot;
      const steps = Math.max(1, Math.ceil(Math.hypot(x - start.x, z - start.z) / .055));
      for (let step = 1; step <= steps; step++) {
        const east = start.x + (x - start.x) * step / steps;
        const south = start.z + (z - start.z) * step / steps;
        const next = model.step(foot, east, south);
        assert.ok(next, `blocked at ${east},${south} en route to ${x},${y},${z}`);
        foot = next;
      }
      assert.ok(Math.abs(foot.y - y) <= .31);
    }
    return foot;
  }

  const dorm = travel(spawn, model.dormRoute);
  const outside = travel(dorm, [...model.dormRoute].reverse());
  const gateApproach = travel(outside, [[-13, 0, -18], [0, 0, -24], ...model.towerRoute]);
  assert.equal(gateApproach.y, gy);
  assert.ok(Math.hypot(gateApproach.x - gx, gateApproach.z - gz) < 3);
  assert.equal(model.step(gateApproach, gx, gz), undefined);
  assert.equal(model.step(spawn, 0, 0), undefined);
  assert.equal(model.step(spawn, 0, 68), undefined);
  t.diagnostic(JSON.stringify({ flightSeconds: state.flight?.elapsed, spawn, gateApproach }));
  city.dispose();
});

test('flight below the translated island crosses the projected runway without touching down', t => {
  const site = createSkyCitySite({ east: 0, north: -100, height: 880 });
  const city = mountSkyCity(new Group());
  t.after(() => city.dispose());
  city.show('full');
  const model = city.footModel()!;
  const support = { islandFloorAt: model.floorAt, islandBlocked: model.obstructs };
  const landing = createSkyCityLanding(site, support);
  const aircraft = createSkyCityApproach({ site, ...support });
  assert.ok(aircraft.launch());

  let flight = aircraft.snapshot();
  for (let step = 0; step < 1800 && flight.stage === 'flight' && !landing.onLane(flight.feet); step++) {
    flight = aircraft.advance(1 / 60);
  }
  assert.ok(landing.onLane(flight.feet));
  assert.equal(landing.canDisembark(flight.feet), false);
  assert.equal(landing.surfaceAt(flight.feet.east, flight.feet.north)?.height, 880);
  assert.equal(flight.flight?.phase, 'airborne');
  assert.equal(flight.flight.touchdown, null);
  assert.equal(flight.flight.recovery, null);
  assert.ok(flight.feet.height < 800);
  t.diagnostic(JSON.stringify(flight.feet));
});
