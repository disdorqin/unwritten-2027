import {
  hookOneHourWindowMs, isAudibleHookOneHour, isHookOneListenCount, type HookOneHour, type HookOneListenCount,
} from '../shared/hook-one-hour.js';

export type HookOneAttendanceMark = Readonly<{ lastHeardAt: number; listenCount: HookOneListenCount }>;
export type HookOneAttendanceStore = Readonly<{
  load(profileKey: string): Promise<HookOneAttendanceMark | undefined>;
  save(profileKey: string, mark: HookOneAttendanceMark): Promise<void>;
}>;

export type HookOneBoundary = Readonly<{
  at: number;
  ordinary: boolean;
  /** O1/TX2's settled whole-town outcome at this boundary; absence means unavailable. */
  auroraAtHour?: boolean;
  residents: readonly Readonly<{
    /** Server-owned connection lease, not a recyclable presence number. */
    sessionKey: string;
    /** Opaque authenticated profile, never a display name or a wire field. */
    profileKey: string | undefined;
    inTown: boolean;
  }>[];
}>;

export type HookOneHourDelivery = Readonly<{ sessionKey: string; event: HookOneHour }>;

export function readHookOneAttendanceMark(value: unknown): HookOneAttendanceMark | undefined {
  if (!value || typeof value !== 'object') return;
  const mark = value as Record<string, unknown>;
  if (isAudibleHookOneHour(mark.lastHeardAt) && isHookOneListenCount(mark.listenCount)) {
    return { lastHeardAt: mark.lastHeardAt, listenCount: mark.listenCount };
  }
}

function validKey(key: string | undefined): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= 256;
}

function sessionsByProfile(residents: HookOneBoundary['residents']) {
  const sessions = new Map<string, Set<string>>();
  const profilesBySession = new Map<string, string | null>();
  for (const resident of residents) {
    const { profileKey, sessionKey } = resident;
    if (!resident.inTown || !validKey(profileKey) || !validKey(sessionKey)) continue;
    const previous = profilesBySession.get(sessionKey);
    profilesBySession.set(sessionKey, previous === undefined || previous === profileKey ? profileKey : null);
  }
  for (const [sessionKey, profileKey] of profilesBySession) {
    if (profileKey === null) continue;
    const group = sessions.get(profileKey) ?? new Set<string>();
    group.add(sessionKey);
    sessions.set(profileKey, group);
  }
  return sessions;
}

function deliver(event: HookOneHour, sessionKeys: ReadonlySet<string>): HookOneHourDelivery[] {
  return [...sessionKeys].map(sessionKey => ({ sessionKey, event }));
}

function nextCount(previous: HookOneListenCount | undefined): HookOneListenCount {
  return previous === 1 ? 2 : previous === 2 ? 3 : previous === undefined ? 1 : 4;
}

/** Host-only. Retain boundary membership and use one authority for this store. */
export function createHookOneAttendance(
  resolveBoundary: (at: number) => HookOneBoundary | undefined,
  store: HookOneAttendanceStore,
) {
  let sampled: { at: number; auroraAtHour: boolean; sessions: ReturnType<typeof sessionsByProfile> } | undefined;
  let tail: Promise<unknown> = Promise.resolve();

  async function recordProfile(profileKey: string, at: number, sessions: ReadonlySet<string>) {
    try {
      const previous = await store.load(profileKey);
      if (previous && (!readHookOneAttendanceMark(previous) || previous.lastHeardAt >= at)) return [];
      const count = nextCount(previous?.listenCount);
      await store.save(profileKey, { lastHeardAt: at, listenCount: count });
      return deliver({ type: 'event', kind: 'hook-one-hour', at, auroraAtHour: false, confirmedListenCount: count }, sessions);
    } catch {
      // Only committed counts can result in a cue. The host can retry this boundary within the live window.
      return [];
    }
  }

  function record(at: number, observedAt: number): Promise<HookOneHourDelivery[]> {
    if (!isAudibleHookOneHour(at) || !Number.isFinite(observedAt) || observedAt < at ||
        observedAt - at > hookOneHourWindowMs || (sampled && at < sampled.at)) return Promise.resolve([]);

    const sameBoundary = sampled?.at === at;
    if (!sameBoundary) {
      const boundary = resolveBoundary(at);
      const aurora = boundary?.auroraAtHour;
      if (boundary?.at !== at || boundary.ordinary !== true || typeof aurora !== 'boolean') return Promise.resolve([]);
      sampled = { at, auroraAtHour: aurora, sessions: sessionsByProfile(boundary.residents) };
      if (aurora) {
        const event = { type: 'event', kind: 'hook-one-hour', at, auroraAtHour: true } as const;
        return Promise.resolve([...sampled.sessions.values()].flatMap(sessions => deliver(event, sessions)));
      }
    }

    const hour = sampled!;
    if (hour.auroraAtHour) return Promise.resolve([]);
    const result = tail.then(async () => {
      const deliveries = await Promise.all([...hour.sessions].map(([profile, sessions]) =>
        recordProfile(profile, at, sessions)));
      return deliveries.flat();
    });
    tail = result;
    return result;
  }

  return { record, flush: async () => { await tail; } };
}
