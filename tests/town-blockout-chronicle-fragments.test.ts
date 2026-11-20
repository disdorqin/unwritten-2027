import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCollectChronicleFragment,
  chronicleFragmentHint,
  chronicleFragmentKeyReady,
  installedChronicleFragments,
  publicChronicleProgress,
  receiveMayorChronicleFragment,
  type ChronicleFragmentId,
  type ChronicleSite,
  type ChronicleVersion,
  type TrustedMayorChronicleAction,
} from '../tools/voxel-tavern/town-blockout/town-chronicle-fragments';

const sites = new Set<ChronicleSite>([
  'plaza-stele', 'loop-rail-stationmaster', 'loop-outpost-foundation', 'lookout-crater-rim-stele',
  'mine-camp-book', 'clocktower-bell-inscription', 'cordon-removal-stele', 'crystal-survey-note',
  'warrior-city-forge-plaque', 'palace-vault-scroll', 'summit-cabin-journal', 'clocktower-mayor-private',
]);
const world = { version: 'v1.3', sites } as const;
const none = new Set<ChronicleFragmentId>();
const pageIds = (version: ChronicleVersion) => installedChronicleFragments({ version, sites }).map(page => page.id);
const firstEleven = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const earlierCollected = new Set<ChronicleFragmentId>(firstEleven);
const captainDelivery = { kind: 'deliver-captain-page', visit: {
  site: 'clocktower-mayor-private', passed: new Set<never>(),
} } as const;

test('catalog matches page titles, methods, absolute depths and four tier cutoffs', () => {
  const catalog = installedChronicleFragments(world);
  assert.deepEqual(catalog.map(page => page.title), [
    '开镇记', '专列', '封字令', '天火', '井下人', '钟铭', '撤', '星尘', '城', '宝库门', '绝顶手记', '船长页',
  ]);
  assert.deepEqual(catalog.map(page => page.method), [
    'rubbing', 'gift', 'rubbing', 'rubbing', 'pickup', 'rubbing', 'rubbing', 'pickup', 'rubbing', 'pickup', 'pickup', 'gift',
  ]);
  assert.deepEqual(catalog.flatMap(page => 'depth' in page ? [[page.id, page.depth]] : []),
    [[5, -90], [8, -140], [9, -165], [10, -190]]);
  assert.deepEqual(pageIds('opening'), [1]);
  assert.deepEqual(pageIds('first-season'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageIds('v1.2'), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(pageIds('v1.3'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('the opening projection still needs the verified plaza stele', () => {
  const opening = { version: 'opening', sites } as const;
  const unmounted = { version: 'opening', sites: new Set<ChronicleSite>() } as const;
  const plaza = { site: 'plaza-stele', passed: new Set<never>() } as const;
  const station = { site: 'loop-rail-stationmaster', passed: new Set(['stationmaster-first-talk'] as const) } as const;
  assert.equal(canCollectChronicleFragment(1, 'rubbing', opening, plaza, none), true);
  assert.equal(canCollectChronicleFragment(1, 'rubbing', opening, plaza, none), true, 'unrelated guests can use the same stele');
  assert.equal(canCollectChronicleFragment(1, 'rubbing', opening, plaza, new Set([1])), false);
  assert.equal(canCollectChronicleFragment(1, 'rubbing', unmounted, plaza, none), false);
  assert.equal(canCollectChronicleFragment(1, 'pickup', opening, plaza, none), false);
  assert.equal(canCollectChronicleFragment(2, 'gift', opening, station, none), false);
  assert.equal(chronicleFragmentHint(1, opening), undefined);
  assert.equal(chronicleFragmentHint(1, unmounted), '此页尚在远方');
  assert.equal(chronicleFragmentHint(12, opening), '此页尚在远方');
});

test('surface fragments are independent while station gifting uses the first talk', () => {
  for (const [id, site] of [[3, 'loop-outpost-foundation'], [4, 'lookout-crater-rim-stele'],
    [6, 'clocktower-bell-inscription'], [7, 'cordon-removal-stele']] as const) {
    assert.equal(canCollectChronicleFragment(id, 'rubbing', world, { site, passed: new Set() }, none), true);
  }
  assert.equal(canCollectChronicleFragment(2, 'gift', world, {
    site: 'loop-rail-stationmaster', passed: new Set(),
  }, none), false);
  assert.equal(canCollectChronicleFragment(2, 'gift', world, {
    site: 'loop-rail-stationmaster', passed: new Set(['stationmaster-first-talk']),
  }, none), true);
});

test('underground checks accepted gates and guarding without requiring earlier pickups', () => {
  type Visit = Parameters<typeof canCollectChronicleFragment>[3];
  const check = (id: ChronicleFragmentId, method: Parameters<typeof canCollectChronicleFragment>[1],
    site: ChronicleSite, passed: Visit['passed'], expected: boolean) =>
    assert.equal(canCollectChronicleFragment(id, method, world, { site, passed }, none), expected);

  check(5, 'pickup', 'mine-camp-book', new Set(), false);
  check(5, 'pickup', 'mine-camp-book', new Set(['dream-well-passed']), true);
  check(8, 'pickup', 'crystal-survey-note', new Set(), false);
  check(8, 'pickup', 'crystal-survey-note', new Set(['mine-gate-passed']), true);
  check(9, 'rubbing', 'warrior-city-forge-plaque', new Set(['crystal-gate-passed']), false);
  check(9, 'rubbing', 'warrior-city-forge-plaque', new Set(['mine-gate-passed', 'crystal-gate-passed']), true);
  check(10, 'pickup', 'palace-vault-scroll',
    new Set(['mine-gate-passed', 'crystal-gate-passed', 'warrior-city-gate-passed']), false);
  check(10, 'pickup', 'palace-vault-scroll',
    new Set(['mine-gate-passed', 'crystal-gate-passed', 'warrior-city-gate-passed', 'vault-guardian-cleared']), true);
  check(11, 'pickup', 'summit-cabin-journal', new Set(), false);
  check(11, 'pickup', 'summit-cabin-journal', new Set(['summit-registered']), true);
});

test('private delivery requires pages 1 through 11 and the mayor in the clocktower', () => {
  const beforeLast = new Set<ChronicleFragmentId>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const earlyCollected = new Set<ChronicleFragmentId>(firstEleven);
  const mayor = { site: 'clocktower-mayor-private', passed: new Set<never>() } as const;
  assert.equal(canCollectChronicleFragment(12, 'gift', world, mayor, beforeLast), false);
  assert.equal(canCollectChronicleFragment(12, 'gift', world, mayor, earlyCollected), true);
  assert.equal(canCollectChronicleFragment(12, 'pickup', world, mayor, earlyCollected), false);
  assert.equal(canCollectChronicleFragment(12, 'gift', world, { ...mayor, site: 'plaza-stele' }, earlyCollected), false);
});

test('the first eleven distinct accepted receipts only show progress, even out of order', () => {
  const order = [3, 7, 1, 2, 4, 5, 6, 8, 9, 11, 10] as const;
  let accepted: readonly ChronicleFragmentId[] = [];
  for (const [index, page] of order.entries()) {
    const action = { kind: 'receive-page', id: page } as const;
    const result = receiveMayorChronicleFragment(action, world, earlierCollected, accepted);
    assert.ok(result);
    assert.equal(result.kind, 'receipt');
    assert.equal(result.fragmentKeyReady, false);
    assert.equal(result.progress.receivedCount, index + 1);
    assert.equal('narration' in result, false);
    accepted = result.accepted;
    assert.equal(receiveMayorChronicleFragment(action, world, earlierCollected, accepted), undefined);
    assert.equal(chronicleFragmentKeyReady(accepted), false);
  }
  assert.deepEqual(accepted, firstEleven);
});

test('only delivery at the installed mayor can grant page 12 after the first eleven are collected and received', () => {
  assert.equal(receiveMayorChronicleFragment(captainDelivery, world, earlierCollected, firstEleven.slice(0, -1)), undefined);
  assert.equal(receiveMayorChronicleFragment(captainDelivery, world, new Set(firstEleven.slice(0, -1)), firstEleven), undefined);
  assert.equal(receiveMayorChronicleFragment(captainDelivery, { version: 'v1.2', sites }, earlierCollected, firstEleven), undefined);
  assert.equal(receiveMayorChronicleFragment(captainDelivery, {
    version: 'v1.3', sites: new Set([...sites].filter(site => site !== 'clocktower-mayor-private')),
  }, earlierCollected, firstEleven), undefined);
  assert.equal(receiveMayorChronicleFragment({ ...captainDelivery,
    visit: { ...captainDelivery.visit, site: 'plaza-stele' },
  }, world, earlierCollected, firstEleven), undefined);
  const ordinaryPage12 = { kind: 'receive-page', id: 12 } as unknown as TrustedMayorChronicleAction;
  assert.equal(receiveMayorChronicleFragment(ordinaryPage12, world, new Set([...firstEleven, 12]), firstEleven), undefined);
  assert.equal(receiveMayorChronicleFragment({ kind: 'receive-page', id: 1 }, world, none, []), undefined);
});

test('page 12 yields one blank ceremony and the fragment key from the same receipt', () => {
  const result = receiveMayorChronicleFragment(captainDelivery, world, earlierCollected, firstEleven);
  assert.deepEqual(result, { kind: 'ceremony', grantedPage: 12, accepted: [...firstEleven, 12],
    progress: { receivedCount: 12, majorReceivedCount: 4 }, fragmentKeyReady: true,
    pageOrder: [...firstEleven, 12], narration: '' });
  assert.ok(result);
  // A fresh caller restores the host-committed list rather than replaying a client event.
  const restored = JSON.parse(JSON.stringify(result.accepted)) as ChronicleFragmentId[];
  assert.equal(chronicleFragmentKeyReady(restored), true);
  assert.equal(receiveMayorChronicleFragment(captainDelivery, world, new Set(restored), restored), undefined);
  assert.equal(chronicleFragmentKeyReady([12, 12, 12]), false);
});

test('public projection exposes only distinct receipt counts, even after the ceremony', () => {
  assert.deepEqual(publicChronicleProgress(none), { receivedCount: 0, majorReceivedCount: 0 });
  const received: ChronicleFragmentId[] = [1, 4, 8, 7, 9, 11, 12, 12];
  assert.deepEqual(publicChronicleProgress(received), { receivedCount: 7, majorReceivedCount: 4 });
  const publicPayload = JSON.stringify([publicChronicleProgress(received),
    chronicleFragmentHint(12, { version: 'opening', sites })]);
  assert.equal(publicPayload, '[{"receivedCount":7,"majorReceivedCount":4},"此页尚在远方"]');
});
