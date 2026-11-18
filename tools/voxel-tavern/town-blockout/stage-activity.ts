import {
  BoxGeometry, CanvasTexture, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, Sphere, SRGBColorSpace, Vector3,
} from 'three';
import { sampleStagePose, stageClock, stageProgram, stageProgramDuration } from './stage-choreography';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

type XYZ = [number, number, number];
type Costume = {
  name: string;
  role: 'host' | 'flower' | 'dancer' | 'drummer' | 'guest';
  base: string;
  trim: string;
  accent: string;
  skin: string;
};
type CostumedPiece = { joint: Object3D; offset: Matrix4; color: Color };

const [stageX, stageNorth, stageY] = layout.plots.find(plot => plot.id === 'stage')!.origin;
const stageActivationRadius = 72;

function stageWarmupStart(now: number) {
  const local = new Date(now);
  if (local.getMonth() !== 11 || local.getDate() !== 31 || local.getHours() < 20) return;
  const offset = (local.getMinutes() * 60 + local.getSeconds()) * 1000 + local.getMilliseconds();
  return offset < stageProgramDuration * 1000 ? now - offset : undefined;
}
const cast: readonly Costume[] = [
  { name: '柳三弦', role: 'host', base: '#923846', trim: '#f4c47b', accent: '#523044', skin: '#ecad86' },
  { name: '梅枝', role: 'flower', base: '#c85471', trim: '#ffe9d6', accent: '#e37f9f', skin: '#ffe2c9' },
  { name: '青禾', role: 'dancer', base: '#327d7c', trim: '#ecce86', accent: '#74b8ae', skin: '#eec0a0' },
  { name: '石鼓', role: 'drummer', base: '#414672', trim: '#efbf74', accent: '#8b739e', skin: '#dca687' },
  { name: '共演来客', role: 'guest', base: '#6f4d87', trim: '#fcdf9a', accent: '#ae86b8', skin: '#eac099' },
];
const costumesDark = '#32283b';
const gold = '#f0ba66';
const pearl = '#fff0d4';
const deckY = .52;
const tau = Math.PI * 2;
const smooth = (n: number) => {
  const t = Math.max(0, Math.min(n, 1));
  return t * t * (3 - 2 * t);
};
const form = (x: number, y: number, z: number, w: number, h: number, d: number) => new Matrix4()
  .makeScale(w, h, d).setPosition(x, y, z);

function addTheaterSign(rig: Group) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 112;
  const draw = canvas.getContext('2d');
  if (!draw) return;
  draw.fillStyle = '#482733';
  draw.fillRect(0, 0, 768, 112);
  draw.strokeStyle = '#cf9a58';
  draw.lineWidth = 4;
  draw.strokeRect(8, 8, 752, 96);
  draw.strokeRect(15, 15, 738, 82);
  draw.fillStyle = '#ffe4ab';
  draw.textAlign = 'center';
  draw.textBaseline = 'middle';
  draw.font = 'bold 68px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  draw.fillText('雪 夜 小 剧 场', 384, 60);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sign = new Mesh(new PlaneGeometry(7.2, 1.05), new MeshBasicMaterial({ map: texture }));
  sign.rotation.y = Math.PI;
  sign.position.set(0, 5.48, -5.36);
  rig.add(sign);
}

function costumeActor(costume: Costume) {
  const root = new Object3D();
  root.name = costume.name;
  const pieces: CostumedPiece[] = [];
  const { base, accent, trim, skin, role } = costume;
  function piece(joint: Object3D, color: string, point: XYZ, size: XYZ) {
    pieces.push({ joint, offset: form(...point, ...size), color: new Color(color) });
  }
  const torso = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
    piece(root, color, [x, y, z], [w, h, d]);

  torso(base, 0, .88, 0, .70, .82, .54);
  torso(base, 0, .47, .03, .81, .42, .60);
  torso(accent, 0, .27, .035, .85, .12, .635);
  torso(trim, 0, .73, -.278, .72, .083, .065);
  torso(costumesDark, 0, .795, -.306, .74, .06, .038);
  torso(gold, 0, .765, -.343, .13, .13, .045);
  torso(trim, 0, 1.23, -.294, .44, .07, .068);
  torso(pearl, 0, 1.332, 0, .28, .11, .285);
  torso(accent, 0, 1.06, -.289, .37, .25, .041);
  for (const side of [-1, 1]) {
    torso(trim, side * .16, 1.04, -.318, .045, .19, .04);
    torso(pearl, side * .104, 1.141, -.327, .053, .047, .032);
    for (let embroidery = 0; embroidery < 4; embroidery++) {
      const row = embroidery % 2;
      torso(embroidery % 3 ? gold : pearl, side * (.062 + embroidery * .061), .46 + row * .062, -.282,
        .037, .04, .027);
    }
    torso(trim, side * .334, .44, -.286, .031, .23, .049);
    torso(skin, side * .272, 1.579, 0, .084, .13, .14);
    torso(gold, side * .279, 1.49, -.035, .038, .083, .047);
    torso(costumesDark, side * .103, 1.599, -.24, .059, .037, .025);
    torso(costumesDark, side * .104, 1.651, -.24, .083, .015, .028);
    torso(accent, side * .177, 1.536, -.238, .071, .036, .023);
  }
  torso(skin, 0, 1.6, -.024, .48, .43, .41);
  torso(skin, 0, 1.54, -.236, .083, .072, .047);
  torso(role === 'host' ? costumesDark : '#9d4b57', 0, 1.472, -.241, .112, .028, .033);
  torso(costumesDark, 0, 1.77, .025, .52, .155, .45);
  torso(costumesDark, 0, 1.61, .194, .51, .32, .11);
  if (role === 'host' || role === 'drummer') {
    torso(base, 0, 1.855, 0, .61, .065, .48);
    torso(costumesDark, 0, 1.945, .005, .46, .135, .35);
    torso(trim, 0, 1.91, -.177, .46, .047, .045);
    torso(gold, 0, 2.035, -.04, .113, .071, .103);
    if (role === 'host') {
      torso(costumesDark, 0, 1.442, -.274, .20, .067, .069);
      torso(costumesDark, 0, 1.383, -.278, .087, .077, .05);
      for (const side of [-1, 1]) torso(accent, side * .345, 1.894, 0, .194, .068, .11);
    }
  } else {
    torso(costumesDark, 0, 1.872, .077, .44, .16, .31);
    torso(costumesDark, 0, 1.965, .165, .28, .128, .23);
    torso(trim, 0, 1.836, -.171, .47, .050, .074);
    for (const side of [-1, 1]) for (let pin = 0; pin < 3; pin++) {
      const x = side * (.219 + pin * .048);
      torso(gold, x, 1.88 + pin * .04, -.1, .032, .134, .032);
      torso(pin === 1 ? pearl : accent, x, 1.955 + pin * .04, -.1, .061, .057, .066);
    }
  }

  const arms = [-1, 1].map(side => {
    const arm = new Object3D();
    arm.position.set(side * .361, 1.165, 0);
    root.add(arm);
    piece(arm, accent, [0, -.087, 0], [.198, .233, .28]);
    piece(arm, base, [side * .008, -.271, -.038], [.215, .221, .295]);
    piece(arm, trim, [side * .008, -.392, -.047], [.221, .071, .308]);
    piece(arm, pearl, [side * .008, -.426, -.055], [.198, .028, .288]);
    piece(arm, skin, [0, -.471, -.078], [.136, .105, .139]);
    return arm;
  });

  const feet = [-1, 1].map(side => {
    const foot = new Object3D();
    foot.position.set(side * .18, .335, 0);
    root.add(foot);
    piece(foot, accent, [0, -.08, .02], [.238, .210, .28]);
    piece(foot, costumesDark, [0, -.25, -.079], [.242, .138, .377]);
    piece(foot, trim, [0, -.24, -.253], [.215, .062, .033]);
    return foot;
  });

  let prop: Object3D | undefined;
  if (role === 'flower' || role === 'drummer') {
    prop = new Object3D();
    prop.position.set(0, -.492, -.075);
    arms[1].add(prop);
    piece(prop, costumesDark, [0, -.115, -.006], [.064, .24, .064]);
    if (role === 'flower') {
      for (let rib = 0; rib < 9; rib++) {
        const radius = (rib - 4) * .112;
        piece(prop, rib % 2 ? '#a94a64' : '#d77582', [radius, -.295 - .058 * (4 - Math.abs(rib - 4)), -.017],
          [.126, .28 + .031 * (4 - Math.abs(rib - 4)), .033]);
        piece(prop, gold, [radius, -.456 - .065 * (4 - Math.abs(rib - 4)), -.027], [.124, .041, .043]);
      }
    } else {
      piece(prop, gold, [0, -.26, 0], [.249, .075, .218]);
      piece(prop, '#ffc56d', [0, -.403, 0], [.223, .25, .196]);
      piece(prop, gold, [0, -.555, 0], [.252, .062, .222]);
      for (const dx of [-.103, .103]) for (const dz of [-.089, .089]) {
        piece(prop, '#9d546a', [dx, -.403, dz], [.038, .249, .033]);
      }
      piece(prop, '#b54856', [0, -.638, .008], [.065, .143, .047]);
    }
  }
  return { root, arms, feet, prop, pieces };
}

export function createStageActivity(context: TownActivityContext): TownActivity & {
  start(): boolean;
  syncCeremony(now: number, east: number, north: number): void;
  getShowState(): { time: number; act: typeof stageProgram[number]['id']; playing: boolean; joined: boolean };
} {
  const rig = new Group();
  rig.name = '雪夜小剧场';
  rig.position.set(stageX, stageY, -stageNorth);
  context.scene.add(rig);
  addTheaterSign(rig);
  const boxes = new BoxGeometry();
  const performers = cast.map(costumeActor);
  const count = performers.reduce((total, actor) => total + actor.pieces.length, 0);
  const troupe = new InstancedMesh(boxes, new MeshLambertMaterial({ flatShading: true }), count);
  troupe.name = '雪夜小剧场演出班';
  troupe.boundingSphere = new Sphere(new Vector3(0, 1.75, 0), 8.7);
  troupe.instanceMatrix.setUsage(DynamicDrawUsage);
  rig.add(troupe);
  let slot = 0;
  for (const { pieces } of performers) for (const { color } of pieces) troupe.setColorAt(slot++, color);

  const glow = new InstancedMesh(boxes, new MeshBasicMaterial({ toneMapped: false }), 24);
  glow.name = '舞台踏板灯与掌声';
  glow.boundingSphere = new Sphere(new Vector3(0, 1.3, -1.6), 8.5);
  glow.instanceMatrix.setUsage(DynamicDrawUsage);
  rig.add(glow);
  const lampTones = ['#ffd89f', '#b9ecf2', '#eac6f7', '#f0b178', '#f7ca79'].map(value => new Color(value));
  const lampColor = new Color();
  const goldLight = new Color('#fff1c0');
  const matrix = new Matrix4();
  const dummy = new Object3D();
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed = 0;
  let playing = false;
  let joined = false;
  let guestBlend = 0;
  let clapRemaining = 0;
  let announcedAct = -1;
  let renderedTick = 0;
  let nearStage = true;
  let warmupStart: number | undefined;
  let warmupTime: number | undefined;

  const showTime = () => warmupTime ?? stageClock(elapsed);
  const showPlaying = () => playing || warmupTime !== undefined;

  function getShowState() {
    const time = showTime();
    return { time, act: stageProgram.find(act => time < act.end)!.id, playing: showPlaying(), joined };
  }

  function syncCeremony(now: number, east: number, north: number) {
    nearStage = (east - stageX) ** 2 + (north - stageNorth) ** 2 <= stageActivationRadius ** 2;
    const start = nearStage ? stageWarmupStart(now) : undefined;
    warmupTime = start === undefined ? undefined : (now - start) / 1000;
    if (start === warmupStart) return;
    warmupStart = start;
    renderedTick = -1;
    announcedAct = stageProgram.findIndex(act => showTime() < act.end);
    if (warmupTime !== undefined && warmupTime < 1) context.announce('柳三弦报幕 · 鼓灯迎新');
  }

  function writeActors(t: number, actIndex: number) {
    let instance = 0;
    for (let i = 0; i < performers.length; i++) {
      const { root, arms, feet, prop, pieces } = performers[i];
      const guest = i === cast.length - 1;
      if (guest && guestBlend === 0) continue;
      const pose = sampleStagePose(t, guest ? 2 : i, reducedMotion);
      if (guest) {
        root.position.set(7 - 6.9 * guestBlend + (pose.x - 1.5) * .13, deckY, -4.08);
        root.rotation.set(pose.tilt, -.15 * (1 - guestBlend) + pose.heading * .28, 0);
        root.scale.setScalar(.86);
      } else {
        root.position.set(pose.x, pose.y, pose.z);
        root.rotation.set(pose.tilt, pose.heading, 0);
      }
      for (let limb = 0; limb < 2; limb++) {
        const sign = limb === 0 ? -1 : 1;
        const reach = limb === 0 ? pose.leftReach : pose.rightReach;
        arms[limb].rotation.set(pose.swing * sign, 0, sign * (.17 + pose.armLift + reach));
        feet[limb].rotation.x = sign * pose.stride;
      }
      if (prop) prop.scale.setScalar(Math.max(.0001, pose.prop));
      root.updateMatrixWorld(true);
      for (const { joint, offset } of pieces) {
        troupe.setMatrixAt(instance++, matrix.multiplyMatrices(joint.matrixWorld, offset));
      }
    }
    troupe.count = instance;
    troupe.instanceMatrix.needsUpdate = true;

    const mixTo = (actIndex + 1) % stageProgram.length;
    const act = stageProgram[actIndex];
    const pulse = (1 - Math.cos(t * tau / 2.5)) * .5;
    const late = smooth((t - act.end + 7) / 7);
    const phaseTone = lampColor.copy(lampTones[actIndex]).lerp(lampTones[mixTo], late);
    phaseTone.multiplyScalar(.75 + .21 * pulse);
    const highlight = sampleStagePose(t, 1, reducedMotion);
    const flash = clapRemaining > 0 ? clapRemaining / 1.15 : 0;
    let lightIndex = 0;
    function placeLight(x: number, y: number, z: number, width: number, height: number, depth: number, color: Color) {
      dummy.position.set(x, y, z);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      glow.setMatrixAt(lightIndex, dummy.matrix);
      glow.setColorAt(lightIndex++, color);
    }
    for (let i = 0; i < 12; i++) {
      const x = -7.15 + i * 1.30;
      placeLight(x, .55, -5.12, .27, .069, .20, phaseTone);
    }
    if (highlight.solo > .01) {
      const radius = .72 + pulse * .09;
      for (let i = 0; i < 8; i++) {
        const angle = i * tau / 8;
        const size = .12 * highlight.solo;
        placeLight(highlight.x + Math.cos(angle) * radius, .54,
          highlight.z + Math.sin(angle) * radius, size, .018, size, goldLight);
      }
    }
    if (flash > 0) {
      for (let i = 0; i < 4; i++) {
        const height = .62 + Math.sin((1 - flash) * Math.PI) * (1.05 + i * .27);
        placeLight((i - 1.5) * 2, height, -4.62, .10, .10, .10, goldLight);
      }
    }
    glow.count = lightIndex;
    glow.instanceMatrix.needsUpdate = true;
    glow.instanceColor!.needsUpdate = true;
  }

  function lookAtStage() {
    context.face(stageX, stageNorth - 1, stageY + 2.28);
  }

  function start() {
    if (showPlaying()) return false;
    playing = true;
    elapsed = 0;
    announcedAct = 0;
    renderedTick = -1;
    context.announce('柳三弦报幕 · 鼓灯迎新');
    return true;
  }

  function begin() {
    lookAtStage();
    if (start()) return;
    const act = stageProgram.find(entry => entry.id === getShowState().act)!;
    context.announce(act.announcement);
  }

  function applaud() {
    if (!showPlaying()) {
      context.announce('到舞台正中启幕，演出开始后可在这里鼓掌。');
      return;
    }
    lookAtStage();
    clapRemaining = 1.15;
    context.announce(joined ? '你为舞台的共演打了拍子。' : '掌声送到，舞台灯火为你亮起。');
  }

  function updateJoin() {
    if (!joined && !stageProgram.find(act => act.id === getShowState().act)?.guest) return;
    joined = !joined;
    lookAtStage();
    context.announce(joined ? '已加入共演，左侧可为舞台打拍。' : '已离开共演。');
  }

  function update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (playing && warmupTime === undefined) elapsed += dt;
    if (!nearStage) return;
    if (!showPlaying()) {
      if (renderedTick < 0) {
        joined = false;
        guestBlend = 0;
        clapRemaining = 0;
        writeActors(0, 0);
        renderedTick = 0;
      }
      return;
    }
    const t = showTime();
    const actIndex = stageProgram.findIndex(act => t < act.end);
    if (actIndex !== announcedAct) {
      announcedAct = actIndex;
      context.announce(`柳三弦报幕 · ${stageProgram[actIndex].announcement}`);
    }
    const wantGuest = joined && stageProgram[actIndex].guest ? 1 : 0;
    const difference = wantGuest - guestBlend;
    guestBlend += Math.sign(difference) * Math.min(Math.abs(difference), dt * .85);
    clapRemaining = Math.max(0, clapRemaining - dt);
    const tick = Math.floor((warmupTime ?? elapsed) * 30);
    if (tick !== renderedTick) {
      renderedTick = tick;
      writeActors(t, actIndex);
    }
  }

  writeActors(0, 0);
  return {
    spots: [
      { x: stageX, n: stageNorth + 11, ground: stageY, range: 2.05,
        get label() { return showPlaying() ? '观看雪灯演出' : '开启雪灯演出'; }, run: begin },
      { x: stageX - 4, n: stageNorth + 11, ground: stageY, range: 1.9, label: '为舞台鼓掌', run: applaud },
      { x: stageX + 4, n: stageNorth + 11, ground: stageY, range: 1.9,
        get label() { return joined ? '退出舞台共演' : '加入舞台共演'; },
        available: () => showPlaying() && (joined || Boolean(stageProgram.find(act => act.id === getShowState().act)?.guest)), run: updateJoin },
    ],
    update,
    start,
    syncCeremony,
    getShowState,
  };
}
