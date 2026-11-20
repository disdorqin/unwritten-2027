export type ChronicleVersion = 'opening' | 'first-season' | 'v1.2' | 'v1.3';

const versions: readonly ChronicleVersion[] = ['opening', 'first-season', 'v1.2', 'v1.3'];
const catalog = [
  { id: 1, title: '开镇记', version: 'opening', site: 'plaza-stele', method: 'rubbing', prerequisites: [] },
  { id: 2, title: '专列', version: 'first-season', site: 'loop-rail-stationmaster', method: 'gift', prerequisites: ['stationmaster-first-talk'] },
  { id: 3, title: '封字令', version: 'first-season', site: 'loop-outpost-foundation', method: 'rubbing', prerequisites: [] },
  { id: 4, title: '天火', version: 'first-season', site: 'lookout-crater-rim-stele', method: 'rubbing', prerequisites: [] },
  { id: 5, title: '井下人', version: 'first-season', site: 'mine-camp-book', method: 'pickup', prerequisites: ['dream-well-passed'], depth: -90 },
  { id: 6, title: '钟铭', version: 'first-season', site: 'clocktower-bell-inscription', method: 'rubbing', prerequisites: [] },
  { id: 7, title: '撤', version: 'first-season', site: 'cordon-removal-stele', method: 'rubbing', prerequisites: [] },
  { id: 8, title: '星尘', version: 'v1.2', site: 'crystal-survey-note', method: 'pickup', prerequisites: ['mine-gate-passed'], depth: -140 },
  { id: 9, title: '城', version: 'v1.2', site: 'warrior-city-forge-plaque', method: 'rubbing', prerequisites: ['mine-gate-passed', 'crystal-gate-passed'], depth: -165 },
  { id: 10, title: '宝库门', version: 'v1.3', site: 'palace-vault-scroll', method: 'pickup', prerequisites: ['mine-gate-passed', 'crystal-gate-passed', 'warrior-city-gate-passed', 'vault-guardian-cleared'], depth: -190 },
  { id: 11, title: '绝顶手记', version: 'v1.3', site: 'summit-cabin-journal', method: 'pickup', prerequisites: ['summit-registered'] },
  { id: 12, title: '船长页', version: 'v1.3', site: 'clocktower-mayor-private', method: 'gift', prerequisites: [] },
] as const;

// The catalog has placement metadata only. Story prose and ship records are not inputs.
export type ChronicleFragment = typeof catalog[number];
export type ChronicleFragmentId = ChronicleFragment['id'];
export type ChronicleSite = ChronicleFragment['site'];
type ChronicleMethod = ChronicleFragment['method'];
type ChroniclePrerequisite = ChronicleFragment['prerequisites'][number];

type InstalledSites = {
  version: ChronicleVersion;
  sites: ReadonlySet<ChronicleSite>;
};

type TrustedVisit = {
  site: ChronicleSite;
  passed: ReadonlySet<ChroniclePrerequisite>;
};

export type TrustedMayorChronicleAction =
  | { kind: 'receive-page'; id: Exclude<ChronicleFragmentId, 12> }
  | { kind: 'deliver-captain-page'; visit: TrustedVisit };

const majorPages = new Set<ChronicleFragmentId>([7, 9, 11, 12]);

export function installedChronicleFragments({ version, sites }: InstalledSites) {
  const versionIndex = versions.indexOf(version);
  return catalog.filter(page => versions.indexOf(page.version) <= versionIndex && sites.has(page.site));
}

export function canCollectChronicleFragment(
  id: ChronicleFragmentId,
  method: ChronicleMethod,
  world: InstalledSites,
  visit: TrustedVisit,
  owned: ReadonlySet<ChronicleFragmentId>,
) {
  const page = installedChronicleFragments(world).find(candidate => candidate.id === id);
  if (!page || owned.has(id) || page.site !== visit.site || page.method !== method) return false;
  if (!page.prerequisites.every(requirement => visit.passed.has(requirement))) return false;
  return id !== 12 || catalog.every(candidate => candidate.id === 12 || owned.has(candidate.id));
}

/** A verified mayor interaction commits the grant and the receipt before emitting its result. */
export function receiveMayorChronicleFragment(
  action: TrustedMayorChronicleAction,
  world: InstalledSites,
  collected: ReadonlySet<ChronicleFragmentId>,
  received: readonly ChronicleFragmentId[],
) {
  const captainDelivery = action.kind === 'deliver-captain-page';
  const id: ChronicleFragmentId = captainDelivery ? 12 : action.id;
  if (received.includes(id)) return undefined;
  if (captainDelivery) {
    if (!canCollectChronicleFragment(12, 'gift', world, action.visit, collected) ||
        !catalog.every(page => page.id === 12 || received.includes(page.id))) return undefined;
  } else if (id === 12 || !collected.has(id) || !installedChronicleFragments(world).some(page => page.id === id)) {
    return undefined;
  }

  const accepted = [...received, id].sort((a, b) => a - b);
  const progress = publicChronicleProgress(accepted);
  return captainDelivery
    ? { kind: 'ceremony' as const, accepted, grantedPage: 12 as const, progress, fragmentKeyReady: true as const,
      pageOrder: catalog.map(page => page.id), narration: '' as const }
    : { kind: 'receipt' as const, accepted, progress, fragmentKeyReady: false as const };
}

/** Read the fragment key from committed mayor receipts during reconnect or restore. */
export function chronicleFragmentKeyReady(received: Iterable<ChronicleFragmentId>) {
  return publicChronicleProgress(received).receivedCount === catalog.length;
}

export function chronicleFragmentHint(id: ChronicleFragmentId, world: InstalledSites) {
  return installedChronicleFragments(world).some(page => page.id === id)
    ? undefined
    : '此页尚在远方';
}

// Public progress counts only host-accepted receipts, without page contents or player information.
export function publicChronicleProgress(received: Iterable<ChronicleFragmentId>) {
  const accepted = new Set(received);
  const pages = catalog.filter(page => accepted.has(page.id));
  return { receivedCount: pages.length, majorReceivedCount: pages.filter(page => majorPages.has(page.id)).length };
}
