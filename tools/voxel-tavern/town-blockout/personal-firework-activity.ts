import { personalFireworkKinds, type PersonalFireworkRelay, type PersonalFireworkRequest } from '../../../src/presence/personal-fireworks';
import type { TownActivityContext, TownActivitySpot } from './town-activity';
import {
  createPersonalFireworkInventory, hangingFireworkGround, nearestPersonalFireworks,
  personalFireworkCopy, personalFireworkStock, personalFireworkStorageKey, samplePersonalFirework,
  type PersonalFirework, type PersonalFireworkArea, type PersonalFireworkKind, type PersonalFireworkParticle,
} from './personal-fireworks';

export const firecrackerStand = { x: 154, n: 97.5 };
const quietRetry = '稍等一会儿再放。';
type Position = { x: number; y: number; z: number };
type Player = Position & { yaw: number; area: PersonalFireworkArea };
type Options = {
  context: Pick<TownActivityContext, 'open' | 'announce'>;
  button: HTMLButtonElement;
  player(): Player;
  listener(): Position;
  hand(owner: number): Position | undefined;
  ground(x: number, z: number): number;
  canSet(point: Position, player: Player): boolean;
  request(request: PersonalFireworkRequest): 'sent' | 'busy' | 'offline';
  serverNow(): number;
  ceremony(): boolean;
  paint(frame: readonly PersonalFireworkParticle[]): void;
  sound(kind: PersonalFireworkKind, distance: number, ceremony: boolean, delaySeconds: number): void;
};

export function createTownPersonalFireworks(opts: Options) {
  const { button, context } = opts;
  const inventory = createPersonalFireworkInventory(readStock(), stock => {
    try { localStorage.setItem(personalFireworkStorageKey, JSON.stringify(stock)); } catch { /* Keep session stock. */ }
  });
  const effects: PersonalFirework[] = [];
  const particles: PersonalFireworkParticle[] = [];
  let pending: { seed: number; at: number } | undefined;
  let soundAt = -Infinity;
  let soundCount = 0;
  let sparkOwner = 0;

  function readStock(): unknown {
    try { return JSON.parse(localStorage.getItem(personalFireworkStorageKey) ?? 'null'); } catch { return null; }
  }

  function refresh() {
    button.textContent = `爆竹背包 ${inventory.total()}/10`;
  }

  function cancelSparkler(owner = sparkOwner) {
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].kind === 'sparkler' && effects[i].owner === owner) effects.splice(i, 1);
    }
  }

  function play(event: PersonalFireworkRequest, owner: number, at: number) {
    if (event.item === 'sparkler') cancelSparkler(owner);
    if (effects.length === 96) effects.shift();
    const effect = { kind: event.item, owner, at, seed: event.seed, yaw: event.yaw,
      x: event.east, y: event.height, z: -event.north };
    effects.push(effect);
    const ear = opts.listener();
    const distance = Math.hypot(ear.x - effect.x, ear.y - effect.y, ear.z - effect.z);
    if (distance > 80) return;
    const now = performance.now();
    if (now - soundAt >= 1_000) { soundAt = now; soundCount = 0; }
    if (soundCount++ < 8 || owner === sparkOwner) {
      opts.sound(event.item, distance, opts.ceremony(), (at - opts.serverNow()) / 1_000);
    }
  }

  function finishUse(kind: PersonalFireworkKind) {
    if (inventory.use(kind, 'open', Date.now(), opts.ceremony()) !== 'fired') return false;
    refresh();
    try {
      const key = 'unwritten:first-personal-firework';
      if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now()));
    } catch { /* Gameplay also works without browser storage. */ }
    context.announce(`已放 · ${personalFireworkStock[kind].label}`);
    return true;
  }

  function use(kind: PersonalFireworkKind, panel: HTMLElement) {
    const player = opts.player();
    const check = inventory.check(kind, player.area, Date.now(), opts.ceremony());
    if (check !== 'fired') {
      panel.closest('dialog')?.close();
      context.announce(check === 'indoors' ? personalFireworkCopy.indoors : check === 'empty' ? personalFireworkCopy.empty : quietRetry);
      return;
    }
    if (pending && performance.now() - pending.at < 2_000) {
      panel.closest('dialog')?.close();
      context.announce(quietRetry);
      return;
    }
    const point = kind === 'string' ? hangingFireworkGround(player, player.yaw, opts.ground)
      : { x: player.x, y: player.y + 1.28, z: player.z };
    if (!opts.canSet(point, player)) {
      panel.closest('dialog')?.close();
      context.announce(personalFireworkCopy.indoors);
      return;
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const yaw = Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw));
    const event = { item: kind, seed, east: point.x, north: -point.z, height: point.y, yaw };
    panel.closest('dialog')?.close();
    const result = opts.request(event);
    if (result === 'sent') pending = { seed, at: performance.now() };
    else if (result === 'busy') context.announce(quietRetry);
    else if (finishUse(kind)) { sparkOwner = 0; play(event, 0, opts.serverNow()); }
  }

  function show(pickup: boolean) {
    const panel = context.open(pickup ? personalFireworkCopy.sign : '爆竹背包',
      pickup ? personalFireworkCopy.pickup : '只在露天燃放。');
    if (pickup) {
      const reminder = document.createElement('p');
      reminder.textContent = personalFireworkCopy.reminder;
      panel.append(reminder);
    }
    for (const kind of personalFireworkKinds) {
      const item = document.createElement('button');
      item.type = 'button';
      item.dataset.firecrackerItem = kind;
      const label = personalFireworkStock[kind].label;
      const updateLabel = () => { item.textContent = `${pickup ? '领取' : '使用'}${label} · 持有 ${inventory.stock()[kind]}`; };
      item.onclick = () => {
        if (!pickup) { use(kind, panel); return; }
        const added = inventory.claim(kind, 1);
        if (!added) context.announce('背包已满 · 10/10');
        refresh(); updateLabel();
      };
      updateLabel();
      panel.append(item);
    }
  }
  button.onclick = () => show(false);
  refresh();

  return {
    pickup(ground: number): TownActivitySpot {
      return { ...firecrackerStand, ground, range: 1.8, label: '在集市领取爆竹', run: () => show(true) };
    },
    receive(event: PersonalFireworkRelay, own: boolean) {
      if (own) {
        if (event.seed !== pending?.seed) return;
        pending = undefined;
        if (!finishUse(event.item)) return;
        sparkOwner = event.from;
      }
      play(event, event.from, event.startAt);
    },
    reject(seed: number, position: boolean) {
      if (seed !== pending?.seed) return;
      pending = undefined;
      context.announce(position ? personalFireworkCopy.indoors : quietRetry);
    },
    cancelSparkler,
    update() {
      if (!effects.length && !particles.length) return;
      const now = opts.serverNow();
      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        if (now - effect.at >= personalFireworkStock[effect.kind].seconds * 1_000) effects.splice(i, 1);
      }
      particles.length = 0;
      if (effects.length) {
        const player = opts.player();
        if (player.area !== 'open') cancelSparkler();
        const hand = (owner: number) => owner === sparkOwner ? {
          x: player.x + .32 * Math.cos(player.yaw) + .44 * Math.sin(player.yaw),
          y: player.y + 1.27, z: player.z + .32 * Math.sin(player.yaw) - .44 * Math.cos(player.yaw),
        } : opts.hand(owner);
        const ear = opts.listener();
        for (const effect of nearestPersonalFireworks(effects, ear, now, hand)) {
          particles.push(...samplePersonalFirework(effect, now, hand(effect.owner)));
        }
      }
      opts.paint(particles);
    },
  };
}
