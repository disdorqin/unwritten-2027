export type TownNightBeaconFrame = Readonly<{
  type: 'event';
  kind: 'town-night-beacon';
  at: number;
  expiresAt: number;
}>;

function isEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function readTownNightBeacon(value: unknown): TownNightBeaconFrame | undefined {
  if (!value || typeof value !== 'object') return;
  const { type, kind, at, expiresAt } = value as Record<string, unknown>;
  if (type === 'event' && kind === 'town-night-beacon' && isEpoch(at) && isEpoch(expiresAt) && at < expiresAt) {
    return Object.freeze({ type, kind, at, expiresAt });
  }
}

type Effect = (cue: TownNightBeaconFrame) => void;
type TownNightBeaconEffects = Readonly<{
  ringTower?: Effect;
  swingPendulum?: Effect;
  echo?: (site: 1 | 2 | 3, cue: TownNightBeaconFrame) => void;
  glowAtAnchors?: Effect;
  stationBroadcast?: Effect;
  ringMascotBell?: Effect;
}>;

/** Pass frames only from the established server connection. Read-only reconnect state is not a cue. */
export function createTownNightBeaconReceiver(effects: TownNightBeaconEffects) {
  let lastPlayedAt = -Infinity;
  const consumers: Effect[] = [
    cue => effects.ringTower?.(cue),
    cue => effects.swingPendulum?.(cue),
    cue => effects.echo?.(1, cue),
    cue => effects.echo?.(2, cue),
    cue => effects.echo?.(3, cue),
    cue => effects.glowAtAnchors?.(cue),
    cue => effects.stationBroadcast?.(cue),
    cue => effects.ringMascotBell?.(cue),
  ];
  return (value: unknown, serverNow: number) => {
    const cue = readTownNightBeacon(value);
    if (!cue || !Number.isFinite(serverNow) || serverNow < cue.at || serverNow >= cue.expiresAt || cue.at <= lastPlayedAt) return;
    lastPlayedAt = cue.at;
    const failures: unknown[] = [];
    for (const consume of consumers) {
      try { consume(cue); }
      catch (error) { failures.push(error); }
    }
    return { cue, failures };
  };
}
