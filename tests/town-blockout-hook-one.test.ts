import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ceremonyStateAt, type CeremonyPhase } from '../tools/voxel-tavern/town-blockout/town-ceremony';
import { createDailyTowerChime } from '../tools/voxel-tavern/town-blockout/town-clocktower-time';
import { createOrdinaryHookOne, ordinaryNinthSound, type OrdinaryHookOnePlan } from '../tools/voxel-tavern/town-blockout/town-hook-one';

const hourMs = 3_600_000;
const beijingOffsetMinutes = 480;
const at = Date.parse('2026-12-30T17:00:00+08:00');

type Frame = Parameters<ReturnType<typeof createOrdinaryHookOne>>[0];

function frame(hourAt = at, confirmedListenCount = 1): Frame {
  const hour = new Date(hourAt + 8 * hourMs).getUTCHours();
  return {
    phase: 'ordinary',
    dailyChime: { cue: { type: 'hourly-chime', at: hourAt, hour, strikes: 3 }, audible: hour >= 7 },
    attendance: { at: hourAt, confirmedListenCount },
    auroraAtHour: false,
  };
}

function ninthStage(plan: OrdinaryHookOnePlan | undefined) {
  assert.ok(plan?.ninth);
  return plan.ninth.stage;
}

test('the ordinary cue gives eight strikes spaced 2.020 s and one delayed ninth', () => {
  const plan = createOrdinaryHookOne()(frame());
  assert.ok(plan?.ninth);
  assert.deepEqual(plan.normalStrikesAt.map(epoch => epoch - at), [0, 2020, 4040, 6060, 8080, 10_100, 12_120, 14_140]);
  const delay = plan.ninth.at - plan.normalStrikesAt[7];
  assert.ok(delay >= 7000 && delay <= 11_000);
  assert.equal(plan.ninth.stage, 'ordinary');
});

test('independent clients derive the same ninth epoch for an hour regardless of listen count', () => {
  const first = createOrdinaryHookOne();
  const second = createOrdinaryHookOne();
  const delays = new Set<number>();
  for (let index = 0; index < 240; index++) {
    const epoch = at + index * hourMs;
    const one = first(frame(epoch, 1));
    const two = second(frame(epoch, 3));
    if (!frame(epoch).dailyChime?.audible) {
      assert.equal(one, undefined);
      assert.equal(two, undefined);
      continue;
    }
    assert.ok(one?.ninth);
    assert.ok(two?.ninth);
    const delay = one.ninth.at - one.normalStrikesAt[7];
    assert.equal(one.ninth.at, two.ninth.at);
    assert.ok(delay >= 7000 && delay <= 11_000);
    delays.add(delay);
  }
  assert.ok(delays.size > 1);
});

test('the same hour or an older hour cannot replay after clock correction', () => {
  const planner = createOrdinaryHookOne();
  assert.ok(planner(frame()));
  assert.equal(planner(frame()), undefined);
  assert.equal(planner(frame(at - hourMs)), undefined);
  assert.ok(planner(frame(at + hourMs)));
});

test('late joining and attendance for a different hour cannot replay a missed cue', () => {
  const planner = createOrdinaryHookOne();
  assert.equal(planner({ ...frame(), attendance: undefined }), undefined);
  assert.equal(planner(frame()), undefined);
  assert.equal(planner({ ...frame(at + hourMs), attendance: { at, confirmedListenCount: 3 } }), undefined);
  assert.ok(planner(frame(at + 2 * hourMs)));
});

test('aurora preserves the normal strikes and suppresses only the ninth', () => {
  const planner = createOrdinaryHookOne();
  const suppressed = planner({ ...frame(at, 3), auroraAtHour: true });
  assert.ok(suppressed);
  assert.equal(suppressed.normalStrikesAt.length, 8);
  assert.equal(suppressed.normalStrikesAt.at(-1), at + 14_140);
  assert.equal(suppressed.ninth, undefined);
  assert.equal(planner(frame(at, 3)), undefined);
  assert.equal(ninthStage(planner(frame(at + hourMs, 3))), 'third-listen');
});

test('the host supplies the third listen and the local planner claims that stage only once', () => {
  const planner = createOrdinaryHookOne();
  assert.equal(ninthStage(planner({ ...frame(), attendance: { at } })), 'ordinary');
  assert.equal(ninthStage(planner(frame(at + hourMs, 2))), 'ordinary');
  assert.equal(ninthStage(planner(frame(at + 2 * hourMs, 3))), 'third-listen');
  assert.equal(planner(frame(at + 2 * hourMs, 3)), undefined);
  assert.equal(ninthStage(planner(frame(at + 3 * hourMs, 3))), 'ordinary');
  assert.equal(ninthStage(planner(frame(at + 4 * hourMs, 4))), 'ordinary');
});

test('nonordinary phases and the silent ordinary midnight cannot enter this planner', () => {
  const planner = createOrdinaryHookOne();
  const ceremonyPhases: readonly CeremonyPhase[] = ['standby', 'mailbox', 'evening', 'converge', 'approach', 'countdown', 'climax', 'afterglow'];
  for (const phase of ceremonyPhases) assert.equal(planner({ ...frame(), phase }), undefined);
  const midnight = Date.parse('2026-12-30T00:00:00+08:00');
  assert.equal(planner(frame(midnight)), undefined);
  assert.equal(planner({ ...frame(), dailyChime: undefined }), undefined);
  assert.ok(planner(frame()));
});

test('an ordinary crossing from the production day clock produces an independent hook plan', () => {
  const daily = createDailyTowerChime();
  const planner = createOrdinaryHookOne();
  const phase = ceremonyStateAt(at, beijingOffsetMinutes).phase;
  assert.equal(phase, 'ordinary');
  assert.equal(daily(at - 1, phase), undefined);
  const dailyChime = daily(at + 5000, phase);
  assert.ok(dailyChime?.audible);
  assert.equal(dailyChime.cue.strikes, 3);
  const plan = planner({ phase, dailyChime, attendance: { at }, auroraAtHour: false });
  assert.ok(plan?.ninth);
  assert.equal(plan.normalStrikesAt.length, 8);
  assert.equal(plan.normalStrikesAt[0], at);
  assert.equal(dailyChime.cue.strikes, 3);
  assert.equal(daily(at + 5001, phase), undefined);

  const lateWake = createDailyTowerChime();
  lateWake(at - 1, phase);
  assert.equal(lateWake(at + 5001, phase), undefined);

  const lateJoin = createDailyTowerChime();
  assert.equal(lateJoin(at, phase), undefined);
  assert.equal(lateJoin(at + 1, phase), undefined);
});

test('the production day clock excludes after-hours and the two unapproved ceremony phases', () => {
  const cases = [
    ['2026-12-30T06:00:00+08:00', 'ordinary'],
    ['2026-12-31T20:00:00+08:00', 'mailbox'],
    ['2027-01-01T00:00:00+08:00', 'climax'],
    ['2027-01-01T01:00:00+08:00', 'ordinary'],
  ] as const;
  const planner = createOrdinaryHookOne();
  for (const [iso, expectedPhase] of cases) {
    const epoch = Date.parse(iso);
    const daily = createDailyTowerChime();
    const phase = ceremonyStateAt(epoch, beijingOffsetMinutes).phase;
    assert.equal(phase, expectedPhase);
    daily(epoch - 1, ceremonyStateAt(epoch - 1, beijingOffsetMinutes).phase);
    const dailyChime = daily(epoch, phase);
    if (expectedPhase === 'ordinary') assert.equal(dailyChime?.audible, false);
    else assert.equal(dailyChime, undefined);
    assert.equal(planner({ phase, dailyChime, attendance: { at: epoch }, auroraAtHour: false }), undefined);
  }
});

test('audio parameters leave disputed gain and wet mix to the host', () => {
  assert.deepEqual(ordinaryNinthSound, { lowpassHz: 1200, tailSeconds: 6, tailDetuneCents: -50, direction: 'west-above' });
});
