import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial,
  type Scene,
} from 'three';
import type { TownActivity, TownActivityContext } from './town-activity';
import { railPlatforms } from './town-rail-stops';
import { iceFishingStation } from './ice-fishing-activity';
import { memorialTimeboxAnnex } from './town-mail-sites';
import { roadCorridorKeepClear } from './road-clearance';

export const fireWarmthRadius = 3;
export const maxCampfireSites = 9;
export const pineCampfireId = 'pine-camp';
export const campfirePartsPerSite = 44;
const fireParticles = 48;
const smokeParticles = 8;
const forestAngle = .12;

export type CampfireForestOptions = {
  level(): 0 | 1 | 2;
  onForestSeat?(): void;
  pineLevel?(): 0 | 1 | 2;
  onPineSeat?(): void;
  villageSmoke?: { x: number; n: number; height: number; scale(): number };
};

const forestFlames = [
  { count: 24, size: .78, rise: .62, glow: .6 },
  { count: 36, size: 1, rise: 1, glow: .88 },
  { count: fireParticles, size: 1.28, rise: 1.35, glow: 1.14 },
] as const;
type Surface = { x: number; n: number; ground: number };
type Style = 'stone' | 'bucket' | 'brazier';
type Seed = {
  id: string;
  label: string;
  style: Style;
  origin: readonly [number, number];
  facing: number;
  ground?: number;
  fixed?: boolean;
  spread?: number;
  ring?: readonly number[];
  woodPile?: readonly [number, number];
};
type CheckGround = (east: number, north: number, fixedHeight?: number) => number | undefined;
export type CampfirePiece = {
  at: [x: number, y: number, z: number];
  scale: [width: number, height: number, depth: number];
  tint: string;
  yaw?: number;
};

const castleSouth = railPlatforms.find(({ id }) => id === 'ice-castle')!;
const regionalSites: readonly Seed[] = [
  { id: 'forest', label: '森林篝火', style: 'stone', origin: [104, 400], facing: forestAngle },
  { id: 'lakeside', label: '冰湖岸边火桶', style: 'bucket', origin: [iceFishingStation.x, 97.65], facing: Math.PI },
  { id: 'castle-south', label: '城堡南站火盆', style: 'brazier',
    origin: [castleSouth.x + 6.8, castleSouth.n], ground: castleSouth.ground, facing: -Math.PI / 2 },
  { id: 'memorial', label: '新区时光信箱火盆', style: 'brazier', origin: [memorialTimeboxAnnex.x, memorialTimeboxAnnex.n + 2.72], facing: Math.PI / 2 },
  { id: 'market', label: '年集坐食区火炉', style: 'brazier', origin: [163, 90], facing: Math.PI },
];
const seatRadius = .61;
const woodPileRadius = .72;
const plazaSites: readonly Seed[] = [
  { id: 'plaza-brazier-a', label: '广场火盆甲', style: 'brazier', origin: [238, 205], facing: 0, fixed: true, spread: 2.05 },
  { id: 'plaza-brazier-b', label: '广场火盆乙', style: 'brazier', origin: [240, 173], facing: 0, fixed: true, spread: 2.05 },
  { id: 'plaza-campfire', label: '广场篝火', style: 'stone', origin: [178, 162], facing: 0, fixed: true,
    ring: [0, Math.PI / 2, Math.PI, -Math.PI / 2], woodPile: [-1.50, -1.35] },
];
const pineCampSeed: Seed = {
  id: pineCampfireId, label: '松林火塘', style: 'stone', origin: [418, 225], facing: -Math.PI / 2, fixed: true,
  ring: [0, Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3, Math.PI],
  woodPile: [-1.50, -1.35],
};
const fixedOffset = [[0, 0]] as const;
const siteOffsets = [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]] as const;
const regionalOffsets = [...siteOffsets, ...[2, 3.5, 5, 6.5, 8, 10, 12, 14, 16, 18, 20, 22].flatMap(radius =>
  Array.from({ length: 16 }, (_, index) => {
    const angle = index * Math.PI / 8;
    return [Math.sin(angle) * radius, Math.cos(angle) * radius] as const;
  }))];

export type CampfireSite = Surface & {
  id: string;
  label: string;
  style: Style;
  seats: readonly (Surface & { yaw: number; approach: Surface })[];
  woodPile?: Surface;
};

function seatSpread(seed: Seed) {
  return seed.spread ?? (seed.style === 'stone' ? 2.15 : 1.65);
}

function plazaIncludesCampfires(bounds?: readonly number[]) {
  if (bounds?.length !== 4 || !bounds.every(Number.isFinite)) return false;
  const [west, south, east, north] = bounds;
  const fits = (x: number, n: number, radius: number) =>
    x - radius >= west && x + radius <= east && n - radius >= south && n + radius <= north;
  // Opt in the complete plaza set once the fire cores, seats and log pile fit.
  return plazaSites.every(seed => {
    const [x, n] = seed.origin;
    const pile = seed.woodPile;
    return fits(x, n, seatSpread(seed) + seatRadius) &&
      (!pile || fits(x + pile[0], n + pile[1], woodPileRadius));
  });
}

export function findRegionalCampfires(
  groundAt: CheckGround,
  plazaBounds?: readonly number[],
  options?: { pineCamp?: boolean },
): CampfireSite[] {
  const seeds = [...regionalSites];
  if (plazaIncludesCampfires(plazaBounds)) seeds.push(...plazaSites);
  if (options?.pineCamp) seeds.push(pineCampSeed);
  const fires: CampfireSite[] = [];
  for (const seed of seeds) {
    const spread = seatSpread(seed);
    const ring = seed.ring ?? (seed.style === 'stone' ? [-1.13, -.40, .40, 1.13] : [-.97, 0, .97]);
    const offsets = seed.fixed ? fixedOffset : seed.id === 'forest' || seed.id === 'lakeside' ? regionalOffsets : siteOffsets;
    for (const [dx, dn] of offsets) {
      const x = seed.origin[0] + dx;
      const n = seed.origin[1] + dn;
      if (roadCorridorKeepClear(x, n, seed.style === 'stone' ? 1 : .81)) continue;
      const feet = groundAt(x, n, seed.ground);
      if (feet === undefined) continue;
      const footprint = seed.style === 'stone' ? .66 : .51;
      if ([[footprint, 0], [-footprint, 0], [0, footprint], [0, -footprint]].some(([ex, en]) => {
        const support = groundAt(x + ex, n + en, seed.ground);
        return support === undefined || Math.abs(support - feet) > .20;
      })) continue;

      const seats: (Surface & { yaw: number; approach: Surface })[] = [];
      for (const turn of ring) {
        const angle = seed.facing + turn;
        const east = x + Math.sin(angle) * spread;
        const north = n + Math.cos(angle) * spread;
        if (roadCorridorKeepClear(east, north, seatRadius)) continue;
        const height = groundAt(east, north, seed.ground);
        const approachX = x + Math.sin(angle) * (spread - .68);
        const approachN = n + Math.cos(angle) * (spread - .68);
        const approachGround = groundAt(approachX, approachN, seed.ground);
        if (height !== undefined && approachGround !== undefined &&
            Math.abs(height - feet) <= .35 && Math.abs(height - approachGround) <= .32) {
          seats.push({ x: east, n: north, ground: height, yaw: angle + Math.PI,
            approach: { x: approachX, n: approachN, ground: approachGround } });
        }
      }
      if (seats.length < (seed.id === pineCampfireId ? ring.length : 2)) continue;
      let woodPile: Surface | undefined;
      if (seed.woodPile) {
        const pileX = x + seed.woodPile[0], pileN = n + seed.woodPile[1];
        const ground = groundAt(pileX, pileN);
        if (ground === undefined || Math.abs(ground - feet) > .20 ||
            roadCorridorKeepClear(pileX, pileN, woodPileRadius)) continue;
        woodPile = { x: pileX, n: pileN, ground };
      }
      fires.push({ id: seed.id, label: seed.label, style: seed.style, x, n, ground: feet, seats,
        ...(woodPile ? { woodPile } : {}) });
      break;
    }
  }
  return fires;
}

export function nearCampfire(fires: readonly CampfireSite[], east: number, north: number, feet: number) {
  return fires.some(site => Math.abs(site.ground - feet) <= 1.25 &&
    (east - site.x) ** 2 + (north - site.n) ** 2 <= fireWarmthRadius ** 2);
}

export function campfirePieces(fires: readonly CampfireSite[]) {
  const pieces: CampfirePiece[] = [];
  for (const fire of fires) {
    const isStone = fire.style === 'stone';
    const isBucket = fire.style === 'bucket';
    const radius = isStone ? .64 : isBucket ? .375 : .43;
    const emberY = isStone ? .21 : isBucket ? .51 : .50;
    const add = (dx: number, dy: number, dn: number, w: number, h: number, d: number, tint: string, yaw?: number) =>
      pieces.push({ at: [fire.x + dx, fire.ground + dy, -(fire.n + dn)], scale: [w, h, d], tint, yaw });
    add(0, .045, 0, radius * 1.7, .082, radius * 1.7, '#4d454a');
    if (!isStone && !isBucket) {
      for (const [dx, dn] of [[.22, .22], [.22, -.22], [-.22, .22], [-.22, -.22]]) {
        add(dx, .18, dn, .105, .34, .105, '#6b5350');
      }
    }
    add(0, emberY - .09, 0, radius * 1.6, .13, radius * 1.6, '#412f30');
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      const tint = isStone ? ['#677588', '#818d9e', '#717d8f'][index % 3] : ['#544d56', '#765651'][index % 2];
      add(Math.sin(angle) * radius, isStone ? .143 : isBucket ? .30 : .44, Math.cos(angle) * radius,
        radius * .91, isStone ? .24 : isBucket ? .56 : .22, radius * .49, tint, -angle);
    }
    for (const [offset, turn] of [[-.18, .32], [0, -.38], [.18, .52]]) {
      add(offset, emberY, 0, .16, .15, radius * 1.55, '#715045', turn);
      add(offset * .75, emberY + .096, .04, .12, .052, .19, '#bc5434', turn);
    }
    for (const seat of fire.seats) {
      const addSeat = (x: number, y: number, n: number, w: number, h: number, d: number, tint: string) =>
        pieces.push({ at: [seat.x + Math.cos(seat.yaw) * x, seat.ground + y, -(seat.n + Math.sin(seat.yaw) * x + n)],
          scale: [w, h, d], tint, yaw: -seat.yaw });
      addSeat(0, .435, 0, .57, .12, .40, '#9e745b');
      addSeat(-.19, .20, 0, .11, .40, .31, '#67505a');
      addSeat(.19, .20, 0, .11, .40, .31, '#67505a');
    }
    if (fire.woodPile) {
      const { x, n, ground } = fire.woodPile;
      pieces.push({ at: [x, ground + .05, -n], scale: [.86, .10, .64], tint: '#453b3b' });
      for (const [index, shift] of [-.18, .02, .20, -.09, .09].entries()) {
        const y = index < 3 ? .18 : .32;
        pieces.push({ at: [x, ground + y, -n + shift], scale: [.73, .14, .15],
          tint: index % 2 ? '#a97e58' : '#79583f' });
        pieces.push({ at: [x - .37, ground + y, -n + shift], scale: [.026, .11, .12], tint: '#c0966c' });
      }
    }
  }
  return pieces;
}

export function createTownCampfires(
  scene: Scene,
  context: Pick<TownActivityContext, 'sit'>,
  sites: readonly CampfireSite[],
  forest?: CampfireForestOptions,
): TownActivity & { warmAt: (east: number, north: number, feet: number) => boolean; updateFlames: (dt: number, east: number, north: number, indoors: boolean) => void } {
  const villageSmoke = forest?.villageSmoke;
  const capacity = sites.length * (fireParticles + 1) + (villageSmoke ? smokeParticles : 0);
  const positions = new Float32Array(capacity * 3);
  const styles = new Float32Array(capacity * 3);
  const position = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const style = new BufferAttribute(styles, 3).setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('fireStyle', style);
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute vec3 fireStyle;
      varying vec3 vFireStyle;
      void main() {
        vFireStyle = fireStyle;
        vec4 center = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * center;
        gl_PointSize = clamp(fireStyle.x * 660. / max(1., -center.z), 2., 108.);
      }
    `,
    fragmentShader: `
      varying vec3 vFireStyle;
      void main() {
        vec2 p = gl_PointCoord - .5;
        float r = length(p);
        float alpha = (1. - smoothstep(.05, .50, r)) * vFireStyle.y;
        vec3 color = vFireStyle.z < 0. ? vec3(.57, .65, .74)
          : mix(vec3(1., .14, .026), vec3(1., .80, .36), vFireStyle.z);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const flames = new Points(geometry, material);
  flames.name = 'Shared regional campfire flames';
  flames.visible = false;
  flames.frustumCulled = false;
  scene.add(flames);
  let elapsed = 0, next = 0;

  return {
    spots: sites.flatMap(site => site.seats.map(seat => ({
      ...seat.approach, range: .47,
      label: `在${site.label}旁坐下`,
      run() {
        context.sit({ x: seat.x, n: seat.n, eyeY: seat.ground + 1.475, yaw: seat.yaw });
        if (site.id === 'forest') forest?.onForestSeat?.();
        else if (site.id === pineCampfireId) forest?.onPineSeat?.();
      },
    }))),
    blocked(east, north, feet) {
      return sites.some(site => {
        if (Math.abs(site.ground - feet) >= .95) return false;
        const distanceSquared = (east - site.x) ** 2 + (north - site.n) ** 2;
        const pile = site.woodPile;
        return distanceSquared < (site.style === 'stone' ? 1 : .81) ** 2 ||
          (pile !== undefined && feet < pile.ground + .45 && feet + 1.8 > pile.ground &&
            (east - pile.x) ** 2 + (north - pile.n) ** 2 < woodPileRadius ** 2) ||
          (distanceSquared < 2.76 ** 2 && site.seats.some(seat => feet < seat.ground + .5 &&
            feet + 1.8 > seat.ground && (east - seat.x) ** 2 + (north - seat.n) ** 2 < seatRadius ** 2));
      });
    },
    warmAt: (east, north, feet) => nearCampfire(sites, east, north, feet),
    updateFlames(dt, east, north, indoors) {
      flames.visible = !indoors && (sites.length > 0 || villageSmoke !== undefined);
      if (!flames.visible) return;
      elapsed += dt;
      if (elapsed < next) return;
      next = elapsed + 1 / 24;
      let point = 0;
      const emit = (x: number, y: number, z: number, size: number, opacity: number, gold: number) => {
        const index = point++ * 3;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;
        styles[index] = size;
        styles[index + 1] = opacity;
        styles[index + 2] = gold;
      };
      for (const [index, site] of sites.entries()) {
        const isStone = site.style === 'stone';
        const y = site.ground + (isStone ? .31 : .59);
        const level = site.id === 'forest' ? forest?.level() : site.id === pineCampfireId ? forest?.pineLevel?.() : undefined;
        const profile = level === undefined ? undefined : forestFlames[level];
        const glow = profile?.glow ?? 1;
        emit(site.x, y + .07, -site.n, (isStone ? 1.88 : 1.35) * glow, .31 * glow, .26);
        if ((site.x - east) ** 2 + (site.n - north) ** 2 > 40 ** 2) continue;
        for (let i = 0; i < (profile?.count ?? fireParticles); i++) {
          const life = (elapsed * (.57 + i % 8 * .068) + i * .618034 + index * .26) % 1;
          const theta = i * 2.39996 + elapsed * .22;
          const spread = (1 - life * .67) * (isStone ? .32 : .19) * (.62 + .38 * Math.sin(i * 1.718));
          const rise = life * (isStone ? .95 : .70) * (profile?.rise ?? 1);
          emit(site.x + Math.cos(theta) * spread, y + rise, -site.n + Math.sin(theta) * spread,
            .145 * (1 - life * .74) * (profile?.size ?? 1), .82 * (1 - life), (1 - life) ** 2);
        }
      }
      if (villageSmoke && (villageSmoke.x - east) ** 2 + (villageSmoke.n - north) ** 2 <= 40 ** 2) {
        const scale = villageSmoke.scale();
        const until = scale > 1 ? smokeParticles : smokeParticles / 2;
        for (let i = 0; i < until; i++) {
          const life = (elapsed * .27 + i / until) % 1;
          emit(villageSmoke.x + Math.sin(i * 2.4 + elapsed) * .24 * life, villageSmoke.height + life * 2.2 * scale,
            -villageSmoke.n + .37 * life, (.20 + life * .49) * scale, .20 * (1 - life), -1);
        }
      }
      geometry.setDrawRange(0, point);
      position.needsUpdate = true;
      style.needsUpdate = true;
    },
  };
}
