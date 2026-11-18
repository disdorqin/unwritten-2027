import { Vector3, type Group } from 'three';
import type { buildExtensionStreets } from './extension-streets';
import type { iceThrone } from './landmark-ice-castle';
import type { railwayStationStops } from './landmark-station';
import type { PassportStamp } from './town-passport';
import type { createTownRailway } from './town-railway';
import type { TownActivityContext, TownActivitySpot } from './town-activity';

type TownStand = (east: number, north: number, ground: number) => boolean;
type LocalPoint = readonly [number, number, number];

function worldPoint(group: Group, point: LocalPoint) {
  return group.localToWorld(new Vector3(...point));
}

export const stationTicketStamp = {
  id: 'railway-ticket',
  label: '环镇列车车票',
  hint: '到火车站售票窗盖章。',
} as const satisfies PassportStamp;

export function createRailwayStationSpots(
  group: Group, context: Pick<TownActivityContext, 'open'>,
  railway: Pick<ReturnType<typeof createTownRailway>, 'timetable'>,
  passport: { hasExtension(id: string): boolean; collectExtension(id: string): boolean },
  canStand: TownStand,
): TownActivitySpot[] {
  const stops = group.userData.stops as typeof railwayStationStops;
  const ticket = worldPoint(group, stops.ticketCounter);
  const board = worldPoint(group, stops.timetable);
  const spots: TownActivitySpot[] = [
    {
      x: ticket.x, n: -ticket.z, ground: ticket.y, range: 1.35, label: '车票盖章',
      available: () => !passport.hasExtension(stationTicketStamp.id),
      run: () => passport.collectExtension(stationTicketStamp.id),
    },
    {
      x: board.x, n: -board.z, ground: board.y, range: 1.45, label: '查看环镇列车时刻表',
      run() {
        const { atPlatform, metres, seconds } = railway.timetable();
        context.open('环镇列车时刻表', atPlatform ? '列车在站台候车。'
          : `列车行驶中，距回站约 ${Math.round(metres)} 米，预计 ${Math.ceil(seconds)} 秒。`);
      },
    },
  ];
  return spots.filter(({ x, n, ground }) => canStand(x, n, ground));
}

export function createIceThroneSpots(
  group: Group, context: Pick<TownActivityContext, 'face' | 'sit'>,
  canStand: TownStand, savePhoto: (filename: string) => void,
): TownActivitySpot[] {
  const throne = group.userData.throne as typeof iceThrone;
  const stand = worldPoint(group, throne.stand);
  const seat = worldPoint(group, throne.seat);
  const photo = worldPoint(group, throne.photo);
  const door = worldPoint(group, throne.hallDoor);
  const spots: TownActivitySpot[] = [
    {
      x: stand.x, n: -stand.z, ground: stand.y, range: .95, label: '在冰城堡王座就座',
      run: () => context.sit({ x: seat.x, n: -seat.z, eyeY: seat.y, yaw: -Math.PI / 2 }),
    },
    {
      x: photo.x, n: -photo.z, ground: photo.y, range: .85, label: '保存冰城堡王座取景',
      run() {
        context.face(door.x, -door.z, door.y);
        savePhoto('UNWRITTEN-2027-ice-throne.png');
      },
    },
  ];
  return spots.filter(({ x, n, ground }) => canStand(x, n, ground));
}

export function createCourtyardSeatSpots(
  { seating }: Pick<ReturnType<typeof buildExtensionStreets>, 'seating'>,
  context: Pick<TownActivityContext, 'sit'>, canStand: TownStand,
): TownActivitySpot[] {
  const spots: TownActivitySpot[] = [];
  for (const { approaches, seat } of seating) {
    const approach = approaches.find(({ x, n, ground }) => canStand(x, n, ground));
    if (approach) spots.push({ ...approach, range: 1.25, label: '在长凳就座', run: () => context.sit(seat) });
  }
  return spots;
}
