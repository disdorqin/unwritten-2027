export const undergroundCrystalMimicCues = {
  breathing: { periodMs: 4000, expansion: .025, part: 'tip' },
  disguise: {
    core: 'subtle-warmth',
    footing: 'shallow-imprint',
    trueClusterFooting: 'broken-crystal-ring',
    pathOffsetMetres: [1, 2],
    chime: { rangeMetres: 1, pitch: 'high', intermittent: true, veryQuiet: true },
  },
  reveal: { gazeMs: 3000, unfoldMs: 1200, pauseMs: 500, sound: 'quiet-crystal-crackle' },
  combat: { pickaxeHits: 3, glowMs: 10_000 },
} as const;

type Weapon = 'snowball' | 'pickaxe';
type RevealSource = 'gaze' | Weapon;
type Phase = 'disguised' | 'unfolding' | 'pausing' | 'combat' | 'defeated';
type PhysicalHit = { attackId: string; actorId: string; weapon: Weapon };
type Drop<CrystalKind extends string> = Readonly<{ crystalKind: CrystalKind; grade: number }>;
type Recognition = Readonly<{
  kind: 'recognition'; id: string; mimicId: string; actorId: string; at: number; source: RevealSource;
}>;
type Defeat<CrystalKind extends string> = Readonly<{
  kind: 'defeat'; id: string; mimicId: string; actorId: string; at: number; drop: Drop<CrystalKind>;
}>;
type RevealResult = { kind: 'revealed'; damage: 0; event: Recognition };
type HitResult<CrystalKind extends string> = RevealResult
  | { kind: 'defeated'; damage: 1; event: Defeat<CrystalKind> }
  | { kind: 'damaged'; damage: 1; hitsRemaining: number }
  | { kind: 'ignored' | 'duplicate' | 'immune' | 'slowed'; damage: 0 };

type Options<CrystalKind extends string> = {
  id: string;
  crystalKind: CrystalKind;
  wildGrade: number;
  now(): number;
};

/** One encounter with a crystal mimic. The host supplies accepted sight, hits, and monotonic milliseconds. */
export function createUndergroundCrystalMimic<CrystalKind extends string>(options: Options<CrystalKind>) {
  const { id, crystalKind, wildGrade } = options;
  const bornAt = options.now();
  if (!id.trim() || !crystalKind.trim() || !Number.isSafeInteger(wildGrade) || wildGrade < 0 ||
      !Number.isSafeInteger(wildGrade + 1) || !Number.isFinite(bornAt)) {
    throw new RangeError('Crystal mimic requires a valid identity, crystal and clock');
  }

  const { breathing, disguise, reveal, combat } = undergroundCrystalMimicCues;
  const gazeStarts = new Map<string, number>();
  const hitIds = new Set<string>();
  let latest = bornAt;
  let hitsRemaining: number = combat.pickaxeHits;
  let recognition: Recognition | undefined;
  let defeat: Defeat<CrystalKind> | undefined;

  function time() {
    const at = options.now();
    if (!Number.isFinite(at - bornAt) || at < latest) throw new RangeError('Crystal mimic clock went backwards or became invalid');
    latest = at;
    return at;
  }

  function phaseAt(at: number): Phase {
    if (defeat) return 'defeated';
    if (!recognition) return 'disguised';
    const elapsed = at - recognition.at;
    if (elapsed < reveal.unfoldMs) return 'unfolding';
    if (elapsed < reveal.unfoldMs + reveal.pauseMs) return 'pausing';
    return 'combat';
  }

  function startReveal(actorId: string, source: RevealSource, at: number): RevealResult {
    // A single recognizer wins the transition. The stable ID lets the host record it idempotently.
    recognition = Object.freeze({ kind: 'recognition', id: id + ':recognition', mimicId: id, actorId, source, at });
    gazeStarts.clear();
    return { kind: 'revealed', damage: 0, event: recognition };
  }

  /** The host reports actual uninterrupted aim and reports loss of sight or disconnection as false. */
  function observeSight(observerId: string, clear: boolean): RevealResult | { kind: 'tracking'; gazeMs: number } | { kind: 'ignored' } {
    const at = time();
    if (recognition || !observerId.trim()) return { kind: 'ignored' };
    if (!clear) {
      gazeStarts.delete(observerId);
      return { kind: 'ignored' };
    }
    const since = gazeStarts.get(observerId) ?? at;
    gazeStarts.set(observerId, since);
    const gazeMs = at - since;
    return gazeMs >= reveal.gazeMs ? startReveal(observerId, 'gaze', at) : { kind: 'tracking', gazeMs };
  }

  /** Forward only confirmed hits. Replaying an actor's attack ID cannot do damage after the reveal. */
  function hit({ actorId, attackId, weapon }: PhysicalHit): HitResult<CrystalKind> {
    const at = time();
    if (!actorId.trim() || !attackId.trim() || (weapon !== 'snowball' && weapon !== 'pickaxe')) {
      return { kind: 'ignored', damage: 0 };
    }
    const hitId = JSON.stringify([actorId, attackId]);
    if (hitIds.has(hitId)) return { kind: 'duplicate', damage: 0 };
    const phase = phaseAt(at);
    if (phase === 'defeated') return { kind: 'ignored', damage: 0 };
    hitIds.add(hitId);
    if (phase === 'disguised') return startReveal(actorId, weapon, at);
    if (phase !== 'combat') return { kind: 'immune', damage: 0 };
    if (weapon === 'snowball') return { kind: 'slowed', damage: 0 };

    hitsRemaining--;
    if (hitsRemaining > 0) return { kind: 'damaged', damage: 1, hitsRemaining };
    const drop = Object.freeze({ crystalKind, grade: wildGrade + 1 });
    defeat = Object.freeze({ kind: 'defeat', id: id + ':defeat', mimicId: id, actorId, at, drop });
    hitIds.clear();
    return { kind: 'defeated', damage: 1, event: defeat };
  }

  function sample(distanceMetres?: number) {
    const at = time();
    const phase = phaseAt(at);
    const timeInCycle = ((at - bornAt) % breathing.periodMs) / breathing.periodMs;
    const tipExpansion = breathing.expansion * (1 - Math.cos(2 * Math.PI * timeInCycle)) / 2;
    return {
      phase,
      breathScale: phase === 'disguised' ? 1 + tipExpansion : 1,
      unfoldProgress: recognition ? Math.min(1, (at - recognition.at) / reveal.unfoldMs) : 0,
      canAttack: phase === 'combat',
      chimeEligible: phase === 'disguised' && distanceMetres !== undefined &&
        distanceMetres >= 0 && distanceMetres <= disguise.chime.rangeMetres,
      hitsRemaining,
      glowOpacity: defeat ? Math.max(0, 1 - (at - defeat.at) / combat.glowMs) : 0,
      drop: defeat?.drop,
      recognition,
      defeat,
    };
  }

  return { sample, observeSight, hit };
}
