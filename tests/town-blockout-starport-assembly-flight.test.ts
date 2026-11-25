import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { NearestFilter, SRGBColorSpace, type BoxGeometry, type DataTexture, type Mesh, type MeshLambertMaterial } from 'three';
import { createAircraftFlight, surveyAircraftRunway, type AircraftPoint } from '../src/shared/aircraft-flight.ts';
import { createFlightThrust } from '../src/shared/flight-thrust.ts';
import {
  createFittedStarportAssemblySite, createStarportAssembly, starportAssemblyParts, type StarportAssemblyState,
} from '../src/shared/starport-assembly.ts';
import {
  createOrdinaryTownNightSchedule, createTownNightWindow, townDayMs, townLayerOverlapMs,
} from '../src/shared/town-night-window.ts';
import { mountStarportAssemblySite, starportAssemblyEnvelopeAt } from '../tools/voxel-tavern/town-blockout/starport-assembly-site.ts';
import { mountStarportFlightAssembly } from '../tools/voxel-tavern/town-blockout/starport-flight-assembly.ts';
import { createStarportReviewWorld, starportFlightSite } from '../tools/voxel-tavern/town-blockout/starport-flight-site.ts';
import { za22CloudRunway, za22CloudSurfaceAt } from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

type Target = typeof starportAssemblyParts[number] | 'ignition';
const { Group } = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url))('three') as {
  Group: new () => Parameters<typeof mountStarportFlightAssembly>[0];
};

function prepare() {
  const anchor = starportFlightSite.assembly;
  let feet: AircraftPoint = { ...anchor, north: anchor.north - 1.6 };
  let now = 0;
  const scheduleAt = createOrdinaryTownNightSchedule({
    dawnEpoch: 0, beaconOffsetsAfterDusk: Array(12).fill(60_000), cueFreshnessMs: 2_000,
  });
  const window = createTownNightWindow({ now: () => now, scheduleAt });
  const assembly = mountStarportFlightAssembly(new Group(), anchor, () => feet, () => window.snapshot().layersOverlap);

  function face(targetName: Target, standBack = 1.4): [heading: number, pitch: number] {
    const target = assembly.snapshot().targets[targetName];
    feet = { east: target.east, north: target.north - standBack, height: anchor.height };
    const east = target.east - feet.east;
    const north = target.north - feet.north;
    return [Math.atan2(east, north), Math.atan2(target.height - feet.height - 1.58, Math.hypot(east, north))];
  }

  function hearBeacon(day: number) {
    const schedule = scheduleAt(day * townDayMs);
    assert.ok(schedule);
    now = schedule.beaconAt;
    assert.equal(window.recordBeacon(now)?.kind, 'town-night-beacon');
    assert.equal(window.snapshot().layersOverlap, true);
  }

  return { assembly, face, hearBeacon, expireOverlap() {
    now += townLayerOverlapMs;
    assert.equal(window.snapshot().layersOverlap, false);
  } };
}

test('ZD-03 flight rack requires a forward sightline and accepted ground reach for each fitting', async t => {
  const { assembly, face } = prepare();
  t.after(() => assembly.dispose());
  const [heading, pitch] = face('snow-wing');
  assert.equal(assembly.aim(heading + Math.PI, pitch), null);
  assert.equal((await assembly.interact(heading + Math.PI, pitch)).kind, 'select-component');
  assert.equal((await assembly.interact(...face('snow-wing', 3))).kind, 'out-of-reach');
  assert.deepEqual(assembly.snapshot().profile, {
    revision: 0, carried: [...starportAssemblyParts], installed: [], ignited: false,
  });
  assert.equal((await assembly.interact(...face('ignition'))).kind, 'incomplete');
  for (const part of starportAssemblyParts) {
    const view = face(part);
    assert.equal(assembly.aim(...view), part);
    assert.equal((await assembly.interact(...view)).kind, 'placed');
    assert.equal((await assembly.interact(...view)).kind, 'already-installed');
  }
  assert.deepEqual(assembly.snapshot().profile, {
    revision: 3, carried: [], installed: [...starportAssemblyParts], ignited: false,
  });
});

test('ZD-03 all three fittings still require the first beacon minute before F-4 rollout', async t => {
  const { assembly, face, hearBeacon, expireOverlap } = prepare();
  t.after(() => assembly.dispose());
  const { world } = createStarportReviewWorld({ assemblyHandoff: true });
  const { runway } = starportFlightSite;
  const runwaySurvey = surveyAircraftRunway(runway, world);
  assert.ok(runwaySurvey.ok);
  assert.equal(runwaySurvey.checkedMetres, 42.5);
  const power = createFlightThrust(600);
  const flight = createAircraftFlight(world, power);

  for (const part of starportAssemblyParts) assert.equal((await assembly.interact(...face(part))).kind, 'placed');
  const ignitionView = face('ignition');
  assert.equal(assembly.aim(...ignitionView), 'ignition');
  assert.equal(flight.launchRunway(assembly.snapshot().profile.ignited, runway.start, runway), false);
  hearBeacon(0);
  assert.equal((await assembly.interact(...ignitionView)).kind, 'missing-key');
  assembly.grantKeyOne();
  expireOverlap();
  assert.equal((await assembly.interact(...ignitionView)).kind, 'window-closed');
  assert.equal(assembly.snapshot().profile.revision, 3);
  assert.equal(flight.launchRunway(assembly.snapshot().profile.ignited, runway.start, runway), false);

  hearBeacon(1);
  assert.equal((await assembly.interact(...ignitionView)).kind, 'ignited');
  assert.deepEqual(assembly.snapshot().profile, {
    revision: 4, carried: [], installed: [...starportAssemblyParts], ignited: true,
  });
  assert.ok(flight.launchRunway(assembly.snapshot().profile.ignited, runway.start, runway));
  assert.equal(flight.snapshot()?.phase, 'rolling');
  let liftoff: ReturnType<typeof flight.snapshot>;
  for (let step = 0; step < 101; step++) {
    const current = flight.advance(.1, { throttle: 'full' });
    if (current?.phase !== 'airborne') continue;
    liftoff = current;
    break;
  }
  assert.ok(liftoff);
  assert.equal(liftoff.rollMetres, 40);
  assert.equal(liftoff.speed, 8);
  assert.ok(Math.abs(liftoff.elapsed - 10) < 1e-7);
  assert.equal(liftoff.point.height, runway.start.height + .35);
  assert.ok(Math.abs(power.snapshot().fuelSeconds - 590) < 1e-7);
});

test('ZD-03 fitted rack at the ZA-22 bench has a clear south approach and leaves the runway clear', t => {
  const owner = new Group();
  const anchor = { east: 324, north: 657, height: 347 };
  const model = mountStarportAssemblySite(owner, anchor);
  t.after(() => model.dispose());
  const runway = za22CloudRunway;
  const radius = .27;
  const eyeHeight = 1.65;
  const bodyHeight = 1.8;

  const envelope = starportAssemblyEnvelopeAt(anchor);
  assert.deepEqual(model.group.position.toArray(), [324, 347, -657]);
  assert.equal(model.group.parent, owner);
  assert.equal(model.aim(undefined, 0, 0, eyeHeight), null);
  const panel = model.group.getObjectByName('rack-worn-panel') as unknown as Mesh<BoxGeometry, MeshLambertMaterial>;
  assert.equal(panel.geometry.parameters.width, 5.82);
  const map = panel.material.map as DataTexture;
  assert.ok(map.isDataTexture);
  assert.equal(map.colorSpace, SRGBColorSpace);
  assert.equal(map.minFilter, NearestFilter);
  assert.equal(map.magFilter, NearestFilter);
  assert.equal(map.generateMipmaps, false);
  const front = panel.geometry.groups[4]!;
  const frontUV = Array.from({ length: front.count }, (_, i) =>
    panel.geometry.attributes.uv!.getX(panel.geometry.index!.getX(front.start + i)));
  assert.equal(Math.round((Math.max(...frontUV) - Math.min(...frontUV)) * map.image.width) + 1, 140);
  let mapDisposals = 0;
  map.addEventListener('dispose', () => mapDisposals++);
  for (const east of [envelope.east - envelope.width / 2, envelope.east + envelope.width / 2]) {
    for (const north of [envelope.north - envelope.depth / 2, envelope.north + envelope.depth / 2]) {
      assert.equal(za22CloudSurfaceAt(east, north, 0), anchor.height);
    }
  }
  assert.equal(model.blocked(anchor, radius, bodyHeight), true);
  assert.equal(model.blocked({ ...anchor, east: 326.82 }, radius, bodyHeight), true);
  assert.equal(model.blocked({ ...anchor, height: anchor.height + envelope.tall }, radius, bodyHeight), false);

  const approach = [[336, 640], [336, 663.25], [328, 663.25], [328, 655], [324, 655]] as const;
  for (let part = 1; part < approach.length; part++) {
    const [fromEast, fromNorth] = approach[part - 1]!;
    const [toEast, toNorth] = approach[part]!;
    const steps = Math.ceil(Math.hypot(toEast - fromEast, toNorth - fromNorth) / .15);
    for (let step = 0; step <= steps; step++) {
      const east = fromEast + (toEast - fromEast) * step / steps;
      const north = fromNorth + (toNorth - fromNorth) * step / steps;
      const height = za22CloudSurfaceAt(east, north, radius);
      assert.equal(height, anchor.height, `ZA-22 approach support at ${east}/${north}`);
      assert.equal(model.blocked({ east, north, height }, radius, bodyHeight), false);
    }
  }

  for (const name of [...starportAssemblyParts, 'ignition'] as const) {
    const target = model.targets[name];
    const feet = { east: target.east, north: 655, height: anchor.height };
    assert.equal(za22CloudSurfaceAt(feet.east, feet.north, radius), feet.height);
    assert.equal(model.blocked(feet, radius, bodyHeight), false);
    const reachPoint = name === 'ignition' ? model.site.ignitionPoint : model.site.sockets[name];
    assert.deepEqual(reachPoint, { ...target, height: anchor.height });
    assert.ok(reachPoint.north - feet.north <= model.site.reach);
    const pitch = Math.atan2(target.height - feet.height - eyeHeight, target.north - feet.north);
    assert.equal(model.aim(feet, 0, pitch, eyeHeight), name);
    assert.equal(model.aim(feet, Math.PI, pitch, eyeHeight), null);
  }
  for (let east = runway.start; east <= runway.end; east += .5) {
    const feet = { east, north: runway.north, height: anchor.height };
    for (const offset of [-runway.width / 2, 0, runway.width / 2]) {
      assert.equal(za22CloudSurfaceAt(east, feet.north + offset, 0), feet.height);
    }
    assert.equal(model.blocked(feet, runway.width / 2, bodyHeight), false);
  }
  model.show({ installed: starportAssemblyParts, ignited: true });
  for (const part of starportAssemblyParts) assert.equal(model.group.getObjectByName(part)?.visible, true);
  model.dispose();
  model.dispose();
  assert.equal(mapDisposals, 1);
  assert.equal(model.group.parent, null);
  assert.equal(model.blocked(anchor, radius, bodyHeight), false);
});

test('ZD-03 rack targets reject rear sightlines and remain available from oblique front approaches', t => {
  const anchor = { east: 324, north: 657, height: 347 };
  const model = mountStarportAssemblySite(new Group(), anchor);
  t.after(() => model.dispose());
  const eyeHeight = 1.65;
  function aimAt(feet: AircraftPoint, target: AircraftPoint) {
    const east = target.east - feet.east;
    const north = target.north - feet.north;
    const distance = Math.hypot(east, north);
    assert.ok(distance < model.site.reach);
    assert.equal(model.blocked(feet, .27, 1.8), false);
    return model.aim(feet, Math.atan2(east, north), Math.atan2(target.height - feet.height - eyeHeight, distance), eyeHeight);
  }

  for (const name of [...starportAssemblyParts, 'ignition'] as const) {
    const target = model.targets[name];
    const rear = { ...anchor, east: target.east, north: 658.2 };
    assert.equal(aimAt(rear, target), null, `${name} is hidden from behind`);
  }
  for (const [name, east] of [['snow-wing', 320.5], ['navigation-core', 327.5]] as const) {
    const target = model.targets[name];
    const oblique = { ...anchor, east, north: target.north - .18 };
    assert.equal(aimAt(oblique, target), name);
  }
});

test('ZD-03 the fitted rack requires its front side at request and commit for installation and ignition', async t => {
  const anchor = { east: 324, north: 657, height: 347 };
  const model = mountStarportAssemblySite(new Group(), anchor);
  t.after(() => model.dispose());
  const south = { ...anchor, north: 655 };
  const rear = { ...anchor, north: 658.2 };
  let feet = rear;
  let feetAtCommit: AircraftPoint | undefined;
  let profile: StarportAssemblyState = { revision: 0, carried: starportAssemblyParts, installed: [], ignited: false };
  const site = createFittedStarportAssemblySite(anchor);
  assert.deepEqual(site.sockets, {
    'snow-wing': { east: 322.1, north: 656.68, height: 347 },
    booster: { east: 324, north: 656.68, height: 347 },
    'navigation-core': { east: 325.9, north: 656.68, height: 347 },
  });
  assert.deepEqual(site.ignitionPoint, { east: 324, north: 656.64, height: 347 });
  const assembly = createStarportAssembly(site, {
    read: () => profile,
    pose: () => feet,
    readIgnition: () => ({ keyOne: true, layersOverlap: true }),
    commit(_id, expected, next, guard) {
      if (feetAtCommit) feet = feetAtCommit;
      if (expected !== profile.revision || !guard()) return false;
      profile = next;
      return true;
    },
  });

  for (const part of starportAssemblyParts) {
    feet = { ...rear, east: model.site.sockets[part].east };
    assert.equal(model.blocked(feet, .27, 1.8), false);
    assert.equal((await assembly.place('pilot', part)).kind, 'out-of-reach');
  }
  const wing = model.site.sockets['snow-wing'];
  feet = { ...anchor, east: 320.5, north: wing.north };
  assert.equal((await assembly.place('pilot', 'snow-wing')).kind, 'out-of-reach');
  feet = south;
  feetAtCommit = rear;
  assert.equal((await assembly.place('pilot', 'booster')).kind, 'conflict');
  assert.deepEqual(await assembly.snapshot('pilot'), profile);
  assert.equal(profile.revision, 0);

  feetAtCommit = undefined;
  feet = { ...anchor, east: 320.5, north: wing.north - .18 };
  assert.equal((await assembly.place('pilot', 'snow-wing')).kind, 'placed');
  for (const part of ['booster', 'navigation-core'] as const) {
    feet = { ...south, east: model.site.sockets[part].east };
    assert.equal((await assembly.place('pilot', part)).kind, 'placed');
  }
  feet = rear;
  assert.equal((await assembly.ignite('pilot')).kind, 'out-of-reach');
  feet = south;
  feetAtCommit = rear;
  assert.equal((await assembly.ignite('pilot')).kind, 'conflict');
  assert.equal(profile.revision, 3);
  assert.equal(profile.ignited, false);
  feetAtCommit = undefined;
  feet = south;
  assert.equal((await assembly.ignite('pilot')).kind, 'ignited');
  assert.deepEqual(await assembly.snapshot('pilot'), {
    revision: 4, carried: [], installed: [...starportAssemblyParts], ignited: true,
  });
});
