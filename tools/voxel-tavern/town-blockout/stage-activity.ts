import {
  BoxGeometry, CanvasTexture, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PlaneGeometry, PointLight, SRGBColorSpace,
} from 'three';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

type Piece = {
  color: string;
  center: [number, number, number];
  size: [number, number, number];
};

const [stageX, stageNorth, stageY] = layout.plots.find(plot => plot.id === 'stage')!.origin;
const duration = 12;
const cycle = Math.PI * 2;

export function createStageActivity(context: TownActivityContext): TownActivity {
  const rig = new Group();
  rig.name = '雪夜小剧场';
  rig.position.set(stageX, stageY, -stageNorth);
  context.scene.add(rig);

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 112;
    const draw = canvas.getContext('2d')!;
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

  const wood = '#5d3733', gold = '#dfa856', warm = '#ffcb7b', skin = '#edbc91', black = '#322c3c';
  const boxes = new BoxGeometry();
  const puppetMaterial = new MeshLambertMaterial();
  const dummy = new Object3D();
  function batch(pieces: Piece[]) {
    const mesh = new InstancedMesh(boxes, puppetMaterial, pieces.length);
    pieces.forEach(({ color, center, size }, i) => {
      dummy.position.set(...center);
      dummy.scale.set(...size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new Color(color));
    });
    mesh.computeBoundingSphere();
    return mesh;
  }

  function puppet(home: number, robe: string, trim: string) {
    const root = new Group();
    const body = batch([
      { color: black, center: [-.19, .10, -.09], size: [.24, .20, .47] },
      { color: black, center: [.19, .10, -.09], size: [.24, .20, .47] },
      { color: robe, center: [0, .52, 0], size: [.75, .72, .59] },
      { color: trim, center: [0, .31, -.31], size: [.72, .12, .05] },
      { color: robe, center: [0, 1.05, 0], size: [.66, .58, .54] },
      { color: gold, center: [0, .84, -.29], size: [.67, .14, .065] },
      { color: trim, center: [0, 1.105, -.29], size: [.13, .46, .05] },
      { color: skin, center: [0, 1.565, -.035], size: [.48, .44, .42] },
      { color: black, center: [-.11, 1.60, -.25], size: [.065, .054, .03] },
      { color: black, center: [.11, 1.60, -.25], size: [.065, .054, .03] },
      { color: wood, center: [0, 1.815, -.02], size: [.65, .10, .45] },
      { color: trim, center: [0, 1.94, 0], size: [.49, .16, .39] },
      { color: gold, center: [0, 2.05, 0], size: [.13, .11, .12] },
    ]);
    root.add(body);
    const arms = [-1, 1].map(side => {
      const arm = new Group();
      arm.position.set(side * .38, 1.24, 0);
      arm.add(batch([
        { color: trim, center: [0, -.09, 0], size: [.24, .22, .31] },
        { color: robe, center: [0, -.24, -.04], size: [.26, .26, .37] },
        { color: gold, center: [0, -.36, -.05], size: [.25, .08, .36] },
        { color: skin, center: [0, -.445, -.07], size: [.17, .15, .19] },
      ]));
      root.add(arm);
      return arm;
    });
    root.position.set(home, .53, -.55);
    rig.add(root);
    return { root, arms, home };
  }

  const cast = [
    puppet(-3.1, '#2b777f', '#73adb0'),
    puppet(0, '#aa3d49', '#de7456'),
    puppet(3.1, '#84618d', '#b58cb8'),
  ];
  const spot = new PointLight('#ffc187', 0, 17, 2);
  spot.position.set(0, 4.2, -4.25);
  rig.add(spot);
  const lightColors = [new Color('#ffbe72'), new Color('#f492cf'), new Color('#a5d2ff')];

  const showerMaterial = new MeshBasicMaterial({
    color: warm, transparent: true, depthWrite: false,
  });
  const shower = new InstancedMesh(boxes, showerMaterial, 14);
  shower.frustumCulled = false;
  shower.visible = false;
  rig.add(shower);

  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let elapsed: number | null = null;
  let applauseAge = Infinity;
  let announcedAct = 0;

  function pose(time: number) {
    const waves = reducedMotion ? .4 : 1;
    const bow = time > 9.5 ? Math.sin(Math.PI * Math.min(1, (time - 9.5) / 2.5)) : 0;
    for (const [index, actor] of cast.entries()) {
      const phase = time * cycle / 2.8 + index * .72;
      const strength = elapsed === null ? 0 : Math.min(1, time * 2, (duration - time) * 2) * (1 - .86 * bow);
      actor.root.position.x = actor.home + .56 * strength * waves * Math.sin(phase);
      actor.root.position.z = -.55 + .52 * strength * waves * Math.sin(time * cycle / 5 - index * .7);
      actor.root.rotation.y = -.44 * strength * waves * Math.sin(phase);
      actor.root.rotation.x = -.64 * bow;
      actor.root.position.y = .53 + .09 * strength * waves * (1 + Math.cos(phase * 2));
      actor.arms.forEach((arm, i) => {
        const side = i ? 1 : -1;
        arm.rotation.z = side * (.19 + strength * waves * (.41 + .36 * Math.sin(phase + i * 1.05)));
        arm.rotation.x = -.29 * strength * waves * Math.sin(phase + i * .6) + .49 * bow;
      });
    }
  }

  function begin() {
    context.face(stageX, stageNorth, stageY + 2.2);
    if (elapsed !== null) {
      context.announce('演出正在进行，向左走几步可以鼓掌。');
      return;
    }
    elapsed = 0;
    announcedAct = 0;
    applauseAge = Infinity;
    context.announce('雪灯演出 · 灯偶亮相');
  }

  function applaud() {
    if (elapsed === null) {
      context.announce('到舞台正中启幕，演出开始后可在这里鼓掌。');
      return;
    }
    context.face(stageX, stageNorth, stageY + 2.2);
    applauseAge = 0;
    context.announce('你送出了掌声，舞台亮起一串金色灯火。');
  }

  function update(dt: number) {
    if (elapsed === null && !shower.visible) return;
    if (elapsed !== null) {
      elapsed += dt;
      if (elapsed >= duration) {
        elapsed = null;
        spot.intensity = 0;
        pose(0);
        context.announce('演出结束 · 回到正中可再看一场。');
      } else {
        const t = elapsed;
        const glow = (1 - Math.cos(cycle * t / duration)) / 2;
        spot.color.copy(lightColors[0]).lerp(lightColors[2], glow).lerp(lightColors[1], Math.max(0, 1 - Math.abs(t - 6) / 3) * .46);
        spot.intensity = 95 * Math.min(1, t * 2, (duration - t) * 2) + 65 * Math.max(0, 1 - applauseAge);
        pose(t);
        const act = t >= 9.5 ? 2 : t >= 4 ? 1 : 0;
        if (act !== announcedAct) {
          announcedAct = act;
          context.announce(act === 1 ? '雪灯演出 · 三偶共舞' : '雪灯演出 · 谢幕');
        }
      }
    }
    applauseAge += dt;
    const age = applauseAge / 1.35;
    shower.visible = age < 1;
    if (!shower.visible) return;
    showerMaterial.opacity = (1 - age) * .9;
    const count = reducedMotion ? 5 : 14;
    shower.count = count;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) / 2) * .82;
      dummy.position.set(spread, .85 + Math.sin(age * Math.PI) * (1.35 + (i % 4) * .35), -4.7 + (i % 2) * .3);
      const side = .095 + .035 * (i % 3);
      dummy.scale.set(side, side, side);
      dummy.updateMatrix();
      shower.setMatrixAt(i, dummy.matrix);
    }
    shower.instanceMatrix.needsUpdate = true;
  }

  pose(0);
  return {
    spots: [
      { x: stageX, n: stageNorth + 11, ground: stageY, range: 2.05, label: '开启雪灯演出', run: begin },
      { x: stageX - 4, n: stageNorth + 11, ground: stageY, range: 1.9, label: '为舞台鼓掌', run: applaud },
    ],
    update,
  };
}
