import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, Raycaster, Vector3, type MeshBasicMaterial } from 'three';
import { orbitalAnchorIds } from '../src/presence/orbital-anchor-registry.ts';
import { createOrbitalStationDeck } from '../tools/voxel-tavern/town-blockout/orbital-station-deck.ts';

test('S-2 through S-3 is one continuous collision-checked route', () => {
  const deck = createOrbitalStationDeck();
  try {
    assert.equal(deck.roomAt(deck.start.x, deck.start.n), 'airlock');
    const checkedRooms = new Set<string>();
    let feet = 0;
    for (const route of [deck.tourRoute, [...deck.tourRoute].reverse()]) {
      let prior = route[0].ground;
      for (let index = 1; index < route.length; index++) {
        const from = route[index - 1], to = route[index];
        const parts = Math.ceil(Math.hypot(to.x - from.x, to.n - from.n) / .025);
        for (let i = 0; i <= parts; i++) {
          const x = from.x + (to.x - from.x) * i / parts;
          const n = from.n + (to.n - from.n) * i / parts;
          const height = deck.floorHeightAt(x, n);
          assert.notEqual(height, undefined, `missing support at ${x}, ${n}`);
          assert.ok(deck.isWalkable(x, n), `blocked route sample at ${x}, ${n}`);
          assert.ok(Math.abs(height! - prior) <= .025, `floor jump at ${x}, ${n}`);
          prior = height!;
          const room = deck.roomAt(x, n);
          if (room) checkedRooms.add(room);
          feet++;
        }
      }
    }
    assert.deepEqual([...checkedRooms], ['airlock', 'living', 'cockpit', 'observation', 'teleport']);
    assert.ok(feet > 5800);
    assert.equal(deck.rooms.cockpit.ground, .32);
    assert.ok(deck.floorHeightAt(6.4, 6.15)! > 0);
    assert.ok(!deck.isWalkable(5.4, 3), 'solid wall between cockpit and airlock openings');
    assert.ok(!deck.isWalkable(8.8, .97), 'outside cabin bounds');
    assert.ok(!deck.isWalkable(9.1, 21.45), 'central console housing is solid');
  } finally {
    deck.dispose();
  }
});

test('exact S-1 four-anchor states drive the pad, with one independent steady hub', () => {
  const deck = createOrbitalStationDeck();
  try {
    const { teleport } = deck;
    const indicator = (id: string) => (deck.group.getObjectByName('teleport-anchor-' + id) as Mesh<Mesh['geometry'], MeshBasicMaterial>).material;
    const hub = (deck.group.getObjectByName('teleport-always-lit-hub') as Mesh<Mesh['geometry'], MeshBasicMaterial>).material;
    assert.deepEqual(teleport.readState(), {
      hubLit: true, anchors: orbitalAnchorIds.map(id => ({ id, lit: false })), mapVisible: false,
    });
    const first = 'starport';
    const old = indicator(first);
    teleport.setVisitedAnchors([first, first]);
    assert.equal(teleport.readState().anchors.filter(anchor => anchor.lit).length, 1);
    assert.equal(indicator(first), hub);
    assert.notEqual(indicator('summit'), hub);
    assert.equal(teleport.readState().mapVisible, false);
    teleport.setVisitedAnchors(orbitalAnchorIds);
    assert.ok(teleport.readState().mapVisible);
    assert.equal(deck.group.getObjectByName('teleport-complete-anchor-map')?.visible, true);
    assert.deepEqual(teleport.console, deck.rooms.teleport);
    teleport.setVisitedAnchors([]);
    assert.equal(indicator(first), old);
    assert.equal(teleport.readState().mapVisible, false);
    assert.equal(teleport.readState().hubLit, true);
  } finally {
    deck.dispose();
  }
});

test('the approved living and observation assets and S-2 airlock survive the deck fit', () => {
  const deck = createOrbitalStationDeck();
  try {
    for (const name of ['orbital-airlock', 'orbital-cockpit', 'orbital-observation-cabin',
      'orbital-living-cabin', 'orbital-teleport-cabin', 'orbital-status-wall',
      'observation-single-long-bench', 'orbital-berth-3']) {
      assert.ok(deck.group.getObjectByName(name), name);
    }
    const airlock = deck.group.getObjectByName('orbital-airlock')!;
    const lamps: string[] = [];
    airlock.traverse(node => {
      if (node.name.startsWith('status-')) lamps.push(node.name);
    });
    assert.equal(lamps.filter(name => name === 'status-red').length, 16);
    assert.equal(lamps.filter(name => name === 'status-teleport').length, 1);
    assert.equal(lamps.filter(name => name === 'status-life-support').length, 1);
  } finally {
    deck.dispose();
  }
});


test('the observation bench starts from a supported footpoint and its window restores the first frame after one loop', () => {
  const deck = createOrbitalStationDeck();
  try {
    const lookout = deck.observation;
    assert.equal(deck.roomAt(lookout.approach.x, lookout.approach.n), 'observation');
    assert.ok(deck.isWalkable(lookout.approach.x, lookout.approach.n));
    assert.ok(lookout.canSitAt(lookout.approach));
    assert.ok(!lookout.canSitAt(deck.start));
    assert.ok(!lookout.canSitAt(deck.rooms.living));
    assert.ok(!lookout.canSitAt(deck.rooms.observation), 'the ordinary viewpoint still requires walking to the seat');
    assert.ok(!lookout.canSitAt({ ...lookout.approach, ground: 2 }));
    assert.ok(!deck.isWalkable(lookout.seat.x, lookout.seat.n), 'the fixture still blocks walking');
    assert.equal(lookout.seat.ground, .5);
    assert.equal(lookout.cycleSeconds, 24);
    const start = lookout.readWindowCycle();
    lookout.setWindowCycle(lookout.cycleSeconds / 4);
    const quartile = lookout.readWindowCycle();
    assert.ok(quartile.limbEast > start.limbEast);
    assert.ok(quartile.peaksEast > start.peaksEast);
    assert.ok(quartile.lakeGlint > start.lakeGlint);
    assert.ok(quartile.townGlow < start.townGlow);
    lookout.setWindowCycle(lookout.cycleSeconds);
    assert.deepEqual(lookout.readWindowCycle(), start);
    assert.deepEqual(deck.teleport.readState().anchors.map(anchor => anchor.lit), [false, false, false, false]);
  } finally {
    deck.dispose();
  }
});

test('the combined cockpit plaque has a full backing and can be read from the side-door arrival', () => {
  const deck = createOrbitalStationDeck();
  try {
    const { cockpitNameplate: plate, group } = deck;
    group.updateMatrixWorld(true);
    const cockpit = group.getObjectByName('orbital-cockpit')!;
    assert.equal(plate.n, 7.9);
    const depthFace = plate.x + plate.depth / 2 - .002;
    for (const north of [plate.n - plate.width / 2 + .012, plate.n, plate.n + plate.width / 2 - .012]) {
      for (const height of [plate.y - plate.height / 2 + .012, plate.y, plate.y + plate.height / 2 - .012]) {
        const ray = new Raycaster(new Vector3(depthFace, height, -north), new Vector3(1, 0, 0), 0, .006);
        assert.equal(ray.intersectObject(cockpit, true)[0]?.object.name, 'orbital-east-bulkhead');
      }
    }
    const arrival = deck.rooms.cockpit;
    assert.ok(deck.isWalkable(5.4, arrival.n), 'the side doorway was not blocked by the plaque');
    const eye = new Vector3(arrival.x, arrival.ground + 1.65, -arrival.n);
    const lookAt = new Vector3(plate.x, plate.y, -plate.n).sub(eye).normalize();
    assert.equal(new Raycaster(eye, lookAt).intersectObject(group, true)[0]?.object.name,
      'orbital-sign-cockpit-nameplate');
    assert.equal(group.getObjectByName('orbital-sign-airlock-nameplate'), undefined);
    assert.ok(group.getObjectByName('orbital-status-wall')?.userData.nameplate);
  } finally {
    deck.dispose();
  }
});
