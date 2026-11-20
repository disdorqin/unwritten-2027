import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSoulMayorAuthority } from '../../src/presence/soul-mayor.ts';
import { createZodiacStarStoneAuthority } from '../../src/presence/zodiac-star-stone-authority.ts';

const actor = { layer: 'test-platform', east: 220, north: 188, height: 12 };
const talk = { ...actor, north: 187.1 };

test('authority limits delivery to a trusted protagonist on the approved layer and talk footpoint', () => {
  const positions = new Map([
    [1, talk], [2, talk], [3, { ...talk, layer: 'other-area' }], [4, { ...talk, height: 13.2 }],
    [5, { ...talk, east: 221 }], [6, talk], [7, talk], [8, talk],
  ]);
  const invitations = new Set<string>();
  let encounter: { actor: typeof actor; talk: typeof talk } | undefined = { actor, talk };
  let failSave = false;
  let writes = 0;
  const stars = createZodiacStarStoneAuthority({
    nowMs: () => 0, origin: id => id === 'ox' ? talk : undefined,
    playerPosition: peer => positions.get(peer), canPickup: () => true, canDeposit: () => true,
    xiaoweiScene: () => ({ atRingPassage: false, atNewYearsEveWitness: false, bellHandoffConfirmed: false }),
  }, { load() {}, save() {} });
  const bind = () => createSoulMayorAuthority({
    profile: peer => peer <= 6 || peer === 8
      ? { key: peer === 6 || peer === 8 ? 'same-hero' : 'hero-' + peer, protagonist: peer !== 2 } : undefined,
    acceptedPosition: peer => positions.get(peer),
    encounterSite: () => encounter,
    canTalk: peer => peer !== 5,
    invitations: {
      received: key => invitations.has(key),
      grantOnce(key) {
        if (invitations.has(key)) return 'already-received';
        if (failSave) return 'retry';
        invitations.add(key);
        writes++;
        return 'received';
      },
    },
    stars,
  });
  const mayor = bind();
  assert.equal(mayor.view(2), undefined);
  assert.equal(mayor.view(3), undefined);
  assert.equal(mayor.view(7), undefined);
  for (const peer of [-1, 2, 3, 4, 5, 7, 999]) assert.equal(mayor.receiveInvitation(peer), 'denied');
  positions.set(5, talk);
  assert.equal(mayor.receiveInvitation(5), 'denied');
  assert.deepEqual(mayor.view(1), { site: { actor, talk }, invited: false, ringCount: 0 });
  assert.equal(stars.pickup(1, 'ox', 0), true, 'choosing not to accept never gates collection');
  assert.equal(stars.deposit(1, 'ox', 1)?.ringCount, 1);
  assert.equal(mayor.view(1)?.ringCount, 1);
  assert.equal(mayor.view(1)?.invited, false);
  failSave = true;
  assert.equal(mayor.receiveInvitation(6), 'retry');
  assert.equal(mayor.view(6)?.invited, false);
  failSave = false;
  assert.equal(mayor.receiveInvitation(6), 'received');
  assert.equal(mayor.receiveInvitation(6), 'already-received');
  assert.equal(bind().view(8)?.invited, true, 'read back the committed receipt on a new connection after restart');
  assert.equal(writes, 1);
  const plaza = { ...talk, layer: 'test-plaza' };
  encounter = { actor: plaza, talk: plaza };
  assert.equal(mayor.view(8), undefined, 'changing the encounter location revokes the old platform view');
  positions.set(8, plaza);
  assert.equal(mayor.view(8)?.invited, true);
  assert.equal(mayor.receiveInvitation(8), 'already-received');
  encounter = undefined;
  assert.equal(mayor.view(1), undefined);
  assert.equal(mayor.receiveInvitation(1), 'denied');
});
