/**
 * Crater surface play rules (branch window B; design: 坑区地表玩法包
 * 六件套). Pure state machines for the hands-on tasks at the crater's
 * surface story points. Canon boundaries: everything is solo-
 * completable, nothing here produces currency or materials, and all
 * feedback lives in the world (the host renders needle/bell/switch
 * states from these snapshots) — no popups, no cards.
 */

/* ---- Smelting workshop: work the bellows, hold the needle ------- */

export const bellowsBand = { low: 0.55, high: 0.8, holdMs: 10_000, decayPerSecond: 0.22, pumpGain: 0.16 } as const;

export function createBellows() {
  let pressure = 0.3;
  let heldMs = 0;
  let cast = false;
  return {
    pump() { pressure = Math.min(1, pressure + bellowsBand.pumpGain); },
    tick(dtMs: number) {
      pressure = Math.max(0, pressure - bellowsBand.decayPerSecond * (dtMs / 1000));
      if (!cast && pressure >= bellowsBand.low && pressure <= bellowsBand.high) {
        heldMs += dtMs;
        if (heldMs >= bellowsBand.holdMs) cast = true;
      } else {
        heldMs = 0;
      }
    },
    state: () => ({ pressure, heldMs, inBand: pressure >= bellowsBand.low && pressure <= bellowsBand.high, cast }),
    reset() { pressure = 0.3; heldMs = 0; cast = false; },
  };
}

/* ---- Instrument workshop: calibrate three dials ----------------- */

/** Dial targets derive from the game day so every client agrees; no clock is invented here. */
export function dialTargets(dayIndex: number): readonly [number, number, number] {
  const seed = (dayIndex * 2654435761) >>> 0;
  return [0, 1, 2].map(i => (((seed >> (i * 8)) & 0xff) / 255) * Math.PI * 2) as unknown as readonly [number, number, number];
}

export const dialLockTolerance = 0.09;

export function createCalibration(dayIndex: number) {
  const targets = dialTargets(dayIndex);
  const angles = [0, 0, 0];
  const locked = () => angles.map((angle, i) => {
    const diff = Math.atan2(Math.sin(angle - targets[i]!), Math.cos(angle - targets[i]!));
    return Math.abs(diff) <= dialLockTolerance;
  });
  return {
    turn(dial: 0 | 1 | 2, delta: number) { angles[dial] = (angles[dial]! + delta) % (Math.PI * 2); },
    locked,
    aligned: () => locked().every(Boolean),
    angles: () => [...angles],
  };
}

/* ---- Supply station: sort the ore baskets ----------------------- */

export type OreKind = 'stardust' | 'scrap' | 'rubble';
export const sortBasketCapacity = 6;

export function createSorting() {
  const bins: Record<OreKind, number> = { stardust: 0, scrap: 0, rubble: 0 };
  let sortedTotal = 0;
  let mistakes = 0;
  return {
    /** Place one carried lump into a bin. Right bin fills it; wrong bin is refused and counted. */
    place(kind: OreKind, bin: OreKind): 'sorted' | 'refused' | 'bin-full' {
      if (kind !== bin) { mistakes++; return 'refused'; }
      if (bins[bin] >= sortBasketCapacity) return 'bin-full';
      bins[bin]++; sortedTotal++;
      return 'sorted';
    },
    state: () => ({ bins: { ...bins }, sortedTotal, mistakes, allSealed: (Object.values(bins) as number[]).every(n => n >= sortBasketCapacity) }),
  };
}

/* ---- Ore yard: the big scale ------------------------------------ */

/** A lump's weight is a fact of the lump (host-seeded by its id), never rolled at weigh time. */
export function lumpWeightKg(lumpId: number): number {
  const seed = (lumpId * 2246822519) >>> 0;
  return Math.round((2 + ((seed % 1600) / 100)) * 10) / 10; // 2.0–17.9 kg
}

export function createScale() {
  let bestKg = 0;
  return {
    weigh(lumpId: number): { kg: number; isBest: boolean } {
      const kg = lumpWeightKg(lumpId);
      const isBest = kg > bestKg;
      if (isBest) bestKg = kg;
      return { kg, isBest };
    },
    bestKg: () => bestKg,
  };
}

/* ---- Crater station: the track switch ---------------------------- */

export function createTrackSwitch() {
  let thrown = false;
  return {
    pull() { thrown = !thrown; return thrown; },
    /** The day boundary resets the points (host calls at dawn). */
    dawnReset() { thrown = false; },
    thrown: () => thrown,
    /** Which siding the next empty train takes. */
    nextTrainRoute: () => (thrown ? 'siding' : 'main'),
  };
}
