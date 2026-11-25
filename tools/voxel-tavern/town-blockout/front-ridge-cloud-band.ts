import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, Group,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PlaneGeometry, RepeatWrapping, SphereGeometry,
} from 'three';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';
import {
  townOutdoorWeatherEffects, type TownOutdoorWeatherState,
} from '../../../src/shared/town-outdoor-weather';

/**
 * Mid-mountain cloud band + high drifting clusters for the front
 * ridge (《设计-全图云层-2026-11-22》 §一/§二, D line share).
 *
 * The band rings the ridge waist at 170-260 m so the town never sees
 * the top: from the plaza only foot and waist read, everything above
 * the waist is in cloud. It is NOT a flat slab: the dense core
 * altitude undulates with azimuth, two gap sectors (cloud-fall
 * mouths) break the ring, and wispy skirt rows above and below sell
 * the 170-260 span. The switchback road crosses the dense core once
 * on its upper spiral -- a measured 30-60 m "walking in cloud"
 * segment (densityAt > 0.6 at eye height); the host fog hook reads
 * densityAt, this module owns no fog state.
 *
 * Night surface follows the glow-band ruling (乙案「云面浮光」, batch
 * 63): light floats ON the band surface as slow river-like streams,
 * palette between crystal teal #7fd4c8 and snow white, no saturated
 * blue/purple, brightness capped under the town lights. High
 * clusters never glow.
 *
 * Weather (wiring, 2026-11-25, batch-103 ruling): the band's ONLY
 * weather input is the ZB-20 single state object
 * (TownOutdoorWeatherState, src/shared/town-outdoor-weather.ts),
 * consumed through applyOutdoorWeather -- no second weather state
 * exists here. Mapping: windStrength -> drift multiplier
 * (0.3 + 1.4 * strength, so a calm day still creeps); weather kind
 * -> cloud amount (clear-snow 0.75, wind / whiteout 1); the kind's
 * visibilityMeters -> density (unlimited 1, whiteout 12 m -> 1.8).
 * Wind direction is deliberately not consumed: the band is a ring
 * and its drift is azimuthal, with no heading to align to. Night
 * thinning stays on the separate setNight axis (day/night system),
 * not on the weather object.
 *
 * Visual only: nothing registers a collider; the road corridor's
 * feather band stays physically clear (walkers enter cloud, never
 * geometry).
 */

const CENTRE = { east: 320, north: 650, radiusE: 330, radiusN: 380 };
const dOfHeight = (h: number) => 1 - Math.pow(Math.max(0, (h - 18) / 332), 1 / 1.6);
const posOf = (d: number, theta: number) => ({
  east: CENTRE.east + d * CENTRE.radiusE * Math.cos(theta),
  north: CENTRE.north + d * CENTRE.radiusN * Math.sin(theta),
});
const thetaOf = (east: number, north: number) => Math.atan2(
  (north - CENTRE.north) / CENTRE.radiusN, (east - CENTRE.east) / CENTRE.radiusE);
const dOf = (east: number, north: number) => Math.hypot(
  (east - CENTRE.east) / CENTRE.radiusE, (north - CENTRE.north) / CENTRE.radiusN);

/** Dense-core altitude: slow undulation, 208-239 m around the ring. */
export const cloudBandCoreHeightAt = (theta: number) =>
  221 + 13 * Math.sin(theta + 2.2) + 4 * Math.sin(2 * theta - 0.7);

/** Cloud-fall mouths: gap centre azimuths (rad) and half-width. */
const GAPS = [
  { theta: 0.61, half: 0.13 },   // north face fall
  { theta: -2.18, half: 0.13 },  // south-west face fall
];
const gapFactor = (theta: number) => {
  let f = 1;
  for (const gap of GAPS) {
    let d = Math.abs(theta - gap.theta) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < gap.half * 2.2) {
      const t = Math.max(0, (d - gap.half) / (gap.half * 1.2));
      f = Math.min(f, t * t * (3 - 2 * t));
    }
  }
  return f;
};

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Shared 乙案 glow texture: teal-to-white light spots in streamlines
 * on transparency. Used by this band and the summit extras glow. */
export function makeCloudGlowTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 512, 128);
  // Streamlines: spots strung along slow sine rivers, teal cores
  // with snow-white hearts, soft radial falloff.
  for (let river = 0; river < 5; river++) {
    const baseY = 14 + river * 26 + hash(river * 7) * 8;
    const phase = hash(river * 13) * 6.28;
    for (let s = 0; s < 26; s++) {
      const x = (s / 26) * 512 + hash(river * 31 + s) * 14;
      const y = baseY + Math.sin(x / 90 + phase) * 6;
      const r = 5 + hash(river * 57 + s) * 13;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const hot = hash(river * 91 + s) > 0.62;
      g.addColorStop(0, hot ? 'rgba(240,255,252,0.85)' : 'rgba(127,212,200,0.55)');
      g.addColorStop(0.55, 'rgba(127,212,200,0.28)');
      g.addColorStop(1, 'rgba(127,212,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping; tex.wrapT = RepeatWrapping;
  return tex;
}

interface PuffSeed {
  theta: number; d: number; height: number;
  sx: number; sy: number; sz: number; drift: number; core: boolean;
}

export function createFrontRidgeCloudBand() {
  const group = new Group();
  group.name = 'front-ridge-cloud-band';
  // Derived working multipliers, fed ONLY by applyOutdoorWeather
  // (defaults = the pre-wiring shipped behaviour).
  const weather = { cloudAmount: 1, density: 1, windSpeed: 1 };
  let night = false;
  let elapsed = 0;

  // --- puff field: rows following the cone contours ---------------
  const seeds: PuffSeed[] = [];
  const rowHeights = [176, 192, 208, 224, 240, 254];
  rowHeights.forEach((rowH, ri) => {
    const d = dOfHeight(rowH);
    const step = 0.096 + hash(ri * 3) * 0.02;
    for (let theta = -Math.PI; theta < Math.PI; theta += step) {
      const j = hash(seeds.length * 1.7);
      const th = theta + (j - 0.5) * 0.05;
      if (gapFactor(th) < 0.35) continue;
      const pos = posOf(d, th);
      const h = sampleNorthRidge350(pos.east, pos.north);
      if (h < 60) continue; // ring only where the mountain body is
      const core = Math.abs(rowH - cloudBandCoreHeightAt(th)) < 9;
      seeds.push({
        theta: th, d, height: rowH + (j - 0.5) * 5,
        sx: 15 + j * 9, sy: 3.6 + hash(seeds.length * 3.1) * 2.2, sz: 10 + hash(seeds.length * 5.3) * 6,
        drift: (0.0016 + ri * 0.00035) * (ri % 2 === 0 ? 1 : -1), core,
      });
    }
  });
  const puffGeo = new SphereGeometry(1, 7, 5);
  const mkPuffs = (list: PuffSeed[], opacity: number) => {
    const mat = new MeshLambertMaterial({ color: 0xe8ecf0, transparent: true, opacity, depthWrite: false });
    const mesh = new InstancedMesh(puffGeo, mat, Math.max(1, list.length));
    mesh.name = list[0]?.core ? 'cloud-band-core-puffs' : 'cloud-band-skirt-puffs';
    list.forEach((s, i) => mesh.setColorAt(i, new Color().setHSL(0.58, 0.05, 0.9 + hash(i * 7.7) * 0.07)));
    group.add(mesh);
    return { mesh, mat, list };
  };
  const corePuffs = mkPuffs(seeds.filter(s => s.core), 0.88);
  const skirtPuffs = mkPuffs(seeds.filter(s => !s.core), 0.42);

  // --- high drifting clusters over the mountain (2 clusters) ------
  interface ClusterPuff { cx: number; cz: number; cy: number; r: number; phase: number; s: number }
  const clusterSeeds: ClusterPuff[] = [];
  const clusters = [
    { east: 185, north: 480, height: 418, n: 7 },
    { east: 468, north: 565, height: 448, n: 6 },
  ];
  clusters.forEach((c, ci) => {
    for (let i = 0; i < c.n; i++) {
      clusterSeeds.push({
        cx: c.east, cz: c.north, cy: c.height + (hash(ci * 40 + i) - 0.5) * 14,
        r: 16 + hash(ci * 61 + i) * 30, phase: hash(ci * 83 + i) * 6.28,
        s: 17 + hash(ci * 97 + i) * 12,
      });
    }
  });
  const clusterMat = new MeshLambertMaterial({ color: 0xe8ecf0, transparent: true, opacity: 0.5, depthWrite: false });
  const clusterMesh = new InstancedMesh(puffGeo, clusterMat, clusterSeeds.length);
  clusterMesh.name = 'mountain-high-cloud-clusters';
  group.add(clusterMesh);

  // --- night glow surface (乙案): annulus strip on the band top ---
  const glowTex = makeCloudGlowTexture();
  const glowMat = new MeshBasicMaterial({
    map: glowTex ?? undefined, transparent: true, opacity: 0,
    depthWrite: false, side: 2, color: 0xdff7f1,
  });
  const stripPositions: number[] = [];
  const stripUvs: number[] = [];
  const stripIndices: number[] = [];
  {
    let vi = 0;
    let prevRow: number[] | null = null;
    for (let theta = -Math.PI; theta <= Math.PI + 0.001; theta += 0.07) {
      if (gapFactor(theta) < 0.5) { prevRow = null; continue; }
      const core = cloudBandCoreHeightAt(theta);
      const inner = posOf(dOfHeight(core - 8), theta);
      const outer = posOf(dOfHeight(core + 20), theta);
      const y = core + 5.5 + 1.5 * Math.sin(3 * theta);
      stripPositions.push(inner.east, y, inner.north, outer.east, y - 2, outer.north);
      const u = (theta + Math.PI) / (Math.PI * 2) * 6;
      stripUvs.push(u, 0, u, 1);
      if (prevRow) {
        stripIndices.push(prevRow[0]!, vi, prevRow[1]!, prevRow[1]!, vi, vi + 1);
      }
      prevRow = [vi, vi + 1];
      vi += 2;
    }
  }
  const glowGeo = new BufferGeometry();
  glowGeo.setAttribute('position', new Float32BufferAttribute(stripPositions, 3));
  glowGeo.setAttribute('uv', new Float32BufferAttribute(stripUvs, 2));
  glowGeo.setIndex(stripIndices);
  const glowMesh = new Mesh(glowGeo, glowMat);
  glowMesh.name = 'cloud-band-glow-surface';
  glowMesh.visible = false;
  group.add(glowMesh);

  const dummy = new Object3D();
  const placePuffs = (set: { mesh: InstancedMesh; list: PuffSeed[] }) => {
    set.list.forEach((s, i) => {
      const th = s.theta + elapsed * s.drift * weather.windSpeed;
      const pos = posOf(s.d, th);
      dummy.position.set(pos.east, s.height, pos.north);
      dummy.scale.set(s.sx, s.sy, s.sz);
      dummy.rotation.set(0, th, 0);
      dummy.updateMatrix();
      set.mesh.setMatrixAt(i, dummy.matrix);
    });
    set.mesh.instanceMatrix.needsUpdate = true;
  };
  const placeClusters = () => {
    clusterSeeds.forEach((p, i) => {
      const a = p.phase + elapsed * 0.01 * weather.windSpeed;
      dummy.position.set(p.cx + Math.cos(a) * p.r, p.cy + Math.sin(elapsed * 0.05 + p.phase) * 1.5, p.cz + Math.sin(a) * p.r * 0.7);
      dummy.scale.set(p.s, p.s * 0.32, p.s * 0.66);
      dummy.rotation.set(0, a, 0);
      dummy.updateMatrix();
      clusterMesh.setMatrixAt(i, dummy.matrix);
    });
    clusterMesh.instanceMatrix.needsUpdate = true;
  };
  placePuffs(corePuffs); placePuffs(skirtPuffs); placeClusters();

  const applyWeather = () => {
    const amount = weather.cloudAmount;
    corePuffs.mat.opacity = 0.88 * amount;
    skirtPuffs.mat.opacity = 0.42 * amount;
    clusterMat.opacity = 0.5 * amount;
  };
  applyWeather();

  /** Analytic density for the host fog hook (0..1). */
  const densityAt = (east: number, north: number, height: number) => {
    const surface = sampleNorthRidge350(east, north);
    if (surface < 60) return 0;
    const theta = thetaOf(east, north);
    const gap = gapFactor(theta);
    if (gap <= 0) return 0;
    const core = cloudBandCoreHeightAt(theta);
    const dHere = dOf(east, north);
    const radial = Math.exp(-Math.pow((dHere - dOfHeight(core)) / 0.11, 2));
    const coreTerm = Math.exp(-Math.pow((height - core) / 2.6, 2));
    const skirtTerm = 0.22 * Math.exp(-Math.pow((height - core) / 26, 2));
    const amount = weather.cloudAmount;
    return Math.min(1, (coreTerm + skirtTerm) * radial * gap * weather.density * amount);
  };

  return {
    group,
    puffCount: seeds.length,
    clusterCount: clusters.length,
    clusterPuffCount: clusterSeeds.length,
    densityAt,
    coreHeightAt: cloudBandCoreHeightAt,
    setNight(on: boolean) {
      night = on;
      const tint = new Color(on ? 0x39445c : 0xe8ecf0);
      corePuffs.mat.color.copy(tint);
      skirtPuffs.mat.color.copy(tint);
      clusterMat.color.copy(tint);
      glowMesh.visible = on;
    },
    /** Consume the ZB-20 single weather state (see header mapping).
     * Idempotent: the host may forward the current state every frame. */
    applyOutdoorWeather(state: TownOutdoorWeatherState) {
      weather.windSpeed = 0.3 + 1.4 * state.windStrength;
      weather.cloudAmount = state.weather === 'clear-snow' ? 0.75 : 1;
      weather.density =
        townOutdoorWeatherEffects[state.weather].visibilityMeters == null ? 1 : 1.8;
      applyWeather();
    },
    update(dtSeconds: number) {
      elapsed += dtSeconds;
      placePuffs(corePuffs); placePuffs(skirtPuffs); placeClusters();
      if (glowTex) {
        glowTex.offset.x = (elapsed * 0.0045) % 1; // river-slow flow
        glowTex.offset.y = (elapsed * 0.0011) % 1;
      }
      const target = night ? 0.34 * weather.density : 0;
      glowMat.opacity += (target - glowMat.opacity) * Math.min(1, dtSeconds * 0.8);
    },
    dispose() {
      puffGeo.dispose();
      corePuffs.mat.dispose(); skirtPuffs.mat.dispose(); clusterMat.dispose();
      glowGeo.dispose(); glowMat.dispose(); glowTex?.dispose();
    },
  };
}
