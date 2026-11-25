import type { createUndergroundCampRemains } from './underground-camp-remains';

type Remains = ReturnType<typeof createUndergroundCampRemains>;
type Camp = Pick<Remains, 'rooms' | 'dining' | 'memorial' | 'queryPassage'>;
type Point = Remains['recovery'];
type Room = Remains['rooms'][number];
type Bowl = Remains['dining']['bowl'];
type Niche = Remains['memorial']['niches'][number];

export const undergroundCanteenBowlRelic = {
  category: 'relic',
  id: 'mine-canteen-left-bowl',
  label: '食堂的留碗',
} as const;

type Prompt = Readonly<{
  id: string;
  kind: 'bed' | 'stand' | 'bowl' | 'offer-lamp';
  label: string;
  targetId: string;
}>;
type Action =
  | { prompt: Prompt; approach: Point; kind: 'bed'; room: Room }
  | { prompt: Prompt; approach: Point; kind: 'bowl'; bowl: Bowl }
  | { prompt: Prompt; approach: Point; kind: 'offer-lamp'; niche: Niche };
type Result = 'sat' | 'stood' | 'bowl-recorded' | 'bowl-known' | 'lamp-offered' |
  'unavailable' | 'rejected' | 'busy';
type RelicResult = 'recorded' | 'already-recorded' | 'rejected';
type Options = {
  camp: Camp;
  walker: { radius: number; standingHeight: number };
  promptRange: number;
  restAfterMs: number;
  now(): number;
  /** Trusted position within the active camp, including while seated. No value outside the camp session. */
  readFooting(): Point | undefined;
  sit(room: Room): boolean;
  stand(room: Room): boolean;
  setSeatedAmbience(active: boolean): void;
  onRested?(room: Room): void;
  lookAtBowl(bowl: Bowl): boolean;
  /** Idempotent per visitor in the host catalogue. */
  recordRelic(entry: typeof undergroundCanteenBowlRelic): RelicResult | Promise<RelicResult>;
  canOfferLamp?(nicheId: string): boolean;
  offerLamp?(nicheId: string): boolean | Promise<boolean>;
};

const floorTolerance = .002;

function hint(kind: Prompt['kind'], targetId: string, label: string): Prompt {
  return { id: kind + ':' + targetId, kind, targetId, label };
}

/** Camp-local interaction decisions. The host supplies movement, audio, catalogue, and lamp authority. */
export function createUndergroundCampInteractions(options: Options) {
  const { camp, promptRange, restAfterMs } = options;
  const { radius, standingHeight } = options.walker;
  if (![promptRange, restAfterMs, radius, standingHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Camp interaction requires a valid walking profile and timing');
  }

  const actions: Action[] = camp.rooms.map(room => ({
    prompt: hint('bed', room.id, '在床边坐下'), approach: room.approach, kind: 'bed', room,
  }));
  const bowl = camp.dining.bowl;
  actions.push({ prompt: hint('bowl', bowl.id, '看一眼留碗'), approach: bowl.approach, kind: 'bowl', bowl });
  if (options.offerLamp && options.canOfferLamp) {
    const [, y, z] = camp.memorial.approach;
    for (const niche of camp.memorial.niches) {
      if (niche.hasSpentLamp || niche.lit) continue;
      actions.push({
        prompt: hint('offer-lamp', niche.id, '献一盏灯'),
        approach: [niche.position[0], y, z], kind: 'offer-lamp', niche,
      });
    }
  }

  let seated: { room: Room; startedAt: number; rested: boolean } | undefined;
  let bowlKnown = false;
  let busy = false;

  function walkable([x, y, z]: Point) {
    const location = camp.queryPassage(x, z, radius, standingHeight);
    return location?.zone === 'camp' && Math.abs(location.floor - y) <= floorTolerance;
  }

  function pathClear(start: Point, end: Point, length: number) {
    const steps = Math.max(1, Math.ceil(length / .05));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const probe: Point = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t,
      ];
      if (!walkable(probe)) return false;
    }
    return true;
  }

  function trustedFooting() {
    const position = options.readFooting();
    if (position?.every(Number.isFinite)) return position;
  }

  function select(position: Point) {
    if (!walkable(position)) return;
    let nearest: Action | undefined;
    let distance = Infinity;
    for (const action of actions) {
      const approach = action.approach;
      const gap = Math.hypot(position[0] - approach[0], position[1] - approach[1], position[2] - approach[2]);
      if (gap > promptRange || gap >= distance) continue;
      if (action.kind === 'offer-lamp' && options.canOfferLamp?.(action.niche.id) !== true) continue;
      if (!pathClear(position, approach, gap)) continue;
      nearest = action;
      distance = gap;
    }
    return nearest;
  }

  function inSeat(position: Point, room: Room) {
    const at = room.sit.position;
    return Math.hypot(position[0] - at[0], position[2] - at[2]) <= promptRange &&
      Math.abs(position[1] - at[1]) <= standingHeight;
  }

  function standPrompt(position: Point, room: Room) {
    if (inSeat(position, room) && walkable(room.approach)) return hint('stand', room.id, '起身');
  }

  function prompt() {
    if (busy) return;
    const position = trustedFooting();
    if (!position) return;
    return seated ? standPrompt(position, seated.room) : select(position)?.prompt;
  }

  function cancelSeat() {
    if (!seated) return;
    seated = undefined;
    options.setSeatedAmbience(false);
  }

  async function press(expectedId?: string): Promise<Result> {
    if (busy) return 'busy';
    const position = trustedFooting();
    if (!position) return 'unavailable';
    if (seated) {
      const stand = standPrompt(position, seated.room);
      if (!stand || (expectedId && stand.id !== expectedId)) return 'unavailable';
      busy = true;
      try {
        if (!options.stand(seated.room)) return 'rejected';
        cancelSeat();
        return 'stood';
      } finally {
        busy = false;
      }
    }

    const action = select(position);
    if (!action || (expectedId && action.prompt.id !== expectedId)) return 'unavailable';
    busy = true;
    try {
      if (action.kind === 'bed') {
        const startedAt = options.now();
        if (!Number.isFinite(startedAt) || !options.sit(action.room)) return 'rejected';
        seated = { room: action.room, startedAt, rested: false };
        options.setSeatedAmbience(true);
        return 'sat';
      }
      if (action.kind === 'offer-lamp') {
        return await options.offerLamp?.(action.niche.id) ? 'lamp-offered' : 'rejected';
      }
      if (!options.lookAtBowl(action.bowl)) return 'rejected';
      if (bowlKnown) return 'bowl-known';
      const result = await options.recordRelic(undergroundCanteenBowlRelic);
      if (result !== 'recorded' && result !== 'already-recorded') return 'rejected';
      bowlKnown = true;
      return result === 'recorded' ? 'bowl-recorded' : 'bowl-known';
    } finally {
      busy = false;
    }
  }

  function update() {
    if (!seated) return;
    const position = trustedFooting();
    if (!position || !inSeat(position, seated.room)) {
      cancelSeat();
      return;
    }
    const elapsed = options.now() - seated.startedAt;
    if (seated.rested || !Number.isFinite(elapsed) || elapsed < restAfterMs) return;
    seated.rested = true;
    options.onRested?.(seated.room);
  }

  return {
    prompt, press, update, cancelSeat,
    snapshot: () => ({ seatedRoomId: seated?.room.id, rested: seated?.rested ?? false, bowlKnown }),
  };
}
