// 前山三站主线。路径净空与站位由线路模块提供，时钟只消费实测绳长。
const speedMetresPerSecond = 5;
const midStationDwellMs = 10_000;

type CableDirection = 'up' | 'down';
type CableStation = 'base' | 'middle' | 'summit';
type CabinState = {
  direction: CableDirection;
  distanceMetres: number;
  station: CableStation | null;
};

export function createNorthRidgeCableClock(lowerMetres: number, upperMetres: number, epochMs: number, terminalDwellMs = 0) {
  if (!Number.isFinite(lowerMetres) || lowerMetres <= 0 ||
      !Number.isFinite(upperMetres) || upperMetres <= 0 || !Number.isFinite(epochMs) || !Number.isFinite(terminalDwellMs) || terminalDwellMs < 0) {
    throw new RangeError('The cable clock requires positive measured spans and a finite shared epoch.');
  }

  const metresPerMs = speedMetresPerSecond / 1000;
  const lowerMs = lowerMetres / metresPerMs;
  const upperMs = upperMetres / metresPerMs;
  const totalMetres = lowerMetres + upperMetres;
  const oneWayMs = terminalDwellMs + lowerMs + midStationDwellMs + upperMs;
  const cycleMs = 2 * oneWayMs;

  function cabinAt(phaseMs: number): CabinState {
    if (phaseMs < oneWayMs) {
      if (phaseMs < terminalDwellMs) return { direction: 'up', distanceMetres: 0, station: 'base' };
      phaseMs -= terminalDwellMs;
      if (phaseMs < lowerMs) {
        return { direction: 'up', distanceMetres: phaseMs * metresPerMs, station: phaseMs === 0 ? 'base' : null };
      }
      if (phaseMs <= lowerMs + midStationDwellMs) {
        return { direction: 'up', distanceMetres: lowerMetres, station: 'middle' };
      }
      return { direction: 'up', distanceMetres: totalMetres - (oneWayMs - terminalDwellMs - phaseMs) * metresPerMs, station: null };
    }

    const downMs = phaseMs - oneWayMs - terminalDwellMs;
    if (downMs < 0) return { direction: 'down', distanceMetres: totalMetres, station: 'summit' };
    if (downMs < upperMs) {
      return { direction: 'down', distanceMetres: totalMetres - downMs * metresPerMs, station: downMs === 0 ? 'summit' : null };
    }
    if (downMs <= upperMs + midStationDwellMs) {
      return { direction: 'down', distanceMetres: lowerMetres, station: 'middle' };
    }
    return { direction: 'down', distanceMetres: (cycleMs - phaseMs) * metresPerMs, station: null };
  }

  return {
    oneWayMs,
    cycleMs,
    cabinsAt(nowMs: number): readonly [CabinState, CabinState] {
      if (!Number.isFinite(nowMs)) throw new RangeError('The cable clock requires finite world time.');
      const remainder = (nowMs - epochMs) % cycleMs;
      const phaseMs = remainder < 0 ? remainder + cycleMs : remainder;
      const oppositeMs = phaseMs < oneWayMs ? phaseMs + oneWayMs : phaseMs - oneWayMs;
      return [cabinAt(phaseMs), cabinAt(oppositeMs)];
    },
  };
}
