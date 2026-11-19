import { BufferAttribute, BufferGeometry, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector2 } from 'three';
import { scaledDrawCount } from './town-quality';

const count = 1_580;
const foregroundCount = 530;
const stormCount = count;
const stormFade = .11;

export function createSnowfall(scene: Scene) {
  const seeds = new Float32Array((count + stormCount) * 3);
  const flakes = new Float32Array((count + stormCount) * 4);
  let seed = 352811;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let i = 0; i < count + stormCount; i++) {
    const additional = i >= count;
    const foreground = additional ? (i - count) % 3 === 0 : i < foregroundCount;
    const threshold = additional ? (i - count) / stormCount * (1 - stormFade) : -stormFade;
    seeds.set([random(), random(), random()], i * 3);
    flakes.set([foreground ? 0 : 1, random(), random(), threshold], i * 4);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(seeds, 3));
  geometry.setAttribute('flake', new BufferAttribute(flakes, 4));
  geometry.setDrawRange(0, count);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      storm: { value: 0 },
      elevationMode: { value: 0 },
      viewportHeight: { value: 640 },
      pixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 flake;
      uniform float time;
      uniform float storm;
      uniform float elevationMode;
      uniform float viewportHeight;
      uniform float pixelRatio;
      varying float opacity;
      varying float tilt;

      void main() {
        float background = flake.x;
        vec3 walkVolume = mix(vec3(37., 21., 37.), vec3(135., 85., 135.), background);
        vec3 orbitVolume = mix(vec3(74., 56., 74.), vec3(245., 178., 245.), background);
        vec3 volume = mix(walkVolume, orbitVolume, elevationMode);
        float phase = 6.28318 * flake.y;
        float flutter = time * mix(.85, 2.0, flake.z) + phase;
        vec3 wind = vec3(mix(.9, 2.7, flake.z), -mix(2.7, 4.7, flake.y), mix(.28, .8, flake.z));
        wind *= mix(1., 2.2, elevationMode);
        vec3 drift = time * wind + vec3(sin(flutter), 0., cos(flutter * .72)) * .72;
        // Wrap a world-aligned field around the viewer without attaching snow to the camera.
        vec3 local = mod((position - .5) * volume + drift - cameraPosition + volume * .5, volume) - volume * .5;
        vec4 viewPosition = viewMatrix * vec4(cameraPosition + local, 1.);
        float distanceFromEye = length(local);
        vec3 fadePosition = abs(local) / (volume * .5);
        float boundary = 1. - smoothstep(.72, 1., max(fadePosition.x, max(fadePosition.y, fadePosition.z)));
        float nearFade = smoothstep(.85, 2.6, distanceFromEye);
        float visible = smoothstep(flake.w, flake.w + ${stormFade}, storm);
        opacity = mix(.9, .63, background) * boundary * nearFade * mix(.69, 1., flake.y) * visible;
        tilt = .36 + .23 * sin(flutter * 1.42);
        float diameter = mix(.062, .144, flake.z) * mix(1., 3.05, elevationMode);
        diameter *= mix(1., 1.65, background) * mix(1., 1.12, storm);
        float pixels = .5 * diameter * projectionMatrix[1][1] * viewportHeight / max(.1, -viewPosition.z);
        float minPixels = mix(mix(3.2, 2.1, background), mix(3.65, 2.55, background), elevationMode);
        gl_PointSize = clamp(pixels, minPixels * pixelRatio, mix(12., 7., background) * pixelRatio);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float opacity;
      varying float tilt;

      void main() {
        vec2 point = gl_PointCoord * 2. - 1.;
        point = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * point;
        float radius = length(point * vec2(1.27, .91));
        float core = 1. - smoothstep(.24, .78, radius);
        float fringe = 1. - smoothstep(.55, 1., radius);
        float alpha = opacity * max(core, fringe * .29);
        if (alpha < .012) discard;
        gl_FragColor = vec4(mix(vec3(.27, .36, .53), vec3(.86, .93, 1.), core), alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  // Quality tiers (M5) thin the falling snow by draw range only: the flake
  // field, its seeds and the storm reveal order are unchanged, fewer of the
  // buffer's flakes are drawn. Storm extras sit after the base flakes in
  // threshold order, so one scaled range serves both.
  let densityScale = 1;
  let stormExtra = 0;
  function applyDrawRange() {
    geometry.setDrawRange(0, scaledDrawCount(count + stormExtra, densityScale, count + stormCount));
  }

  const particles = new Points(geometry, material);
  particles.name = 'Drifting snow';
  particles.frustumCulled = false;
  particles.renderOrder = 90;
  const bufferSize = new Vector2();
  particles.onBeforeRender = renderer => {
    material.uniforms.viewportHeight.value = renderer.getDrawingBufferSize(bufferSize).y;
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  };
  scene.add(particles);
  let active = true;

  return {
    update(_camera: PerspectiveCamera, dt: number, walking: boolean, sheltered = false) {
      particles.visible = active && !sheltered;
      material.uniforms.elevationMode.value = walking ? 0 : 1;
      // Integrate speed into time so changing the weather never teleports existing snow.
      if (active) material.uniforms.time.value += dt * (1 + material.uniforms.storm.value * .42);
    },
    setIntensity(intensity: number) {
      if (!Number.isFinite(intensity)) return;
      const storm = Math.max(0, Math.min(1, (intensity - 1) / 3));
      if (storm === material.uniforms.storm.value) return;
      material.uniforms.storm.value = storm;
      stormExtra = Math.min(stormCount, Math.ceil(storm / (1 - stormFade) * stormCount));
      applyDrawRange();
    },
    setDensityScale(scale: number) {
      if (!Number.isFinite(scale) || scale <= 0 || scale === densityScale) return;
      densityScale = scale;
      applyDrawRange();
    },
    setEnabled(enabled: boolean) { active = enabled; },
    enabled() { return active; },
  };
}
