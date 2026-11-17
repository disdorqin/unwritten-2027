import { tavernModelToPlot } from './landmark-tavern';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

export function createTavernActivity(context: TownActivityContext): TownActivity {
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  const [east, north, altitude] = plot.origin;
  const modelToPlot = tavernModelToPlot(plot);
  const worldPoint = (point: readonly [number, number, number]) => {
    const [x, y, z] = modelToPlot(...point);
    return { x: east + x, n: north - z, y: altitude + y };
  };
  const seats = [
    { label: '坐在一楼餐桌旁', approach: [1.56, 3, 2.53], eye: [.75, 4.4, 2.23], yaw: -.24 },
    { label: '坐在二楼阅览长凳', approach: [-3.87, 8, 1.36], eye: [-5.25, 9.48, 1.36], yaw: Math.PI / 2 },
  ] as const;
  return { spots: seats.map(({ label, approach, eye, yaw }) => {
    const { x, n, y: ground } = worldPoint(approach);
    const seat = worldPoint(eye);
    return { x, n, ground, range: 1.05, label, run: () => context.sit({ x: seat.x, n: seat.n, eyeY: seat.y, yaw }) };
  }) };
}
