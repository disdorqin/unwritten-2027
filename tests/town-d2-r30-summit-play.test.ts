import test from 'node:test';
import assert from 'node:assert/strict';
import { createTownD2R30ProductionHost } from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';

test('D32-P1 the hut registrar registers, stamps and grants the wing', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const play = host.summitPlay();
    assert.deepEqual(
      { level: play.passport().level, wing: play.passport().snowWingGranted, registered: play.passport().summitRegistered },
      { level: 0, wing: false, registered: false },
    );
    // Out of reach of every anchor: nothing happens, nothing is granted.
    const away = play.interact('summit', { east: -900, north: 200, height: 400 });
    assert.equal(away.action, 'out-of-range');
    assert.equal(away.passport.snowWingGranted, false);

    // The lower stamp alone is level 1: the two-level passport is real.
    const cloud = play.interact('cloud-deck', { east: 306, north: 659, height: 347 });
    assert.equal(cloud.action, 'cloud-stamp');
    assert.equal(cloud.passport.level, 1);
    assert.equal(cloud.passport.snowWingGranted, false, 'the front stamp alone does not grant a wing');

    // Registration at the hut desk, then the summit stamp.
    const registered = play.interact('summit', { east: 62.5, north: 1014, height: 800 });
    assert.equal(registered.action, 'register-summit');
    assert.equal(registered.passport.summitRegistered, true);
    assert.equal(registered.passport.snowWingGranted, true, 'climb registration hands over the snow wing');

    const stamped = play.interact('summit', { east: 50, north: 998, height: 800 });
    assert.equal(stamped.action, 'summit-stamp');
    assert.equal(stamped.passport.level, 2);
    assert.equal(stamped.passport.snowWingGranted, true);
    assert.throws(() => play.interact('summit', { east: NaN, north: 1, height: 2 }), /finite/);
  } finally {
    host.dispose();
  }
});

test('D32-P1 the climb keeps 15-20 m rest ledges and slipping costs no health', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const play = host.summitPlay();
    const ledges = play.ledger;
    assert.ok(ledges.length >= 10, `expected a full ladder, got ${ledges.length}`);
    // Every rest ledge is 15-20 m of rise from the one below it.
    for (let index = 1; index < ledges.length - 1; index++) {
      const rise = ledges[index]!.ground - ledges[index - 1]!.ground;
      assert.ok(rise >= 15 && rise <= 20, `ledge ${index} rise ${rise.toFixed(1)} m is outside 15-20 m`);
    }
    // The last pitch lands on the summit anchor; it only has to be a real step.
    const finalRise = ledges.at(-1)!.ground - ledges.at(-2)!.ground;
    assert.ok(finalRise > 0 && finalRise <= 20, `final pitch ${finalRise.toFixed(1)} m`);

    // A ledge below the blizzard band: the climb is open there.
    const onLedge = ledges[1]!;
    const foot = { east: onLedge.east, north: onLedge.north, height: onLedge.ground };
    assert.equal(play.ledgeAt(foot), 1);
    const slip = play.slip(foot);
    assert.equal(slip.landed, true);
    assert.equal(slip.damage, 0, 'an ice slip must never damage the player');
    assert.equal((slip as { ledge: number }).ledge, 0, 'a slip returns to the ledge directly below');
    assert.equal((slip as { supported: boolean }).supported, true, 'the ledge below must be real support');
    // Slipping from the first ledge stays on it rather than falling off the wall.
    const first = ledges[0]!;
    const bottom = play.slip({ east: first.east, north: first.north, height: first.ground });
    assert.equal((bottom as { ledge: number }).ledge, 0);

    // Off the wall there is nothing to slip from and nothing to climb.
    const offWall = play.slip({ east: -800, north: 300, height: 400 });
    assert.equal(offWall.landed, false);
    assert.equal(offWall.damage, 0);
  } finally {
    host.dispose();
  }
});

test('D32-P1 a blizzard closes the wall', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const play = host.summitPlay();
    // The mid-wall sits in the high-mountain blizzard band (tier 5); the
    // low ledges do not. The same ladder serves both, only permission changes.
    const storm = play.ledger[8]!;
    const stormFoot = { east: storm.east, north: storm.north, height: storm.ground };
    assert.equal(host.snowTierAt(stormFoot.east, stormFoot.north), 5);
    const closed = play.canClimb(stormFoot);
    assert.equal(closed.ok, false);
    assert.equal((closed as { reason: string }).reason, 'blizzard');
    assert.equal(play.slip(stormFoot).landed, false, 'no climbing and no slipping while the storm runs');

    const calm = play.ledger[1]!;
    const calmFoot = { east: calm.east, north: calm.north, height: calm.ground };
    assert.equal(host.snowTierAt(calmFoot.east, calmFoot.north)! < 5, true);
    assert.equal(play.canClimb(calmFoot).ok, true);

    // Off the wall entirely: nothing to climb, storm or not.
    assert.equal(play.canClimb({ east: -800, north: 300, height: 400 }).ok, false);
  } finally {
    host.dispose();
  }
});

test('D32-P1 the snow wing only flies the 6:1 envelope from the glide deck', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const play = host.summitPlay();
    const deck = { east: -46, north: 1038, height: 800 };
    assert.deepEqual({ ...play.planGlide(deck, 1, 0) }, { ok: false, reason: 'no-snow-wing' });

    play.interact('summit', { east: 62.5, north: 1014, height: 800 });
    assert.equal(play.passport().snowWingGranted, true);
    assert.deepEqual({ ...play.planGlide({ east: 300, north: 300, height: 400 }, 1, 0) },
      { ok: false, reason: 'not-at-glide-deck' });

    const plan = play.planGlide(deck, 1, 0);
    assert.equal(plan.ok, true);
    if (plan.ok) {
      assert.equal(plan.ratio, 6);
      assert.ok(plan.reachMetres > 0);
      // The landing is the point where the 6:1 descent meets the terrain.
      const drop = deck.height - plan.landing.height;
      assert.ok(Math.abs(plan.reachMetres - drop * 6) <= 12,
        `reach ${plan.reachMetres} vs ${drop.toFixed(1)} m of drop at 6:1`);
    }
    // Flying off the canonical domain is refused, not silently landed.
    assert.deepEqual({ ...play.planGlide(deck, -1, 0) }, { ok: false, reason: 'out-of-domain' });
  } finally {
    host.dispose();
  }
});
