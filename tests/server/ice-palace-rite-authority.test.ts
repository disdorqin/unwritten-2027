import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIcePalaceRiteAuthority } from '../../src/presence/ice-palace-rite-authority';

const lever = { east: 47_100, north: 7_330, height: 1_212 };
const harvest = { east: 47_805, north: 7_743, height: 1_212 };
const solstice = { east: 48_540, north: 6_503, height: 1_212 };

test('the confirmed palace ice window supplies the same conditions to the scene and game', async () => {
  let conditions = { frozen: false, showUnderIceGlow: false };
  const authority = createIcePalaceRiteAuthority({
    groundPeer: peerId => peerId === 1 ? { pose: lever } : undefined,
    iceWindow: {
      read: () => ({ conditions, leverAvailable: true }),
      async operate(command) {
        assert.deepEqual(command, { peerId: 1, requestId: 'cold-1' });
        conditions = { frozen: true, showUnderIceGlow: true };
        return true;
      },
    },
  });
  assert.equal(authority.isIceOpen(), false);
  assert.equal(authority.snapshot(1).rites.leverAvailable, true);
  const command = { rite: 'lever', requestId: 'cold-1' };
  assert.equal(await authority.request(9, { ...command, pose: lever }), false);
  assert.equal(await authority.request(1, command), true);
  assert.equal(authority.isIceOpen(), true);
  assert.equal(authority.snapshot(1).rites.frozen, true);
  assert.equal(authority.snapshot(1).lake, authority.lakeConditions());
  assert.deepEqual(authority.lakeConditions(), { frozen: true, showUnderIceGlow: true });
});

test('harvest checks the accepted footpoint and forwards the same player identity and replay key', async () => {
  let pose = { ...harvest, height: harvest.height + 56 };
  let profileKey: string | undefined;
  let awardCommits = 0;
  const command = { rite: 'harvest', requestId: 'shard-1', profileKey: 'wire-spoof', pose: harvest };
  const authority = createIcePalaceRiteAuthority({
    groundPeer: () => ({ pose, profileKey }),
    forgeInventory: {
      canHarvest: profile => profile === 'forge-actor' && awardCommits === 0,
      async harvest(request) {
        assert.deepEqual(request, { peerId: 1, requestId: 'shard-1', profileKey: 'forge-actor' });
        // A replay returns the original receipt from the same store.
        if (awardCommits === 0) awardCommits++;
        return true;
      },
    },
  });
  assert.equal(await authority.request(1, command), false);
  pose = harvest;
  assert.equal(await authority.request(1, command), false);
  profileKey = 'forge-actor';
  assert.equal(authority.snapshot(1).rites.harvestAvailable, true);
  assert.equal(await authority.request(1, command), true);
  assert.equal(await authority.request(1, command), true);
  assert.equal(awardCommits, 1);
  assert.equal(authority.snapshot(1).rites.harvestAvailable, false);
});

test('winter access is unavailable without the event and only the committed host receipt completes the rite', async () => {
  const groundPeer = () => ({ pose: solstice, profileKey: 'winter-profile' });
  const unavailable = createIcePalaceRiteAuthority({ groundPeer });
  const command = { rite: 'solstice', requestId: 'winter-01' };
  assert.equal(unavailable.snapshot(1).rites.solsticeRite, 'closed');
  assert.equal(unavailable.lakeConditions(), undefined);
  assert.equal(await unavailable.request(1, command), false);

  let status: 'closed' | 'ready' | 'completed' = 'closed';
  const authority = createIcePalaceRiteAuthority({
    groundPeer,
    solstice: {
      read: () => status,
      async complete({ profileKey }) {
        assert.equal(profileKey, 'winter-profile');
        if (status !== 'ready') return false;
        status = 'completed';
        return true;
      },
    },
  });
  assert.equal(await authority.request(1, command), false);
  status = 'ready';
  assert.equal(authority.snapshot(1).rites.solsticeRite, 'ready');
  assert.equal(await authority.request(1, { ...command, requestId: ' ' }), false);
  assert.equal(await authority.request(1, command), true);
  assert.equal(authority.snapshot(1).rites.solsticeRite, 'completed');
});
