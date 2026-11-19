import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshLambertMaterial, Object3D,
} from 'three';
import { towerTime } from './town-clocktower-time';

const glyphs = [
  ['111','101','101','101','111'], ['010','110','010','010','111'],
  ['111','001','111','100','111'], ['111','001','111','001','111'],
  ['101','101','111','001','001'], ['111','100','111','001','111'],
  ['111','100','111','101','111'], ['111','001','010','010','010'],
  ['111','101','111','101','111'], ['111','101','111','001','111'],
] as const;
const separator = ['0','1','0','1','0'];
const geometry = new BoxGeometry();
const dark = new MeshLambertMaterial({ color: '#302b34' });
const gold = new MeshLambertMaterial({ color: '#eead49', emissive: '#8a622d', emissiveIntensity: .31 });
const neutral = new MeshLambertMaterial();
const clocks = new WeakMap<Group, (epoch: number, seconds: number | null, climax: boolean) => void>();
const unit = .275;
const digitHeight = .45;
const charColumns = 3;
const spacing = 1;
const plateColumns = 6 * charColumns + 2 + 7 * spacing;

export function attachTowerTime(tower: Group, faceY: number, readoutY: number) {
  const frame = new Mesh(geometry, dark);
  frame.name = '钟楼像素时刻牌底';
  frame.position.set(0, readoutY, 5.55);
  frame.scale.set(plateColumns * unit + .32, 5 * digitHeight + .36, .15);
  tower.add(frame);
  const plate = new InstancedMesh(geometry, gold, 6 * 15 + 4);
  plate.name = '钟楼像素时刻牌';
  plate.instanceMatrix.setUsage(DynamicDrawUsage);
  tower.add(plate);

  const hands = new InstancedMesh(geometry, neutral, 204);
  hands.name = '钟楼随时针';
  hands.instanceMatrix.setUsage(DynamicDrawUsage);
  const faces = [
    ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(yaw => ({ yaw, normal: 5.94, inside: false })),
    { yaw: 0, normal: 4.81, inside: true },
  ];
  tower.add(hands);
  // Initial instance bounding volumes must accommodate future hand angles.
  hands.frustumCulled = false;
  plate.frustumCulled = false;
  const template = new Object3D();
  const dialInk = new Color('#302b34');
  const insideInk = [new Color('#c07743'), new Color('#eead49')];
  let previousSecond = -Infinity, previousPlate = '';
  let previousCountdown: number | null = null;

  function update(epoch: number, secondsToMidnight: number | null, climax: boolean) {
    const second = Math.floor(epoch / 1000);
    const countdown = climax ? 0 : secondsToMidnight === null ? null : Math.max(0, Math.ceil(secondsToMidnight));
    if (second === previousSecond && countdown === previousCountdown) return;
    previousCountdown = countdown;
    const reading = towerTime(epoch, secondsToMidnight, climax);
    if (second !== previousSecond) {
      previousSecond = second;
      let slot = 0;
      for (const { yaw, normal, inside } of faces) {
        for (const [index, angle] of [reading.hour, reading.minute].entries()) {
          const body = index ? { length: inside ? 1.84 : 2.58, width: inside ? .125 : .25 }
            : { length: inside ? 1.31 : 1.72, width: inside ? .1875 : .3125 };
          const { length, width } = body;
          for (let distance = 0; distance < length; distance += inside ? .09375 : .12) {
            const u = Math.sin(angle) * distance * (inside ? -1 : 1);
            const y = faceY + Math.cos(angle) * distance;
            const n = normal + (index ? .022 : -.009) * (inside ? -1 : 1);
            template.position.set(Math.cos(yaw) * u + Math.sin(yaw) * n, y, -Math.sin(yaw) * u + Math.cos(yaw) * n);
            const tip = !inside && distance > length - .5 ? .125 : 0;
            template.rotation.set(0, yaw, 0);
            template.scale.set(width + tip, width + tip, inside ? .0625 : .125);
            template.updateMatrix();
            hands.setMatrixAt(slot, template.matrix);
            hands.setColorAt(slot++, inside ? insideInk[index] : dialInk);
          }
        }
      }
      hands.count = slot;
      hands.instanceMatrix.needsUpdate = true;
      hands.instanceColor!.needsUpdate = true;
    }
    if (previousPlate === reading.plate) return;
    previousPlate = reading.plate;
    let column = 0, slot = 0;
    template.rotation.set(0, 0, 0);
    template.scale.set(unit * .8, digitHeight * .8, .12);
    for (const glyph of reading.plate) {
      const rows = glyph === ':' ? separator : glyphs[Number(glyph)];
      for (const [row, pixels] of rows.entries()) {
        for (const [offset, bit] of [...pixels].entries()) {
          if (bit === '0') continue;
          template.position.set((column + offset - (plateColumns - 1) / 2) * unit, readoutY + (2 - row) * digitHeight, 5.69);
          template.updateMatrix();
          plate.setMatrixAt(slot++, template.matrix);
        }
      }
      column += rows[0].length + spacing;
    }
    plate.count = slot;
    plate.instanceMatrix.needsUpdate = true;
  }
  clocks.set(tower, update);
  update(0, null, false);
}

export function updateTowerTime(tower: Group, epoch: number, secondsToMidnight: number | null, climax: boolean) {
  clocks.get(tower)?.(epoch, secondsToMidnight, climax);
}
