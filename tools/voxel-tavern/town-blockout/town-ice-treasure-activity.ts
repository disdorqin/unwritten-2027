import { iceTreasurePickupDelayMs, type createIceTreasure } from '../../../src/shared/ice-treasure';
import type { TownActivitySpot } from './town-activity';

type Treasure = ReturnType<ReturnType<typeof createIceTreasure>['snapshot']>['treasure'];
type Site = Readonly<Pick<TownActivitySpot, 'x' | 'n' | 'ground'>>;
type BellPosition = Readonly<{ x: number; n: number; height: number }>;
export type IceTreasureBellView =
  | { kind: 'release' }
  | { kind: 'hidden' }
  | { kind: 'visible'; position: BellPosition; frost: number };
type IceTreasureActivityOptions = {
  pedestal: Site & { bellHeight: number };
  pickupRadius: number;
  // Use confirmed room state and its clock. A request does not predict a pickup.
  treasure(): Treasure | undefined;
  now(): number;
  localSkater(): (Site & { id: number }) | undefined;
  groundAt(x: number, n: number): number | undefined;
  carrierBellPosition(id: number): BellPosition | undefined;
  // The host owns one bell model. Release lets the solo activity present it.
  presentBell(view: IceTreasureBellView): void;
  requestPickup(): void;
};

export function createTownIceTreasureActivity(options: IceTreasureActivityOptions) {
  const { pedestal, pickupRadius } = options;
  if (![pedestal.x, pedestal.n, pedestal.ground, pedestal.bellHeight, pickupRadius].every(Number.isFinite) ||
    pickupRadius <= 0 || pedestal.bellHeight < pedestal.ground) {
    throw new RangeError('Ice treasure needs a finite pedestal and a positive pickup radius');
  }

  let disposed = false;
  let pickupReady = false;
  let ownsBell = false;
  const spot: TownActivitySpot = {
    x: pedestal.x, n: pedestal.n, ground: pedestal.ground, range: pickupRadius,
    label: '拾取大金铃铛',
    available: () => pickupReady && options.localSkater() !== undefined,
    run() {
      update();
      const skater = options.localSkater();
      if (pickupReady && skater && Math.abs(skater.ground - spot.ground) <= .55 &&
        Math.hypot(skater.x - spot.x, skater.n - spot.n) <= pickupRadius) {
        options.requestPickup();
      }
    },
  };

  function releaseBell() {
    if (!ownsBell) return;
    ownsBell = false;
    options.presentBell({ kind: 'release' });
  }

  function update() {
    if (disposed) return;
    const treasure = options.treasure();
    pickupReady = false;
    if (!treasure) {
      releaseBell();
      return;
    }
    ownsBell = true;
    if (treasure.phase === 'awaiting-reset') {
      options.presentBell({ kind: 'hidden' });
      return;
    }

    let position: BellPosition | undefined;
    let frost = 0;
    if (treasure.phase === 'carried') {
      position = options.carrierBellPosition(treasure.player);
    } else if (treasure.phase === 'available') {
      position = { x: pedestal.x, n: pedestal.n, height: pedestal.bellHeight };
      Object.assign(spot, { x: pedestal.x, n: pedestal.n, ground: pedestal.ground });
      pickupReady = true;
    } else {
      const { east: x, north: n } = treasure.point;
      const ground = Number.isFinite(x) && Number.isFinite(n) ? options.groundAt(x, n) : undefined;
      if (ground !== undefined && Number.isFinite(ground) && Number.isFinite(treasure.pickableAt)) {
        position = { x, n, height: ground };
        Object.assign(spot, { x, n, ground });
        const now = options.now();
        pickupReady = Number.isFinite(now) && now >= treasure.pickableAt;
        frost = Number.isFinite(now)
          ? Math.max(0, Math.min(1, (treasure.pickableAt - now) / iceTreasurePickupDelayMs)) : 1;
      }
    }
    options.presentBell(position && [position.x, position.n, position.height].every(Number.isFinite)
      ? { kind: 'visible', position, frost } : { kind: 'hidden' });
  }

  update();
  return {
    spots: [spot],
    update,
    isCarrying() {
      if (disposed) return false;
      const treasure = options.treasure();
      return treasure?.phase === 'carried' && treasure.player === options.localSkater()?.id;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pickupReady = false;
      releaseBell();
    },
  };
}
