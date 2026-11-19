import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, MeshLambertMaterial, Object3D, Sphere, Vector3,
} from 'three';
import { towerTime } from './town-clocktower-time';

const glyphs = [
  ['111','101','101','101','111'], ['010','110','010','010','111'],
  ['111','001','111','100','111'], ['111','001','111','001','111'],
  ['101','101','111','001','001'], ['111','100','111','001','111'],
  ['111','100','111','101','111'], ['111','001','010','010','010'],
  ['111','101','111','101','111'], ['111','101','111','001','111'],
] as const;
const separatorRows = [1, 3] as const;
const geometry = new BoxGeometry();
const gold = new MeshLambertMaterial({ color: '#eead49', emissive: '#8a622d', emissiveIntensity: .31 });
const neutral = new MeshLambertMaterial();
const controls = new WeakMap<Group, (epoch: number, seconds: number | null, climax: boolean) => void>();

// Keep the raised face at the specified relief and back the shallow letters against the board.
// A deep letter extrusion closes dark rows when the face is viewed steeply from the plaza.
export const clockBoardDimensions = { width: 8.4, height: 2.6, depth: .25, pixel: .3125, gap: .125, relief: .28 } as const;
const boardPattern = 'DD:DD:DD';
const glyphWidth = (glyph: string) => glyph === ':' ? 1 : 3;
const pixelsPerGlyph = (glyph: string) => glyph === ':' ? separatorRows.length : 15;
const pixelCount = [...boardPattern].reduce((total, glyph) => total + pixelsPerGlyph(glyph), 0);

export type TowerClockHands = { setAngles(hourAngle: number, minuteAngle: number): void };
export type TowerClockBoard = { setText(text: string): void };

export function attachTowerTime(tower: Group, faceY: number, boardY: number, boardSurfaceZ: number) {
  const { width, height, depth, pixel, gap, relief } = clockBoardDimensions;
  const inkDepth = relief - depth;
  const plates = new InstancedMesh(geometry, gold, pixelCount);
  plates.name = '钟楼像素时刻牌';
  plates.instanceMatrix.setUsage(DynamicDrawUsage);
  const glyphZ = boardSurfaceZ + relief - inkDepth / 2;
  plates.boundingSphere = new Sphere(new Vector3(0, boardY, glyphZ), Math.hypot(width / 2, height / 2, inkDepth / 2));

  const hands = new InstancedMesh(geometry, neutral, 182);
  hands.name = '钟楼随时针';
  hands.instanceMatrix.setUsage(DynamicDrawUsage);
  hands.boundingSphere = new Sphere(new Vector3(0, faceY, 0), Math.hypot(6.1, 2.9));
  const faces = [
    ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(yaw => ({ yaw, inside: false })),
    { yaw: 0, inside: true },
  ];
  tower.add(plates, hands);

  const template = new Object3D();
  const outerInk = new Color('#302b34');
  const innerInk = [new Color('#c07743'), new Color('#eead49')];
  let lastAngles: readonly [number, number] | undefined;
  const clockHands: TowerClockHands = {
    setAngles(hourAngle, minuteAngle) {
      if (lastAngles?.[0] === hourAngle && lastAngles[1] === minuteAngle) return;
      const setColors = lastAngles === undefined;
      lastAngles = [hourAngle, minuteAngle];
      let slot = 0;
      for (const { yaw, inside } of faces) {
        for (const [index, angle] of lastAngles.entries()) {
          const minute = index === 1;
          const length = inside ? (minute ? 1.84 : 1.31) : (minute ? 2.58 : 1.72);
          const blockWidth = inside ? (minute ? .125 : .1875) : (minute ? .25 : .3125);
          const normal = inside ? (minute ? 4.84375 : 4.8125) : (minute ? 5.96875 : 5.9375);
          const depth = inside ? .0625 : .125;
          template.rotation.set(0, yaw, 0);
          for (let distance = 0; distance < length; distance += inside ? .09375 : .12) {
            const u = Math.sin(angle) * distance * (inside ? -1 : 1);
            const y = faceY + Math.cos(angle) * distance;
            template.position.set(Math.cos(yaw) * u + Math.sin(yaw) * normal, y, -Math.sin(yaw) * u + Math.cos(yaw) * normal);
            const tip = !inside && distance > length - .5 ? .125 : 0;
            template.scale.set(blockWidth + tip, blockWidth + tip, depth);
            template.updateMatrix();
            hands.setMatrixAt(slot, template.matrix);
            if (setColors) hands.setColorAt(slot, inside ? innerInk[index] : outerInk);
            slot++;
          }
        }
      }
      hands.instanceMatrix.needsUpdate = true;
      if (setColors) hands.instanceColor!.needsUpdate = true;
    },
  };

  const displayWidth = [...boardPattern].reduce((total, glyph) => total + glyphWidth(glyph) * pixel, (boardPattern.length - 1) * gap);
  let previousText = '';
  const clockBoard: TowerClockBoard = {
    setText(text) {
      if (text === previousText || !/^\d{2}:\d{2}:\d{2}$/.test(text)) return;
      let cursor = -displayWidth / 2;
      let slot = 0;
      template.rotation.set(0, 0, 0);
      for (const [index, glyph] of [...text].entries()) {
        const columns = glyphWidth(glyph);
        if (previousText[index] !== glyph) {
          const placePixel = (offset: number, row: number, column: number, visible: number) => {
            template.position.set(cursor + (column + .5) * pixel, boardY + (2 - row) * pixel, glyphZ);
            template.scale.set(pixel * visible, pixel * visible, inkDepth * visible);
            template.updateMatrix();
            plates.setMatrixAt(slot + offset, template.matrix);
          };
          if (glyph === ':') {
            separatorRows.forEach((row, offset) => placePixel(offset, row, 0, 1));
          } else {
            for (const [row, cells] of glyphs[Number(glyph)].entries()) {
              for (const [column, cell] of [...cells].entries()) {
                placePixel(row * columns + column, row, column, cell === '1' ? 1 : 0);
              }
            }
          }
        }
        slot += pixelsPerGlyph(glyph);
        cursor += columns * pixel + gap;
      }
      previousText = text;
      plates.instanceMatrix.needsUpdate = true;
    },
  };

  let previousSecond: number | undefined;
  let previousCountdown: number | null | undefined;
  function update(epoch: number, secondsToMidnight: number | null, climax: boolean) {
    const second = Math.floor(epoch / 1000);
    const countdown = climax ? 0 : secondsToMidnight === null ? null : Math.max(0, Math.ceil(secondsToMidnight));
    if (second === previousSecond && countdown === previousCountdown) return;
    const reading = towerTime(epoch, secondsToMidnight, climax);
    if (second !== previousSecond) clockHands.setAngles(reading.hour, reading.minute);
    clockBoard.setText(reading.plate);
    previousSecond = second;
    previousCountdown = countdown;
  }
  tower.userData.clockHands = clockHands;
  tower.userData.clockBoard = clockBoard;
  controls.set(tower, update);
  update(0, null, false);
}

export function updateTowerTime(tower: Group, epoch: number, secondsToMidnight: number | null, climax: boolean) {
  controls.get(tower)?.(epoch, secondsToMidnight, climax);
}
