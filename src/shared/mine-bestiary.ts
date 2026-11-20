type Point = Readonly<{ east: number; north: number }>;
type Counter = 'snowball' | 'pickaxe';
type Stage = 'rest' | 'peek' | 'chase' | 'orbit' | 'windup' | 'recover' | 'retreat' | 'rebuild' | 'defeated';
type Section = 'mine' | 'crystal-cave';
type DamageBand = 'light' | 'medium';
type Action = 'quiet' | 'walk' | 'crouch' | 'run' | 'scoop-snow' | 'mine' | 'throw-snowball' | 'direct-lamp';

/** The five inhabitants of the first two segments. U-3 owns the mimic; U-5 owns the keeper. */
const manifest = {
  'snow-clump': { section: 'mine', site: 'shallow-snow', counters: ['snowball'], hits: 1, band: 'light' },
  'skeleton-miner': { section: 'mine', site: 'workface', counters: ['pickaxe'], hits: 2, band: 'medium' },
  'zombie-miner': { section: 'mine', site: 'deep-mine', counters: ['pickaxe'], hits: 3, band: 'medium' },
  'rock-snake': { section: 'mine', site: 'waterline', counters: ['snowball', 'pickaxe'], hits: 1, band: 'light' },
  'crystal-bat': { section: 'crystal-cave', site: 'ceiling', counters: ['snowball'], hits: 1, band: 'light' },
} as const;
for (const rule of Object.values(manifest)) {
  Object.freeze(rule.counters);
  Object.freeze(rule);
}
export const mineBestiary = Object.freeze(manifest);

export type MineCreature = keyof typeof mineBestiary;
type Habitat = (typeof mineBestiary)[MineCreature]['site'];
type CreatureSpawn = Readonly<{ id: string; species: MineCreature; habitat: Habitat; room: string; at: Point }>;

type UndergroundPlayer = Readonly<{
  room: string;
  at: Point;
  action: Action;
  health: number;
  maxHealth: number;
}>;

/** Only an accepted U-2/U-6 host supplies movement, perception and combat contacts. */
export type MineEncounterHost = Readonly<{
  hasSpawnSite(section: Section, room: string, habitat: Habitat, point: Point): boolean;
  moveAllowed(id: string, room: string, from: Point, to: Point): boolean;
  seesPlayer(id: string, player: UndergroundPlayer): boolean;
  hearsMining(id: string, player: UndergroundPlayer): boolean;
  /** True inside a registered campfire or cold-flame safety zone. */
  insideCampfire(room: string, point: Point): boolean;
}>;

export type MineEncounterFrame = Readonly<{ tick: number }> & (
  | Readonly<{ mode: 'peaceful' }>
  | Readonly<{
      mode: 'survival'; section: Section; player: UndergroundPlayer;
      /** One already accepted tool-to-creature contact, independent of mere intent. */
      contact?: Readonly<{ target: string; tool: Counter }>;
      /** Host-resolved snowball ground contact on this tick, independent of the thrower's pose. */
      snowballLanding?: Readonly<{ room: string; at: Point }>;
    }>
);

type Behavior = { speed: number; attackRange: number; windup: number; recovery: number };
// Provisional 10 Hz fixture tuning. The source commits to damage bands, not fixed point values.
const tuning: Readonly<Record<MineCreature, Behavior>> = {
  'snow-clump': { speed: 3.25, attackRange: 0.85, windup: 2, recovery: 30 },
  'skeleton-miner': { speed: 1.7, attackRange: 1.15, windup: 4, recovery: 12 },
  'zombie-miner': { speed: 1.05, attackRange: 1.5, windup: 8, recovery: 14 },
  'rock-snake': { speed: 3.6, attackRange: 0.95, windup: 2, recovery: 8 },
  'crystal-bat': { speed: 3.2, attackRange: 1.15, windup: 6, recovery: 10 },
};

export const mineEncounterDamageFraction: Readonly<Record<DamageBand, number>> = Object.freeze({ light: .08, medium: .16 });
const damageRank: Readonly<Record<DamageBand, number>> = { light: 1, medium: 2 };
const inCave = new Set<Action>(['mine', 'run', 'throw-snowball', 'direct-lamp']);
const snakeVibrationRange = 6;
const snakeLandingProbeTicks = 8;
// Candidate values at 10 Hz. Followers copy the original disturbance with a small positional bias.
const snowNeighbourRange = 3.2;
const snowFollowDelay = 3;
const snowCollisionDistance = .45;
type SnowRoll = Readonly<{ starts: number; target: Point }>;

type Creature = {
  spawn: CreatureSpawn; at: Point; phase: Stage; until: number; hits: number; patrolTarget: Point; ringStep: number;
  probeTarget?: Point;
  snowRoll?: SnowRoll;
};

function distance(a: Point, b: Point) {
  return Math.hypot(a.east - b.east, a.north - b.north);
}

function advancePoint(from: Point, to: Point, metres: number): Point {
  const length = distance(from, to);
  if (length <= metres) return { ...to };
  return { east: from.east + (to.east - from.east) * metres / length, north: from.north + (to.north - from.north) * metres / length };
}

// KD4 additionally holds the fixed mining-room patrol outside its own campfire ring.
function avoidsFire(species: MineCreature) {
  return species === 'snow-clump' || species === 'zombie-miner' || species === 'skeleton-miner';
}

export function createMineBestiaryEncounter(spawns: readonly CreatureSpawn[], host: MineEncounterHost) {
  const actors = new Map<string, Creature>();
  const counts = new Map<string, number>();
  for (const spawn of spawns) {
    const rule = mineBestiary[spawn.species];
    if (actors.has(spawn.id) || !spawn.id || !spawn.room || rule.site !== spawn.habitat ||
        !Number.isFinite(spawn.at.east) || !Number.isFinite(spawn.at.north) ||
        !host.hasSpawnSite(rule.section, spawn.room, spawn.habitat, spawn.at) ||
        host.insideCampfire(spawn.room, spawn.at)) {
      throw new Error('An accepted underground spawn site is required.');
    }
    const key = `${spawn.species}/${spawn.room}`;
    const count = 1 + (counts.get(key) ?? 0);
    counts.set(key, count);
    if ((spawn.species === 'snow-clump' && count > 5) || (spawn.species === 'crystal-bat' && count > 15)) {
      throw new Error('The encounter exceeds the room creature cap.');
    }
    const origin = { ...spawn.at };
    actors.set(spawn.id, { spawn: { ...spawn, at: origin }, at: origin, phase: 'rest', until: 0, hits: rule.hits, patrolTarget: origin, ringStep: 0 });
  }

  let lastTick = -1;

  function move(actor: Creature, destination: Point, metres: number) {
    const proposed = advancePoint(actor.at, destination, metres);
    if ((avoidsFire(actor.spawn.species) && host.insideCampfire(actor.spawn.room, proposed)) ||
        !host.moveAllowed(actor.spawn.id, actor.spawn.room, actor.at, proposed)) return false;
    actor.at = proposed;
    return true;
  }

  function prepareSnowRolls(clumps: readonly Creature[], player: UndergroundPlayer, tick: number) {
    if (clumps.length === 0 || player.action !== 'scoop-snow' || host.insideCampfire(player.room, player.at)) return;
    const ready = clumps.filter(actor => !actor.snowRoll &&
      (actor.phase === 'rest' || (actor.phase === 'rebuild' && tick >= actor.until)));
    ready.sort((a, b) => distance(a.at, player.at) - distance(b.at, player.at) || a.spawn.id.localeCompare(b.spawn.id));
    for (const leader of ready) {
      if (leader.snowRoll || distance(leader.at, player.at) > 8 || !host.seesPlayer(leader.spawn.id, player)) continue;
      leader.snowRoll = { starts: tick, target: { ...player.at } };
      const neighbours = ready.filter(actor => !actor.snowRoll && distance(actor.at, leader.at) <= snowNeighbourRange);
      neighbours.sort((a, b) => distance(a.at, leader.at) - distance(b.at, leader.at) || a.spawn.id.localeCompare(b.spawn.id));
      for (const [index, actor] of neighbours.slice(0, 2).entries()) {
        actor.snowRoll = {
          starts: tick + snowFollowDelay * (index + 1),
          target: {
            east: player.at.east + (actor.at.east - leader.at.east) * .1,
            north: player.at.north + (actor.at.north - leader.at.north) * .1,
          },
        };
      }
    }
  }

  function rebuildSnowClump(actor: Creature, tick: number) {
    actor.phase = 'rebuild';
    actor.until = tick + tuning['snow-clump'].recovery;
    actor.snowRoll = undefined;
  }

  function resolveSnowCollisions(previous: ReadonlyMap<Creature, Point>, tick: number) {
    const rolling = [...previous].filter(([actor]) => actor.phase === 'chase');
    const scattered = new Set<Creature>();
    for (const [index, [actor, start]] of rolling.entries()) {
      for (const [other, otherStart] of rolling.slice(index + 1)) {
        // Compare both rolls at the same time within this tick, including crossings between samples.
        const east = start.east - otherStart.east;
        const north = start.north - otherStart.north;
        const deltaEast = actor.at.east - other.at.east - east;
        const deltaNorth = actor.at.north - other.at.north - north;
        const travelSquared = deltaEast ** 2 + deltaNorth ** 2;
        const closest = travelSquared === 0 ? 0 : -(east * deltaEast + north * deltaNorth) / travelSquared;
        if (closest <= 0) continue;
        const time = Math.min(1, closest);
        if (Math.hypot(east + time * deltaEast, north + time * deltaNorth) > snowCollisionDistance) continue;
        scattered.add(actor);
        scattered.add(other);
      }
    }
    for (const actor of scattered) rebuildSnowClump(actor, tick);
  }

  function runCreature(actor: Creature, frame: Extract<MineEncounterFrame, { mode: 'survival' }>, openDive: boolean): DamageBand | undefined {
    const { player, snowballLanding, tick } = frame;
    const { species, id, room, at: origin } = actor.spawn;
    const { speed, attackRange, windup, recovery } = tuning[species];
    const rule = mineBestiary[species];
    if (rule.section !== frame.section || actor.phase === 'defeated') return;
    const sameRoom = player.room === room;
    const range = distance(actor.at, player.at);
    const safeFire = host.insideCampfire(room, player.at);

    if (actor.phase === 'rebuild' || actor.phase === 'recover') {
      if (tick < actor.until) return;
      actor.phase = species === 'rock-snake' ? 'retreat' : species === 'crystal-bat' && sameRoom ? 'orbit' : 'rest';
      if (actor.phase === 'orbit') actor.ringStep = 15;
    }
    if (actor.phase === 'windup') {
      if (tick < actor.until) return;
      if (species === 'snow-clump') rebuildSnowClump(actor, tick);
      else {
        actor.phase = 'recover';
        actor.until = tick + recovery;
      }
      if (sameRoom && !safeFire && range <= attackRange && host.seesPlayer(id, player)) return rule.band;
      return;
    }
    const idleSnake = species === 'rock-snake' && (actor.phase === 'rest' || actor.phase === 'peek');
    const nearbyLanding = idleSnake && snowballLanding?.room === room &&
      distance(actor.at, snowballLanding.at) <= snakeVibrationRange ? snowballLanding.at : undefined;
    const investigatingLanding = idleSnake && (nearbyLanding !== undefined || actor.probeTarget !== undefined);
    if (!sameRoom && species !== 'skeleton-miner' && !investigatingLanding) {
      actor.phase = 'retreat';
      actor.snowRoll = undefined;
    }
    const heardMining = species === 'skeleton-miner' && !safeFire && player.action === 'mine' &&
      range <= 12 && host.hearsMining(id, player);
    if (actor.phase === 'retreat' && !heardMining) {
      move(actor, origin, speed / 10);
      if (distance(actor.at, origin) <= 1e-6) actor.phase = 'rest';
      return;
    }
    if (safeFire && avoidsFire(species)) {
      actor.phase = 'retreat';
      actor.snowRoll = undefined;
      return;
    }

    const see = sameRoom && host.seesPlayer(id, player);
    if (species === 'skeleton-miner') {
      if (heardMining) {
        const previousTarget = actor.phase === 'retreat' ? actor.at : actor.patrolTarget;
        actor.patrolTarget = advancePoint(previousTarget, player.at, 1);
        actor.phase = 'chase';
      } else if (actor.phase === 'chase' && !see && distance(actor.at, actor.patrolTarget) <= 1e-6) {
        actor.patrolTarget = origin;
        actor.phase = 'retreat';
        return;
      }
    } else if (species === 'crystal-bat') {
      if (actor.phase === 'rest' && sameRoom && distance(origin, player.at) <= 6 && inCave.has(player.action)) {
        actor.phase = 'orbit';
        actor.ringStep = 0;
      }
    } else if (species === 'rock-snake') {
      if (idleSnake && sameRoom && range <= snakeVibrationRange && player.action === 'run') {
        actor.phase = 'chase';
        actor.probeTarget = undefined;
      } else if (idleSnake) {
        if (nearbyLanding) {
          actor.phase = 'peek';
          actor.until = tick + snakeLandingProbeTicks;
          actor.probeTarget = { ...nearbyLanding };
        } else if (!actor.probeTarget && sameRoom && range <= snakeVibrationRange && player.action === 'walk') {
          actor.phase = 'peek';
          actor.until = tick + 3;
        }
        if (actor.phase === 'peek' && tick >= actor.until) {
          actor.phase = actor.probeTarget ? 'retreat' : 'rest';
          actor.probeTarget = undefined;
        } else if (actor.probeTarget) {
          move(actor, actor.probeTarget, speed / 10);
        }
      }
    } else if (species === 'snow-clump') {
      if (actor.phase === 'rest' && actor.snowRoll && tick >= actor.snowRoll.starts) actor.phase = 'chase';
    } else if (species === 'zombie-miner') {
      const follows = (see && range <= 8 && player.action === 'run') ||
        (player.action === 'mine' && range <= 6 && host.hearsMining(id, player));
      if (follows) {
        actor.phase = 'chase';
        actor.until = tick + 16;
      }
      if (actor.phase === 'chase' && tick >= actor.until) {
        actor.phase = 'retreat';
        return;
      }
    }

    if (actor.phase === 'orbit') {
      const phase = ++actor.ringStep * .22;
      const path = { east: origin.east + Math.cos(phase) * 2, north: origin.north + Math.sin(phase) * 2 };
      move(actor, path, speed / 10);
      if (actor.ringStep >= 29 && openDive && see && range <= 6) {
        actor.phase = 'chase';
      }
      return;
    }
    if (actor.phase !== 'chase') return;
    if (see && range <= attackRange) {
      actor.phase = 'windup';
      actor.until = tick + windup;
      return;
    }
    if (actor.snowRoll) {
      const target = actor.snowRoll.target;
      if (distance(actor.at, target) <= 1e-6 || !move(actor, target, speed / 10)) rebuildSnowClump(actor, tick);
      return;
    }
    move(actor, species === 'skeleton-miner' ? actor.patrolTarget : player.at, speed / 10);
  }

  return {
    snapshot() {
      return [...actors.values()].map(actor => ({ id: actor.spawn.id, species: actor.spawn.species,
        room: actor.spawn.room, phase: actor.phase, remainingHits: actor.hits, at: { ...actor.at } }));
    },
    advance(frame: MineEncounterFrame) {
      if (!Number.isSafeInteger(frame.tick) || frame.tick <= lastTick) throw new Error('Each encounter tick must be new.');
      lastTick = frame.tick;
      if (frame.mode === 'peaceful') {
        for (const actor of actors.values()) if (actor.phase === 'rest') actor.snowRoll = undefined;
        return { damage: 0, damageBand: undefined, hit: 'ignored' } as const;
      }
      const { player, contact, section } = frame;
      if (!Number.isFinite(player.health) || !Number.isFinite(player.maxHealth) ||
          player.health < 0 || player.maxHealth <= 0 || player.health > player.maxHealth) throw new Error('Invalid host health.');

      let hit: 'ignored' | 'wrong-tool' | 'damaged' | 'defeated' = 'ignored';
      const target = contact && actors.get(contact.target);
      if (contact && target && target.spawn.room === player.room && target.phase !== 'defeated' &&
          mineBestiary[target.spawn.species].section === section) {
        const counters: readonly Counter[] = mineBestiary[target.spawn.species].counters;
        if (!counters.includes(contact.tool)) hit = 'wrong-tool';
        else if (--target.hits === 0) { target.phase = 'defeated'; hit = 'defeated'; }
        else hit = 'damaged';
      }

      const clumps = section === 'mine' ? [...actors.values()].filter(actor =>
        actor.spawn.species === 'snow-clump' && actor.spawn.room === player.room) : [];
      prepareSnowRolls(clumps, player, frame.tick);
      const previousSnowPositions = new Map(clumps.map(actor => [actor, actor.at]));
      let damageBand: DamageBand | undefined;
      const divingByRoom = new Map<string, number>();
      const isDiving = (a: Creature) => a.spawn.species === 'crystal-bat' && (a.phase === 'chase' || a.phase === 'windup');
      for (const actor of actors.values()) if (isDiving(actor)) {
        const room = actor.spawn.room;
        divingByRoom.set(room, (divingByRoom.get(room) ?? 0) + 1);
      }
      for (const actor of actors.values()) {
        const room = actor.spawn.room;
        const before = isDiving(actor);
        const count = divingByRoom.get(room) ?? 0;
        const candidate = runCreature(actor, frame, count < 2);
        if (before !== isDiving(actor)) divingByRoom.set(room, count + (before ? -1 : 1));
        if (candidate && (!damageBand || damageRank[candidate] > damageRank[damageBand])) damageBand = candidate;
      }
      resolveSnowCollisions(previousSnowPositions, frame.tick);
      return { damage: damageBand ? Math.min(player.health, player.maxHealth * mineEncounterDamageFraction[damageBand]) : 0,
        damageBand, hit } as const;
    },
  };
}
