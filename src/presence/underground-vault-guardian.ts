export const undergroundVaultGuardianTiming = {
  riseMs: 3000,
  retreatMs: 10_000,
  sweepWarningMs: [1200, 1000, 800],
  throwWarningMs: 1000,
} as const;

type Stage = 1 | 2 | 3;
type Pose = 'kneeling' | 'rising' | 'fighting' | 'transitioning' | 'yielding' | 'yielded';
type Core = 'stone' | 'ice' | 'both' | 'neither';
type Point = readonly [east: number, north: number, height: number];
type GuardianHit = Readonly<{
  id: string;
  actorId: string;
  tool: 'pickaxe' | 'snowball';
  target: 'joint' | 'armour' | 'exposed-stone' | 'stone-core' | 'ice-core';
  plateId?: string;
}>;
type Occupancy = Readonly<{
  insideArena: boolean;
  crossedMidline: boolean;
  atHandCue: boolean;
  guardianHasSight: boolean;
}>;
type Attack = Readonly<{ id: string; kind: 'sweep' } | { id: string; kind: 'throw'; impact: Point }>;
type Warned = Attack & { readyAt: number };
type Options = Readonly<{
  now(): number;
  encounterId: string;
  partySize: number;
  soloStageHealth: number;
  pickDamage: number;
  snowDamage: number;
  glancingPickDamage: number;
  armourBreakHits: number;
  transitionMs: number;
  readCoreWindow(): Core;
  /** Commit world vault opening once. Failure leaves the encounter awaiting confirmation. */
  openVault(encounterId: string): 'opened' | 'already-open' | 'rejected';
}>;

/** Clamp damage already verified by geometry for one player in one physics frame. */
export function settleUndergroundVaultGuardianDamage(maxHealth: number,
  hits: readonly Readonly<{ attackId: string; damage: number }>[]) {
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) throw new RangeError('Invalid player max health');
  const strongest = new Map<string, number>();
  for (const { attackId, damage } of hits) {
    if (!attackId || !Number.isFinite(damage) || damage <= 0) continue;
    strongest.set(attackId, Math.max(strongest.get(attackId) ?? 0, Math.min(damage, maxHealth * .5)));
  }
  let damage = 0;
  for (const hit of strongest.values()) damage += hit;
  return Math.min(damage, maxHealth * .8);
}

/** One solo/party encounter. Arena crossing, aim, cover, and accepted targets come from the host. */
export function createUndergroundVaultGuardian(options: Options) {
  const { encounterId, partySize, soloStageHealth, pickDamage, snowDamage, glancingPickDamage,
    armourBreakHits, transitionMs } = options;
  const bornAt = options.now();
  const members = Math.min(partySize, 4);
  const stageHealth = soloStageHealth * (1 + .4 * (members - 1));
  const { riseMs, retreatMs, sweepWarningMs, throwWarningMs } = undergroundVaultGuardianTiming;
  if (!encounterId || !Number.isSafeInteger(partySize) || partySize < 1 ||
      !Number.isSafeInteger(armourBreakHits) || armourBreakHits < 1 ||
      ![stageHealth, pickDamage, snowDamage, glancingPickDamage, transitionMs].every(v => Number.isFinite(v) && v > 0) ||
      glancingPickDamage >= pickDamage || !Number.isFinite(bornAt)) throw new RangeError('Invalid guardian encounter');
  let pose: Pose = 'kneeling';
  let stage: Stage = 1;
  let stageRemaining = stageHealth;
  let latest = bornAt;
  let nextPoseAt = Infinity;
  let leftAt: number | undefined;
  let handCue = false;
  let opening = false;
  let warning: Warned | undefined;
  const damageIds = new Set<string>();
  const attackIds = new Set<string>();
  const armour = new Map<string, number>();

  function time() {
    const at = options.now();
    if (!Number.isFinite(at - bornAt) || at < latest) throw new RangeError('Guardian clock went backwards or became invalid');
    latest = at;
    return at;
  }

  function returnToDoor(restoreFullStage: boolean) {
    pose = 'kneeling';
    stageRemaining = restoreFullStage ? stageHealth : (stageRemaining + stageHealth) / 2;
    warning = undefined;
    handCue = false;
    leftAt = undefined;
    nextPoseAt = Infinity;
    armour.clear();
  }

  function advance(at: number) {
    if ((pose === 'rising' || pose === 'transitioning') && at >= nextPoseAt) pose = 'fighting';
    if (pose === 'fighting' && leftAt !== undefined && at - leftAt >= retreatMs && !warning) returnToDoor(false);
  }

  function updateOccupancy(contact: Occupancy) {
    const at = time();
    advance(at);
    if (contact.insideArena || contact.guardianHasSight) leftAt = undefined;
    else if (pose === 'rising' || pose === 'fighting' || pose === 'transitioning') leftAt ??= at;
    if (pose === 'kneeling' && contact.insideArena && contact.crossedMidline) {
      pose = 'rising';
      nextPoseAt = at + riseMs;
    }
    handCue = pose === 'rising' && contact.insideArena && contact.atHandCue;
  }

  function damageFor(hit: GuardianHit) {
    if (stage === 1) return hit.target === 'joint' && hit.tool === 'pickaxe' ? pickDamage : 0;
    if (stage === 2) {
      if (!hit.plateId) return 0;
      const snowHits = armour.get(hit.plateId) ?? 0;
      if (hit.target === 'exposed-stone') return snowHits >= armourBreakHits && hit.tool === 'pickaxe' ? pickDamage : 0;
      if (hit.target !== 'armour') return 0;
      if (hit.tool === 'pickaxe') return glancingPickDamage;
      armour.set(hit.plateId, Math.min(snowHits + 1, armourBreakHits));
      return snowDamage;
    }
    const core = options.readCoreWindow();
    if (hit.target === 'stone-core' && hit.tool === 'pickaxe' && (core === 'stone' || core === 'both')) return pickDamage;
    return hit.target === 'ice-core' && hit.tool === 'snowball' && (core === 'ice' || core === 'both') ? snowDamage : 0;
  }

  function hit(hit: GuardianHit) {
    const at = time();
    advance(at);
    if (!hit.id || !hit.actorId || (hit.tool !== 'pickaxe' && hit.tool !== 'snowball')) return { kind: 'ignored' } as const;
    const id = JSON.stringify([hit.actorId, hit.id]);
    if (damageIds.has(id)) return { kind: 'duplicate' } as const;
    if (pose === 'yielded' || pose === 'yielding') return { kind: 'ignored' } as const;
    damageIds.add(id);
    if (pose !== 'fighting' || leftAt !== undefined) return { kind: 'immune', effect: 'stone-sparks' } as const;
    const damage = Math.min(stageRemaining, damageFor(hit));
    if (damage === 0) return { kind: 'ineffective', effect: hit.tool === 'snowball' ? 'snow-puff' : 'stone-sparks' } as const;
    stageRemaining = Math.max(0, stageRemaining - damage);
    if (stageRemaining > 0) return { kind: 'damaged', damage } as const;

    warning = undefined;
    armour.clear();
    if (stage === 3) {
      pose = 'yielding';
      return { kind: 'yielding', damage } as const;
    }
    stage = stage === 1 ? 2 : 3;
    stageRemaining = stageHealth;
    pose = 'transitioning';
    nextPoseAt = at + transitionMs;
    return { kind: 'transitioning', damage, stage } as const;
  }

  function warnAttack(input: Attack) {
    const at = time();
    advance(at);
    if (pose !== 'fighting' || leftAt !== undefined || warning || !input.id || attackIds.has(input.id) ||
        (input.kind === 'throw' && (input.impact.length !== 3 || !input.impact.every(Number.isFinite)))) return;
    attackIds.add(input.id);
    warning = Object.freeze(input.kind === 'sweep' ? { id: input.id, kind: input.kind, readyAt: at + sweepWarningMs[stage - 1] }
      : { id: input.id, kind: input.kind, impact: Object.freeze([...input.impact]) as Point, readyAt: at + throwWarningMs });
    return warning;
  }

  function releaseAttack(id: string) {
    const at = time();
    advance(at);
    if (!warning || warning.id !== id || at < warning.readyAt || pose !== 'fighting') return;
    const attack = warning;
    warning = undefined;
    advance(at);
    return attack;
  }

  function summonPlan(alive: number) {
    advance(time());
    if (pose !== 'fighting' || stage === 1 || leftAt !== undefined || alive !== 0) return;
    return {
      cap: Math.min(5, stage + Math.floor((members - 1) / 2)),
      allowed: stage === 2 ? ['small-ice-golem'] as const : ['small-ice-golem', 'stone-monster'] as const,
    };
  }

  function retryAfterPartyWipe() {
    advance(time());
    if (pose !== 'rising' && pose !== 'fighting' && pose !== 'transitioning') return false;
    // The host clears spawned adds when it accepts the whole-party wipe.
    returnToDoor(true);
    return true;
  }

  function confirmYielded(doorwayClear: boolean) {
    time();
    if (!doorwayClear || pose !== 'yielding' || opening) return false;
    opening = true;
    try {
      const result = options.openVault(encounterId);
      if (result !== 'opened' && result !== 'already-open') return false;
      pose = 'yielded';
      return true;
    } finally {
      opening = false;
    }
  }

  return {
    updateOccupancy, hit, warnAttack, releaseAttack, summonPlan, retryAfterPartyWipe, confirmYielded,
    snapshot() {
      advance(time());
      return { pose, stage, stageRemaining, stageHealth, handCue: pose === 'rising' && handCue,
        coreWindow: pose === 'fighting' && stage === 3 ? options.readCoreWindow() : 'neither',
        warning,
        vaultDoorOpen: pose === 'yielded', coreChamberDoorOpen: false as const };
    },
  };
}
