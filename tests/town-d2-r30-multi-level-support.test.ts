import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { createTownD2R30ProductionHost } from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';

/**
 * D33-2: a real multi-level deck installed over an A-sector lowland. The
 * host's canonical ground at E0/N100 is ~390.5 m; this mock is a 430 m
 * walkway above it. A player standing on the ground must NOT be lifted onto
 * the upper deck merely because `supportAt` reports the highest surface.
 */
const upperDeckInstaller = (deckHeight: number) => (port: {
  owner: Group;
  heightAt(e: number, n: number): number | undefined;
}) => {
  const group = new Group();
  group.name = 'test-upper-deck';
  // A real deck body so the host's "installer mounts geometry" gate passes;
  // it is a walkway above the canonical ground, not a second terrain.
  const geometry = new BoxGeometry(8, .4, 8);
  geometry.translate(0, deckHeight, -100);
  group.add(new Mesh(geometry, new MeshLambertMaterial()));
  port.owner.add(group);
  return {
    sector: 'A' as const,
    group,
    deckAt: (east: number, north: number) =>
      Math.abs(east) <= 4 && Math.abs(north - 100) <= 4 ? deckHeight : undefined,
    groundAt: port.heightAt,
    dispose() { group.clear(); },
  };
};

test('D33-2 foot-aware support never teleports a lower-floor player to an upper deck', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const ground = host.collision.surfaceAt(0, 100)!;
    assert.ok(ground > 380 && ground < 400, `unexpected ground ${ground}`);
    host.install('A', upperDeckInstaller(ground + 40));
    // The legacy highest-deck contract reports the upper level.
    assert.equal(host.supportAt(0, 100), ground + 40);
    // A player standing on the ground stays on the ground: the 40 m upper deck
    // is not reachable with a 0.45 m step. The 0.01 m canonical/collision
    // sampling epsilon is the same terrain, not a second level.
    assert.ok(Math.abs(host.supportNearFeet(0, 100, ground)! - ground) < .05,
      'a lower-floor player must not be lifted to the 40 m deck');
    // Standing already on the deck keeps it.
    assert.equal(host.supportNearFeet(0, 100, ground + 40), ground + 40);
    // A foot just below the deck can step up onto it (within STEP_UP).
    assert.equal(host.supportNearFeet(0, 100, ground + 40 - .3), ground + 40);
  } finally {
    host.dispose();
  }
});

test('D33-2 foot-aware support falls back to the nearest landing, not a void', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const ground = host.collision.surfaceAt(0, 100)!;
    host.install('A', upperDeckInstaller(ground + 40));
    // From a foot slightly above the deck but below the next level, the
    // closest surface below is the deck — a real landing, not a hole.
    assert.equal(host.supportNearFeet(0, 100, ground + 40.6), ground + 40);
    // Far above everything, the player lands on the highest real surface
    // below them — never snapped up through a higher deck, never left void.
    assert.equal(host.supportNearFeet(0, 100, ground + 200), ground + 40);
  } finally {
    host.dispose();
  }
});

test('D33-2 foot-aware support keeps the single-source contract and fails closed', () => {
  const host = createTownD2R30ProductionHost();
  try {
    // Without any installed deck the foot-aware answer equals the canonical
    // ground everywhere — it never invents a second height field.
    for (const [east, north] of [[0, 100], [50, 1000], [-600, 900]] as const) {
      const ground = host.collision.surfaceAt(east, north)!;
      assert.equal(host.supportNearFeet(east, north, ground), ground);
    }
    assert.equal(host.supportNearFeet(5000, 5000, 400), undefined, 'outside the domain has no support');
    assert.throws(() => host.supportNearFeet(NaN, 100, 400), RangeError);
    assert.throws(() => host.supportNearFeet(0, 100, Number.NaN), RangeError);
    host.dispose();
    assert.equal(host.supportNearFeet(0, 100, 400), undefined, 'a disposed host offers no support');
  } finally {
    host.dispose();
  }
});
