import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Points, ShaderMaterial,
  type ColorRepresentation, type Scene,
} from 'three';
import { playTowerBell, playTowerChime } from '../tower-chime';
import {
  fireworksShowMs, isFireworksSeed, isFireworksTheme, publicFireworksStand, type FireworksTheme,
} from '../../../src/presence/firework-sites';
import {
  personalFireworkParticleLimit, personalFireworkVisibleLimit, type PersonalFireworkKind, type PersonalFireworkParticle,
} from './personal-fireworks';
import { createCeremonyFireworksDispatch } from './ceremony-fireworks-clock';
import {
  burstEchoes, burstEnd, burstLifetime, burstSparks, ceremonyCueOffsets, makeCelebrationTestScore, makeCeremonyScores,
  scorePeak, showBurstTail, showFlightSeconds, showPointLimit, type CeremonyFireworksCue, type ShellGrade, type ShellShape,
} from './celebration-fireworks-score';

import { createFireworksAudio, fireworksBed, type FireworksSoundEvent } from './celebration-fireworks-audio';

export type { CeremonyFireworksCue } from './celebration-fireworks-score';

type Burst = {
  time: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  shape: ShellShape;
  grade?: ShellGrade;
  outer: Color;
  inner: Color;
  launch?: readonly [x: number, y: number, z: number];
};

type FireworksProgram = { duration: number; bursts: readonly Burst[]; sound?: 'overture' | 'main' | 'test' };

export type FireworksTable = {
  duration?: number;
  sound?: FireworksProgram['sound'];
  bursts: readonly (Omit<Burst, 'outer' | 'inner' | 'launch'> & {
    outer: ColorRepresentation;
    inner: ColorRepresentation;
    launchId?: string;
  })[];
  launchPoints: readonly { id: string; x: number; y?: number; z: number }[];
};

const countdown = 3;
const trailCount = 3;
const burstTail = showBurstTail;
const flight = showFlightSeconds;
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

function makeFireworksRandom(seed: number) {
  let rng = seed >>> 0;
  return () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 0x100000000;
  };
}

export function makeTestFireworksTable(seed: number, groundHeight: (x: number, n: number) => number = () => 15): FireworksTable {
  return { ...makeCelebrationTestScore(seed, groundHeight), sound: 'test' };
}

export function makePlayerFireworksTable(seed: number, theme: FireworksTheme): FireworksTable {
  const shapePattern = patterns[seed % patterns.length];
  const palette = themeColors[theme];
  const random = makeFireworksRandom(seed);
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
    end = Math.max(end, burstEnd(burst));
  }
  const duration = table.duration ?? end;
  return bursts.length && Number.isFinite(duration) && duration > 0 && scorePeak(bursts).points <= showPointLimit
    ? { duration, bursts, sound: table.sound }
    : undefined;
}

const previewProgram: FireworksProgram = { duration: 15, bursts: previewBursts };
export function createFestival(
  scene: Scene,
  setMessage: (message: string) => void = () => {},
  complete?: () => void,
  groundHeight: (x: number, n: number) => number = () => 15,
) {
  const { prelude, scores } = makeCeremonyScores(groundHeight);
  const ceremonyPrograms = Object.fromEntries(Object.entries(scores).map(([cue, score]) =>
    [cue, compileShow({ ...score, sound: 'main' })])) as Record<CeremonyFireworksCue, FireworksProgram | undefined>;
  const preludeProgram = compileShow({ ...prelude, sound: 'overture' });
  const ceremonyPeak = scorePeak(Object.entries(scores).flatMap(([cue, score]) => score.bursts.map(burst =>
    ({ ...burst, time: burst.time + ceremonyCueOffsets[cue as CeremonyFireworksCue] }))));
  const ceremonyFits = ceremonyPeak.points <= showPointLimit && ceremonyPeak.blooms <= 20;
  const personalCapacity = personalFireworkVisibleLimit * personalFireworkParticleLimit;
  const capacity = showPointLimit + workshopSparkCount * trailCount + personalCapacity;
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
  const tracks = new Map<FireworksProgram, { age: number; clockMs?: () => number; startedAt: number }>();
  const hasMainTrack = () => [...tracks.keys()].some(program => program.sound !== 'overture');
  let playerProgram: FireworksProgram | undefined;
  let workshop: { burst: Burst; elapsed: number } | undefined;
  let used = 0;
  let personalFrame: readonly PersonalFireworkParticle[] = [];
  let drewPersonal = false;
  const personalTint = new Color();
  let message = '';
  let audio: AudioContext | undefined;
  let nextManualBell = 0;
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const showAudio = createFireworksAudio(() => audio, reducedMotion);
  let bedThrough: number | undefined;

  function announce(next: string) {
    if (next === message) return;
    message = next;
    setMessage(next);
  }

  function getAudioContext() {
    return audio ??= new AudioContext();
  }

  function tryEnableAudio() {
    try {
      const context = getAudioContext();
      return context.state === 'running' ? Promise.resolve() : context.resume().catch(() => {});
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

  function drawBurst(burst: Burst, t: number, maxSparks = burstSparks(burst)) {
    const particleCount = reducedMotion ? Math.min(32, maxSparks) : maxSparks;
    const echoes = reducedMotion ? 1 : burstEchoes(burst);
    const lifetime = burstLifetime(burst);
    const brocade = burst.shape === 'brocade';
    const willow = burst.shape === 'willow' || brocade;
    const ring = burst.shape === 'ring' || burst.shape === 'double-ring';
    const trailSpacing = willow ? .105 : burst.shape === 'chrysanthemum' ? .03 : .055;
    for (let i = 0; i < particleCount; i++) {
      const angle = i * 2.399963 + burst.x;
      const height = 1 - 2 * (i + .5) / particleCount;
      const circle = Math.sqrt(1 - height * height);
      const dx = Math.cos(angle) * (ring ? 1 : circle);
      const dy = ring ? Math.sin(angle) : height;
      const dz = ring ? Math.sin(angle) * .25 : Math.sin(angle) * circle;
      const innerRing = burst.shape === 'double-ring' && i >= particleCount / 1.6;
      const speed = (.76 + ((i * 17) % 31) / 86) * burst.radius * (innerRing ? .6 : 1);
      const tint = i % 5 === 0 ? burst.inner : burst.outer;
      for (let trail = 0; trail < echoes; trail++) {
        const age = t - trail * trailSpacing;
        if (age < 0 || age > lifetime) continue;
        const spread = speed * (1 - Math.exp(-age * 1.52));
        const gravity = age * age * (brocade ? 2.6 : willow ? 2.1 : 1.15);
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
      if (age < -flight || time > burstEnd(burst)) continue;
      if (age < 0) drawRocket(burst, age);
      else drawBurst(burst, age);
    }
  }

  function launch(program: FireworksProgram, ageSeconds: number, clockMs?: () => number, startAt?: number) {
    if (tracks.has(program) || !Number.isFinite(ageSeconds) || ageSeconds >= program.duration) return false;
    tracks.set(program, { age: ageSeconds, clockMs, startedAt: startAt ?? (clockMs ? clockMs() - ageSeconds * 1000 : 0) });
    return true;
  }

  function stopPreview() {
    if (elapsed < 0) return;
    elapsed = -1;
    announce('');
  }

  function startShow(table: FireworksTable, opts: { ageSeconds?: number; interruptPreview?: boolean; clockMs?: () => number } = {}) {
    if (hasMainTrack() || (elapsed >= 0 && !opts.interruptPreview && !opts.clockMs)) return false;
    const program = compileShow(table);
    if (!program || !launch(program, opts.ageSeconds ?? 0, opts.clockMs)) return false;
    stopPreview();
    playerProgram = program;
    return true;
  }

  const dispatchCeremony = createCeremonyFireworksDispatch(flight);
  function launchTimedCeremony(program: FireworksProgram, startAt: number, clockMs: () => number) {
    return dispatchCeremony(program, startAt, clockMs(), clockMs, (remaining, playback) => {
      if (!launch(remaining, playback.ageSeconds, playback.clockMs, playback.startAt)) return false;
      if (program.sound === 'overture') return true;
      stopPreview();
      if (playerProgram) {
        tracks.delete(playerProgram);
        playerProgram = undefined;
      }
      return true;
    });
  }

  return {
    startShow,
    showActive() { return elapsed >= 0 || hasMainTrack(); },
    mountAudioSettings: showAudio.mountSettings,
    getAudioContext,
    enableAudio() { void tryEnableAudio(); },
    playCeremonyBell(kind: 'tick' | 'hourly' | 'grand', distance: number) {
      if (audio) playTowerBell(audio, kind === 'hourly' ? 'small' : kind, distance, kind === 'hourly' ? 3 : 1);
    },
    launchCeremony(cue: CeremonyFireworksCue, startAt: number, clockMs: () => number) {
      const program = ceremonyPrograms[cue];
      return Boolean(ceremonyFits && program && launchTimedCeremony(program, startAt, clockMs));
    },
    launchOverture(startAt: number, clockMs: () => number) {
      return Boolean(preludeProgram && launchTimedCeremony(preludeProgram, startAt, clockMs));
    },
    launchPublicFireworks(seed: number, theme: FireworksTheme, ageSeconds = 0) {
      if (!isFireworksSeed(seed) || !isFireworksTheme(theme)) return false;
      return startShow(makePlayerFireworksTable(seed, theme), { ageSeconds, interruptPreview: true });
    },
    start() {
      if (elapsed >= 0 || hasMainTrack()) return false;
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
    setPersonalFireworkFrame(particles: readonly PersonalFireworkParticle[]) { personalFrame = particles; },
    playPersonalFirework(kind: PersonalFireworkKind, distance: number, ceremony = false, delaySeconds = 0) {
      if (!audio || audio.state !== 'running' || !Number.isFinite(distance) || distance < 0) return;
      const hits = kind === 'string' ? 10 : 1;
      const wait = kind === 'string' ? 2 : kind === 'rocket' ? 1.2 : 0;
      const gain = (.13 / (1 + (distance / 16) ** 2)) * (ceremony ? .35 : 1);
      const audioNow = audio.currentTime;
      for (let i = 0; i < hits; i++) {
        const offset = delaySeconds + wait + .30 * i;
        if (offset < -.2) continue;
        const time = audioNow + Math.max(0, offset);
        const pop = audio.createOscillator();
        const volume = audio.createGain();
        pop.type = 'triangle';
        const pitch = kind === 'sparkler' ? 920 : kind === 'rocket' ? 132 : 330 + (i % 3) * 52;
        pop.frequency.setValueAtTime(pitch, time);
        pop.frequency.exponentialRampToValueAtTime(pitch * .38, time + .11);
        volume.gain.setValueAtTime(gain, time);
        volume.gain.exponentialRampToValueAtTime(.0001, time + .12);
        pop.connect(volume).connect(audio.destination);
        pop.start(time);
        pop.stop(time + .13);
      }
    },
    active() { return elapsed >= 0; },
    update(dt: number, sound?: { listener: { x: number; y: number; z: number }; ceremonyElapsed?: number; musicLevel: number }) {
      const events: FireworksSoundEvent[] = [];
      const formalTime = sound?.ceremonyElapsed;
      let musicTime = formalTime;
      if (sound && formalTime !== undefined && formalTime >= 8 && formalTime < 24 && !reducedMotion) {
        events.push(...fireworksBed(Math.max(bedThrough ?? formalTime, formalTime - .15), formalTime, 8, 24, sound.listener));
        bedThrough = formalTime;
      } else bedThrough = undefined;
      if (elapsed < 0 && !workshop && !tracks.size && !personalFrame.length && !drewPersonal) {
        if (sound) showAudio.music(musicTime, sound.musicLevel);
        return;
      }
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
      for (const [program, track] of tracks) {
        const time = track.clockMs ? (track.clockMs() - track.startedAt) / 1000 : track.age + delta;
        if (time >= program.duration) {
          tracks.delete(program);
          if (program === playerProgram) playerProgram = undefined;
        } else {
          const previous = Math.max(track.age, time - .20);
          if (sound && program.sound && time >= 0) {
            const { listener } = sound;
            const distanceTo = (x: number, y: number, z: number) =>
              Math.hypot(listener.x - x, listener.y - y, listener.z - z);
            for (const burst of program.bursts) {
              const rocket = burst.time - flight;
              const seed = Math.round(burst.x * 997 + burst.z * 37 + burst.time * 1000);
              if (burst.launch && rocket >= previous && rocket < time) {
                events.push({ kind: 'whoosh', offset: rocket - time, distance: distanceTo(...burst.launch), seed });
              }
              if (burst.time >= previous && burst.time < time) {
                events.push({ kind: 'boom', offset: burst.time - time, distance: distanceTo(burst.x, burst.y, burst.z), grade: burst.grade, seed });
              }
            }
            if (program.sound === 'test') {
              if (musicTime === undefined) musicTime = (time - 5) * 1.5;
              if (!reducedMotion) events.push(...fireworksBed(previous, time, 5, 27, listener));
            }
          }
          track.age = time;
          if (time >= 0) drawSequence(program.bursts, time);
        }
      }
      if (sound) {
        showAudio.play(events);
        showAudio.music(musicTime, sound.musicLevel);
      }
      if (workshop) {
        workshop.elapsed += delta;
        if (workshop.elapsed > burstTail) workshop = undefined;
        else drawBurst(workshop.burst, workshop.elapsed, workshopSparkCount);
      }
      drewPersonal = personalFrame.length > 0;
      for (let i = 0; i < Math.min(personalFrame.length, personalCapacity); i++) {
        const particle = personalFrame[i];
        emit(particle.x, particle.y, particle.z, personalTint.setHex(particle.tint), particle.opacity, particle.radius);
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
