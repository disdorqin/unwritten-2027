import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  createDailyRailTimetable, dailyFinaleCue, dailyHearthCue, dailyMailErrand, dailyMascotWestCue,
  dailyNinthChimeAftermath, dailyOldWishCue, dailyStageVisit, dailyUnlistedStopProps,
  mayHearDailyMarketAside, registerDailyMeteor,
} from '../tools/voxel-tavern/town-blockout/town-ground-daily-events';

test('unlisted rail stop physically dwells while public current, next and arrival omit it', t => {
  const stops = [
    { id: 'station', distance: 0, speed: 8, label: 'Station' },
    { id: 'market', distance: 80, speed: 8, label: 'Market' },
  ] as const;
  const unlisted = { id: 'fixture-side-stop', distance: 40, speed: 8 };
  const normal = createDailyRailTimetable(stops, 120);
  const nightly = createDailyRailTimetable(stops, 120, unlisted);
  const phase = { leg: 0, distance: 0, stopped: false, secondsLeft: 0 };
  const epoch = Date.UTC(2026, 0, 1);
  nightly.sample(epoch, phase);
  assert.equal(nightly.currentPublicStop(phase)?.id, 'station');
  assert.equal(nightly.nextPublicStop(phase)?.id, 'market');
  assert.equal(nightly.publicArrival(phase, unlisted.id), undefined);
  const regularEta = normal.publicArrival(phase, 'market')?.seconds;
  const nightlyEta = nightly.publicArrival(phase, 'market')?.seconds;
  assert.ok(regularEta !== undefined && nightlyEta !== undefined && nightlyEta > regularEta);
  let firstUnlisted = -1;
  for (let step = 0; step < 45_000; step += 100) {
    nightly.sample(epoch + step, phase);
    assert.notEqual(nightly.nextPublicStop(phase)?.id, unlisted.id);
    if (nightly.atUnlistedStop(phase)) {
      firstUnlisted = step;
      assert.equal(phase.distance, 40);
      assert.equal(nightly.currentPublicStop(phase), undefined);
      break;
    }
  }
  assert.notEqual(firstUnlisted, -1);
  assert.deepEqual(dailyUnlistedStopProps(3), {
    flowers: 'fresh', luggage: 'optional-scenery', collectible: false,
  });
  assert.throws(() => createDailyRailTimetable(stops, 120, { ...unlisted, id: 'station' }), RangeError);
  t.diagnostic(`40 m unlisted fixture stopped by ${firstUnlisted} ms; public ETA ${regularEta.toFixed(3)}s → ${nightlyEta.toFixed(3)}s`);
});

test('V3 finale and off-hours backstage unlock the extra photo spot in either order', t => {
  for (const first of ['finale-completed', 'backstage-visit'] as const) {
    const empty = { sawFinale: false, sawBackstage: false };
    const start = dailyStageVisit(empty, first, first === 'finale-completed')!;
    assert.equal(start.grantTicketStub, first === 'finale-completed');
    assert.equal(start.unlockPhotoSpot, false);
    const second = first === 'finale-completed' ? 'backstage-visit' : 'finale-completed';
    const end = dailyStageVisit(start.history, second, false)!;
    assert.equal(end.grantTicketStub, second === 'finale-completed');
    assert.equal(end.unlockPhotoSpot, true);
    const replay = dailyStageVisit(end.history, 'finale-completed', false)!;
    assert.equal(replay.grantTicketStub, false);
    assert.equal(replay.unlockPhotoSpot, false);
  }
  assert.equal(dailyStageVisit({ sawFinale: true, sawBackstage: false }, 'backstage-visit', true), undefined);
  assert.deepEqual(dailyFinaleCue(1, 5, false), { includeLeaderAddendum: false, subtitleAfterimageFrames: 0 });
  assert.deepEqual(dailyFinaleCue(2, 6, false), { includeLeaderAddendum: true, subtitleAfterimageFrames: 1 });
  assert.deepEqual(dailyFinaleCue(3, 12, true), { includeLeaderAddendum: false, subtitleAfterimageFrames: 0 });
  t.diagnostic('one ticket and one photo unlock; personal 5/6 → 0/1 subtitle frame; silent overpass → 0 frames');
});

test('V4 accepted host selection uses only three mail material slots', t => {
  const stages = [1, 2, 3] as const;
  const postOffice = {
    selectedByHost: true, atPostOffice: true, handledByCourier: true, transaction: 'send-letter',
  } as const;
  assert.deepEqual(stages.map(stage => dailyMailErrand(stage, postOffice)?.paperSlot),
    ['list-fragment', 'star-map-fragment', 'courier-line-slot']);
  assert.equal(dailyMailErrand(1, { ...postOffice, transaction: 'run-errand' })?.paperSlot, 'list-fragment');
  assert.equal(dailyMailErrand(1, { ...postOffice, selectedByHost: false }), undefined);
  assert.equal(dailyMailErrand(1, { ...postOffice, atPostOffice: false }), undefined);
  assert.equal(dailyMailErrand(1, { ...postOffice, handledByCourier: false }), undefined);
  assert.equal(dailyMailErrand(1, { ...postOffice, transaction: 'other' }), undefined);
  t.diagnostic('two eligible post-office flows, three structural slots, four blocked fixture cases');
});

test('V4 meteor visits record the actor without granting or transferring the shard', t => {
  const landing = Object.freeze({ id: 'drop-3', landedAt: 5_000, pickedBy: 'picker' });
  const prior = [{ eventId: 'drop-1', playerId: 'picker' }, { eventId: 'drop-2', playerId: 'picker' }];
  assert.equal(registerDailyMeteor(prior, landing, 'picker', 4_999, true, 3), undefined);
  assert.equal(registerDailyMeteor(prior, landing, 'picker', 5_000, false, 3), undefined);
  assert.equal(registerDailyMeteor(prior, landing, 'picker', 605_000, true, 3), undefined);
  assert.equal(registerDailyMeteor(prior, landing, 'picker', Number.NaN, true, 3), undefined);
  assert.equal(mayHearDailyMarketAside(prior, [landing], 'picker'), false);
  const picker = registerDailyMeteor(prior, landing, 'picker', 604_999, true, 3)!;
  const witness = registerDailyMeteor(prior, landing, 'witness', 5_000, true, 2)!;
  assert.deepEqual(picker, { registration: { eventId: 'drop-3', playerId: 'picker' }, visitNumber: 3 });
  assert.equal(witness.visitNumber, undefined);
  const ledger = [...prior, picker.registration, witness.registration];
  assert.equal(registerDailyMeteor(ledger, landing, 'picker', 7_000, true, 3), undefined);
  assert.equal(mayHearDailyMarketAside(ledger, [landing], 'picker'), true);
  assert.equal(mayHearDailyMarketAside(ledger, [landing], 'witness'), false);
  assert.equal(landing.pickedBy, 'picker');
  t.diagnostic('registration elapsed 599,999 ms accepted; 600,000 ms rejected; third visit 3; only registered picker qualifies');
});

test('V5 prop and reaction cues preserve the approved two-card and personal hearing gates', t => {
  assert.equal(dailyOldWishCue(1, [false, false]), undefined);
  assert.deepEqual([dailyOldWishCue(1, [true, false]), dailyOldWishCue(2, [false, true]),
    dailyOldWishCue(3, [false, false])], [{ cardSlot: 1 }, { cardSlot: 2 }, { knotMotifOnly: true }]);
  assert.equal(dailyOldWishCue(2, [true, false]), undefined);
  assert.deepEqual(dailyHearthCue(2, [12], 'dusk'), { breakCount: 2, finalHalfLineSlot: false });
  assert.deepEqual(dailyHearthCue(3, [0, 7], 'dusk'), { breakCount: 2, finalHalfLineSlot: false });
  assert.deepEqual(dailyHearthCue(3, [7, 8], 'dusk'), { breakCount: 2, finalHalfLineSlot: true });
  assert.deepEqual(dailyHearthCue(3, [12], 'night'), { breakCount: 2, finalHalfLineSlot: false });
  assert.equal(dailyNinthChimeAftermath(1, 0, 0, true), 'deflection-line-slot');
  assert.equal(dailyNinthChimeAftermath(2, 0, 59_999, true), 'mechanism-line-slot');
  assert.equal(dailyNinthChimeAftermath(3, 7, 59_999, true), undefined);
  assert.equal(dailyNinthChimeAftermath(3, 8, 59_999, true), 'silent-nod');
  assert.equal(dailyNinthChimeAftermath(3, 8, 60_000, true), undefined);
  assert.equal(dailyNinthChimeAftermath(3, 8, 0, false), undefined);
  assert.deepEqual(dailyMascotWestCue(3, true, true), {
    usualWestLookMs: 20_000, longerLookAndPawing: true, distantLight: true, lightInteractable: false,
  });
  assert.equal(dailyMascotWestCue(1, true, true).distantLight, false);
  assert.equal(dailyMascotWestCue(3, true, false).distantLight, false);
  t.diagnostic('hearth and chime personal hearing 7/8 boundary; chime 59,999/60,000 ms; two old-card slots only');
});
