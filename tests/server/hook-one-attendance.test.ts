import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createHookOneAttendance, type HookOneAttendanceMark, type HookOneAttendanceStore, type HookOneBoundary,
} from '../../src/presence/hook-one-attendance.js';
import { createHookOneAttendanceFileStore } from '../../src/presence/hook-one-attendance-store.js';
import { createHookOneHourInbox, readHookOneHour } from '../../src/shared/hook-one-hour.js';

const hourMs = 3_600_000;
const firstAt = Date.parse('2026-12-30T17:00:00+08:00');
const connected = (sessionKey: string, profileKey: string | undefined, inTown = true) => ({
  sessionKey, profileKey, inTown,
});
const boundary = (at: number, residents = [connected('tab', 'key')]): HookOneBoundary => ({
  at, ordinary: true, auroraAtHour: false, residents,
});

function memoryStore() {
  const marks = new Map<string, HookOneAttendanceMark>();
  const store: HookOneAttendanceStore = {
    async load(key) { return marks.get(key); },
    async save(key, mark) { marks.set(key, mark); },
  };
  return { store, marks };
}

test('an exact town roster feeds private per-lease receipts and counts an authenticated profile once', async () => {
  const { store, marks } = memoryStore();
  const residents = [
    connected('ws-open', 'member-1'), connected('poll-open', 'member-1'), connected('ws-open', 'member-1'),
    connected('in-other-domain', 'member-2', false), connected('unresolved', undefined),
    connected('ambiguous-reused-lease', 'member-3'), connected('ambiguous-reused-lease', 'member-4'),
    connected('independent', 'member-5'),
  ];
  let samples = 0;
  const authority = createHookOneAttendance(at => {
    samples++;
    return boundary(at, residents);
  }, store);
  const first = authority.record(firstAt, firstAt + 1);
  // The host may see a reconnect before storage finishes. The bucket stays at the boundary.
  residents.push(connected('late-open', 'member-1'));
  const second = authority.record(firstAt, firstAt + 2);
  const result = await first;
  assert.deepEqual(result.map(({ sessionKey }) => sessionKey), ['ws-open', 'poll-open', 'independent']);
  assert.deepEqual(await second, []);
  assert.equal(samples, 1);
  assert.deepEqual([...marks.keys()], ['member-1', 'member-5']);
  for (const { event } of result) {
    assert.deepEqual(readHookOneHour(event), {
      type: 'event', kind: 'hook-one-hour', at: firstAt, auroraAtHour: false, confirmedListenCount: 1,
    });
  }
});

test('a settled aurora sends only a suppression receipt and preserves the next third-listen slot', async () => {
  const { store, marks } = memoryStore();
  let sample: HookOneBoundary | undefined;
  const authority = createHookOneAttendance(() => sample, store);
  async function observe(at: number, effect: boolean, session: string) {
    sample = { ...boundary(at, [connected(session, 'same-authenticated-profile')]), auroraAtHour: effect };
    const [receipt] = await authority.record(at, at);
    assert.ok(receipt);
    return receipt;
  }
  assert.equal((await observe(firstAt, false, 'first')).event.auroraAtHour, false);
  await observe(firstAt + hourMs, false, 'second');
  const auroraAt = firstAt + 2 * hourMs;
  const aurora = await observe(auroraAt, true, 'station');
  assert.deepEqual(aurora.event, { type: 'event', kind: 'hook-one-hour', at: auroraAt, auroraAtHour: true });
  assert.deepEqual(await authority.record(auroraAt, auroraAt + 1), []);
  assert.deepEqual(marks.get('same-authenticated-profile'), { lastHeardAt: firstAt + hourMs, listenCount: 2 });

  const third = await observe(firstAt + 3 * hourMs, false, 'third');
  assert.equal(third.sessionKey, 'third');
  assert.equal(third.event.auroraAtHour ? 0 : third.event.confirmedListenCount, 3);
  for (const hour of [4, 5]) {
    const event = (await observe(firstAt + hour * hourMs, false, 'fourth')).event;
    assert.equal(event.auroraAtHour ? 0 : event.confirmedListenCount, 4);
  }
});

test('no fake cue is issued for unknown weather or roster, silent hours, ceremony or late wake', async () => {
  const { store, marks } = memoryStore();
  let sample: HookOneBoundary | undefined;
  const authority = createHookOneAttendance(() => sample, store);
  const afterHours = Date.parse('2026-12-30T05:00:00+08:00');
  for (const blocked of [afterHours, afterHours - 1, firstAt + 1, Date.parse('2027-01-01T00:00:00+08:00')]) {
    sample = boundary(blocked);
    assert.deepEqual(await authority.record(blocked, blocked), []);
  }
  assert.deepEqual(await authority.record(firstAt, firstAt + 1), []);
  sample = { ...boundary(firstAt), auroraAtHour: undefined };
  assert.deepEqual(await authority.record(firstAt, firstAt + 1), []);
  sample = boundary(firstAt + hourMs);
  assert.deepEqual(await authority.record(firstAt, firstAt + 1), []);
  sample = { ...boundary(firstAt), ordinary: false };
  assert.deepEqual(await authority.record(firstAt, firstAt + 1), []);
  sample = boundary(firstAt);
  assert.deepEqual(await authority.record(firstAt, firstAt - 1), []);
  assert.deepEqual(await authority.record(firstAt, firstAt + 5001), []);
  assert.equal(marks.size, 0);
  assert.equal((await authority.record(firstAt, firstAt + 5000)).length, 1);
});

test('partial storage failure emits no uncommitted count and can retry only the exact frozen roster', async () => {
  const { store, marks } = memoryStore();
  let fail = true;
  const authority = createHookOneAttendance(at =>
    boundary(at, [connected('successful', 'key-1'), connected('failed-first', 'key-2')]), {
    ...store,
    async save(key, mark) {
      if (fail && key === 'key-2') throw new Error('Disk full');
      await store.save(key, mark);
    },
  });
  assert.deepEqual((await authority.record(firstAt, firstAt)).map(d => d.sessionKey), ['successful']);
  assert.equal(marks.has('key-2'), false);
  fail = false;
  assert.deepEqual((await authority.record(firstAt, firstAt + 1)).map(d => d.sessionKey), ['failed-first']);
  assert.deepEqual(await authority.record(firstAt, firstAt + 2), []);
});

test('file-backed attendance survives a restarted authority without replaying the third-listen hour', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hook-one-attendance-'));
  try {
    const profile = 'signed-profile-without-a-nickname';
    const at = firstAt + 2 * hourMs;
    for (const hour of [firstAt, firstAt + hourMs, at]) {
      const viaNewProcess = createHookOneAttendance(at => boundary(at, [connected(`lease-${hour}`, profile)]),
        createHookOneAttendanceFileStore(folder));
      const [receipt] = await viaNewProcess.record(hour, hour + 1);
      assert.ok(receipt && !receipt.event.auroraAtHour);
      assert.equal(receipt.event.confirmedListenCount, (hour - firstAt) / hourMs + 1);
      await viaNewProcess.flush();
    }
    const restored = createHookOneAttendance(at => boundary(at, [connected('next-lease', profile)]),
      createHookOneAttendanceFileStore(folder));
    assert.deepEqual(await restored.record(at, at + 5), []);
    const [later] = await restored.record(at + hourMs, at + hourMs + 3);
    assert.ok(later && !later.event.auroraAtHour);
    assert.equal(later.event.confirmedListenCount, 4);
    const filenames = await readdir(folder);
    assert.equal(filenames.length, 1);
    assert.match(filenames[0], /^[a-f0-9]{64}\.json$/);
    const savedPath = join(folder, filenames[0]);
    assert.deepEqual(JSON.parse(await readFile(savedPath, 'utf8')),
      { version: 1, lastHeardAt: at + hourMs, listenCount: 4 });
    await writeFile(savedPath, '{"version":1,"listenCount":3}', 'utf8');
    const badState = createHookOneAttendance(at => boundary(at, [connected('next-lease', profile)]),
      createHookOneAttendanceFileStore(folder));
    assert.deepEqual(await badState.record(at + 2 * hourMs, at + 2 * hourMs), []);
    assert.equal(await readFile(savedPath, 'utf8'), '{"version":1,"listenCount":3}');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('the wire reader rejects samples with no confirmed ordinary count and strips host-only properties', () => {
  const frame = { type: 'event', kind: 'hook-one-hour', at: firstAt };
  assert.equal(readHookOneHour({ ...frame, auroraAtHour: false }), undefined);
  assert.equal(readHookOneHour({ ...frame, auroraAtHour: false, confirmedListenCount: 5 }), undefined);
  assert.equal(readHookOneHour({ ...frame, at: firstAt + 1, auroraAtHour: true }), undefined);
  assert.deepEqual(readHookOneHour({ ...frame, auroraAtHour: true, confirmedListenCount: 3, profileKey: 'private' }),
    { ...frame, auroraAtHour: true });
});

test('the same cue survives a delayed receipt and an early receipt without replay', () => {
  const first = createHookOneHourInbox();
  const second = createHookOneHourInbox();
  const cue = { audible: true, cue: { at: firstAt, strikes: 3 } };
  const message = { type: 'event', kind: 'hook-one-hour', at: firstAt, auroraAtHour: false, confirmedListenCount: 3 };
  assert.equal(first.update(firstAt + 2, true, cue), undefined);
  first.accept(message, firstAt + 72);
  second.accept(message, firstAt - 1);
  assert.equal(second.update(firstAt - 1, true, cue), undefined);
  const planInput = { dailyChime: cue, attendance: { at: firstAt, confirmedListenCount: 3 }, auroraAtHour: false };
  assert.deepEqual(first.update(firstAt + 90, true), planInput);
  assert.deepEqual(second.update(firstAt + 6, true, cue), planInput);
  first.accept(message, firstAt + 91);
  assert.equal(first.update(firstAt + 92, true, cue), undefined);
});

test('receipts cannot start playback without the matching still-live ordinary crossing', () => {
  const inbox = createHookOneHourInbox();
  const cue = { audible: true, cue: { at: firstAt } };
  const message = { type: 'event', kind: 'hook-one-hour', at: firstAt, auroraAtHour: true };
  inbox.accept(message, firstAt);
  assert.equal(inbox.update(firstAt, true), undefined);
  assert.equal(inbox.update(firstAt + 1, false, cue), undefined);
  assert.equal(inbox.update(firstAt + 2, true, cue), undefined);
  inbox.accept(message, firstAt + 5001);
  assert.equal(inbox.update(firstAt + 5001, true), undefined);
  const next = firstAt + hourMs;
  inbox.accept({ ...message, at: next }, next);
  assert.deepEqual(inbox.update(next, true, { audible: true, cue: { at: next } }), {
    dailyChime: { audible: true, cue: { at: next } }, attendance: { at: next }, auroraAtHour: true,
  });
});
