import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orbitalAnchorIds, type OrbitalAnchorHost, type OrbitalAnchorId } from '../../src/presence/orbital-anchor-registry.ts';
import type { OrbitalGateHost } from '../../src/presence/orbital-gates.ts';
import { createOrbitalStationDeck } from '../../tools/voxel-tavern/town-blockout/orbital-station-deck.ts';
import {
  collectOrbitalAnchorVisits, orbitalDoorLockedLabel, orbitalFirstTour, readOrbitalHub, resolveOrbitalChapterDoor,
  resolveOrbitalDownlink, resolveOrbitalReturnToAirlock, resolveOrbitalTourStep,
  type OrbitalDownlinkHost, type OrbitalPosition, type OrbitalReturnHost,
} from '../../src/presence/orbital-travel.ts';

const pose = (east: number, north: number, height: number) => ({ east, north, height, yaw: 0 });
const sites: Record<OrbitalAnchorId, OrbitalPosition> = {
  starport: { domain: 'ridge', pose: pose(0, 0, 350) },
  'crater-bottom': { domain: 'pit', pose: pose(0, 0, -35) },
  summit: { domain: 'summit', pose: pose(10, 10, 800) },
  plaza: { domain: 'town', pose: pose(15, 15, 6) },
};
const anchorSites: OrbitalAnchorHost = Object.fromEntries(orbitalAnchorIds.map(id => [id, {
  domain: sites[id].domain,
  containsSupportedFootpoint: (point: OrbitalPosition['pose']) =>
    Math.hypot(point.east - sites[id].pose.east, point.north - sites[id].pose.north) < .45 &&
    point.height === sites[id].pose.height,
}]));
const hub = { domain: 'deck', pose: pose(13, 13, 0) };
const airlock = { domain: 'deck', pose: pose(-4, 0, 0) };
const downlink: OrbitalDownlinkHost = {
  chapterOpen: true, completedRooms: orbitalFirstTour.length, hubDomain: hub.domain, anchorSites, landingAt: id => sites[id],
  isAtHub: point => Math.hypot(point.east - hub.pose.east, point.north - hub.pose.north) < .4 && point.height === 0,
};
const returns: OrbitalReturnHost = {
  chapterOpen: true, airlockDomain: airlock.domain, anchorSites, isReturnDoorOpen: () => true,
  isAtReturnDoor: (id, point) => point.east === sites[id].pose.east && point.north === sites[id].pose.north - 2 &&
    point.height === sites[id].pose.height,
  airlockLanding: () => airlock,
  isLegalAirlockLanding: point => point.east === airlock.pose.east && point.north === 0 && point.height === 0,
};

test('only accepted physical steps activate their own anchor, and all four drive the hub display', () => {
  let visited: readonly OrbitalAnchorId[] = [];
  assert.equal(readOrbitalHub(visited).hubLit, true);
  assert.equal(readOrbitalHub(visited).allAnchorsLit, false);
  for (const [index, id] of orbitalAnchorIds.entries()) {
    const site = sites[id];
    const { east, north, height } = site.pose;
    for (const route of ['transport', 'restore'] as const) {
      assert.equal(collectOrbitalAnchorVisits({ ...site, route }, visited, anchorSites), visited);
    }
    assert.equal(collectOrbitalAnchorVisits({ ...site, pose: pose(east, north, height + 1), route: 'physical' }, visited, anchorSites), visited);
    for (let step = 8; step >= 0; step--) {
      visited = collectOrbitalAnchorVisits({ ...site, pose: pose(east + step * .12, north, height), route: 'physical' }, visited, anchorSites);
    }
    assert.deepEqual(visited, orbitalAnchorIds.slice(0, index + 1));
    assert.equal(readOrbitalHub(visited).anchors[id], true);
    assert.equal(collectOrbitalAnchorVisits({ ...site, route: 'physical' }, visited, anchorSites), visited);
  }
  assert.equal(readOrbitalHub(visited).allAnchorsLit, true);
  assert.deepEqual(collectOrbitalAnchorVisits({ ...sites.starport, route: 'physical' }, [], {}), []);
});

test('each activated anchor supports repeatable zero-cooldown downlinks only from the hub', () => {
  for (const id of orbitalAnchorIds) {
    assert.deepEqual(resolveOrbitalDownlink(id, hub, [], downlink), { ok: false, reason: 'unvisited' });
    assert.deepEqual(resolveOrbitalDownlink(id, airlock, [id], downlink), { ok: false, reason: 'wrong-origin' });
    assert.deepEqual(resolveOrbitalDownlink(id, hub, [id], { ...downlink, chapterOpen: false }), { ok: false, reason: 'locked' });
    assert.deepEqual(resolveOrbitalDownlink(id, hub, [id], { ...downlink, completedRooms: 4 }), { ok: false, reason: 'locked' });
    assert.deepEqual(resolveOrbitalDownlink({ id, pose: sites[id].pose }, hub, [id], downlink), { ok: false, reason: 'invalid-anchor' });
    for (let use = 0; use < 2; use++) {
      const result = resolveOrbitalDownlink(id, hub, [id], downlink);
      assert.deepEqual(result, { ok: true, position: sites[id] });
      assert.ok(result.ok && result.position.pose !== sites[id].pose);
    }
    assert.deepEqual(resolveOrbitalDownlink(id, hub, [id], {
      ...downlink, landingAt: () => ({ domain: 'wrong-layer', pose: sites[id].pose }),
    }), { ok: false, reason: 'invalid-landing' });
  }
});

test('return requires an actual local door and deposits in supported airlock, not the hub', () => {
  for (const id of orbitalAnchorIds) {
    const approach = { ...sites[id], pose: { ...sites[id].pose, north: sites[id].pose.north - 2 } };
    assert.deepEqual(resolveOrbitalReturnToAirlock(id, sites[id], [id], returns), { ok: false, reason: 'wrong-origin' });
    assert.deepEqual(resolveOrbitalReturnToAirlock(id, approach, [id], { ...returns, isReturnDoorOpen: () => false }),
      { ok: false, reason: 'locked' });
    assert.deepEqual(resolveOrbitalReturnToAirlock(id, approach, [id], { ...returns, airlockLanding: () => hub }),
      { ok: false, reason: 'invalid-landing' });
    assert.deepEqual(resolveOrbitalReturnToAirlock(id, approach, [id], returns), { ok: true, position: airlock });
  }
});

test('both designated gates remain locked until chapter, town inlay and flyer permissions agree', () => {
  const gateHost: OrbitalGateHost = {
    isOpen: () => true, isAtOpening: () => true, isLegalLanding: () => true,
    landingAt: () => ({ site: 'airlock', pose: airlock.pose }),
  };
  for (const gate of ['starport', 'core'] as const) {
    const state = { site: gate, pose: pose(1, 1, 1) };
    const request = { gate, direction: 'enter' };
    for (const flags of [[false, true, true], [true, false, true], [true, true, false]]) {
      const [chapterOpen, firstKeyLit, flyerAssembled] = flags;
      assert.deepEqual(resolveOrbitalChapterDoor(request, state, chapterOpen, { firstKeyLit, flyerAssembled }, {
        ...gateHost, landingAt: () => { throw new Error('locked door touched landing'); },
      }), { ok: false, reason: 'locked' });
    }
    assert.ok(resolveOrbitalChapterDoor(request, state, true, { firstKeyLit: true, flyerAssembled: true }, gateHost).ok);
  }
  assert.equal(orbitalDoorLockedLabel, '未解锁');
});

test('first walkthrough requires ordered visits by foot, then rooms can be revisited freely', () => {
  let completedRooms = 0;
  for (const [index, room] of orbitalFirstTour.entries()) {
    const later = orbitalFirstTour[index + 1];
    assert.deepEqual(resolveOrbitalTourStep(completedRooms, undefined, 'physical'), { ok: true, completedRooms });
    if (later) assert.deepEqual(resolveOrbitalTourStep(completedRooms, later, 'physical'), { ok: false, completedRooms });
    assert.deepEqual(resolveOrbitalTourStep(completedRooms, room, 'restore'), { ok: true, completedRooms });
    const visit = resolveOrbitalTourStep(completedRooms, room, 'physical');
    assert.ok(visit.ok);
    completedRooms = visit.completedRooms;
    assert.equal(completedRooms, index + 1);
  }
  for (const room of orbitalFirstTour) {
    assert.deepEqual(resolveOrbitalTourStep(completedRooms, room, 'physical'), { ok: true, completedRooms });
  }
});

test('the mounted deck accepts a continuous first tour ending at the physical hub console', () => {
  const deck = createOrbitalStationDeck();
  try {
    const order: string[] = [];
    let progress = 0;
    const route = deck.tourRoute;
    let previousHeight = route[0].ground;
    for (let segment = 1; segment < route.length; segment++) {
      const [from, to] = [route[segment - 1], route[segment]];
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.n - from.n) / .025);
      for (let step = 0; step <= steps; step++) {
        const east = from.x + (to.x - from.x) * step / steps;
        const north = from.n + (to.n - from.n) * step / steps;
        const height = deck.floorHeightAt(east, north);
        assert.ok(height !== undefined && Math.abs(height - previousHeight) < .025);
        assert.ok(deck.isWalkable(east, north, .22));
        previousHeight = height;
        const room = deck.roomAt(east, north);
        const accepted = resolveOrbitalTourStep(progress, room, 'physical');
        assert.equal(accepted.ok, true);
        if (accepted.completedRooms !== progress && room) order.push(room);
        progress = accepted.completedRooms;
      }
    }
    assert.deepEqual(order, orbitalFirstTour);
    const point = route.at(-1)!;
    assert.deepEqual(point, deck.teleport.console);
    assert.equal(deck.roomAt(point.x, point.n), 'teleport');
  } finally {
    deck.dispose();
  }
});
