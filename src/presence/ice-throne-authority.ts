const claimMs = 3_000;
const termMs = 5 * 60_000;
const awayMs = 10_000;
const hitLimit = 3;

export type IceThroneChange = { ownerId: number | null; message: string };
type Seat = { name: string; claimSince?: number; needsReseat?: boolean };
type Reign = { id: number; crownedAt: number; leftAt?: number; hits: Set<string> };

/** Call only from the presence host, with a common monotonic clock for both transports. */
export function createIceThroneAuthority(onChange: (change: IceThroneChange) => void) {
  const seats = new Map<number, Seat>();
  let reign: Reign | undefined;

  function abdicate(now: number) {
    const previous = reign;
    if (!previous) return;
    reign = undefined;
    for (const [id, seat] of seats) {
      if (id === previous.id) seat.needsReseat = true;
      if (!seat.needsReseat) seat.claimSince = now;
    }
    onChange({ ownerId: null, message: '冰雪之主退位，王座空悬' });
  }

  function tick(now: number) {
    if (reign) {
      if (now - reign.crownedAt >= termMs || (reign.leftAt !== undefined && now - reign.leftAt > awayMs)) abdicate(now);
      return;
    }

    let winner: { id: number; since: number; name: string } | undefined;
    for (const [id, { name, claimSince }] of seats) {
      if (claimSince === undefined || now - claimSince < claimMs) continue;
      if (!winner || claimSince < winner.since || (claimSince === winner.since && id < winner.id)) {
        winner = { id, since: claimSince, name };
      }
    }
    if (!winner) return;

    reign = { id: winner.id, crownedAt: now, hits: new Set() };
    for (const seat of seats.values()) seat.claimSince = undefined;
    onChange({ ownerId: winner.id, message: `${winner.name} 登临冰雪王座` });
  }

  function observe(now: number, id: number, name: string, atThroneSeat: boolean) {
    tick(now);
    if (!atThroneSeat) {
      seats.delete(id);
      if (reign?.id === id) reign.leftAt ??= now;
      return;
    }

    const seat = seats.get(id);
    if (seat) seat.name = name;
    else seats.set(id, { name, claimSince: reign ? undefined : now });
    if (reign?.id === id) reign.leftAt = undefined;
  }

  function remove(now: number, id: number) {
    observe(now, id, '', false);
  }

  /** Pass only the first valid victim report accepted by the existing snowball relay. */
  function confirmedHit(now: number, victimId: number, throwerId: number, ballId: number) {
    tick(now);
    if (reign?.id !== victimId || throwerId === victimId) return;
    reign.hits.add(`${throwerId}:${ballId}`);
    if (reign.hits.size === hitLimit) abdicate(now);
  }

  return { observe, remove, tick, confirmedHit, ownerId: () => reign?.id ?? null };
}
