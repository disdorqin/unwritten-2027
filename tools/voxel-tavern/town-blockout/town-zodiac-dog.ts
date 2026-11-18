import type { TownActivityContext, TownActivitySpot } from './town-activity';
import type { TownHousePortal } from './town-house-portals';
import { townResidentPostcards } from './town-resident-postcards';

type WorldPoint = readonly [east: number, height: number, z: number];

export const zodiacDogHouseId = 'district:410:343';

export function locateZodiacDogMailbox(
  portal: TownHousePortal, groundAt: (east: number, north: number) => number,
) {
  const forwardEast = Math.sin(portal.exitYaw);
  const forwardNorth = Math.cos(portal.exitYaw);
  function point(forward: number, side: number, lift = 0): WorldPoint {
    const east = portal.x + forward * forwardEast - side * forwardNorth;
    const north = portal.n + forward * forwardNorth + side * forwardEast;
    return [east, groundAt(east, north) + lift, -north];
  }
  const mailbox = point(-.74, 1.94);
  const postcard = point(.65, 1.48);
  const charm = {
    id: 'dog',
    stand: point(.65, 2.25),
    object: point(-.41, 2.18, .045),
    yaw: Math.PI - portal.exitYaw,
    range: .29,
  } as const;
  return { mailbox, postcard, charm };
}

export type ZodiacDogMailbox = ReturnType<typeof locateZodiacDogMailbox>;

export function createZodiacDogPostcard(
  site: ZodiacDogMailbox, context: Pick<TownActivityContext, 'open'>,
): TownActivitySpot {
  const [x, ground, z] = site.postcard;
  return {
    x, n: -z, ground, range: .29,
    label: '查看居民明信片',
    run() {
      const card = townResidentPostcards.find(({ author }) => author === '纪守信');
      if (card) context.open(card.author + ' · ' + card.place, card.body);
    },
  };
}
