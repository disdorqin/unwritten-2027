export type IceCastlePoint = readonly [x: number, y: number, z: number];
type IceCastleFinish = 'foundation' | 'deepIce' | 'blueIce' | 'ice' | 'paleIce' | 'snow' | 'recess' | 'pane' | 'glint' | 'brass' | 'lantern';

type IceCastleDetails = {
  block(x: number, y: number, z: number, w: number, h: number, d: number, finish: IceCastleFinish, yaw?: number): void;
  crystal(x: number, y: number, z: number, w: number, h: number, d: number, finish: IceCastleFinish, yaw?: number): void;
};

type IceCastleExhibit = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  anchor: IceCastlePoint;
  stand: IceCastlePoint;
  yaw: number;
};

export const iceCastleExhibits: readonly IceCastleExhibit[] = [
  {
    id: 'cedar', title: '雪松', subtitle: '森林里的积雪',
    description: '层叠的松枝托着积雪，取形自小镇原木街旁的雪林。',
    anchor: [8.75, 2.17, 8.23], stand: [8.75, .15, 6.54], yaw: Math.PI,
  },
  {
    id: 'sailboat', title: '帆船', subtitle: '冻湖上的归航',
    description: '冰雕在观景台对面。分层的船身刻出木板轮廓，桅杆上还挂着一面收起一半的帆。',
    anchor: [19.12, 3.5, 8.23], stand: [19.12, 3.09, 6.40], yaw: Math.PI,
  },
  {
    id: 'lighthouse', title: '冰灯塔', subtitle: '照亮湖岸',
    description: '取形自湖岸的灯塔。盘旋的冰砖一路叠到塔顶，灯室里嵌了一小块暖色灯芯。',
    anchor: [11.89, 2.17, -8.23], stand: [11.89, .15, -6.54], yaw: 0,
  },
  {
    id: 'cabin', title: '小雪屋', subtitle: '冰里的原木小屋',
    description: '横排原木、积雪双坡屋顶和一盏窗灯，都是小镇原木小屋里能认出来的细节。',
    anchor: [15.60, 2.17, -8.23], stand: [15.60, .15, -6.54], yaw: 0,
  },
];

export const iceChandelierPosition = [14.35, 7.65, -2.45] as const;
type IceCastleLight = { position: IceCastlePoint; color: string; distance: number; power: number };

export function createIceCastleRefinementRuntime(
  crownGlow: { value: number }, exhibits = iceCastleExhibits, chandelier = iceChandelierPosition as IceCastlePoint,
) {
  const gateLight: IceCastleLight = { position: [-22.15, 3.2, 0], color: '#ffba76', distance: 13, power: 0 };
  const hallLight: IceCastleLight = { position: chandelier, color: '#ffba76', distance: 18, power: 0 };
  let phase = 0;
  let feedback = 3;
  const follow = (light: IceCastleLight, target: number, weight: number) => {
    light.power += (target - light.power) * weight;
    if (target === 0 && light.power < .05) light.power = 0;
  };

  function update(dt: number, localEye: { x: number; y: number; z: number }, night: boolean) {
    feedback = Math.min(feedback + dt, 3);
    const accent = Math.min(feedback / .22, 1) * Math.max(0, 1 - (feedback - .22) / 2.78);
    phase = (phase + (2 * Math.PI / 7) * dt * (1 + 3.2 * accent)) % (2 * Math.PI);
    crownGlow.value = 1 + .2 * Math.sin(phase) + .35 * accent;

    const { x, y, z } = localEye;
    const gate = night && y < 8.3 && x < -15.4 && x > -34 && Math.abs(z) < 9.6;
    const hall = night && y < 11.4 && x > 6.5 && x < 21.4 && Math.abs(z) < 9.7;
    const smoothing = 1 - Math.exp(-9 * dt);
    follow(gateLight, gate ? 64 : 0, smoothing);
    follow(hallLight, hall ? 153 + 70 * accent : 0, smoothing);
  }

  return {
    lights: [gateLight, hallLight] as const,
    exhibits,
    update,
    enthrone() { feedback = 0; },
  };
}

export type IceCastleRefinementRuntime = ReturnType<typeof createIceCastleRefinementRuntime>;

export function addIceCastleDeer({ block, crystal }: IceCastleDetails, x: number, y: number, z: number) {
  // Legs, body and antlers are laid out in pairs. Both deer face the hall door.
  const piece = (dx: number, dy: number, dz: number, w: number, h: number, d: number, finish: IceCastleFinish) =>
    block(x + dx, y + dy, z + dz, w, h, d, finish);
  for (const side of [-1, 1]) {
    const dz = side * .24;
    for (const [dx, foot] of [[-.43, -.47], [.41, .46]]) {
      piece(foot, .07, dz, .27, .14, .23, 'deepIce');
      piece(dx, .32, dz, .17, .45, .16, 'ice');
      piece(dx * .86, .62, dz, .21, .27, .19, 'paleIce');
    }
    piece(-.71, 1.43, dz * .52, .12, .09, .08, 'recess');
    piece(-.54, 1.60, dz * 1.24, .22, .15, .22, 'ice');
    piece(-.47, 1.70, dz * 1.55, .12, .13, .14, 'paleIce');
    piece(-.52, 1.73, dz * .92, .085, .27, .09, 'paleIce');
    piece(-.44, 1.91, dz * 1.23, .10, .12, .24, 'paleIce');
    piece(-.31, 1.98, dz * 1.64, .34, .085, .097, 'ice');
    piece(-.21, 2.07, dz * 1.64, .10, .17, .09, 'paleIce');
    piece(-.37, 2.08, dz * 1.25, .078, .29, .083, 'paleIce');
    piece(-.09, 2.04, dz * 1.70, .09, .15, .09, 'paleIce');
    piece(.16, .96, dz * 1.14, .49, .21, .08, 'paleIce');
  }
  piece(.03, .85, 0, 1.15, .41, .51, 'ice');
  piece(.10, 1.05, 0, .92, .14, .53, 'paleIce');
  piece(-.40, .98, 0, .46, .43, .45, 'blueIce');
  piece(-.49, 1.19, 0, .29, .42, .28, 'ice');
  piece(-.59, 1.46, 0, .47, .32, .31, 'paleIce');
  piece(-.87, 1.36, 0, .24, .19, .26, 'ice');
  piece(-1.0, 1.39, 0, .085, .096, .223, 'deepIce');
  piece(.64, .98, 0, .22, .16, .25, 'paleIce');
  crystal(x + .77, y + 1.05, z, .24, .20, .27, 'ice');
}

export function addIceCastleCarvings({ block, crystal }: IceCastleDetails, exhibits = iceCastleExhibits) {
  for (const { id, anchor, yaw } of exhibits) {
    const [x, y, z] = anchor;
    const outwardSign = yaw === 0 ? 1 : -1;
    const piece = (dx: number, dy: number, dz: number, w: number, h: number, d: number,
      finish: IceCastleFinish, turn = 0) => block(x + dx, y + dy, z + dz * outwardSign, w, h, d, finish, turn);
    piece(0, .11, 0, 1.83, .22, 1.08, 'deepIce');
    piece(0, .248, .02, 1.65, .074, .93, 'paleIce');
    for (const dx of [-.58, .58]) piece(dx, -.078, -.11, .14, .21, .72, 'ice');

    if (id === 'cedar') {
      piece(0, .51, 0, .17, .5, .17, 'deepIce');
      for (let tier = 0; tier < 4; tier++) {
        const width = 1.10 - .19 * tier;
        const height = .57 + .32 * tier;
        for (const half of [0, 1, 2]) {
          const span = width - .12 * half;
          piece(0, height + .09 * half, 0, span, .11, span * .75, half === 2 ? 'paleIce' : 'ice', tier * .27);
        }
        for (const side of [-1, 1]) {
          piece(side * width * .42, height + .045, .12, .18, .10, .16, 'ice', side * .3);
          piece(side * width * .37, height + .115, .125, .19, .06, .15, 'snow', side * .3);
        }
        piece(0, height + .145, -.36 * width, .21, .052, .12, 'paleIce', tier * .25);
      }
      crystal(x, y + 1.86, z, .36, .58, .34, 'paleIce');
      continue;
    }
    if (id === 'sailboat') {
      for (const [width, height, finish] of [[1.12, .35, 'deepIce'], [1.41, .44, 'blueIce'], [1.60, .54, 'ice']] as const) {
        piece(0, height, 0, width, .115, .57, finish);
      }
      piece(.65, .66, 0, .28, .17, .36, 'paleIce');
      piece(-.68, .64, 0, .19, .17, .38, 'ice');
      piece(-.02, 1.12, 0, .09, 1.22, .09, 'deepIce');
      for (const side of [-1, 1]) {
        for (const dx of [-.49, -.17, .17, .49]) {
          piece(dx, .558, side * .29, .286, .048, .055, 'paleIce');
        }
        for (const dx of [-.46, .06, .48]) {
          piece(dx, .655, side * .155, .115, .135, .089, side > 0 ? 'deepIce' : 'blueIce');
        }
      }
      for (let level = 0; level < 6; level++) {
        const width = .65 - .103 * level;
        piece(.04 + width / 2, .80 + .13 * level, .035, width, .15, .09,
          level % 2 ? 'paleIce' : 'snow');
        if (level < 4) piece(-.14 - width * .23, .82 + .13 * level, -.06, width * .46, .14, .08, 'ice');
      }
      piece(.11, 1.68, 0, .23, .11, .08, 'pane');
      continue;
    }
    if (id === 'lighthouse') {
      for (let row = 0; row < 8; row++) {
        const size = .75 - .039 * row;
        const height = .36 + .137 * row;
        piece(0, height, -.06, size, .145, size, row % 3 === 0 ? 'blueIce' : 'ice', Math.PI / 4);
        piece((row % 2 === 0 ? -.23 : .23) * size, height + .02, -.06 + size * .52,
          .10, .035, .075, 'paleIce', Math.PI / 4);
      }
      piece(0, 1.47, -.06, .60, .10, .60, 'paleIce', Math.PI / 4);
      piece(0, 1.62, -.06, .27, .24, .25, 'lantern');
      for (const dx of [-.19, .19]) for (const dz of [-.22, .10]) {
        piece(dx, 1.62, dz, .07, .27, .07, 'paleIce');
        piece(dx, 1.488, dz, .105, .055, .105, 'blueIce');
        piece(dx, 1.777, dz, .101, .076, .101, 'snow');
      }
      crystal(x, y + 1.92, z, .65, .46, .63, 'blueIce', Math.PI / 4);
      continue;
    }
    for (let row = 0; row < 6; row++) {
      piece(-.32, .34 + .105 * row, 0, .66, .107, .64, row % 2 ? 'blueIce' : 'ice');
      piece(.43, .34 + .105 * row, 0, .37, .107, .64, row % 2 ? 'blueIce' : 'ice');
    }
    piece(.06, .82, .017, .23, .21, .64, 'ice');
    piece(.06, .55, .32, .20, .44, .05, 'deepIce');
    piece(-.31, .69, .33, .263, .22, .045, 'paleIce');
    piece(-.31, .69, .36, .17, .135, .05, 'lantern');
    piece(-.31, .69, .389, .018, .145, .028, 'paleIce');
    piece(-.31, .69, .389, .185, .023, .028, 'paleIce');
    piece(-.31, .565, .385, .311, .043, .12, 'snow');
    piece(.06, .373, .375, .32, .055, .171, 'snow');
    piece(.128, .578, .352, .042, .048, .053, 'pane');
    for (const side of [-1, 1]) {
      piece(-.066, .978, side * .415, 1.56, .095, .073, 'blueIce');
      piece(-.066, 1.06, side * .393, 1.47, .038, .081, 'paleIce');
    }
    for (let row = 0; row < 6; row++) {
      piece(-.066, 1.01 + row * .084, 0, 1.56, .09, .81 - row * .116, row % 2 ? 'paleIce' : 'snow');
    }
    piece(.33, 1.39, -.15, .17, .52, .16, 'deepIce');
    piece(.33, 1.67, -.15, .24, .08, .23, 'snow');
  }
}

export function addIceCastleChandelier(parts: IceCastleDetails, lift = 0) {
  const block: IceCastleDetails['block'] = (x, y, z, ...args) => parts.block(x, y + lift, z, ...args);
  const crystal: IceCastleDetails['crystal'] = (x, y, z, ...args) => parts.crystal(x, y + lift, z, ...args);
  const [x, y, z] = iceChandelierPosition;
  block(x, 11.37, z, 1.20, .22, 1.20, 'deepIce');
  block(x, 10.14, z, .145, 2.46, .145, 'paleIce', Math.PI / 4);
  crystal(x, y + .62, z, .59, 1.66, .59, 'glint');
  crystal(x, y + .32, z, .44, .97, .44, 'paleIce', Math.PI / 4);
  for (const [radius, height, pieces] of [[.70, 8.98, 6], [1.29, 8.40, 10], [.78, 7.72, 8]]) {
    const delta = 2 * Math.PI / pieces;
    for (let i = 0; i < pieces; i++) {
      const angle = delta * i + .3;
      const px = x + radius * Math.cos(angle);
      const pz = z + radius * Math.sin(angle);
      const qx = x + radius * Math.cos(angle + delta);
      const qz = z + radius * Math.sin(angle + delta);
      block((px + qx) / 2, height, (pz + qz) / 2, Math.hypot(qx - px, qz - pz) + .02, .075, .095,
        'paleIce', -Math.atan2(qz - pz, qx - px));
      const drop = i % 2 ? .57 : .82;
      crystal(px, height - drop / 2 + .04, pz, .205, drop, .205, i % 2 ? 'ice' : 'paleIce', angle);
    }
    for (const angle of [0, Math.PI / 2]) block(x, height + .03, z, radius * 2, .069, .075, 'ice', angle);
  }
}
