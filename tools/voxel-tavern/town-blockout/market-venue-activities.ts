import { Vector3, type Group } from 'three';
import { marketDiningBench } from './market-stall-objects';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

type MarketAnchor = { x: number; z: number; base: number };
type TownGround = (east: number, north: number, heightHint?: number) => number | undefined;

const eyeAboveSeat = .98;
const seatApproach = .60;

export function createMarketVenueActivities(
  market: Group | undefined,
  context: Pick<TownActivityContext, 'face' | 'sit'>,
  dryGround: TownGround,
  savePhoto: (filename: string) => void,
): TownActivitySpot[] {
  if (!market) return [];
  const tables = (market.userData.marketDiningTables ?? []) as readonly MarketAnchor[];
  const gate = market.userData.marketGate as MarketAnchor | undefined;
  const spots: TownActivitySpot[] = [];

  const originHeight = market.position.y;
  const point = (x: number, z: number, absoluteBase: number) => {
    const world = market.localToWorld(new Vector3(x, absoluteBase - originHeight, z));
    return { x: world.x, n: -world.z, y: world.y };
  };

  function walkUp(x: number, z: number) {
    const stand = point(x, z, originHeight);
    const ground = dryGround(stand.x, stand.n);
    if (ground !== undefined) return { x: stand.x, n: stand.n, ground };
  }

  for (const table of tables) {
    const center = point(table.x, table.z, table.base);
    for (const side of [-1, 1]) {
      const z = table.z + side * marketDiningBench.offset;
      const seat = [0, .22, -.22]
        .map(offset => point(table.x + offset, z, table.base + marketDiningBench.top))
        .find(candidate => {
          const support = dryGround(candidate.x, candidate.n, candidate.y);
          return support !== undefined && Math.abs(support - candidate.y) <= .025;
        });
      if (!seat) continue;
      const stand = walkUp(table.x, z + side * seatApproach)
        ?? walkUp(table.x - .86, z) ?? walkUp(table.x + .86, z);
      if (!stand) continue;
      spots.push({
        ...stand, range: .49, label: '在坐食区就座',
        run() {
          context.sit({
            x: seat.x, n: seat.n, eyeY: seat.y + eyeAboveSeat,
            yaw: Math.atan2(center.x - seat.x, center.n - seat.n),
          });
        },
      });
    }
  }

  function photo(
    x: number, z: number, target: ReturnType<typeof point>, label: string, filename: string,
  ) {
    const stand = walkUp(x, z);
    if (!stand) return;
    spots.push({
      ...stand, range: .68, label,
      run() {
        context.face(target.x, target.n, target.y);
        savePhoto(filename);
      },
    });
  }

  if (gate) {
    photo(gate.x, gate.z + 4.3, point(gate.x, gate.z, gate.base + 2.55),
      '保存集市牌楼取景', 'UNWRITTEN-2027-market-gate.png');
  }
  if (tables.length) {
    const west = Math.min(...tables.map(table => table.x));
    const x = (west + Math.max(...tables.map(table => table.x))) / 2;
    const south = Math.max(...tables.map(table => table.z));
    const north = Math.min(...tables.map(table => table.z));
    const base = tables.reduce((sum, table) => sum + table.base, 0) / tables.length;
    photo(west - .80, south + 2.50, point(x + 1.15, north, base + 2.05),
      '保存坐食区灯下取景', 'UNWRITTEN-2027-market-lantern-tables.png');
  }
  return spots;
}
