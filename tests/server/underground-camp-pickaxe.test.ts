import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundCampPickaxeAuthority } from '../../src/presence/underground-camp-pickaxe.js';
import { resolveUndergroundCampPickaxeSite, undergroundCampPickaxe, type UndergroundCampPickaxeResult } from '../../src/shared/underground-camp-pickaxe.js';

import { createUndergroundMineLayout } from '../../tools/voxel-tavern/town-blockout/underground-mine-layout.js';

test('the camp pickaxe can be registered on the second table without loading the camp renderer', () => {
  const spec = {
    pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
    shoreLength: 8, gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
    collapse: { length: 3, width: 1.2, height: 1.3 },
    walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
  };
  for (const side of ['right', 'left'] as const) {
    const camp = { side, length: side === 'right' ? 10 : 14, extension: 5 };
    const mine = createUndergroundMineLayout({ ...spec, camp });
    const pickaxe = resolveUndergroundCampPickaxeSite(mine, camp);
    assert.ok(pickaxe);
    const [x, y, z] = pickaxe.approach;
    assert.equal(x, side === 'right' ? .89 : -.89);
    assert.equal(mine.queryPassage(x, z, .27, 1.8)?.floor, y);
    assert.ok(Math.abs(z - (side === 'right' ? 40.04 : 42.04)) < 1e-9);
    assert.ok(pickaxe.aim[1] > y && pickaxe.aim[2] < z);
    assert.equal(resolveUndergroundCampPickaxeSite(mine, { ...camp, length: 9 }), undefined);
  }
});

const site = { domainId: 'mine', east: 0, north: 0, height: -91 };
const accepted = { ...site, playerId: 'visitor' };
const { siteId, horizontalReach } = undergroundCampPickaxe;

test('camp pickaxe uses an accepted nearby same-domain mine arrival and aimed-at tool', async () => {
  let foot = accepted;
  let landed = true;
  let visible = true;
  let grants = 0;
  const claim = createUndergroundCampPickaxeAuthority({
    site,
    readAcceptedFoot: () => foot,
    hasAcceptedMineArrival: () => landed,
    hasAcceptedPickaxeSight: () => visible,
    async grantToolOnce(_, pickup) {
      assert.equal(pickup.tool, 'pickaxe');
      grants++;
      return 'granted';
    },
  });

  assert.equal(await claim('visitor', 'other-site'), 'rejected');
  assert.equal(await claim('other-visitor', siteId), 'rejected');
  for (const bad of [{ domainId: 'town' }, { east: horizontalReach + .001 }, { height: -90 }, { north: NaN }]) {
    foot = { ...accepted, ...bad };
    assert.equal(await claim('visitor', siteId), 'rejected');
  }
  foot = { ...accepted, east: horizontalReach };
  visible = false;
  assert.equal(await claim('visitor', siteId), 'rejected');
  visible = true;
  landed = false;
  assert.equal(await claim('visitor', siteId), 'rejected');
  assert.equal(grants, 0);

  landed = true;
  assert.equal(await claim('visitor', siteId), 'granted');
  assert.equal(grants, 1);
});

test('duplicate pickaxe claims never run twice while the durable inventory operation is pending', async () => {
  const receipts = new Set<string>();
  let finish: (() => void) | undefined;
  let full = true;
  let calls = 0;
  const make = () => createUndergroundCampPickaxeAuthority({
    site,
    readAcceptedFoot: playerId => ({ ...accepted, playerId }),
    hasAcceptedMineArrival: () => true,
    hasAcceptedPickaxeSight: () => true,
    async grantToolOnce(playerId): Promise<UndergroundCampPickaxeResult> {
      calls++;
      if (receipts.has(playerId)) return 'already-granted';
      if (full) return 'rejected';
      await new Promise<void>(resolve => { finish = resolve; });
      receipts.add(playerId);
      return 'granted';
    },
  });

  const claim = make();
  assert.equal(await claim('visitor', siteId), 'rejected');
  assert.equal(receipts.size, 0);
  full = false;
  const pending = claim('visitor', siteId);
  assert.equal(await claim('visitor', siteId), 'rejected');
  assert.equal(calls, 2);
  finish?.();
  assert.equal(await pending, 'granted');
  assert.equal(await make()('visitor', siteId), 'already-granted');
  assert.equal(receipts.size, 1);
});

test('an inventory save exception releases the claim so the same player can retry', async () => {
  let attempts = 0;
  const claim = createUndergroundCampPickaxeAuthority({
    site,
    readAcceptedFoot: () => accepted,
    hasAcceptedMineArrival: () => true,
    hasAcceptedPickaxeSight: () => true,
    async grantToolOnce() {
      if (++attempts === 1) throw new Error('inventory save failed');
      return 'granted';
    },
  });

  await assert.rejects(claim('visitor', siteId), /inventory save failed/);
  assert.equal(await claim('visitor', siteId), 'granted');
  assert.equal(attempts, 2);
});
