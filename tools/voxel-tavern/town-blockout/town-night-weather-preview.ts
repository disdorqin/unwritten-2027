import {
  AmbientLight, BoxGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, Fog, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PerspectiveCamera, PlaneGeometry, PointLight, Scene, SphereGeometry, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  townNightWeatherAt, townNightWeatherDayMs, townNightWeatherDefaultDawnEpoch,
  mixTownSkyColor, type TownNightWeatherSample,
} from '../../../src/shared/town-night-weather-cycle';
import { createTownNightWeatherSky } from './town-night-weather-sky';

/**
 * FR-10 独立验收预览：复用生产 rig 与同一权威采样函数。
 * 这里不引入任何天气/积雪/玩法逻辑，画面上只验证昼夜的连续光影与雾色。
 */

type PreviewState = Readonly<{
  phase: number;
  phaseName: string;
  clock: string;
  nightSide: boolean;
  lampLevel: number;
  sunIntensity: number;
  ambientIntensity: number;
  exposure: number;
  fogFar: number;
  playing: boolean;
  speed: number;
}>;

declare global {
  interface Window {
    __FR10_PREVIEW__?: {
      ready: true;
      setPhase(phase: number): void;
      setSpeed(speed: number): void;
      play(): void;
      pause(): void;
      state(): PreviewState;
      sample(): TownNightWeatherSample;
    };
  }
}

const dawn = townNightWeatherDefaultDawnEpoch;
const dayMs = townNightWeatherDayMs;
const phases: ReadonlyArray<readonly [number, string]> = [
  [0, '日出'], [.03, '朝阳'], [.2, '白昼'], [.47, '午后'], [.53, '黄昏'], [.578, '日落'],
  [.6, '入夜'], [.66, '初夜'], [.78, '深夜'], [.9, '极夜'], [.96, '拂晓'],
];

function mixCss(from: number, to: number, t: number): string {
  return `#${mixTownSkyColor(from, to, t).toString(16).padStart(6, '0')}`;
}

function buildTown(scene: Scene) {
  const snow = new MeshLambertMaterial({ color: '#dbe5ef' });
  const packedSnow = new MeshLambertMaterial({ color: '#c9d6e3' });
  const wallColors = ['#6b594a', '#5b4a3e', '#75614f', '#4f4038', '#665848'];
  const roofSnow = new MeshLambertMaterial({ color: '#e8eef5' });
  const eave = new MeshLambertMaterial({ color: '#3d322b' });
  const windowMaterial = new MeshBasicMaterial({ color: '#24324c' });
  const lampGlass = new MeshBasicMaterial({ color: '#5a6b82' });
  const post = new MeshLambertMaterial({ color: '#2f2a28' });
  const pine = new MeshLambertMaterial({ color: '#2b4136' });
  const pineSnow = new MeshLambertMaterial({ color: '#dfe9f2' });
  const trunk = new MeshLambertMaterial({ color: '#41322a' });
  const ridge = new MeshLambertMaterial({ color: '#2f3f59' });
  const ridgeSnow = new MeshLambertMaterial({ color: '#9fb3c9' });
  const lamps: PointLight[] = [];

  const ground = new Mesh(new PlaneGeometry(640, 640, 32, 32), snow);
  ground.rotation.x = -Math.PI / 2;
  const positions = ground.geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getY(index);
    positions.setZ(index, Math.sin(x * .022) * .55 + Math.cos(z * .018) * .45);
  }
  ground.geometry.computeVertexNormals();
  scene.add(ground);

  const plaza = new Mesh(new CircleGeometry(24, 40), packedSnow);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = .12;
  scene.add(plaza);

  const houses: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [-30, -18, 12, 9, 7, .12], [-12, -27, 10, 8, 6.2, -.18], [13, -24, 13, 9, 7.4, .05],
    [30, -10, 10, 8, 6.4, -.22], [28, 15, 12, 9, 6.8, .1], [8, 27, 11, 8, 6.2, .24],
    [-16, 28, 12, 8, 6.8, -.12], [-32, 8, 10, 8, 6, .05],
  ];
  for (const [x, z, width, depth, height, rotation] of houses) {
    const house = new Group();
    house.position.set(x, 0, z);
    house.rotation.y = rotation;
    const wall = new Mesh(new BoxGeometry(width, height, depth),
      new MeshLambertMaterial({ color: wallColors[Math.abs(Math.round(x + z)) % wallColors.length] }));
    wall.position.y = height / 2;
    house.add(wall);
    const eaveMesh = new Mesh(new BoxGeometry(width + 1.2, .45, depth + 1.2), eave);
    eaveMesh.position.y = height + .1;
    house.add(eaveMesh);
    const roof = new Mesh(new BoxGeometry(width + 1.8, .55, depth + 1.8), roofSnow);
    roof.position.y = height + .6;
    house.add(roof);
    const chimney = new Mesh(new BoxGeometry(1.1, 2.4, 1.1), eave);
    chimney.position.set(width * .28, height + 1.4, -depth * .22);
    house.add(chimney);
    const face = new Mesh(new BoxGeometry(width * .16, height * .34, .12), windowMaterial);
    face.position.set(-width * .24, height * .58, -depth / 2 - .07);
    house.add(face);
    const face2 = new Mesh(new BoxGeometry(width * .16, height * .34, .12), windowMaterial);
    face2.position.set(width * .24, height * .58, -depth / 2 - .07);
    house.add(face2);
    scene.add(house);
  }

  const trees: ReadonlyArray<readonly [number, number, number]> = [
    [-52, -38, 1.15], [-42, 26, .9], [-56, 4, 1.3], [-8, -48, 1.1], [20, -44, 1.25],
    [44, -30, .95], [52, 12, 1.2], [38, 40, 1.05], [4, 46, .9], [-28, 44, 1.15],
    [58, -52, 1.35], [-62, -20, 1], [-44, 52, 1.1], [64, 30, 1.05],
  ];
  for (const [x, z, scale] of trees) {
    const tree = new Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    const base = new Mesh(new CylinderGeometry(.42, .52, 3.4, 6), trunk);
    base.position.y = 1.7;
    tree.add(base);
    for (let tier = 0; tier < 3; tier += 1) {
      const radius = 3.7 - tier * .95;
      const cone = new Mesh(new ConeGeometry(radius, 3.2, 7), pine);
      cone.position.y = 3.8 + tier * 2.35;
      tree.add(cone);
      const cap = new Mesh(new ConeGeometry(radius * .74, 1.35, 7), pineSnow);
      cap.position.y = 4.65 + tier * 2.35;
      tree.add(cap);
    }
    scene.add(tree);
  }

  const lampSpots: ReadonlyArray<readonly [number, number]> = [[0, 0], [-20, -16], [18, -14], [16, 18], [-18, 18]];
  for (const [x, z] of lampSpots) {
    const group = new Group();
    group.position.set(x, 0, z);
    const pole = new Mesh(new CylinderGeometry(.16, .22, 5.2, 6), post);
    pole.position.y = 2.6;
    group.add(pole);
    const glass = new Mesh(new SphereGeometry(.62, 12, 8), lampGlass);
    glass.position.y = 5.5;
    group.add(glass);
    const light = new PointLight(0xffd79a, 0, 38, 2);
    light.position.y = 5.4;
    group.add(light);
    lamps.push(light);
    scene.add(group);
  }

  for (let index = 0; index < 7; index += 1) {
    const x = -260 + index * 82;
    const z = -250 - (index % 3) * 24;
    const height = 70 + (index % 4) * 26;
    const peak = new Mesh(new ConeGeometry(56, height, 4), ridge);
    peak.position.set(x, height / 2 - 6, z);
    peak.rotation.y = Math.PI / 4;
    scene.add(peak);
    const cap = new Mesh(new ConeGeometry(24, height * .32, 4), ridgeSnow);
    cap.position.set(x, height - 12, z);
    cap.rotation.y = Math.PI / 4;
    scene.add(cap);
  }

  return { windowMaterial, lampGlass, lamps };
}

function drawCycleChart(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const skyHeight = Math.round(height * .5);
  const curveTop = skyHeight + 6;
  const curveHeight = height - curveTop - 8;
  const sampleAt = (ratio: number) => townNightWeatherAt(dawn + ratio * dayMs, dawn);
  const colorOf = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

  for (let x = 0; x < width; x += 1) {
    context.fillStyle = colorOf(sampleAt(x / (width - 1)).skyColor);
    context.fillRect(x, 0, 1, skyHeight);
  }
  context.fillStyle = '#07101a';
  context.fillRect(0, skyHeight, width, height - skyHeight);
  context.strokeStyle = '#ffffff10';
  context.lineWidth = 1;
  for (let step = 1; step < 10; step += 1) {
    const x = Math.round(width * step / 10) + .5;
    context.beginPath();
    context.moveTo(x, skyHeight);
    context.lineTo(x, height);
    context.stroke();
  }

  const lampCurve = new Path2D();
  const sunCurve = new Path2D();
  for (let x = 0; x < width; x += 1) {
    const sample = sampleAt(x / (width - 1));
    const lampY = height - 6 - sample.lampLevel * curveHeight;
    const sunY = height - 6 - Math.min(1, sample.sunIntensity / 1.9) * curveHeight;
    if (x === 0) {
      lampCurve.moveTo(x, lampY);
      sunCurve.moveTo(x, sunY);
    } else {
      lampCurve.lineTo(x, lampY);
      sunCurve.lineTo(x, sunY);
    }
  }
  context.lineWidth = 2;
  context.strokeStyle = '#e8c184';
  context.stroke(lampCurve);
  context.strokeStyle = '#ffe39a';
  context.stroke(sunCurve);

  const duskX = Math.round(width * .6) + .5;
  context.setLineDash([5, 5]);
  context.strokeStyle = '#ffffff40';
  context.beginPath();
  context.moveTo(duskX, 0);
  context.lineTo(duskX, height);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#cfe2f2aa';
  context.font = '11px "Segoe UI",system-ui,sans-serif';
  context.fillText('入夜 0.60', duskX + 6, 14);
}


export function startTownNightWeatherPreview(host: HTMLElement) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(52, innerWidth / innerHeight, .1, 1400);
  camera.position.set(48, 29, 62);
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  host.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = .07;
  controls.minDistance = 24;
  controls.maxDistance = 190;
  controls.maxPolarAngle = Math.PI * .48;
  controls.update();

  const ambient = new AmbientLight('#ffffff', 1);
  const sun = new DirectionalLight('#ffffff', 1);
  scene.add(ambient, sun);

  const fog = new Fog('#adc2dd', 80, 560);
  scene.fog = fog;
  const { windowMaterial, lampGlass, lamps } = buildTown(scene);
  const rig = createTownNightWeatherSky({ scene, ambient, sun, fog });

  let now = dawn + .47 * dayMs;
  let speed = 8;
  let playing = true;
  let last = performance.now();
  let frameCount = 0;
  let lastSample = townNightWeatherAt(now, dawn);

  const readout = {
    clock: element('clock'), phase: element('phase'), sun: element('sun'),
    ambient: element('ambient'), lamp: element('lamp'), fog: element('fog'), night: element('night'),
    elev: element('elev'), exposure: element('exposure'),
  };
  const playButton = element<HTMLButtonElement>('play');
  const speedLabel = element('speed-label');
  const slider = element<HTMLInputElement>('timeline');
  const marker = element('cycle-marker');
  drawCycleChart(element<HTMLCanvasElement>('cycle-strip'));

  function renderPreview(sample: TownNightWeatherSample) {
    const frame = rig.update(now, dawn);
    fog.near = 80 * frame.fogNearScale;
    fog.far = 560 * frame.fogFarScale;
    const lamp = frame.lampLevel;
    windowMaterial.color.set(mixCss(0x24324c, 0xffd58a, lamp));
    lampGlass.color.set(mixCss(0x5a6b82, 0xffdda0, lamp));
    for (const light of lamps) light.intensity = lamp * 6;

    const totalMinutes = (6 + sample.phase * 24) % 24;
    const hour = Math.floor(totalMinutes);
    const minute = Math.floor((totalMinutes - hour) * 60);
    readout.clock.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    readout.phase.textContent = sample.phaseName;
    readout.sun.textContent = sample.sunIntensity.toFixed(2);
    readout.ambient.textContent = sample.ambientIntensity.toFixed(2);
    readout.lamp.textContent = lamp.toFixed(2);
    readout.elev.textContent = `${Math.round(sample.sunElevationDeg)}°`;
    readout.exposure.textContent = sample.exposure.toFixed(2);
    readout.fog.textContent = `${Math.round(fog.near)}–${Math.round(fog.far)}m`;
    readout.night.textContent = frame.nightSide ? '夜侧' : '日侧';
    readout.night.classList.toggle('night', frame.nightSide);
    slider.value = String(Math.round(sample.phase * 1000));
    marker.style.left = `${sample.phase * 100}%`;
    return sample;
  }

  function state(): PreviewState {
    const sample = lastSample;
    const totalMinutes = (6 + sample.phase * 24) % 24;
    const hour = Math.floor(totalMinutes);
    const minute = Math.floor((totalMinutes - hour) * 60);
    return {
      phase: sample.phase,
      phaseName: sample.phaseName,
      clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      nightSide: !sample.daylight,
      lampLevel: sample.lampLevel,
      sunIntensity: sample.sunIntensity,
      ambientIntensity: sample.ambientIntensity,
      exposure: sample.exposure,
      fogFar: fog.far,
      playing,
      speed,
    };
  }

  function setPhase(phase: number) {
    const clamped = Math.min(.9999, Math.max(0, phase));
    now = dawn + clamped * dayMs;
    lastSample = renderPreview(townNightWeatherAt(now, dawn));
  }

  function setSpeed(value: number) {
    speed = Math.max(1, Math.min(60, value));
    speedLabel.textContent = `${speed}×`;
  }

  function play() {
    playing = true;
    playButton.textContent = '暂停';
    playButton.setAttribute('aria-pressed', 'true');
  }

  function pause() {
    playing = false;
    playButton.textContent = '播放';
    playButton.setAttribute('aria-pressed', 'false');
  }

  function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = document.getElementById(id);
    if (!found) throw new Error(`FR-10 preview is missing #${id}`);
    return found as T;
  }

  for (const [phase, name] of phases) {
    const button = document.createElement('button');
    button.textContent = name;
    button.dataset.phase = String(phase);
    button.onclick = () => {
      pause();
      setPhase(phase);
    };
    element('phase-buttons').append(button);
  }
  playButton.onclick = () => (playing ? pause() : play());
  element<HTMLButtonElement>('speed-down').onclick = () => setSpeed(speed / 2);
  element<HTMLButtonElement>('speed-up').onclick = () => setSpeed(speed * 2);
  slider.oninput = () => {
    pause();
    setPhase(Number(slider.value) / 1000);
  };

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);

  renderer.setAnimationLoop(() => {
    const at = performance.now();
    const delta = Math.min(250, at - last);
    last = at;
    if (playing) {
      now += delta * speed;
      if (now - dawn > dayMs * 365) now = dawn;
    }
    lastSample = renderPreview(townNightWeatherAt(now, dawn));
    controls.update();
    renderer.render(scene, camera);
    frameCount += 1;
    if (frameCount === 2) {
      window.__FR10_PREVIEW__ = {
        ready: true, setPhase, setSpeed, play, pause, state,
        sample: () => lastSample,
      };
    }
  });

  setSpeed(speed);
  play();
}

if (document.getElementById('scene')) {
  startTownNightWeatherPreview(document.getElementById('scene')!);
}
