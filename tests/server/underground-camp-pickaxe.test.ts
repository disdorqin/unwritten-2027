import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundCampPickaxeAuthority } from '../../src/presence/underground-camp-pickaxe.js';
import { undergroundCampPickaxe, type UndergroundCampPickaxeResult } from '../../src/shared/underground-camp-pickaxe.js';

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
