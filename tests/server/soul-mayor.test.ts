import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createSoulMayorAuthority } from '../../src/presence/soul-mayor.ts';
import { createSoulMayorInvitationFileStore } from '../../src/presence/soul-mayor-invitations.ts';
import { createZodiacStarStoneAuthority } from '../../src/presence/zodiac-star-stone-authority.ts';

const actor = { layer: 'test-platform', east: 220, north: 188, height: 12 };
const talk = { ...actor, north: 187.1 };

test('invitation receipts survive reopening, isolate profiles and permit retry after a write failure', t => {
  const root = mkdtempSync(join(tmpdir(), 'town-mayor-invitations-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'receipts');
  const hero = 'stable/private/hero';
  const a = createSoulMayorInvitationFileStore(directory);
  const b = createSoulMayorInvitationFileStore(directory);
  assert.equal(a.grantOnce(hero), 'retry');
  assert.equal(b.received(hero), false);
  mkdirSync(directory);
  assert.equal(a.grantOnce(hero), 'received');
  assert.equal(b.grantOnce(hero), 'already-received');
  assert.equal(b.grantOnce('other-profile'), 'received');
  assert.equal(b.grantOnce(''), 'retry');
  assert.equal(createSoulMayorInvitationFileStore(directory).received(hero), true);
  assert.equal(a.received('different-profile'), false);
  const files = readdirSync(directory);
  assert.equal(files.length, 2);
  for (const file of files) {
    assert.match(file, /^soul-mayor-[a-f0-9]{64}\.receipt$/);
    assert.equal(readFileSync(join(directory, file), 'utf8'), 'received\n');
  }
});

test('competing processes publish one receipt for the same protagonist', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'town-mayor-race-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const run = promisify(execFile);
  const source = new URL('../../src/presence/soul-mayor-invitations.ts', import.meta.url);
  const script = `import {createSoulMayorInvitationFileStore} from ${JSON.stringify(source.href)};
    const store = createSoulMayorInvitationFileStore(process.argv[1]);
    console.log(store.grantOnce('same-hero'));`;
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, directory])));
  assert.deepEqual(results.map(result => result.stdout.trim()).sort(),
    ['already-received', 'already-received', 'already-received', 'received']);
  assert.equal(readdirSync(directory).length, 1);
  assert.equal(createSoulMayorInvitationFileStore(directory).received('same-hero'), true);
});

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
