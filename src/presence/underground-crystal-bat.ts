type Variant = 'common' | 'pool-elite';
type Phase = 'roost' | 'circling' | 'diving' | 'resting' | 'defeated';

type Activity = Readonly<{
  belowNestDistance: number | null;
  noise: 'quiet' | 'sprint' | 'mine' | 'throw';
  enteredPool: boolean;
  minedAtPool: boolean;
}>;

const warningMs = 2_000;
const recoveryMs = 5_000;

/** Encounter rules. The cave host supplies accepted activity, projectile contacts and the dive path. */
export function createUndergroundCrystalBat(variant: Variant) {
  let phase: Phase = 'roost';
  let deadline: number | null = null;
  let lastAt = -Infinity;

  function acceptTime(now: number): boolean {
    if (!Number.isFinite(now) || now < lastAt) return false;
    lastAt = now;
    if (deadline !== null && now >= deadline) {
      phase = phase === 'circling' || phase === 'resting' ? 'diving' : phase;
      deadline = null;
    }
    return true;
  }

  return {
    read() { return { phase, hitsLeft: phase === 'defeated' ? 0 : 1, deadline }; },
    tick(now: number) { acceptTime(now); },
    observe(activity: Activity, now: number) {
      if (!acceptTime(now) || phase !== 'roost') return false;
      const { belowNestDistance, noise, enteredPool, minedAtPool } = activity;
      const woken = variant === 'pool-elite'
        ? enteredPool || minedAtPool
        : belowNestDistance !== null && belowNestDistance >= 0 && belowNestDistance <= 6 && noise !== 'quiet';
      if (!woken) return false;
      phase = 'circling';
      deadline = now + warningMs;
      return true;
    },
    finishDive(now: number) {
      if (!acceptTime(now) || phase !== 'diving') return false;
      phase = 'resting';
      deadline = now + recoveryMs;
      return true;
    },
    impact(id: string, tool: 'snowball' | 'pickaxe', now: number) {
      if (!acceptTime(now) || phase === 'defeated' || tool !== 'snowball' || !id.trim()) {
        return { kind: 'ignored' } as const;
      }
      phase = 'defeated';
      deadline = null;
      // R3-09 and R3-23 retain a one-hit bat and a larger yield of ordinary moonstone.
      return variant === 'pool-elite'
        ? { kind: 'defeated', effect: 'crystal-dust', loot: { mineral: 'moonstone', yield: 'large' } } as const
        : { kind: 'defeated', effect: 'crystal-dust' } as const;
    },
    returnToRoost(now: number) {
      if (!acceptTime(now) || phase === 'defeated') return false;
      phase = 'roost';
      deadline = null;
      return true;
    },
  };
}
