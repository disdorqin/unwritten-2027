import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Points, ShaderMaterial,
  type ColorRepresentation, type Scene,
} from 'three';
import { playTowerBell, playTowerChime } from '../tower-chime';
import {
  fireworksShowMs, isFireworksSeed, isFireworksTheme, publicFireworksStand, type FireworksTheme,
} from '../../../src/presence/firework-sites';

type Burst = {
  time: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  shape: 'peony' | 'ring' | 'willow';
  outer: Color;
  inner: Color;
  launch?: readonly [x: number, y: number, z: number];
};

type FireworksProgram = { duration: number; bursts: readonly Burst[] };

export type FireworksTable = {
  duration?: number;
  bursts: readonly (Omit<Burst, 'outer' | 'inner' | 'launch'> & {
    outer: ColorRepresentation;
    inner: ColorRepresentation;
    launchId?: string;
  })[];
  launchPoints: readonly { id: string; x: number; y?: number; z: number }[];
};

const countdown = 3;
const sparkCount = 96;
const trailCount = 3;
const lifetime = 2.65;
const flight = .8;
const gold = new Color('#ffc26b');
const cream = new Color('#fff1c7');
const red = new Color('#ff5767');
const pink = new Color('#f599df');
const blue = new Color('#7ad9ff');
const jade = new Color('#76f6db');

// World-space choreography above the plaza, with alternating silhouettes and a three-burst finale.
const previewBursts: readonly Burst[] = [
  { time: .85, x: 207, y: 43, z: -202, radius: 14, shape: 'peony', outer: red, inner: cream },
  { time: 1.4, x: 240, y: 49, z: -193, radius: 17, shape: 'peony', outer: gold, inner: cream },
  { time: 2.5, x: 222, y: 57, z: -198, radius: 15, shape: 'ring', outer: jade, inner: cream },
  { time: 4.2, x: 202, y: 48, z: -198, radius: 14, shape: 'ring', outer: blue, inner: pink },
  { time: 5.05, x: 246, y: 51, z: -203, radius: 17, shape: 'willow', outer: gold, inner: cream },
  { time: 6.45, x: 222, y: 59, z: -196, radius: 18, shape: 'peony', outer: pink, inner: cream },
  { time: 8.1, x: 203, y: 50, z: -194, radius: 15, shape: 'willow', outer: red, inner: gold },
  { time: 8.48, x: 246, y: 54, z: -200, radius: 16, shape: 'peony', outer: blue, inner: cream },
  { time: 8.76, x: 224, y: 67, z: -197, radius: 20, shape: 'peony', outer: gold, inner: cream },
];

export type CeremonyFireworksCue = 'fireworks-main' | 'fireworks-far' | 'fireworks-finale';

const lakeLaunch = [344, 7, -66] as const;
const memorialLaunch = [373, 28, -264] as const;
const ceremonyBursts: Record<CeremonyFireworksCue, readonly Burst[]> = {
  'fireworks-main': previewBursts,
  'fireworks-far': [
    { time: .85, x: 326, y: 60, z: -70, radius: 16, shape: 'ring', outer: blue, inner: cream, launch: lakeLaunch },
    { time: .85, x: 355, y: 79, z: -271, radius: 19, shape: 'peony', outer: gold, inner: cream, launch: memorialLaunch },
    { time: 1.35, x: 363, y: 70, z: -58, radius: 19, shape: 'willow', outer: jade, inner: cream, launch: lakeLaunch },
    { time: 1.5, x: 388, y: 73, z: -273, radius: 18, shape: 'ring', outer: pink, inner: blue, launch: memorialLaunch },
    { time: 2.3, x: 345, y: 77, z: -71, radius: 21, shape: 'peony', outer: gold, inner: cream, launch: lakeLaunch },
    { time: 2.45, x: 376, y: 86, z: -292, radius: 21, shape: 'willow', outer: red, inner: gold, launch: memorialLaunch },
  ],
  'fireworks-finale': [
    { time: .85, x: 204, y: 61, z: -202, radius: 21, shape: 'willow', outer: red, inner: gold },
    { time: 1.12, x: 244, y: 63, z: -199, radius: 21, shape: 'peony', outer: blue, inner: cream },
    { time: 1.39, x: 224, y: 73, z: -199, radius: 24, shape: 'peony', outer: gold, inner: cream },
    { time: 4.6, x: 215, y: 57, z: -200, radius: 13, shape: 'willow', outer: gold, inner: cream },
    { time: 7.5, x: 238, y: 55, z: -197, radius: 12, shape: 'ring', outer: jade, inner: cream },
  ],
};

const burstTail = lifetime + .22;
const workshopSparkCount = 36;
const patterns = [
  ['peony', 'ring', 'willow', 'peony', 'ring', 'peony', 'willow', 'ring', 'peony', 'willow', 'ring', 'willow', 'peony', 'ring', 'peony'],
  ['ring', 'willow', 'peony', 'ring', 'willow', 'peony', 'ring', 'peony', 'willow', 'peony', 'willow', 'ring', 'willow', 'ring', 'peony'],
  ['willow', 'peony', 'ring', 'willow', 'ring', 'willow', 'peony', 'peony', 'ring', 'willow', 'peony', 'ring', 'peony', 'willow', 'ring'],
] as const;
const playerBeatTimes = [.85, 2.05, 3.15, 4.30, 5.55, 6.50, 7.85, 8.95, 10.2, 11.25, 12.5, 13.65, 14.8, 15.85, 16.95];
const themeColors = {
  'gold-red': [
    ['#ffb443', '#fff1c7'], ['#ff4f58', '#ffca62'], ['#ff7944', '#ffe4a1'],
  ],
  'ice-blue': [
    ['#7ad9ff', '#d5fbff'], ['#30bbf4', '#b5f8ff'], ['#88efe9', '#e1fdff'],
  ],
  'pink-glow': [
    ['#f599df', '#fff3f2'], ['#f780ae', '#ffd5e4'], ['#df8ffd', '#ffe8fb'],
  ],
} as const;

export function makePlayerFireworksTable(seed: number, theme: FireworksTheme): FireworksTable {
  const shapePattern = patterns[seed % patterns.length];
  const palette = themeColors[theme];
  let rng = seed >>> 0;
  function random() {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 0x100000000;
  }
  const [x, y, z] = publicFireworksStand.launch;
  return {
    duration: fireworksShowMs / 1_000,
    launchPoints: [{ id: 'plaza-stand', x, y, z }],
    bursts: playerBeatTimes.map((time, index) => {
      const [outer, inner] = palette[Math.floor(random() * palette.length)];
      const offset = (index % 2 === 0 ? -1 : 1) * (3 + random() * 9);
      return {
        time: time + (index === 0 ? 0 : random() * .14 - .07), x: x + offset,
        y: 38 + random() * 17, z: z - 10 + random() * 9, radius: 10 + random() * 5,
        shape: shapePattern[index], outer, inner, launchId: 'plaza-stand',
      };
    }),
  };
}

function compileShow(table: FireworksTable): FireworksProgram | undefined {
  const launchPoints = new Map(table.launchPoints.map(({ id, x, y = 15, z }) => [id, [x, y, z] as const]));
  const bursts: Burst[] = [];
  let end = 0;
  for (const { launchId, outer, inner, ...burst } of table.bursts) {
    const launch = launchId === undefined ? undefined : launchPoints.get(launchId);
    if ((launchId !== undefined && !launch) || burst.time < 0 || burst.radius <= 0 ||
        ![burst.time, burst.x, burst.y, burst.z, burst.radius].every(Number.isFinite) ||
        (launch && !launch.every(Number.isFinite))) return undefined;
    bursts.push({ ...burst, outer: new Color(outer), inner: new Color(inner), launch });
    end = Math.max(end, burst.time + burstTail);
  }
  const duration = table.duration ?? end;
  return bursts.length && Number.isFinite(duration) && duration > 0 ? { duration, bursts } : undefined;
}

const previewProgram: FireworksProgram = { duration: 15, bursts: previewBursts };
const ceremonyPrograms = Object.fromEntries(Object.entries(ceremonyBursts).map(([cue, bursts]) =>
  [cue, { duration: bursts.at(-1)!.time + burstTail, bursts }])) as Record<CeremonyFireworksCue, FireworksProgram>;

function maxLiveBursts(program: FireworksProgram) {
  return Math.max(0, ...program.bursts.map(({ time }) => {
    const start = Math.max(0, time - flight);
    return start >= program.duration ? 0 : program.bursts.filter(burst =>
      start >= burst.time - flight && start <= burst.time + burstTail).length;
  }));
}

export function createFestival(
  scene: Scene,
  setMessage: (message: string) => void = () => {},
  complete?: () => void,
) {
  // One rehearsal or player show, or the three concurrent acts of the same ceremony.
  const ceremonyPeak = Object.values(ceremonyPrograms).reduce((total, program) => total + maxLiveBursts(program), 0);
  const maxShowBursts = Math.max(playerBeatTimes.length, ceremonyPeak, maxLiveBursts(previewProgram));
  const capacity = maxShowBursts * sparkCount * trailCount + workshopSparkCount * trailCount;
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const strengths = new Float32Array(capacity);
  const radii = new Float32Array(capacity);
  const geometry = new BufferGeometry();
  const positionBuffer = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const colorBuffer = new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage);
  const strengthBuffer = new BufferAttribute(strengths, 1).setUsage(DynamicDrawUsage);
  const radiusBuffer = new BufferAttribute(radii, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionBuffer);
  geometry.setAttribute('sparkColor', colorBuffer);
  geometry.setAttribute('strength', strengthBuffer);
  geometry.setAttribute('radius', radiusBuffer);
  geometry.setDrawRange(0, 0);
  const buffers = [positionBuffer, colorBuffer, strengthBuffer, radiusBuffer];
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      attribute vec3 sparkColor;
      attribute float strength;
      attribute float radius;
      varying vec3 vColor;
      varying float vStrength;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vColor = sparkColor;
        vStrength = strength;
        gl_Position = projectionMatrix * view;
        gl_PointSize = clamp(radius * sqrt(105.0 / max(14.0, -view.z)), 1.8, 15.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vStrength;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float halo = 1.0 - smoothstep(0.2, 1.0, d);
        float core = 1.0 - smoothstep(0.08, 0.43, d);
        gl_FragColor = vec4(mix(vColor, vec3(1.0, 0.96, 0.84), core * 0.58),
          vStrength * (halo * 0.41 + core * 0.59));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sparks = new Points(geometry, material);
  sparks.name = '广场烟花';
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);

  let elapsed = -1;
  const tracks = new Map<FireworksProgram, number>();
  let playerProgram: FireworksProgram | undefined;
  let workshop: { burst: Burst; elapsed: number } | undefined;
  let used = 0;
  let message = '';
  let audio: AudioContext | undefined;
  let nextManualBell = 0;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function announce(next: string) {
    if (next === message) return;
    message = next;
    setMessage(next);
  }

  function tryEnableAudio() {
    try {
      audio ??= new AudioContext();
      return audio.state === 'running' ? Promise.resolve() : audio.resume().catch(() => {});
    } catch {
      // Browser permission and Web Audio availability do not affect the show.
    }
  }

  function emit(x: number, y: number, z: number, color: Color, strength: number, radius: number) {
    if (used >= capacity) return;
    const offset = used * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    strengths[used] = strength;
    radii[used] = radius;
    used++;
  }

  function drawRocket(burst: Burst, t: number) {
    const launchX = burst.launch?.[0] ?? Math.max(211, Math.min(235, burst.x));
    const launchY = burst.launch?.[1] ?? 15;
    const launchZ = burst.launch?.[2] ?? burst.z + 5;
    for (let i = 0; i < 6; i++) {
      const progress = Math.max(0, (t + flight - i * .025) / flight);
      emit(launchX + (burst.x - launchX) * progress * progress, launchY + (burst.y - launchY) * progress,
        launchZ + (burst.z - launchZ) * progress, cream, (6 - i) / 6, 8 - i * .65);
    }
  }

  function drawBurst(burst: Burst, t: number, maxSparks = sparkCount) {
    const particleCount = reducedMotion ? Math.min(32, maxSparks) : maxSparks;
    const echoes = reducedMotion ? 1 : trailCount;
    for (let i = 0; i < particleCount; i++) {
      const angle = i * 2.399963 + burst.x;
      const height = 1 - 2 * (i + .5) / particleCount;
      const circle = Math.sqrt(1 - height * height);
      const ring = burst.shape === 'ring';
      const willow = burst.shape === 'willow';
      const dx = Math.cos(angle) * (ring ? 1 : circle);
      const dy = ring ? Math.sin(angle) : height;
      const dz = ring ? Math.sin(angle) * .25 : Math.sin(angle) * circle;
      const speed = (.76 + ((i * 17) % 31) / 86) * burst.radius;
      const tint = i % 5 === 0 ? burst.inner : burst.outer;
      for (let trail = 0; trail < echoes; trail++) {
        const age = t - trail * (willow ? .105 : .055);
        if (age < 0 || age > lifetime) continue;
        const spread = speed * (1 - Math.exp(-age * 1.52));
        const gravity = age * age * (willow ? 2.1 : 1.15);
        const intensity = Math.pow(1 - age / lifetime, 1.28) * (1 - trail * .23);
        const flicker = age < .35 || i % 4 !== 0 || Math.sin(i * 8 + age * 24) > -.43 ? 1 : .3;
        emit(burst.x + dx * spread, burst.y + dy * spread - gravity, burst.z + dz * spread,
          tint, intensity * flicker, trail ? 4.7 : 7.8);
      }
    }
  }

  function drawSequence(sequence: readonly Burst[], time: number) {
    for (const burst of sequence) {
      const age = time - burst.time;
      if (age < -flight || age > burstTail) continue;
      if (age < 0) drawRocket(burst, age);
      else drawBurst(burst, age);
    }
  }

  function launch(program: FireworksProgram, ageSeconds: number) {
    if (tracks.has(program) || !Number.isFinite(ageSeconds) || ageSeconds >= program.duration) return false;
    tracks.set(program, ageSeconds);
    return true;
  }

  function stopPreview() {
    if (elapsed < 0) return;
    elapsed = -1;
    announce('');
  }

  function startShow(table: FireworksTable, opts: { ageSeconds?: number; interruptPreview?: boolean } = {}) {
    if (tracks.size || (elapsed >= 0 && !opts.interruptPreview)) return false;
    const program = compileShow(table);
    if (!program || maxLiveBursts(program) > maxShowBursts || !launch(program, opts.ageSeconds ?? 0)) return false;
    stopPreview();
    playerProgram = program;
    return true;
  }

  return {
    startShow,
    showActive() { return elapsed >= 0 || tracks.size > 0; },
    enableAudio() { void tryEnableAudio(); },
    playCeremonyBell(kind: 'tick' | 'hourly' | 'grand', distance: number) {
      if (audio) playTowerBell(audio, kind === 'hourly' ? 'small' : kind, distance, kind === 'hourly' ? 3 : 1);
    },
    launchCeremony(cue: CeremonyFireworksCue, ageSeconds = 0) {
      if (!launch(ceremonyPrograms[cue], ageSeconds)) return false;
      stopPreview();
      if (playerProgram) {
        tracks.delete(playerProgram);
        playerProgram = undefined;
      }
      return true;
    },
    launchPublicFireworks(seed: number, theme: FireworksTheme, ageSeconds = 0) {
      if (!isFireworksSeed(seed) || !isFireworksTheme(theme)) return false;
      return startShow(makePlayerFireworksTable(seed, theme), { ageSeconds, interruptPreview: true });
    },
    start() {
      if (elapsed >= 0 || tracks.size) return false;
      elapsed = 0;
      tryEnableAudio();
      announce('3');
      return true;
    },
    ringBell(distance = 0) {
      if (elapsed >= 0) return false;
      const now = performance.now();
      if (now < nextManualBell) return false;
      nextManualBell = now + 10500;
      void tryEnableAudio()?.then(() => { if (audio && elapsed < 0) playTowerBell(audio, 'small', distance); });
      return true;
    },
    playRiddleChime() {
      void tryEnableAudio()?.then(() => {
        if (!audio || audio.state !== 'running') return;
        const now = audio.currentTime;
        const note = audio.createOscillator();
        const volume = audio.createGain();
        note.type = 'sine';
        note.frequency.setValueAtTime(1047, now);
        volume.gain.setValueAtTime(.0001, now);
        volume.gain.exponentialRampToValueAtTime(.06, now + .02);
        volume.gain.exponentialRampToValueAtTime(.0001, now + .3);
        note.connect(volume).connect(audio.destination);
        note.start(now);
        note.stop(now + .31);
      });
    },
    launchWorkshopBurst(x: number, y: number, z: number) {
      if (workshop) return false;
      workshop = {
        burst: { time: 0, x, y, z, radius: 3.4, shape: 'peony', outer: gold, inner: cream },
        elapsed: 0,
      };
      return true;
    },
    active() { return elapsed >= 0; },
    update(dt: number) {
      if (elapsed < 0 && !workshop && !tracks.size) return;
      const delta = Math.max(0, dt);
      used = 0;
      if (elapsed >= 0) {
        const previous = elapsed;
        elapsed += delta;
        if (elapsed < countdown) {
          announce(String(Math.ceil(countdown - elapsed)));
        } else {
          if (previous < countdown && audio) playTowerChime(audio, 0, 3);
          const time = elapsed - countdown;
          announce(time < 3.8 ? '新年快乐！' : '');
          if (time >= previewProgram.duration) {
            elapsed = -1;
            complete?.();
          } else {
            drawSequence(previewProgram.bursts, time);
          }
        }
      }
      for (const [program, age] of tracks) {
        const time = age + delta;
        if (time >= program.duration) {
          tracks.delete(program);
          if (program === playerProgram) playerProgram = undefined;
        } else {
          tracks.set(program, time);
          if (time >= 0) drawSequence(program.bursts, time);
        }
      }
      if (workshop) {
        workshop.elapsed += delta;
        if (workshop.elapsed > burstTail) workshop = undefined;
        else drawBurst(workshop.burst, workshop.elapsed, workshopSparkCount);
      }
      sparks.visible = used > 0;
      geometry.setDrawRange(0, used);
      if (!sparks.visible) return;
      for (const buffer of buffers) {
        buffer.clearUpdateRanges();
        buffer.addUpdateRange(0, used * buffer.itemSize);
        buffer.needsUpdate = true;
      }
    },
  };
}
