import {
  Color, DoubleSide, Group, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial,
} from 'three';
import type { TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';

/**
 * Batch-67 full-map cloud layer, A-line share: five designed high drifting
 * clusters (town x2, crater, north band, lake) plus the crater smoke clouds.
 * Cloud amount, altitude and drift all hang off the single authoritative
 * G-09 presence weather state (ZB-20); this module owns no weather source
 * of its own. High clouds never glow — the lit cloud-face ruling applies
 * only to D's mountain cloud-sea band.
 */
export const townSkyCloudSpec = {
  altitudeBand: [120, 180] as const,
  smokeBand: [60, 90] as const,
  clusters: [
    { id: 'town-1', east: 305, north: 205, altitude: 148, puffs: 8, radius: 96 },
    { id: 'town-2', east: 130, north: 330, altitude: 168, puffs: 6, radius: 74 },
    { id: 'crater-1', east: -215, north: 275, altitude: 158, puffs: 6, radius: 80 },
    { id: 'north-1', east: 205, north: 485, altitude: 172, puffs: 7, radius: 88 },
    { id: 'lake-1', east: 344, north: 80, altitude: 155, puffs: 6, radius: 70 },
  ] as const,
  // Smoke sources matched to the crater-outer industrial belt: the smelter
  // stands at site 207 deg / r88 from the crater anchor (-120, 185), i.e.
  // (-160, 107); the second blob rides the crater-mouth steam at the anchor.
  smokeBlobs: [
    { id: 'smelter-smoke', east: -160, north: 107, altitude: 74, puffs: 6 },
    { id: 'mouth-steam', east: -120, north: 185, altitude: 70, puffs: 6 },
  ] as const,
  coverTargets: {
    day: { clear: .42, wind: .66, whiteout: .97, fallback: .40 },
    night: { clear: .18, wind: .40, whiteout: .85, fallback: .20 },
  } as const,
  whiteoutAltitudeScale: .8,
  smoothingMs: 15_000,
} as const;

type WeatherKind = 'clear' | 'wind' | 'whiteout' | 'fallback';

const vertex = /* glsl */`
  varying vec2 p;
  void main() {
    p = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const lobeField = /* glsl */`
  float lobeField(vec2 p) {
    return min(length((p - vec2(-0.26, -0.03)) * vec2(1.14, 1.31)),
      min(length((p - vec2(0.22, -0.17)) * vec2(1.32, 1.48)),
          length((p - vec2(0.03, 0.25)) * vec2(1.62, 1.55))));
  }
`;

const whiteFragment = /* glsl */`
  uniform vec3 cloudTint;
  uniform float cloudCover;
  varying vec2 p;
  ${lobeField}
  void main() {
    float opacity = (1.0 - smoothstep(0.27, 0.82, lobeField(p))) * cloudCover * 0.5;
    opacity *= 1.0 - smoothstep(0.66, 1.0, max(abs(p.x), abs(p.y)));
    if (opacity < 0.006) discard;
    gl_FragColor = vec4(cloudTint, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const smokeFragment = /* glsl */`
  uniform vec3 cloudTint;
  uniform vec3 emberTint;
  uniform float cloudCover;
  uniform float emberStrength;
  varying vec2 p;
  ${lobeField}
  void main() {
    float field = lobeField(p);
    float opacity = (1.0 - smoothstep(0.24, 0.78, field)) * cloudCover * 0.55;
    opacity *= 1.0 - smoothstep(0.62, 1.0, max(abs(p.x), abs(p.y)));
    if (opacity < 0.006) discard;
    float ember = emberStrength * (1.0 - smoothstep(0.0, 0.72, field)) * (0.68 - 0.34 * p.y);
    vec3 tint = mix(cloudTint, emberTint, clamp(ember, 0.0, 1.0) * 0.85);
    gl_FragColor = vec4(tint, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

type Puff = {
  homeEast: number; homeNorth: number; altitude: number;
  width: number; depth: number; turn: number;
  orbitRadius: number; orbitPeriodS: number; orbitPhase: number;
  bobPhase: number;
};

function buildWhitePuffs(): Puff[] {
  const puffs: Puff[] = [];
  for (const [clusterIndex, cluster] of townSkyCloudSpec.clusters.entries()) {
    const random = seededRandom(0xC10D + clusterIndex * 977);
    for (let i = 0; i < cluster.puffs; i++) {
      const angle = random() * Math.PI * 2;
      const reach = cluster.radius * (.18 + random() * .82);
      const width = 55 + random() * 65;
      puffs.push({
        homeEast: cluster.east + Math.cos(angle) * reach,
        homeNorth: cluster.north + Math.sin(angle) * reach * .72,
        altitude: cluster.altitude + (random() - .5) * 14,
        width, depth: width * (.6 + random() * .22),
        turn: (random() - .5) * .9,
        orbitRadius: 5 + random() * 13,
        orbitPeriodS: 240 + random() * 360,
        orbitPhase: random() * Math.PI * 2,
        bobPhase: random() * Math.PI * 2,
      });
    }
  }
  return puffs;
}

function buildSmokePuffs(): Puff[] {
  const puffs: Puff[] = [];
  for (const [blobIndex, blob] of townSkyCloudSpec.smokeBlobs.entries()) {
    const random = seededRandom(0x5107 + blobIndex * 613);
    for (let i = 0; i < blob.puffs; i++) {
      const angle = random() * Math.PI * 2;
      const reach = 4 + random() * 11;
      const width = 16 + random() * 18;
      puffs.push({
        homeEast: blob.east + Math.cos(angle) * reach,
        homeNorth: blob.north + Math.sin(angle) * reach,
        altitude: blob.altitude + (random() - .5) * 7,
        width, depth: width * (.68 + random() * .2),
        turn: (random() - .5) * 1.2,
        orbitRadius: 2 + random() * 4,
        orbitPeriodS: 150 + random() * 150,
        orbitPhase: random() * Math.PI * 2,
        bobPhase: random() * Math.PI * 2,
      });
    }
  }
  return puffs;
}

const dayTint = new Color('#eef3f7');
const nightTint = new Color('#5d6d80');
const daySmoke = new Color('#96897a');
const nightSmoke = new Color('#6d6257');
const ember = new Color('#e07f3e');

export function createTownSkyClouds() {
  const group = new Group();
  group.name = 'town-sky-clouds';

  const whitePuffs = buildWhitePuffs();
  const smokePuffs = buildSmokePuffs();
  const geometry = new PlaneGeometry(1, 1);

  const whiteUniforms = {
    cloudTint: { value: new Color().copy(dayTint) }, cloudCover: { value: 0 },
  };
  const whiteMaterial = new ShaderMaterial({
    vertexShader: vertex, fragmentShader: whiteFragment, uniforms: whiteUniforms,
    transparent: true, side: DoubleSide, depthWrite: false,
  });
  const white = new InstancedMesh(geometry, whiteMaterial, whitePuffs.length);
  white.name = 'town-sky-drift-clouds';
  white.frustumCulled = false;
  group.add(white);

  const smokeUniforms = {
    cloudTint: { value: new Color().copy(daySmoke) },
    emberTint: { value: new Color().copy(ember) },
    cloudCover: { value: 0 }, emberStrength: { value: .45 },
  };
  const smokeMaterial = new ShaderMaterial({
    vertexShader: vertex, fragmentShader: smokeFragment, uniforms: smokeUniforms,
    transparent: true, side: DoubleSide, depthWrite: false,
  });
  const smoke = new InstancedMesh(geometry, smokeMaterial, smokePuffs.length);
  smoke.name = 'town-crater-smoke-clouds';
  smoke.frustumCulled = false;
  group.add(smoke);

  const pose = new Object3D();
  let cover = 0;
  let altitudeScale = 1;
  let nightBlend = 0;
  let driftPhase = 0;
  let lastNow: number | undefined;
  let disposed = false;

  function targets(weather: TownOutdoorWeatherState | undefined, darkness: number) {
    const kind: WeatherKind = weather === undefined ? 'fallback'
      : weather.weather === 'clear-snow' ? 'clear' : weather.weather;
    const {day,night}=townSkyCloudSpec.coverTargets;
    return {
      kind,
      cover: day[kind]+(night[kind]-day[kind])*darkness,
      altitudeScale: kind === 'whiteout' ? townSkyCloudSpec.whiteoutAltitudeScale : 1,
      driftFactor: kind === 'wind' ? 1 + 1.6 * (weather?.windStrength ?? 0)
        : kind === 'whiteout' ? 1.25 : 1,
      windEast: weather?.windEast ?? 0,
      windNorth: weather?.windNorth ?? 0,
      windStrength: weather?.windStrength ?? 0,
    };
  }

  function place(mesh: InstancedMesh, puffs: readonly Puff[], seconds: number,
    altScale: number, windLeash: { east: number; north: number }, rise: boolean) {
    for (const [index, puff] of puffs.entries()) {
      const angle = puff.orbitPhase + driftPhase * (Math.PI * 2 / puff.orbitPeriodS);
      const east = puff.homeEast + Math.cos(angle) * puff.orbitRadius + windLeash.east;
      const north = puff.homeNorth + Math.sin(angle) * puff.orbitRadius + windLeash.north;
      const bob = Math.sin(seconds * .11 + puff.bobPhase) * (rise ? 3.2 : 1.8);
      pose.position.set(east, puff.altitude * altScale + bob, -north);
      pose.rotation.set(-Math.PI / 2, 0, puff.turn);
      const swell = rise ? 1 + Math.sin(seconds * .07 + puff.bobPhase) * .12 : 1;
      pose.scale.set(puff.width * swell, puff.depth * swell, 1);
      pose.updateMatrix();
      mesh.setMatrixAt(index, pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function update(nowMs: number, input: { weather?: TownOutdoorWeatherState; night: boolean; sky?: { cloudColor:number; lampLevel:number } }) {
    if (disposed) throw new Error('The town sky cloud layer is disposed.');
    if (!Number.isFinite(nowMs)) throw new RangeError('Cloud time must be finite.');
    const dt = lastNow === undefined ? 0 : Math.max(0, Math.min(5_000, nowMs - lastNow));
    lastNow = nowMs;
    const darkness=input.sky&&Number.isFinite(input.sky.lampLevel)?Math.max(0,Math.min(1,input.sky.lampLevel)):input.night?1:0;
    const goal = targets(input.weather, darkness);
    const blend = 1 - Math.exp(-dt / townSkyCloudSpec.smoothingMs);
    cover += (goal.cover - cover) * blend;
    altitudeScale += (goal.altitudeScale - altitudeScale) * blend;
    nightBlend += (darkness - nightBlend) * blend;
    driftPhase += (dt / 1000) * goal.driftFactor;

    const seconds = nowMs / 1000;
    const leashReach = 20 * goal.windStrength;
    const windLeash = {
      east: goal.windEast * Math.sin(driftPhase * .021) * leashReach,
      north: goal.windNorth * Math.sin(driftPhase * .021) * leashReach,
    };
    place(white, whitePuffs, seconds, altitudeScale, windLeash, false);
    place(smoke, smokePuffs, seconds, 1, { east: windLeash.east * .4, north: windLeash.north * .4 }, true);

    whiteUniforms.cloudCover.value = cover;
    if(input.sky&&Number.isFinite(input.sky.cloudColor))whiteUniforms.cloudTint.value.setHex(input.sky.cloudColor);
    else whiteUniforms.cloudTint.value.copy(dayTint).lerp(nightTint, nightBlend);
    // The smoke signature never fully vanishes: industry keeps breathing
    // under any sky, thickening somewhat with the weather cover.
    smokeUniforms.cloudCover.value = Math.min(1, .55 + cover * .45);
    smokeUniforms.cloudTint.value.copy(daySmoke).lerp(nightSmoke, nightBlend);
    const flicker = .9 + .1 * Math.sin(seconds * 2.3) * Math.sin(seconds * .71 + 1.7);
    smokeUniforms.emberStrength.value = (.45 + .4 * nightBlend) * flicker;
    white.visible = cover > .01;
    return state();
  }

  function state() {
    return {
      cover, altitudeScale, nightBlend,
      whitePuffs: whitePuffs.length, smokePuffs: smokePuffs.length,
      draws: 2,
    };
  }

  update(0, { night: false });
  return {
    group, update, state,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      white.dispose(); smoke.dispose();
      geometry.dispose();
      whiteMaterial.dispose(); smokeMaterial.dispose();
    },
  };
}
