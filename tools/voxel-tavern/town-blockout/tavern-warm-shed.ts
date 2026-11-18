import { BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three';
import type { Box, TownPlot } from './landmark-kit';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

const left = -3;
const right = 3;
const back = -12;
const front = -7;
const pitNorth = -9.15;
const drinkPoint = [1.65, -9.53] as const;
const seats = [-7.77, -8.43, -9.38, -10.04];
const benchEast = -2.14;
const entryEast = 3;
const entryNorth = -8.36;

type Part = { x: number; y: number; z: number; w: number; h: number; d: number; color: string; pitch: number };
type GroundHeight = (east: number, north: number) => number;

export function buildTavernWarmShed(plot: TownPlot, heightAt: GroundHeight) {
  const group = new Group();
  group.name = '未写酒馆 · 后院暖棚';
  const [east, north, base] = plot.origin;
  const ground = (x: number, z: number) => heightAt(east + x, north - z) - base;
  const solid: Part[] = [];
  const glow: Part[] = [];
  const colliders: Box[] = [];
  function block(x: number, y: number, z: number, w: number, h: number, d: number, color: string, pitch = 0) {
    solid.push({ x, y, z, w, h, d, color, pitch });
  }
  function barrier(x: number, bottom: number, z: number, w: number, h: number, d: number) {
    colliders.push({ min: [x - w / 2, bottom, z - d / 2], max: [x + w / 2, bottom + h, z + d / 2] });
  }

  const wood = '#754636';
  const braces = '#ab7051';
  for (const x of [left + .12, right - .12]) {
    for (const z of [front - .15, back + .15]) {
      const y = ground(x, z);
      const h = 3.52 - y;
      block(x, y + h / 2, z, .24, h, .24, wood);
      block(x, y + .13, z, .34, .26, .34, '#65616b');
      barrier(x, y, z, .28, h, .28);
    }
    block(x, 3.46, (back + front) / 2, .18, .22, 5, wood);
  }
  block(0, 3.48, front - .15, 6.05, .23, .19, wood);
  block(0, 3.48, back + .15, 6.05, .23, .19, wood);

  // Leave the southeast approach open, with draft panels on the other sides.
  function windbreak(x: number, z: number, w: number, d: number, bottom: number) {
    const top = 3.34;
    const span = Math.max(w, d);
    const count = Math.ceil(span / .29);
    for (let i = 0; i < count; i++) {
      const offset = ((i + .5) / count - .5) * span;
      block(x + (w > d ? offset : 0), (bottom + top) / 2, z + (d > w ? offset : 0),
        w > d ? span / count - .012 : w, top - bottom, d > w ? span / count - .012 : d,
        i % 3 === 0 ? '#8c5d51' : '#674339');
    }
    block(x, top - .03, z, w + .08, .16, d + .08, braces);
    barrier(x, bottom, z, w, top - bottom, d);
  }
  windbreak(left + .12, -9.5, .15, 4.7, 0);
  windbreak(0, back + .15, 5.74, .15, .85);
  windbreak(right - .12, -10.65, .15, 2.4, .3);

  const pitch = -.108;
  for (let index = 0; index < 20; index++) {
    const x = -3.06 + index * .322;
    block(x, 3.73, -9.5, .329, .17, 5.55, index % 2 ? '#6a3038' : '#783441', pitch);
    block(x, 3.845 + (index % 3) * .012, -9.56, .327, .09, 5.41, index % 3 ? '#c8d7e9' : '#e0e8f1', pitch);
  }

  const pitGround = ground(0, pitNorth);
  block(0, pitGround + .11, pitNorth, 1.22, .22, 1.04, '#4a434b');
  block(0, pitGround + .25, pitNorth, 1.11, .12, .92, '#6c5758');
  block(0, pitGround + .33, pitNorth, .91, .085, .72, '#433034');
  for (const [x, z, y, w, color] of [
    [-.20, -.16, .46, .21, '#ffb44a'], [.17, .06, .49, .19, '#ffce69'],
    [.01, -.02, .59, .21, '#ffd881'], [-.06, .16, .44, .28, '#e97536'],
  ] as const) {
    glow.push({ x, y: pitGround + y, z: pitNorth + z, w, h: .24, d: .19, color, pitch: 0 });
  }
  barrier(0, pitGround, pitNorth, 1.22, .38, 1.04);
  for (const [i, z] of seats.entries()) {
    const y = ground(benchEast, z);
    block(benchEast, y + .48, z, .62, .12, .68, '#b37a57');
    block(benchEast - .24, y + .67, z, .10, .29, .68, wood);
    block(benchEast, y + .22, z, .44, .44, .15, i % 2 ? wood : braces);
    barrier(benchEast, y, z, .62, .82, .62);
  }
  const trayY = ground(2.46, drinkPoint[1]);
  block(2.46, trayY + .36, drinkPoint[1], .53, .72, .84, wood);
  block(2.46, trayY + .76, drinkPoint[1], .67, .10, .95, '#ae7550');
  for (const z of [-9.29, -9.55, -9.8]) {
    block(2.46, trayY + .89, z, .15, .16, .15, z === -9.55 ? '#9f4e38' : '#e9cab1');
    block(2.46, trayY + .976, z, .115, .022, .115, '#8b552a');
  }
  barrier(2.46, trayY, drinkPoint[1], .67, .82, .95);

  function draw(parts: readonly Part[], material: MeshLambertMaterial | MeshBasicMaterial) {
    const mesh = new InstancedMesh(new BoxGeometry(), material, parts.length);
    const dummy = new Object3D();
    const tint = new Color();
    parts.forEach(({ x, y, z, w, h, d, color, pitch }, index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.x = pitch;
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(color));
    });
    group.add(mesh);
  }
  draw(solid, new MeshLambertMaterial());
  draw(glow, new MeshBasicMaterial());
  // Use the minimum eave height for the walk-geometry roof test.
  barrier(0, 3.35, (back + front) / 2, right - left, .18, front - back);
  return { group, colliders };
}

export function createTavernWarmShedSpots(
  plot: TownPlot, heightAt: GroundHeight, context: Pick<TownActivityContext, 'sit' | 'open' | 'announce'>,
  warmFromDrink: () => void, canStand: (east: number, north: number, ground: number) => boolean,
): TownActivitySpot[] {
  const [east, north] = plot.origin;
  function spot(x: number, z: number) {
    const worldEast = east + x;
    const worldNorth = north - z;
    return { x: worldEast, n: worldNorth, ground: heightAt(worldEast, worldNorth) };
  }
  const drink = spot(...drinkPoint);
  let nextDrink = 0;
  const door = spot(2.4, 9.5);
  return [
    ...seats.map((z, index): TownActivitySpot => {
      const position = spot(benchEast + .78, z);
      const bench = spot(benchEast, z);
      return {
        ...position, range: .42, label: `就座 · 暖棚长凳 ${index + 1}`,
        run: () => context.sit({ x: bench.x, n: bench.n, eyeY: bench.ground + .54 + .98, yaw: Math.PI / 2 }),
      };
    }),
    {
      ...drink, range: .46, label: '在暖棚取一杯热饮',
      available: () => performance.now() >= nextDrink,
      run() {
        const now = performance.now();
        if (now < nextDrink) return;
        nextDrink = now + 60_000;
        warmFromDrink();
        context.announce('热饮入手 · 暖意入身');
      },
    },
    {
      ...door, range: .65, label: '查看后院暖棚路线',
      run: () => context.open('后院暖棚', '从酒馆正门沿外墙东侧绕到后院。暖棚朝东开口，火盆旁可以就座和取热饮。'),
    },
  ].filter(({ x, n, ground }) => canStand(x, n, ground));
}

export function inTavernWarmShed(plot: TownPlot | undefined, east: number, north: number, feet: number) {
  if (!plot) return false;
  const [originEast, originNorth, base] = plot.origin;
  const x = east - originEast;
  const z = originNorth - north;
  return x >= left && x <= right && z >= back && z <= front && feet < base + 3.35;
}

export function nearTavernWarmShedFire(plot: TownPlot | undefined, east: number, north: number, feet: number) {
  if (!plot || !inTavernWarmShed(plot, east, north, feet)) return false;
  const [originEast, originNorth] = plot.origin;
  return (east - originEast) ** 2 + (north - originNorth + pitNorth) ** 2 < 2.62 ** 2;
}

export function tavernWarmShedEntrance(plot: TownPlot) {
  return [plot.origin[0] + entryEast, plot.origin[1] - entryNorth] as const;
}
