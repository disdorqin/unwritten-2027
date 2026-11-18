import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTownMailStore, townMailKeys, townMailLimits, UNLOCK_AT, type TownMailEvent,
} from '../tools/voxel-tavern/town-blockout/town-mail-store.ts';

const unlock = new Date(UNLOCK_AT).getTime();
const self = (body: string) => ({ recipientType: 'self' as const, recipientName: '', body, signature: '' });

function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  const time = { value: unlock - 60_000 };
  const events: TownMailEvent[] = [];
  const create = () => createTownMailStore(storage, () => time.value, event => events.push(event));
  return { data, storage, time, events, create, mail: create() };
}

test('the local 19:59 to 20:00 boundary keeps envelopes private until opening', () => {
  const { mail, time, data, events, create } = fixture();
  assert.equal(UNLOCK_AT, '2026-12-31T20:00:00');
  assert.equal(mail.sealLetter(self('只在开箱后再读的句子')).ok, true);
  const status = mail.timeboxStatus();
  const { id } = status.envelopes[0];
  assert.equal(status.ready, false);
  assert.equal(status.remainingHours, 1);
  assert.deepEqual(Object.keys(status.envelopes[0]).sort(), ['id', 'recipientName', 'sealedAt']);
  assert.equal(JSON.stringify(status).includes('只在开箱后再读的句子'), false);
  assert.deepEqual(mail.readLetter(id), { reason: 'locked' });
  assert.deepEqual(mail.openTimebox(), { ok: false, reason: 'locked' });
  assert.deepEqual(events[0], { type: 'timebox.seal', actor: 'player:local', target: 'postoffice.timebox',
    payload: { letterId: id, recipientType: 'self', recipientName: '明年的自己', body: '只在开箱后再读的句子' }, t: time.value });

  time.value = unlock;
  const reloaded = create();
  assert.equal(reloaded.timeboxStatus().ready, true);
  assert.equal(reloaded.openTimebox().ok, true);
  assert.equal(create().timeboxStatus().opened, true);
  assert.equal(reloaded.readLetter(id).letter?.body, '只在开箱后再读的句子');
  assert.equal(reloaded.readLetter(id).letter?.authorName, '一位镇民');
  assert.deepEqual(events[1], { type: 'timebox.open', actor: 'player:local', target: 'postoffice.timebox',
    payload: { letterId: id }, t: unlock });
  assert.equal(events.length, 2);
  assert.equal(JSON.parse(data.get(townMailKeys.timebox)!).items[0].openedAt, unlock);
  time.value = unlock - 1;
  assert.equal(create().timeboxStatus().opened, true);
  assert.deepEqual(reloaded.retractLetter(id), { ok: false, reason: 'locked' });
});

test('both entrances share the five-letter limit and a withdrawal clears the sealed record', () => {
  const { mail, time, create, data, events } = fixture();
  const branch = create();
  for (let index = 0; index < 5; index++) {
    assert.equal((index % 2 ? branch : mail).sealLetter(self('纸上问候 ' + index)).ok, true);
    time.value += townMailLimits.cooldown;
  }
  assert.equal(branch.timeboxStatus().count, 5);
  assert.deepEqual(mail.sealLetter(self('第六封信')), { ok: false, reason: 'capacity' });
  const { id } = branch.timeboxStatus().envelopes[0];
  assert.equal(mail.retractLetter(id).ok, true);
  assert.equal(events.length, 5);
  assert.equal((data.get(townMailKeys.timebox) ?? '').includes(id), false);
  assert.equal(branch.sealLetter(self('纸上问候 0')).ok, true);
  assert.equal(create().timeboxStatus().count, 5);
});

test('only town letters become public when the main box is opened', () => {
  const { mail, create, time, events, data } = fixture();
  assert.equal(mail.sealLetter({ ...self('公开的贺年话'), recipientType: 'town' }).ok, true);
  time.value += townMailLimits.cooldown;
  assert.equal(mail.sealLetter({ ...self('只给小满'), recipientType: 'npc', recipientName: '苏小满', signature: '雪归' }).ok, true);
  assert.equal(mail.timeboxStatus(true).count, 2);
  assert.deepEqual(mail.publicLetters(), []);
  time.value = unlock;
  assert.deepEqual(mail.publicLetters(), []);
  assert.equal(mail.openTimebox().ok, true);
  assert.deepEqual(create().publicLetters().map(letter => letter.body), ['公开的贺年话']);
  assert.equal(events.filter(event => event.type === 'timebox.open').length, 2);
  const entries = JSON.parse(data.get(townMailKeys.timebox)!).items;
  assert.equal(entries[0].openedAt, unlock);
  assert.equal(entries[1].openedAt, unlock);
  assert.equal(entries[1].fromNpc, false);
  time.value += townMailLimits.cooldown;
  assert.equal(create().sealLetter({ ...self('分箱补投的公开信'), recipientType: 'town' }).ok, true);
  assert.equal(mail.publicLetters().length, 2);
});

test('field widths, local term and contact rules, duplicates and the three-second throttle are shared', () => {
  const { mail, time, events } = fixture();
  assert.deepEqual(mail.postMessage('！，。'), { ok: false, reason: 'empty' });
  assert.deepEqual(mail.postMessage('好'.repeat(61)), { ok: false, reason: 'length' });
  assert.deepEqual(mail.postMessage('免费赚钱'), { ok: false, reason: 'blocked' });
  assert.deepEqual(mail.postMessage('邮箱 name123@example.org'), { ok: false, reason: 'blocked' });
  assert.deepEqual(mail.postMessage('电话 138-1234-1234'), { ok: false, reason: 'blocked' });
  assert.deepEqual(mail.postMessage('加我微信 ABC_56789'), { ok: false, reason: 'blocked' });
  assert.deepEqual(mail.sealLetter({ ...self('朋友的信'), recipientType: 'friend', recipientName: '甲'.repeat(13) }), { ok: false, reason: 'length' });
  assert.deepEqual(mail.sealLetter({ ...self('朋友的信'), recipientType: 'friend', recipientName: '，。' }), { ok: false, reason: 'empty' });
  assert.deepEqual(mail.sealLetter({ ...self('信'.repeat(201)) }), { ok: false, reason: 'length' });
  assert.deepEqual(mail.sealLetter({ ...self('朋友的信'), signature: '甲'.repeat(9) }), { ok: false, reason: 'length' });
  assert.deepEqual(mail.sealLetter({ ...self('朋友的信'), recipientType: 'npc', recipientName: '未在册' }), { ok: false, reason: 'missing' });
  assert.equal(mail.postMessage('雪夜快乐 ☃'.trim()).ok, true);
  assert.deepEqual(events[0], { type: 'wall.post', actor: 'player:local', target: 'postoffice.wall',
    payload: { messageId: mail.wallMessages()[0].id, body: '雪夜快乐 ☃' }, t: time.value });
  time.value += 2999;
  assert.deepEqual(mail.sealLetter(self('另外一封信')), { ok: false, reason: 'cooldown' });
  time.value++;
  assert.equal(mail.sealLetter(self('另外一封信')).ok, true);
  assert.deepEqual(mail.postMessage('雪夜快乐 ☃ '), { ok: false, reason: 'duplicate' });
  assert.deepEqual(mail.sealLetter(self('另外一封信')), { ok: false, reason: 'duplicate' });
});

test('the wall evicts the oldest unpinned player message, preserving pinned and NPC rows', () => {
  const { mail, data, time } = fixture();
  const entries = Array.from({ length: 200 }, (_, index) => ({
    kind: 'wall', id: String(index), authorType: index === 1 ? 'npc' : 'player',
    authorName: '镇民', body: '留言内容 ' + index, createdAt: time.value - 60_000 + index, pinned: index === 0,
  }));
  data.set(townMailKeys.wall, JSON.stringify({ version: 1, items: entries }));
  assert.equal(mail.postMessage('新的留言').ok, true);
  const rows = mail.wallMessages();
  assert.equal(rows.length, 200);
  assert.equal(rows[0].id, '0');
  assert.ok(rows.some(row => row.id === '1'));
  assert.ok(!rows.some(row => row.id === '2'));
});

test('malformed collections keep independent backups and failed writes emit nothing', () => {
  const { mail, data, create, time } = fixture();
  assert.equal(mail.sealLetter(self('这封信始终有效')).ok, true);
  data.set(townMailKeys.wall, '{bad');
  assert.deepEqual(create().wallMessages(), []);
  assert.equal(data.get(townMailKeys.wall + '.bak'), '{bad');
  assert.equal(create().timeboxStatus().count, 1);

  time.value += townMailLimits.cooldown;
  assert.equal(mail.postMessage('这条留言始终有效').ok, true);
  data.set(townMailKeys.timebox, '{"version":1,"items":[{"id":"incomplete"}]}');
  assert.equal(create().timeboxStatus().count, 0);
  assert.equal(data.get(townMailKeys.timebox + '.bak'), '{"version":1,"items":[{"id":"incomplete"}]}');
  assert.equal(create().wallMessages()[0].body, '这条留言始终有效');
  const outOfRange = JSON.stringify({ version: 1, items: [{ id: 'bad-time', kind: 'wall', authorType: 'player',
    authorName: '镇民', body: '无法渲染时间', createdAt: 1e100, pinned: false }] });
  data.set(townMailKeys.wall, outOfRange);
  assert.deepEqual(create().wallMessages(), []);
  assert.equal(data.get(townMailKeys.wall + '.bak'), outOfRange);

  let notifications = 0;
  const denied = createTownMailStore({ getItem: () => null, setItem: () => { throw new Error('Quota'); } },
    () => unlock, () => { notifications++; });
  assert.deepEqual(denied.postMessage('这条发布失败'), { ok: false, reason: 'storage' });
  assert.deepEqual(denied.sealLetter(self('这封投递失败')), { ok: false, reason: 'storage' });
  assert.equal(notifications, 0);
});
