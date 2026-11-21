import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUndergroundCampRemains } from '../tools/voxel-tavern/town-blockout/underground-camp-remains.ts';
import {
  createUndergroundCampInteractions, undergroundCanteenBowlRelic,
} from '../tools/voxel-tavern/town-blockout/underground-camp-interactions.ts';

type InteractionOptions = Parameters<typeof createUndergroundCampInteractions>[0];
type Point = ReturnType<typeof createUndergroundCampRemains>['recovery'];

function fixture(t: { after(fn: () => void): void }, overrides: Partial<InteractionOptions> = {}) {
  const floor = -91;
  const recovery: Point = [2.5, floor, 40];
  const walker = { radius: .27, standingHeight: 1.8 };
  const camp = createUndergroundCampRemains({
    camp: { side: 'right', length: 10, extension: 5 },
    walker,
    mine: {
      anchors: { campRecovery: { position: recovery } },
      route: [
        { zone: 'camp', from: [0, floor, 35], to: [0, floor, 40] },
        { zone: 'camp', from: [0, floor, 40], to: recovery },
      ],
      queryPassage(x, z, radius, height) {
        if (x - radius < -2 || x + radius > 7 || z - radius < 35 ||
            z + radius > 45 || height > 3.5) return;
        return { floor, zone: 'camp', clearance: 3.5 };
      },
    },
  });
  const host = { point: recovery as Point | undefined, time: 100, acceptStand: true, look: true, health: 17 };
  const events = { seats: [] as string[], stands: [] as string[], rested: [] as string[],
    ambience: [] as boolean[], looks: [] as Point[], relics: [] as (typeof undergroundCanteenBowlRelic)[] };
  const interactions = createUndergroundCampInteractions({
    camp, walker, restAfterMs: 3000, promptRange: .72,
    now: () => host.time,
    readFooting: () => host.point,
    sit(room) {
      events.seats.push(room.id);
      host.point = room.sit.position;
      return true;
    },
    stand(room) {
      if (!host.acceptStand) return false;
      events.stands.push(room.id);
      host.point = room.approach;
      return true;
    },
    setSeatedAmbience: active => events.ambience.push(active),
    onRested: room => events.rested.push(room.id),
    lookAtBowl(bowl) { events.looks.push(bowl.position); return host.look; },
    recordRelic(entry) { events.relics.push(entry); return 'recorded'; },
    ...overrides,
  });
  t.after(camp.dispose);
  return { camp, events, host, interactions };
}

test('all six beds can be seated and exited, each with one quiet and one restored ambience event', async t => {
  const { camp, events, host, interactions } = fixture(t);
  for (const room of camp.rooms) {
    host.point = room.approach;
    const prompt = interactions.prompt();
    assert.deepEqual(prompt, { id: 'bed:' + room.id, kind: 'bed', label: '在床边坐下', targetId: room.id });
    assert.equal(await interactions.press(prompt.id), 'sat');
    assert.equal(interactions.snapshot().seatedRoomId, room.id);
    assert.deepEqual(host.point, room.sit.position);
    assert.equal(interactions.prompt()?.kind, 'stand');
    assert.equal(await interactions.press(interactions.prompt()?.id), 'stood');
    assert.deepEqual(host.point, room.approach);
    assert.equal(interactions.snapshot().seatedRoomId, undefined);
  }
  const ids = camp.rooms.map(room => room.id);
  assert.deepEqual(events.seats, ids);
  assert.deepEqual(events.stands, ids);
  assert.deepEqual(events.ambience, ids.flatMap(() => [true, false]));
  assert.equal(host.health, 17);
  assert.ok(camp.rooms.every(room => room.sit.restoresHealth === false));
});

test('rest happens once per seat after the configured duration and is cleared on stand or session exit', async t => {
  const { camp, events, host, interactions } = fixture(t);
  host.point = camp.rooms[2].approach;
  assert.equal(await interactions.press(), 'sat');
  host.time = 3099;
  interactions.update();
  assert.deepEqual(events.rested, []);
  host.time = 3100;
  interactions.update();
  interactions.update();
  assert.deepEqual(events.rested, [camp.rooms[2].id]);
  assert.equal(interactions.snapshot().rested, true);
  host.acceptStand = false;
  assert.equal(await interactions.press(), 'rejected');
  assert.equal(interactions.snapshot().rested, true);
  host.point = undefined;
  interactions.update();
  interactions.cancelSeat();
  assert.deepEqual(events.ambience, [true, false]);
  assert.equal(interactions.snapshot().rested, false);
  assert.equal(host.health, 17);
});

test('untrusted height, solid furniture, a partition and stale prompts cannot execute an action', async t => {
  const { camp, events, host, interactions } = fixture(t, { promptRange: 1.5 });
  const bed = camp.rooms[0];
  host.point = [bed.approach[0], bed.approach[1] + .05, bed.approach[2]];
  assert.equal(await interactions.press(), 'unavailable');
  host.point = [6.05, -91, 36.66];
  assert.equal(await interactions.press(), 'unavailable');
  // The next bedroom is within the prompt radius, but a direct route there clips the partition.
  host.point = [4.18, -91, 36.84];
  assert.ok(Math.hypot(host.point[0] - camp.rooms[1].approach[0], host.point[2] - camp.rooms[1].approach[2]) < 1.5);
  assert.equal(interactions.prompt(), undefined);
  host.point = bed.approach;
  const previous = interactions.prompt()?.id;
  assert.equal(previous, 'bed:dorm-1');
  host.point = camp.rooms[1].approach;
  assert.equal(await interactions.press(previous), 'unavailable');
  assert.deepEqual(events.seats, []);
});

test('a successful look records one object-only relic and repeat looks do not duplicate it', async t => {
  const { camp, events, host, interactions } = fixture(t);
  host.point = camp.dining.bowl.approach;
  host.look = false;
  assert.equal(await interactions.press(), 'rejected');
  assert.deepEqual(events.relics, []);
  host.look = true;
  assert.equal(interactions.prompt()?.kind, 'bowl');
  assert.equal(await interactions.press(), 'bowl-recorded');
  assert.equal(await interactions.press(), 'bowl-known');
  assert.deepEqual(events.looks, Array(3).fill(camp.dining.bowl.position));
  assert.deepEqual(events.relics, [{ category: 'relic', id: 'mine-canteen-left-bowl', label: '食堂的留碗' }]);
});

test('pending catalogue writes serialize input and a failed write is retryable', async t => {
  let finish!: (result: 'rejected' | 'already-recorded') => void;
  let writes = 0;
  const { camp, host, interactions } = fixture(t, {
    recordRelic() {
      writes++;
      return new Promise(resolve => { finish = resolve; });
    },
  });
  host.point = camp.dining.bowl.approach;
  const first = interactions.press();
  assert.equal(await interactions.press(), 'busy');
  finish('rejected');
  assert.equal(await first, 'rejected');
  assert.equal(interactions.snapshot().bowlKnown, false);
  const retry = interactions.press();
  finish('already-recorded');
  assert.equal(await retry, 'bowl-known');
  await interactions.press();
  assert.equal(writes, 2);
});

test('only reachable and currently available empty lamp niches can be sent to the offer port', async t => {
  const calls: string[] = [];
  let available = false;
  const { camp, host, interactions } = fixture(t, {
    canOfferLamp: () => available,
    offerLamp(id) { available = false; calls.push(id); return true; },
  });
  const empty = camp.memorial.niches.find(niche => !niche.hasSpentLamp)!;
  host.point = [empty.position[0], camp.memorial.approach[1], camp.memorial.approach[2]];
  assert.equal(interactions.prompt(), undefined);
  available = true;
  const prompt = interactions.prompt()!;
  assert.equal(prompt.kind, 'offer-lamp');
  assert.equal(prompt.targetId, empty.id);
  const occupied = camp.memorial.niches.find(niche => niche.hasSpentLamp)!;
  assert.equal(await interactions.press('offer-lamp:' + occupied.id), 'unavailable');
  assert.equal(await interactions.press(prompt.id), 'lamp-offered');
  assert.deepEqual(calls, [empty.id]);
  assert.equal(await interactions.press(prompt.id), 'unavailable');
});
