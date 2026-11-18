import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readPublishedTownChronicle, recordTownChroniclePlazaPhoto, recordTownChronicleTimeboxUnlock,
  townChronicleKey,
} from '../tools/voxel-tavern/town-blockout/town-chronicle.ts';
import { createTownMailStore, townMailKeys, UNLOCK_AT } from '../tools/voxel-tavern/town-blockout/town-mail-store.ts';

function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  return { data, storage };
}

test('timebox records the same 20:00 boundary once and stores the two aggregate counts only', () => {
  const { data, storage } = fixture();
  const unlockAt = new Date(UNLOCK_AT).getTime();
  let time = unlockAt - 6_000;
  const mail = createTownMailStore(storage, () => time);
  const draft = { recipientType: 'self' as const, recipientName: '', body: '我的私人来信', signature: '私人署名' };
  assert.equal(mail.sealLetter(draft).ok, true);
  time = unlockAt - 1;
  assert.equal(mail.timeboxUnlockRecord(), null);
  assert.equal(storage.getItem(townChronicleKey), null);
  time = unlockAt;
  const ready = mail.timeboxUnlockRecord()!;
  assert.deepEqual(ready, { at: unlockAt, playerLetters: 1, npcLetters: 9 });
  assert.equal(recordTownChronicleTimeboxUnlock({ ...ready, at: unlockAt - 1 }, storage), false);
  assert.equal(recordTownChronicleTimeboxUnlock(ready, storage), true);
  time += 3_000;
  assert.equal(mail.sealLetter({ ...draft, body: '开箱后补投' }).ok, true);
  const reloaded = createTownMailStore(storage, () => time);
  assert.deepEqual(reloaded.timeboxUnlockRecord(), ready);
  assert.equal(recordTownChronicleTimeboxUnlock(ready, storage), true);
  const raw = data.get(townChronicleKey)!;
  assert.ok(raw.includes('共封存 10 封信'));
  for (const privateText of ['我的私人来信', '私人署名', '开箱后补投', '炉子给你留着火']) {
    assert.ok(!raw.includes(privateText));
  }
  assert.equal(JSON.parse(data.get(townMailKeys.timebox)!).items.length, 2);
  assert.deepEqual(readPublishedTownChronicle(storage).map(({ id, vol, era, date, source, actor }) =>
    ({ id, vol, era, date, source, actor })), [{
    id: 'chr-timebox-unlock-2026-12-31', vol: 2, era: '开镇纪元年', date: '2026-12-31', source: 'auto', actor: null,
  }]);
});

test('plaza photo uses the one published local store and keeps distinct members sharing one name', () => {
  const { storage } = fixture();
  const at = new Date('2026-11-18T17:00:00').getTime();
  const photo = { id: 'plaza-photo-123-4', at, names: ['初雪', '初雪', '晚归🐑'], occasion: '日常合影' };
  assert.deepEqual(readPublishedTownChronicle(storage), []);
  assert.equal(recordTownChroniclePlazaPhoto({ ...photo, names: [] }, storage), false);
  assert.equal(recordTownChroniclePlazaPhoto({ ...photo, names: ['\u0000'] }, storage), false);
  assert.equal(recordTownChroniclePlazaPhoto(photo, storage), true);
  assert.equal(recordTownChroniclePlazaPhoto({ ...photo, names: ['另一个名单'] }, storage), true);
  assert.deepEqual(readPublishedTownChronicle(storage), [{
    id: 'chr-plaza-photo-123-4', vol: 5, era: '建镇纪', date: '2026-11-18', title: '广场合影 · 日常合影',
    body: '本机所见，3 位镇民留影。名单为 初雪、初雪、晚归🐑。',
    source: 'auto', actor: null, status: 'published', pinned: false,
  }]);
});

test('public consumers exclude drafts and old corrupt text is recovered without blocking writes', () => {
  const { data, storage } = fixture();
  storage.setItem(townChronicleKey, '{old broken text');
  const at = new Date('2028-01-01T21:00:00').getTime();
  const photo = { id: 'plaza-photo-234-5', at, names: ['归人'], occasion: '开镇首夜' };
  assert.equal(recordTownChroniclePlazaPhoto(photo, storage), true);
  assert.equal(storage.getItem(townChronicleKey + '.bak'), '{old broken text');
  const [photoEntry] = readPublishedTownChronicle(storage);
  assert.equal(photoEntry.era, '开镇纪二年');
  data.set(townChronicleKey, JSON.stringify({
    version: 1, items: [photoEntry, { ...photoEntry, id: 'chr-draft', status: 'draft', body: '尚待审阅' }],
  }));
  assert.deepEqual(readPublishedTownChronicle(storage), [photoEntry]);
  assert.equal(recordTownChroniclePlazaPhoto(photo, { ...storage, setItem() { throw new Error('denied'); } }), true);
  assert.equal(recordTownChroniclePlazaPhoto({ ...photo, id: 'plaza-photo-try-again' },
    { ...storage, setItem() { throw new Error('denied'); } }), false);
});
