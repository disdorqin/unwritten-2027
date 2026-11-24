import {
  applyPumpOffset, baseLevelForPhase, nightOrdinalAt, waterPhaseForNight,
  type WaterLevel, type WaterPhase,
} from '../shared/underground-water.js';

/**
 * The single server-side holder of tonight's river state (design:
 * 地下重入变化 — the state lives at one point on the presence side).
 * The natural phase derives from the beacon night ordinal; the
 * pump-house fight records a temporary offset against the CURRENT
 * night only — when the ordinal rolls (dawn), the offset is gone and
 * the rhythm owns the level again.
 */
export function createUndergroundWaterState(host: Readonly<{
  dawnEpoch: number;
  now: () => number;
}>) {
  let offset = 0;
  let offsetNight = -1;

  function tonight() {
    const ordinal = nightOrdinalAt(host.now(), host.dawnEpoch);
    if (ordinal !== offsetNight) {
      offset = 0;
      offsetNight = ordinal;
    }
    const phase: WaterPhase = waterPhaseForNight(ordinal);
    const baseLevel: WaterLevel = baseLevelForPhase(phase);
    return {
      nightOrdinal: ordinal,
      phase,
      baseLevel,
      pumpOffset: offset,
      level: applyPumpOffset(baseLevel, offset),
    };
  }

  /** Pump-house action: shift tonight's water by one step (+1 raises,
   * -1 lowers). Returns the effective level after the shift. The stored
   * offset is bounded to the river's expressive range, so pumping at a
   * physical end cannot bank invisible shifts. */
  function shiftPump(direction: 1 | -1): WaterLevel {
    tonight();
    offset = Math.min(2, Math.max(-2, offset + direction));
    return tonight().level;
  }

  return { tonight, shiftPump };
}

export type UndergroundWaterState = ReturnType<typeof createUndergroundWaterState>;
