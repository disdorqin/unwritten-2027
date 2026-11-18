import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Points, ShaderMaterial, type Scene,
} from 'three';
import { playTowerBell, playTowerChime } from '../tower-chime';

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

const countdown = 3;
const duration = 15;
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

function maxLiveBursts(sequence: readonly Burst[]) {
  return Math.max(...sequence.map(({ time }) => {
    const start = time - flight;
    return sequence.filter(burst => start >= burst.time - flight && start <= burst.time + burstTail).length;
  }));
}

// Even an overlapping rehearsal, formal cues and workshop reward share one preallocated buffer.
const capacity = (maxLiveBursts(previewBursts)
  + Object.values(ceremonyBursts).reduce((total, sequence) => total + maxLiveBursts(sequence), 0))
  * sparkCount * trailCount + workshopSparkCount * trailCount;

export function createFestival(
  scene: Scene,
  setMessage: (message: string) => void = () => {},
  complete?: () => void,
) {
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
  const ceremonyTracks = new Map<CeremonyFireworksCue, number>();
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

  return {
    enableAudio() { void tryEnableAudio(); },
    playCeremonyBell(kind: 'tick' | 'hourly' | 'grand', distance: number) {
      if (audio) playTowerBell(audio, kind === 'hourly' ? 'small' : kind, distance, kind === 'hourly' ? 3 : 1);
    },
    launchCeremony(cue: CeremonyFireworksCue, ageSeconds = 0) {
      const sequence = ceremonyBursts[cue];
      if (ceremonyTracks.has(cue) || !Number.isFinite(ageSeconds) || ageSeconds >= sequence.at(-1)!.time + burstTail) return false;
      ceremonyTracks.set(cue, Math.max(0, ageSeconds));
      return true;
    },
    start() {
      if (elapsed >= 0) return false;
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
      if (elapsed < 0 && !workshop && !ceremonyTracks.size) return;
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
          if (time >= duration) {
            elapsed = -1;
            complete?.();
          } else {
            drawSequence(previewBursts, time);
          }
        }
      }
      for (const [cue, age] of ceremonyTracks) {
        const sequence = ceremonyBursts[cue];
        const time = age + delta;
        if (time >= sequence.at(-1)!.time + burstTail) ceremonyTracks.delete(cue);
        else {
          ceremonyTracks.set(cue, time);
          drawSequence(sequence, time);
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
      positionBuffer.needsUpdate = true;
      colorBuffer.needsUpdate = true;
      strengthBuffer.needsUpdate = true;
      radiusBuffer.needsUpdate = true;
    },
  };
}
