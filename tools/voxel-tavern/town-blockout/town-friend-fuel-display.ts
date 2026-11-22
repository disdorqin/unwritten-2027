import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
} from 'three';
import {
  flightBurnRate,
  fuelSecondsPerStardustOre,
  type FlightThrottle,
} from '../../../src/shared/flight-thrust.js';

export { fuelSecondsPerStardustOre, type FlightThrottle };

export type FuelStatusTier = 'full' | 'half' | 'normal' | 'low' | 'empty';
export type FuelWarningLevel = 'none' | 'caution' | 'critical';

export interface FuelDisplaySnapshot {
  fuelSeconds: number;
  maxFuelSeconds: number;
  canCount: number;
  percentage: number;
  status: FuelStatusTier;
  throttle: FlightThrottle;
  burnRate: number;
  estimatedEnduranceSeconds: number;
  warningLevel: FuelWarningLevel;
  prompt: string;
  shortWord: string;
  gaugeText: string;
  rateText: string;
  indicatorColor: number;
}

export const FUEL_DISPLAY_CONSTANTS = {
  maxFuelSeconds: fuelSecondsPerStardustOre, // 600s per ore / can
  thresholds: {
    fullRatio: 0.9,     // >= 540s
    halfMinRatio: 0.4,  // 240s
    halfMaxRatio: 0.6,  // 360s
    lowMaxRatio: 0.4,   // <= 40%: 10-40% 原落 normal 无警告，属缺口
    criticalSeconds: 15,// <= 15s
  },
  colors: {
    full: 0x82d9a9,      // soft bright green
    normal: 0x69c09c,    // tranquil green
    half: 0xdfbd83,      // warm golden sand
    low: 0xe59866,       // caution amber
    empty: 0xd9534f,     // critical soft red / off
    housing: 0x2b3844,   // matte dark alloy
    accent: 0xd5ec99,    // stardust glow tint
  },
  shortWords: {
    full: '充盈',
    half: '半余',
    normal: '平稳',
    low: '偏低',
    empty: '耗尽',
  },
  prompts: {
    full: '星尘充盈 · 动力就绪',
    half: '余量过半 · 巡航平稳',
    normal: '星尘平稳燃烧',
    low: '星尘偏低 · 准备滑翔',
    empty: '星尘告罄 · 滑翔降落',
  },
} as const;

/**
 * Pure evaluation function for the fuel presentation layer.
 * Evaluates fuel seconds, throttle, consumption rate, remaining endurance and world prompts.
 */
export function evaluateFuelDisplay(
  fuelSecondsInput: number,
  throttle: FlightThrottle = 'off',
  maxFuel: number = FUEL_DISPLAY_CONSTANTS.maxFuelSeconds,
): FuelDisplaySnapshot {
  const safeMax = Math.max(1, Number.isFinite(maxFuel) ? maxFuel : FUEL_DISPLAY_CONSTANTS.maxFuelSeconds);
  const clampedSeconds = Math.max(0, Math.min(safeMax, Number.isFinite(fuelSecondsInput) ? fuelSecondsInput : 0));
  const percentage = Math.round((clampedSeconds / safeMax) * 1000) / 10;
  const canCount = Math.round((clampedSeconds / FUEL_DISPLAY_CONSTANTS.maxFuelSeconds) * 100) / 100;
  const burnRate = flightBurnRate[throttle] ?? 0;

  let status: FuelStatusTier;
  let warningLevel: FuelWarningLevel;
  let indicatorColor: number;

  if (clampedSeconds <= 0.001) {
    status = 'empty';
    warningLevel = 'critical';
    indicatorColor = FUEL_DISPLAY_CONSTANTS.colors.empty;
  } else if (percentage <= FUEL_DISPLAY_CONSTANTS.thresholds.lowMaxRatio * 100) {
    status = 'low';
    warningLevel = clampedSeconds <= FUEL_DISPLAY_CONSTANTS.thresholds.criticalSeconds ? 'critical' : 'caution';
    indicatorColor = FUEL_DISPLAY_CONSTANTS.colors.low;
  } else if (percentage >= FUEL_DISPLAY_CONSTANTS.thresholds.fullRatio * 100) {
    status = 'full';
    warningLevel = 'none';
    indicatorColor = FUEL_DISPLAY_CONSTANTS.colors.full;
  } else if (
    percentage > FUEL_DISPLAY_CONSTANTS.thresholds.halfMinRatio * 100 &&
    percentage <= FUEL_DISPLAY_CONSTANTS.thresholds.halfMaxRatio * 100
  ) {
    status = 'half';
    warningLevel = 'none';
    indicatorColor = FUEL_DISPLAY_CONSTANTS.colors.half;
  } else {
    status = 'normal';
    warningLevel = 'none';
    indicatorColor = FUEL_DISPLAY_CONSTANTS.colors.normal;
  }

  const estimatedEnduranceSeconds =
    clampedSeconds <= 0.001 ? 0 : burnRate > 0 ? Math.round((clampedSeconds / burnRate) * 10) / 10 : Infinity;

  const shortWord = FUEL_DISPLAY_CONSTANTS.shortWords[status];
  const prompt = FUEL_DISPLAY_CONSTANTS.prompts[status];

  const throttleName = throttle === 'off' ? '关档' : throttle === 'cruise' ? '巡航' : '全推';
  const gaugeText = `${clampedSeconds.toFixed(1)}s (${canCount.toFixed(2)} 罐 · ${percentage}%)`;
  const rateText = `${burnRate.toFixed(1)} s/s [${throttleName}]`;

  return {
    fuelSeconds: clampedSeconds,
    maxFuelSeconds: safeMax,
    canCount,
    percentage,
    status,
    throttle,
    burnRate,
    estimatedEnduranceSeconds,
    warningLevel,
    prompt,
    shortWord,
    gaugeText,
    rateText,
    indicatorColor,
  };
}

/**
 * Three-state walkthrough verification helper for F-8 acceptance.
 * Produces structured snapshots for Full, Half and Empty scenarios.
 */
export function surveyFuelThreeStates(maxFuel: number = FUEL_DISPLAY_CONSTANTS.maxFuelSeconds) {
  return {
    full: evaluateFuelDisplay(maxFuel, 'full', maxFuel),
    half: evaluateFuelDisplay(maxFuel * 0.5, 'cruise', maxFuel),
    low: evaluateFuelDisplay(45, 'full', maxFuel),
    empty: evaluateFuelDisplay(0, 'off', maxFuel),
  };
}

/**
 * Mounts a Three.js visual gauge / meter component for flight fuel presentation.
 * Creates clean geometric indicators representing the fuel tank level and burn status.
 */
export function mountFuelDisplay(
  host: Group,
  options?: {
    maxFuelSeconds?: number;
    initialFuelSeconds?: number;
    initialThrottle?: FlightThrottle;
    name?: string;
  },
) {
  const layerName = options?.name ?? 'town-friend-fuel-display';
  if (host.getObjectByName(layerName)) {
    throw new RangeError(`Host already contains a fuel display layer named ${layerName}`);
  }

  const displayRoot = new Group();
  displayRoot.name = layerName;

  const maxFuel = options?.maxFuelSeconds ?? FUEL_DISPLAY_CONSTANTS.maxFuelSeconds;
  let currentFuel = options?.initialFuelSeconds ?? maxFuel;
  let currentThrottle = options?.initialThrottle ?? 'off';

  // Materials
  const housingMat = new MeshStandardMaterial({
    color: FUEL_DISPLAY_CONSTANTS.colors.housing,
    roughness: 0.85,
    metalness: 0.3,
  });
  const frameMat = new MeshStandardMaterial({
    color: 0x485866,
    roughness: 0.7,
    metalness: 0.4,
  });
  const levelFillMat = new MeshBasicMaterial({
    color: FUEL_DISPLAY_CONSTANTS.colors.full,
  });
  const statusLightMat = new MeshBasicMaterial({
    color: FUEL_DISPLAY_CONSTANTS.colors.full,
  });

  const materials: Material[] = [housingMat, frameMat, levelFillMat, statusLightMat];

  // Base Housing
  const baseGeom = new BoxGeometry(0.36, 0.14, 0.04);
  const baseMesh = new Mesh(baseGeom, housingMat);
  baseMesh.name = 'fuel-gauge-base';
  displayRoot.add(baseMesh);

  // Gauge Bezel Frame
  const frameGeom = new BoxGeometry(0.32, 0.04, 0.015);
  const frameMesh = new Mesh(frameGeom, frameMat);
  frameMesh.name = 'fuel-gauge-frame';
  frameMesh.position.set(0, -0.015, 0.02);
  displayRoot.add(frameMesh);

  // Fill Bar (indicator level)
  const fillGeom = new BoxGeometry(0.3, 0.026, 0.018);
  const fillMesh = new Mesh(fillGeom, levelFillMat);
  fillMesh.name = 'fuel-gauge-fill';
  fillMesh.position.set(0, -0.015, 0.022);
  displayRoot.add(fillMesh);

  // Status Indicator Light
  const lightGeom = new BoxGeometry(0.035, 0.035, 0.02);
  const lightMesh = new Mesh(lightGeom, statusLightMat);
  lightMesh.name = 'fuel-gauge-status-lamp';
  lightMesh.position.set(0.12, 0.035, 0.02);
  displayRoot.add(lightMesh);

  let disposed = false;

  function applyState(snapshot: FuelDisplaySnapshot) {
    const scaleX = Math.max(0.01, snapshot.percentage / 100);
    fillMesh.scale.set(scaleX, 1, 1);
    fillMesh.position.x = -0.15 * (1 - scaleX);
    fillMesh.visible = snapshot.percentage > 0;

    const targetColor = new Color(snapshot.indicatorColor);
    levelFillMat.color.copy(targetColor);
    statusLightMat.color.copy(targetColor);

    displayRoot.userData.snapshot = snapshot;
  }

  // Initial update
  applyState(evaluateFuelDisplay(currentFuel, currentThrottle, maxFuel));

  host.add(displayRoot);

  return {
    root: displayRoot,
    update(fuelSeconds: number, throttle: FlightThrottle) {
      if (disposed) return;
      currentFuel = fuelSeconds;
      currentThrottle = throttle;
      const snap = evaluateFuelDisplay(currentFuel, currentThrottle, maxFuel);
      applyState(snap);
      return snap;
    },
    getSnapshot(): FuelDisplaySnapshot {
      return evaluateFuelDisplay(currentFuel, currentThrottle, maxFuel);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      displayRoot.removeFromParent();
      displayRoot.traverse(obj => {
        if (obj instanceof Mesh) {
          obj.geometry.dispose();
        }
      });
      for (const m of materials) m.dispose();
    },
  };
}
