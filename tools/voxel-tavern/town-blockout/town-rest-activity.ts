import { museumHorizontalScale } from './museum-scale';
import { museumReadingSeat } from './museum-timeline';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext, TownActivitySpot } from './town-activity';

type Point = readonly [east: number, height: number, south: number];

export function createRestActivity(context: TownActivityContext): TownActivity {
  const [east, north, height] = layout.plots.find(({ id }) => id === 'memorial')!.origin;
  const [towerEast, towerNorth, towerHeight] = layout.plots.find(({ id }) => id === 'clocktower')!.origin;
  const toWorld = ([x, y, z]: Point) => ({
    x: east + x * museumHorizontalScale,
    n: north - z * museumHorizontalScale,
    y: height + y,
  });
  const seats: { name: string; approach: Point; eye: Point; yaw: number }[] = [
    { name: '坐在前庭西侧长凳', approach: [-14.85, 0, 15.53], eye: [-14.85, 1.59, 14.51], yaw: Math.PI },
    { name: '坐在前庭东侧长凳', approach: [14.85, -.30, 15.26], eye: [14.85, 1.59, 14.51], yaw: Math.PI },
    {
      name: '坐在展厅阅读凳',
      approach: [museumReadingSeat.x, .28, museumReadingSeat.z + 1.19],
      eye: [museumReadingSeat.x, 1.49, museumReadingSeat.z + .15],
      yaw: Math.PI,
    },
    { name: '坐在露台北侧长凳', approach: [-21.56, 5.65, -9.27], eye: [-20.73, 7.18, -9.27], yaw: -Math.PI / 2 },
    { name: '坐在露台南侧长凳', approach: [-21.54, 5.65, 2.30], eye: [-20.73, 7.18, 2.30], yaw: -Math.PI / 2 },
    { name: '坐在茶桌北侧', approach: [-24.43, 5.65, -9.13], eye: [-23.33, 7.03, -9.13], yaw: Math.PI },
    { name: '坐在茶桌南侧', approach: [-24.43, 5.65, -7.16], eye: [-23.33, 7.03, -7.16], yaw: 0 },
    { name: '坐在茶桌东侧', approach: [-21.45, 5.65, -8.14], eye: [-22.34, 7.03, -8.14], yaw: -Math.PI / 2 },
  ];
  const spots: TownActivitySpot[] = seats.map(({ name, approach, eye, yaw }) => {
    const stand = toWorld(approach);
    const seated = toWorld(eye);
    return {
      x: stand.x, n: stand.n, ground: stand.y, range: .92, label: name,
      run() {
        context.sit({ x: seated.x, n: seated.n, eyeY: seated.y, yaw });
      },
    };
  });

  const sketch = toWorld([-23.33, 5.65, -6.1]);
  const teaTable = toWorld([-23.33, 6.58, -8.14]);
  spots.push({
    x: sketch.x, n: sketch.n, ground: sketch.y, range: .87, label: '翻看露台随手记',
    run() {
      context.face(teaTable.x, teaTable.n, teaTable.y);
      const panel = context.open('露台随手记', '茶盘边是纪念馆的速写。沿栏杆找到地上的铜箭头，就能望见钟楼。');
      const look = document.createElement('button');
      look.type = 'button';
      look.textContent = '转向钟楼';
      look.onclick = () => {
        panel.closest('dialog')?.close();
        context.face(towerEast, towerNorth, towerHeight + 55);
      };
      panel.append(look);
    },
  });

  return { spots };
}
