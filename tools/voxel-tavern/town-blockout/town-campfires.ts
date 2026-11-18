import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial,
  type Scene,
} from 'three';
import type { TownActivity, TownActivityContext } from './town-activity';
import { railPlatforms } from './town-rail-stops';
import { iceFishingStation } from './ice-fishing-activity';
import { memorialTimeboxAnnex } from './town-mail-sites';

export const fireWarmthRadius = 3;
export const maxCampfireSites = 8;
export const campfirePartsPerSite = 44;
const fireParticles = 48;
const forestAngle = .12;
type Surface = { x: number; n: number; ground: number };
type Style = 'stone' | 'bucket' | 'brazier';
type Seed = { id: string; label: string; style: Style; origin: readonly [number, number]; facing: number; ground?: number };
type CheckGround = (east: number, north: number, fixedHeight?: number) => number | undefined;
export type CampfirePiece = {
  at: [x: number, y: number, z: number];
  scale: [width: number, height: number, depth: number];
  tint: string;
  yaw?: number;
};

const castleSouth = railPlatforms.find(({ id }) => id === 'ice-castle')!;
// Plaza P-16 / P-24 / P-25 attach to the same builder after B2 fixes the ground plan.
const regionalSites: readonly Seed[] = [
  { id: 'forest', label: '森林篝火', style: 'stone', origin: [104, 400], facing: forestAngle },
  { id: 'lakeside', label: '冰湖岸边火桶', style: 'bucket', origin: [iceFishingStation.x, 97.65], facing: Math.PI },
  { id: 'castle-south', label: '城堡南站火盆', style: 'brazier',
    origin: [castleSouth.x + 6.8, castleSouth.n], ground: castleSouth.ground, facing: -Math.PI / 2 },
  { id: 'memorial', label: '新区时光信箱火盆', style: 'brazier', origin: [memorialTimeboxAnnex.x, memorialTimeboxAnnex.n + 2.72], facing: Math.PI / 2 },
  { id: 'market', label: '年集坐食区火炉', style: 'brazier', origin: [163, 90], facing: Math.PI },
];
const siteOffsets = [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]] as const;

export type CampfireSite = Surface & {
  id: string;
  label: string;
  style: Style;
  seats: readonly (Surface & { yaw: number })[];
};

export function findRegionalCampfires(groundAt: CheckGround): CampfireSite[] {
  const fires: CampfireSite[] = [];
  for (const seed of regionalSites) {
    const spread = seed.style === 'stone' ? 2.15 : 1.65;
    const ring = seed.style === 'stone' ? [-1.13, -.40, .40, 1.13] : [-.97, 0, .97];
    for (const [dx, dn] of siteOffsets) {
      const x = seed.origin[0] + dx;
      const n = seed.origin[1] + dn;
      const feet = groundAt(x, n, seed.ground);
      if (feet === undefined) continue;
      const footprint = seed.style === 'stone' ? .66 : .51;
      if ([[footprint, 0], [-footprint, 0], [0, footprint], [0, -footprint]].some(([ex, en]) => {
        const support = groundAt(x + ex, n + en, seed.ground);
        return support === undefined || Math.abs(support - feet) > .20;
      })) continue;

      const seats: (Surface & { yaw: number })[] = [];
      for (const turn of ring) {
        const angle = seed.facing + turn;
        const east = x + Math.sin(angle) * spread;
        const north = n + Math.cos(angle) * spread;
        const height = groundAt(east, north, seed.ground);
        if (height !== undefined && Math.abs(height - feet) <= .5) {
          seats.push({ x: east, n: north, ground: height, yaw: angle + Math.PI });
        }
      }
      if (seats.length < 2) continue;
      fires.push({ id: seed.id, label: seed.label, style: seed.style, x, n, ground: feet, seats });
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
  }
  return pieces;
}

export function createTownCampfires(
  scene: Scene,
  context: Pick<TownActivityContext, 'sit'>,
  sites: readonly CampfireSite[],
): TownActivity & { warmAt: (east: number, north: number, feet: number) => boolean; updateFlames: (dt: number, east: number, north: number, indoors: boolean) => void } {
  const capacity = sites.length * (fireParticles + 1);
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
        vec3 color = mix(vec3(1., .14, .026), vec3(1., .80, .36), vFireStyle.z);
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
      x: seat.x, n: seat.n, ground: seat.ground, range: 1.25,
      label: `在${site.label}旁坐下`,
      run: () => context.sit({ x: seat.x, n: seat.n, eyeY: seat.ground + 1.22, yaw: seat.yaw }),
    }))),
    blocked(east, north, feet) {
      return sites.some(site => Math.abs(site.ground - feet) < .8 &&
        (east - site.x) ** 2 + (north - site.n) ** 2 < (site.style === 'stone' ? 1.0 : .81) ** 2);
    },
    warmAt: (east, north, feet) => nearCampfire(sites, east, north, feet),
    updateFlames(dt, east, north, indoors) {
      flames.visible = !indoors && sites.length > 0;
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
        emit(site.x, y + .07, -site.n, isStone ? 1.88 : 1.35, .31, .26);
        if ((site.x - east) ** 2 + (site.n - north) ** 2 > 40 ** 2) continue;
        for (let i = 0; i < fireParticles; i++) {
          const life = (elapsed * (.57 + i % 8 * .068) + i * .618034 + index * .26) % 1;
          const theta = i * 2.39996 + elapsed * .22;
          const spread = (1 - life * .67) * (isStone ? .32 : .19) * (.62 + .38 * Math.sin(i * 1.718));
          const rise = life * (isStone ? .95 : .70);
          emit(site.x + Math.cos(theta) * spread, y + rise, -site.n + Math.sin(theta) * spread,
            .145 * (1 - life * .74), .82 * (1 - life), (1 - life) ** 2);
        }
      }
      geometry.setDrawRange(0, point);
      position.needsUpdate = true;
      style.needsUpdate = true;
    },
  };
}
