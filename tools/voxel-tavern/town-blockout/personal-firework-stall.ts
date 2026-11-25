import type { TownActivityContext, TownActivitySpot } from './town-activity';
import {
  createPersonalFireworkInventory, hangingFireworkGround, nearestPersonalFireworks, personalFireworkCopy,
  personalFireworkStock, samplePersonalFirework, type PersonalFirework, type PersonalFireworkArea, type PersonalFireworkKind,
} from './personal-fireworks';

export const marketFirecrackerCounter = { x: 154, n: 109.65, frontNorth: 107.8 } as const;
type Point = { x: number; y: number; z: number };
type View = {
  player(): Point & { yaw: number; area: PersonalFireworkArea; ceremony: boolean };
  ground(x: number, z: number): number;
  blocked(x: number, n: number, y: number): boolean;
  now(): number;
  owner(): number;
  launch(event: PersonalFirework, ceremony: boolean): void;
};

const kinds = Object.keys(personalFireworkStock) as PersonalFireworkKind[];

export function createPersonalFireworkStall(context: Pick<TownActivityContext, 'open' | 'announce'>, view: View) {
  const inventory = createPersonalFireworkInventory();
  let effects: PersonalFirework[] = [];
  function hand() {
    const player = view.player();
    return { x: player.x + .48 * Math.sin(player.yaw + .3),
      y: player.y + 1.2, z: player.z - .48 * Math.cos(player.yaw + .3) };
  }

  function use(kind: PersonalFireworkKind) {
    const player = view.player();
    const resultAt = view.now();
    const ground = kind === 'string' ? hangingFireworkGround(player, player.yaw, view.ground) : player;
    const area = kind === 'string' && view.blocked(ground.x, -ground.z, ground.y) ? 'house' : player.area;
    const result = inventory.use(kind, area, resultAt, player.ceremony);
    if (result === 'indoors' || result === 'empty') {
      context.announce(personalFireworkCopy[result]);
      return false;
    }
    if (result !== 'fired') return false;
    const position = kind === 'sparkler' ? hand() : ground;
    if (kind === 'sparkler') extinguishSparkler();
    const event = { x: position.x, y: position.y + (kind === 'rocket' ? .8 : 0), z: position.z,
      kind, at: resultAt, yaw: player.yaw, owner: view.owner(),
      seed: crypto.getRandomValues(new Uint32Array(1))[0] };
    effects.push(event);
    view.launch(event, player.ceremony);
    return true;
  }

  function extinguishSparkler() { effects = effects.filter(effect => effect.kind !== 'sparkler'); }

  function menu(mode: 'claim' | 'use') {
    const panel = context.open(personalFireworkCopy.sign,
      mode === 'claim' ? personalFireworkCopy.pickup : personalFireworkCopy.reminder);
    for (const kind of kinds) {
      const button = document.createElement('button');
      button.type = 'button';
      const sync = () => { button.textContent = personalFireworkStock[kind].label + ' ×' + inventory.stock()[kind]; };
      button.onclick = () => {
        if (mode === 'claim') { inventory.claim(kind, 1); sync(); }
        else if (use(kind)) panel.closest('dialog')?.close();
      };
      sync();
      panel.append(button);
    }
  }

  return {
    spot: {
      x: marketFirecrackerCounter.x, n: marketFirecrackerCounter.frontNorth,
      ground: view.ground(marketFirecrackerCounter.x, -marketFirecrackerCounter.frontNorth),
      label: personalFireworkCopy.sign, range: 1.8, run: () => menu('claim'),
    } satisfies TownActivitySpot,
    bag: { label: '爆竹背包', run: () => menu('use') },
    hasStock: () => kinds.some(kind => inventory.stock()[kind] > 0),
    extinguishSparkler,
    frame(listener: Point) {
      const now = view.now();
      effects = effects.filter(effect => now - effect.at < personalFireworkStock[effect.kind].seconds * 1000);
      if (!effects.length) return [];
      if (view.player().area !== 'open') extinguishSparkler();
      const held = hand();
      return nearestPersonalFireworks(effects, listener, now, () => held).flatMap(effect => samplePersonalFirework(effect, now, held));
    },
  };
}
