import { personalFireworkCooldownMs, personalFireworkKinds } from '../../../src/presence/personal-fireworks';

export const personalFireworkVisibleLimit = 8;
export const personalFireworkParticleLimit = 16;
const carryLimit = 10;

export const personalFireworkStorageKey = 'unwritten:personal-fireworks-v1';

export const personalFireworkCopy = {
  sign: '爆竹声中一岁除',
  pickup: '拿去放，响了算我的。过年嘛，这摊不收钱——放完了回来再拿，别一回抱走一筐。',
  reminder: '离人远点儿，离柴火垛远点儿。响动是喜气，惊着人就不是了。',
  indoors: '这儿放不开，出去放。',
  empty: '兜里空了，回集市爆竹摊再领。',
} as const;

export const personalFireworkStock = {
  sparkler: { label: '呲花棒', price: 0, seconds: 20 },
  rocket: { label: '窜天猴', price: 0, seconds: 3.2 },
  string: { label: '挂鞭', price: 0, seconds: 5 },
} as const;
export type PersonalFireworkKind = keyof typeof personalFireworkStock;
type Point = { x: number; y: number; z: number };
export type PersonalFirework = Point & { kind: PersonalFireworkKind; yaw: number; seed: number; owner: number; at: number };
export type PersonalFireworkParticle = Point & { tint: number; opacity: number; radius: number };
export type PersonalFireworkArea = 'open' | 'house' | 'tavern' | 'memorial' | 'pool' | 'train' | 'palace-room';

type StoredStock = { stock: Record<PersonalFireworkKind, number>; lastFiredAt: number | null };

export function createPersonalFireworkInventory(saved?: unknown, save?: (value: StoredStock) => void) {
  const stock: StoredStock['stock'] = { sparkler: 0, rocket: 0, string: 0 };
  let lastFiredAt = -Infinity;
  const total = () => stock.sparkler + stock.rocket + stock.string;
  if (saved && typeof saved === 'object') {
    const state = saved as Partial<StoredStock>;
    const counts = state.stock;
    if (counts && personalFireworkKinds.every(kind => Number.isInteger(counts[kind]) && counts[kind] >= 0) &&
        personalFireworkKinds.reduce((sum, kind) => sum + counts[kind], 0) <= carryLimit) {
      for (const kind of personalFireworkKinds) stock[kind] = counts[kind];
    }
    if (typeof state.lastFiredAt === 'number' && Number.isFinite(state.lastFiredAt) && state.lastFiredAt >= 0) {
      lastFiredAt = Math.min(state.lastFiredAt, Date.now());
    }
  }

  function persist() {
    save?.({ stock: { ...stock }, lastFiredAt: Number.isFinite(lastFiredAt) ? lastFiredAt : null });
  }

  function check(kind: PersonalFireworkKind, area: PersonalFireworkArea, at: number, ceremony = false) {
    if (area !== 'open') return 'indoors';
    if (stock[kind] === 0) return 'empty';
    const cooldown = personalFireworkCooldownMs * (ceremony ? 2 : 1);
    return !Number.isFinite(at) || at - lastFiredAt < cooldown ? 'cooldown' : 'fired';
  }

  return {
    stock: () => ({ ...stock }), total, check,
    claim(kind: PersonalFireworkKind, quantity: number) {
      if (!Number.isSafeInteger(quantity) || quantity <= 0) return 0;
      const count = Math.min(quantity, carryLimit - total());
      stock[kind] += count;
      if (count) persist();
      return count;
    },
    use(kind: PersonalFireworkKind, area: PersonalFireworkArea, at: number, ceremony = false) {
      const result = check(kind, area, at, ceremony);
      if (result !== 'fired') return result;
      stock[kind]--;
      lastFiredAt = at;
      persist();
      return result;
    },
  };
}

function random(seed: number, index: number) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

const gold = 0xffc26b, red = 0xff5767;
const rocketColors = [red, gold, 0x7ad9ff, 0x76f6db, 0xf599df];

export function samplePersonalFirework(effect: PersonalFirework, now: number, hand?: Point): PersonalFireworkParticle[] {
  const age = (now - effect.at) / 1_000;
  if (!Number.isFinite(age) || age < 0 || age >= personalFireworkStock[effect.kind].seconds) return [];
  const { kind, seed, yaw } = effect;
  const base = kind === 'sparkler' && hand ? hand : effect;
  const dx = Math.sin(yaw), dz = -Math.cos(yaw);
  const particles: PersonalFireworkParticle[] = [];

  if (kind === 'rocket' && age < 1.2) {
    for (let i = 0; i < 6; i++) {
      const fraction = (age - .032 * i) / 1.2;
      if (fraction < 0) continue;
      particles.push({ x: base.x + dx * 4 * fraction, y: base.y + 25 * fraction, z: base.z + dz * 4 * fraction,
        tint: gold, opacity: 1 - i / 7, radius: 4 });
    }
    return particles;
  }
  if (kind === 'string' && age < 2) {
    return [{ x: base.x, y: base.y + .13, z: base.z, tint: gold, opacity: .6 + .4 * Math.sin(age * 36), radius: 2.6 }];
  }
  for (let i = 0; i < personalFireworkParticleLimit; i++) {
    const angle = random(seed, i) * Math.PI * 2;
    const height = random(seed, i + 32);
    const life = kind === 'sparkler' ? (age * 2.8 + i / 16) % 1
      : kind === 'string' ? ((age - 2) * 4 + i / 16) % 1 : (age - 1.2) / 2;
    const spread = kind === 'rocket' ? 3.2 * life : (kind === 'string' ? .75 : .46) * life;
    const paper = kind === 'string';
    particles.push({
      x: base.x + (kind === 'rocket' ? 4 * dx : paper ? (i - 7.5) * .045 * -dz : 0) + Math.cos(angle) * spread,
      y: base.y + (kind === 'rocket' ? 25 + (height - .48) * spread : .12 + height * spread) - life * life * (kind === 'rocket' ? 1.3 : .20),
      z: base.z + (kind === 'rocket' ? 4 * dz : paper ? (i - 7.5) * .045 * dx : 0) + Math.sin(angle) * spread,
      tint: kind === 'rocket' ? rocketColors[Math.floor(random(seed, 51) * rocketColors.length)] : paper ? red : gold,
      opacity: 1 - life, radius: paper ? 2.7 : 4.2,
    });
  }
  return particles;
}

export function hangingFireworkGround(player: Point, yaw: number, groundAt: (x: number, z: number) => number): Point {
  const x = player.x + Math.sin(yaw) * 1.2;
  const z = player.z - Math.cos(yaw) * 1.2;
  return { x, y: groundAt(x, z), z };
}

export function nearestPersonalFireworks(
  effects: readonly PersonalFirework[], listener: Point, now: number, handOf?: (owner: number) => Point | undefined,
) {
  return effects.filter(effect => now >= effect.at && now - effect.at < 1_000 * personalFireworkStock[effect.kind].seconds)
    .map(effect => {
      const point = (effect.kind === 'sparkler' ? handOf?.(effect.owner) : undefined) ?? effect;
      return { effect, distance: Math.hypot(point.x - listener.x, point.y - listener.y, point.z - listener.z) };
    })
    .sort((a, b) => a.distance - b.distance || a.effect.owner - b.effect.owner || a.effect.at - b.effect.at)
    .slice(0, personalFireworkVisibleLimit).map(({ effect }) => effect);
}
