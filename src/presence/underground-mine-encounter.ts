import { createMineBestiaryEncounter, mineBestiary, type MineEncounterFrame, type MineEncounterHost } from '../shared/mine-bestiary.js';
import type { createUndergroundSurvival } from './underground-survival.js';

type Encounter = ReturnType<typeof createMineBestiaryEncounter>;
type Survival = Pick<ReturnType<typeof createUndergroundSurvival>, 'status' | 'damage'>;
type AcceptedFrame = Extract<MineEncounterFrame, { mode: 'survival' }>;
type AcceptedEncounter = Omit<AcceptedFrame, 'mode' | 'tick' | 'player'> & Readonly<{
  player: Omit<AcceptedFrame['player'], 'health' | 'maxHealth'>;
}>;
type Outcome = ReturnType<Encounter['advance']>;
type Band = NonNullable<Outcome['damageBand']>;
type Actors = ReturnType<Encounter['snapshot']>;
type Vitals = Readonly<{ damageScale: number }>;
type FrameKey = Readonly<{ playerId: string; tick: number; sequence: number }>;
type Pending = FrameKey & Readonly<{
  actors: Actors;
  accepted?: AcceptedEncounter;
  hit: Outcome['hit'];
  amount: number;
  damageBand?: Band;
}>;

type MineEncounterOptions = Readonly<{
  spawns: Parameters<typeof createMineBestiaryEncounter>[0];
  host: MineEncounterHost;
  survival: Survival;
  maxHealth: number;
  damageByBand: Readonly<Record<Band, number>>;
  // Only the movement and combat authority can provide an encounter sample and contact.
  readAcceptedEncounter(playerId: string): AcceptedEncounter | undefined;
  readVitals?(playerId: string): Vitals | undefined;
}>;

function sameFrame(a: FrameKey, b: FrameKey) {
  return a.tick === b.tick && a.playerId === b.playerId && a.sequence === b.sequence;
}

function sectionCleared(actors: Actors, section: AcceptedFrame['section']) {
  const assigned = actors.filter(actor => mineBestiary[actor.species].section === section);
  return assigned.length > 0 && assigned.every(actor => actor.phase === 'defeated');
}

/** Bridges one accepted actor frame to U-6; physical gate crossing stays with the movement host. */
export function createUndergroundMineEncounter(options: MineEncounterOptions) {
  const { maxHealth, survival } = options;
  const damageByBand = { ...options.damageByBand };
  if (!Number.isFinite(maxHealth) || maxHealth <= 0 ||
      ![damageByBand.light, damageByBand.medium].every(amount => Number.isFinite(amount) && amount > 0 && amount < maxHealth)) {
    throw new RangeError('An encounter needs authority-approved nonfatal monster damage bands');
  }
  const encounter = createMineBestiaryEncounter(options.spawns, options.host);
  let actors = encounter.snapshot();
  let pending: Pending | undefined;
  type Published = Readonly<{
    hit: Outcome['hit'];
    damage: number;
    damageBand?: Band;
    sectionCleared: boolean;
    mayPassClearedGate: boolean;
  }>;
  let last: (FrameKey & { result: Published }) | undefined;
  let publishing = false;

  function activeHealth(playerId: string) {
    const status = survival.status(playerId);
    if (status.health !== undefined && (!Number.isFinite(status.health) || status.health > maxHealth)) {
      throw new RangeError('The encounter and survival authority must share the same health scale');
    }
    return status.mode === 'survival' && status.connected && !status.down && !status.spawn &&
      status.health !== undefined && status.health > 0 ? status.health : undefined;
  }

  return {
    snapshot: () => structuredClone(actors),
    isSectionCleared(section: AcceptedFrame['section']) { return sectionCleared(actors, section); },
    advance(key: FrameKey): Published {
      if (!key.playerId || !Number.isSafeInteger(key.tick) || key.tick < 0 ||
          !Number.isSafeInteger(key.sequence) || key.sequence <= 0) throw new RangeError('Invalid accepted encounter frame');
      if (publishing) throw new Error('The encounter frame is already committing');
      if (last && key.tick === last.tick && sameFrame(last, key)) return last.result;
      if (pending && !sameFrame(pending, key)) throw new Error('Retry the pending encounter frame before advancing');
      if (!pending) {
        const health = activeHealth(key.playerId);
        const accepted = health === undefined ? undefined : options.readAcceptedEncounter(key.playerId);
        if (accepted && (!accepted.player.room ||
            ![accepted.player.at.east, accepted.player.at.north].every(Number.isFinite))) {
          throw new RangeError('Invalid authority-accepted encounter pose');
        }
        const damageScale = (accepted && options.readVitals?.(key.playerId)?.damageScale) ?? 1;
        if (!Number.isFinite(damageScale) || damageScale < 1 ||
            Math.max(damageByBand.light, damageByBand.medium) * damageScale >= maxHealth) {
          throw new RangeError('Invalid underground monster damage scale');
        }
        const result = accepted && health !== undefined
          ? encounter.advance({ ...accepted, tick: key.tick, mode: 'survival', player: { ...accepted.player, health, maxHealth } })
          : encounter.advance({ tick: key.tick, mode: 'peaceful' });
        pending = {
          ...key,
          actors: encounter.snapshot(),
          accepted: accepted && structuredClone(accepted),
          hit: result.hit,
          damageBand: result.damageBand,
          amount: health !== undefined && result.damageBand ? Math.min(health, damageByBand[result.damageBand] * damageScale) : 0,
        };
      }

      const frame = pending;
      publishing = true;
      try {
        const damage = frame.amount > 0 &&
          survival.damage(frame.playerId, { sequence: frame.sequence, kind: 'monster', amount: frame.amount }) ? frame.amount : 0;
        const cleared = frame.accepted !== undefined && sectionCleared(frame.actors, frame.accepted.section);
        const result = Object.freeze({
          hit: frame.hit, damage, damageBand: frame.damageBand, sectionCleared: cleared,
          mayPassClearedGate: cleared && activeHealth(frame.playerId) !== undefined,
        });
        actors = frame.actors;
        last = { ...key, result };
        pending = undefined;
        return result;
      } finally {
        publishing = false;
      }
    },
  };
}
