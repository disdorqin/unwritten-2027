import {
  BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PointLight,
} from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';

type GroundAt = (east: number, north: number) => number | undefined;
type Point = Readonly<{ east: number; north: number; height: number }>;
type Piece = Readonly<{
  family: 'basalt' | 'timber' | 'bronze' | 'cloth' | 'opal';
  tint: string; east: number; north: number; y: number;
  width: number; depth: number; tall: number; yaw: number;
}>;
export type SummitCloudBellPost = Point & Readonly<{
  id: string; courseMetres: number; heading: number;
  baseClearanceMetres: number;
}>;

const cadenceMs = [380, 720, 380] as const;
const bellCount = 9;
const intervalMetres = 30;
const beatMarginMs = 125;
export const summitCloudBellLogCopy = Object.freeze([
  '雾桩旧日志', '头铃先敲四声：', '短、长、短', '声落灯亮，循铃出雾',
] as const);

/**
 * Exactly nine legible metal bells and wooden navigation stakes on the real
 * 5.59 km P-3 second foot-trail. The original trail's collision and survey
 * are read-only; no invented alternate path is carved here.
 */
export function mountSummitCloudBellArray(
  owner: Group, trail: readonly MainSummitTrailPoint[], groundAt: GroundAt,
) {
  if (trail.length < 5000) throw new RangeError('Cloud bell route requires the full P-3 surveyed footpath');
  const travel: number[] = [0];
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!, b = trail[i]!;
    const metres = Math.hypot(b.east - a.east, b.north - a.north);
    // P-3 deliberately includes two station-to-trail splices at the first
    // and final vertex (50m / 15.097m). They are NOT the 1m interior
    // trail samples and must not be misread as a damaged footpath.
    const stationSplice = i === 1 ? metres <= 50.01 :
      i === trail.length - 1 ? metres <= 15.11 : false;
    if (!Number.isFinite(metres) || metres <= 0 || (metres > 3 && !stationSplice)) {
      throw new RangeError('Invalid trail survey for cloud bells');
    }
    travel.push(travel[i - 1]! + metres);
  }
  let start = -1;
  let best = Infinity;
  for (let i = 10; i < trail.length - 250; i++) {
    const remaining = travel.at(-1)! - travel[i]!;
    const height = trail[i]!.height;
    if (remaining < bellCount * intervalMetres || height < 407 || height > 480) continue;
    const score = Math.abs(height - 442);
    if (score < best) { best = score; start = i; }
  }
  if (start < 0) throw new RangeError('Cannot find a P-3 cloud-band bell start');
  const group = new Group();
  group.name = 'main-summit-nine-cloud-bell-array';
  owner.add(group);
  const lamps: PointLight[] = [];
  const pieces: Piece[] = [];
  const posts: SummitCloudBellPost[] = [];
  const approaches: { post: SummitCloudBellPost; distance: number; trailHeight: number }[] = [];
  const atMetres = travel[start]!;
  function nearest(distance: number) {
    let low = start, high = travel.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (travel[middle]! < distance) low = middle + 1;
      else high = middle;
    }
    return Math.min(travel.length - 2, Math.max(1, low));
  }
  function clearOfTrail(east: number, north: number) {
    let minimum = Infinity;
    for (let j = 0; j < trail.length; j += 2) {
      const p = trail[j]!;
      minimum = Math.min(minimum, Math.hypot(p.east - east, p.north - north));
    }
    return minimum;
  }
  function piece(family: Piece['family'], tint: string, at: SummitCloudBellPost,
    x: number, y: number, z: number, w: number, h: number, d: number) {
    const east = at.east + x * Math.cos(at.heading) + z * Math.sin(at.heading);
    const north = at.north + x * Math.sin(at.heading) - z * Math.cos(at.heading);
    pieces.push({ family, tint, east, north, y: at.height + y,
      width: w, tall: h, depth: d, yaw: at.heading });
  }
  const colors = {
    basalt: ['#46545d', '#6c7b82'],
    timber: ['#654935', '#9b704f', '#bd9668'],
    bronze: ['#ad8249', '#d4b078', '#e4cf9e'],
    cloth: ['#c76753', '#e2c27a', '#6e9da9', '#9c6576'],
    opal: ['#9ab8c4', '#b8d4d5'],
  } as const;

  for (let index = 0; index < bellCount; index++) {
    const along = atMetres + index * intervalMetres;
    const i = nearest(along);
    const here = trail[i]!, before = trail[i - 1]!, after = trail[i + 1]!;
    if (here.height < 380 || here.height > 560) {
      group.removeFromParent();
      throw new RangeError('All nine cloud bells must stay in the approved mist band');
    }
    const de = after.east - before.east, dn = after.north - before.north;
    const norm = Math.hypot(de, dn);
    if (norm <= 0) throw new RangeError('Cloud bell waypoint has no tangent');
    const normal = { east: -dn / norm, north: de / norm };
    const choices = [-1, 1].map(side => {
      const east = here.east + side * normal.east * 4.8;
      const north = here.north + side * normal.north * 4.8;
      const height = groundAt(east, north);
      return { east, north, height, clearance: clearOfTrail(east, north) };
    }).filter(a => a.height !== undefined && Number.isFinite(a.height) && a.clearance >= 3.1)
      .sort((a, b) => b.clearance - a.clearance);
    const chosen = choices[0];
    if (!chosen) throw new RangeError('Bell mast would block another trail leg: bell ' + (index + 1));
    const yaw = Math.atan2(here.east - chosen.east, chosen.north - here.north);
    const at: SummitCloudBellPost = {
      id: 'cloud-bell-' + (index + 1),
      east: chosen.east, north: chosen.north, height: chosen.height!,
      courseMetres: travel[i]! - atMetres,
      heading: yaw, baseClearanceMetres: chosen.clearance,
    };
    posts.push(at);
    // The P-3 ribbon is not the same height as the adjacent natural slope.
    // Each bell needs a real supported five-metre spur and accepted foot
    // surface, not an unreachable 2m-high base seen below the main path.
    const approachLength = 4.8;
    approaches.push({ post: at, distance: approachLength, trailHeight: here.height });
    const walkY = (z: number) => at.height + .09 +
      (here.height - at.height - .09) * Math.max(0, Math.min(1, z / approachLength));
    for (let step = 0; step < 13; step++) {
      const z = .52 + step * .36;
      const footY = walkY(z);
      piece('timber', colors.timber[step % 3]!, at, 0, footY - at.height - .06,
        z, 1.74, .13, .37);
      for (const side of [-1, 1]) {
        const bx = side * .73;
        const e = at.east + bx * Math.cos(at.heading) + z * Math.sin(at.heading);
        const n = at.north + bx * Math.sin(at.heading) - z * Math.cos(at.heading);
        const terrain = groundAt(e, n);
        if (terrain !== undefined && footY > terrain + .13) {
          piece('basalt', colors.basalt[step % 2]!, at, bx,
            (footY + terrain) / 2 - at.height, z,
            .27, Math.max(.15, footY - terrain + .05), .31);
        }
        if (step % 3 === 0) {
          piece('timber', colors.timber[0], at, side * 1.0,
            footY + .56 - at.height, z, .14, 1.0, .14);
          piece('bronze', colors.bronze[1], at, side * 1.0,
            footY + 1.03 - at.height, z, .17, .12, .17);
        }
      }
    }
    piece('basalt', colors.basalt[index % 2]!, at, 0, -.18, 0, 1.42, .36, 1.37);
    piece('basalt', colors.basalt[(index + 1) % 2]!, at, 0, .03, 0, 1.18, .11, 1.14);
    piece('timber', colors.timber[index % 3]!, at, 0, 1.60, 0, .27, 3.18, .28);
    piece('timber', colors.timber[0], at, 0, 3.09, .23, 1.40, .23, .30);
    piece('bronze', colors.bronze[1], at, 0, 3.17, .25, 1.58, .12, .18);
    // Actual hollow bell silhouette with eight bronze facets and an open lip.
    for (let facet = 0; facet < 8; facet++) {
      const angle = facet * Math.PI / 4;
      const x = .34 * Math.cos(angle);
      const z = .4 + .34 * Math.sin(angle);
      piece('bronze', colors.bronze[(facet + index) % 3]!, at,
        x, 2.28, z, .16, .70, .17);
    }
    piece('bronze', colors.bronze[2], at, 0, 1.92, .40, .64, .12, .67);
    piece('timber', colors.timber[0], at, 0, 2.82, .40, .11, .45, .12);
    piece('opal', colors.opal[index % 2]!, at, 0, 2.91, .40, .18, .23, .20);
    piece('timber', colors.timber[1], at, -.42, 2.20, .40, .17, 1.17, .15);
    for (let pennant = 0; pennant < 3; pennant++) {
      piece('cloth', colors.cloth[(index + pennant) % 4]!, at,
        -.70 + pennant * .66, 2.87, -.10, .36, .64, .07);
    }
    for (const sign of [-.47, .47]) {
      piece('timber', colors.timber[0], at, sign, .82, -.08, .12, 1.59, .14);
    }
    // Weathered bronze footing rivets & the clapper make this a legible
    // manufactured bell, not a wooden placeholder post.
    for (const x of [-.47, .47]) for (const z of [-.45, .45]) {
      piece('bronze', colors.bronze[(index + (x > 0 ? 1 : 0)) % 3]!, at,
        x, .16, z, .13, .14, .14);
    }
    piece('bronze', colors.bronze[0], at, 0, 1.79, .40, .24, .24, .23);
    piece('timber', colors.timber[1], at, 0, 2.60, .40, .08, .43, .08);
    const source = new PointLight('#c9e5ef', 0, 8, 2);
    source.name = at.id + '-night-beacon';
    source.position.set(at.east, at.height + 2.94, -at.north - .35);
    lamps.push(source);
    group.add(source);
  }

  const voxel = new BoxGeometry(1, 1, 1);
  const movers = new Object3D(), color = new Color();
  const instanced: InstancedMesh[] = [];
  const materials: (MeshBasicMaterial | MeshLambertMaterial)[] = [];
  for (const family of ['basalt', 'timber', 'bronze', 'cloth', 'opal'] as const) {
    const familyPieces = pieces.filter(x => x.family === family);
    const material = family === 'opal' ? new MeshBasicMaterial({ color: '#ffffff' })
      : new MeshLambertMaterial({ color: '#ffffff' });
    materials.push(material);
    const batch = new InstancedMesh(voxel, material, familyPieces.length);
    batch.name = 'cloud-bell-model-' + family;
    for (const [index, p] of familyPieces.entries()) {
      movers.position.set(p.east, p.y, -p.north);
      movers.rotation.set(0, p.yaw, 0);
      movers.scale.set(p.width, p.tall, p.depth);
      movers.updateMatrix();
      batch.setMatrixAt(index, movers.matrix);
      batch.setColorAt(index, color.set(p.tint));
    }
    batch.computeBoundingSphere();
    instanced.push(batch);
    group.add(batch);
  }

  let progress = 0;
  let firstBeat: number | undefined;
  let lastBeat: number | undefined;
  let unlockedAt: number | undefined;
  let fails = 0;
  let finished = false;
  const first = posts[0]!;
  const nearBell = (player: Point) =>
    Number.isFinite(player?.east) && Number.isFinite(player?.north) &&
    Number.isFinite(player?.height) &&
    Math.hypot(player.east - first.east, player.north - first.north) <= 4.2 &&
    Math.abs(player.height - first.height) <= 3.5;

  function strike(args: Readonly<{ player: Point; authorized: boolean; atMs: number }>) {
    if (!args.authorized || !Number.isSafeInteger(args.atMs) || args.atMs < 0 ||
        !nearBell(args.player)) return { accepted: false, reason: 'identity-or-distance' } as const;
    if (finished) return { accepted: true, message: '雾灯已经亮起，沿铃桩走就能看到云外。', progress: 4, lit: 9 } as const;
    if (lastBeat !== undefined && args.atMs <= lastBeat) return {
      accepted: false, reason: 'stale-clock',
    } as const;
    if (progress === 0 || lastBeat === undefined) {
      firstBeat = args.atMs;
      lastBeat = args.atMs;
      progress = 1;
      return { accepted: true, message: '头铃第一声。', progress, lit: 0 } as const;
    }
    const delta = args.atMs - lastBeat;
    const expected = cadenceMs[progress - 1]!;
    if (Math.abs(delta - expected) > beatMarginMs) {
      fails++;
      progress = 1;
      firstBeat = args.atMs;
      lastBeat = args.atMs;
      return { accepted: true, message: '节奏错了，重新听第一声。', progress, lit: 0 } as const;
    }
    lastBeat = args.atMs;
    progress++;
    if (progress === 4) {
      unlockedAt = args.atMs;
      finished = true;
      return { accepted: true, message: '四声对上了！九处雾灯将沿步道依次亮起。', progress, lit: 0 } as const;
    }
    return { accepted: true, message: '铃响了一声，继续照着日志敲。', progress, lit: 0 } as const;
  }
  function tick(atMs: number) {
    if (unlockedAt === undefined || !Number.isFinite(atMs) || atMs < unlockedAt) return 0;
    const lit = Math.max(0, Math.min(9, Math.floor((atMs - unlockedAt) / 780) + 1));
    for (let index = 0; index < lamps.length; index++) {
      lamps[index]!.intensity = index < lit ? 1.65 : 0;
    }
    return lit;
  }
  let disposed = false;
  return {
    group, posts: posts as readonly SummitCloudBellPost[],
    lamps, pieceCount: pieces.length, drawBudget: instanced.length,
    strike, tick, logCopy: summitCloudBellLogCopy,
    surfaceAt(east: number, north: number, radius = .27) {
      if (![east, north, radius].every(Number.isFinite) || radius < 0 || radius > .5) return;
      for (const { post, distance, trailHeight } of approaches) {
        const de = east - post.east, dn = north - post.north;
        const x = de * Math.cos(post.heading) + dn * Math.sin(post.heading);
        const z = de * Math.sin(post.heading) - dn * Math.cos(post.heading);
        if (Math.abs(x) <= .87 - radius && z >= .38 && z <= distance) {
          return post.height + .09 + (trailHeight - post.height - .09) * (z / distance);
        }
      }
    },
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (![east, north, feet, radius, bodyHeight].every(Number.isFinite)) return true;
      return posts.some(site =>
        feet + bodyHeight > site.height + .05 && feet < site.height + 3.2 &&
        Math.hypot(east - site.east, north - site.north) < .22 + radius);
    },
    snapshot: () => ({ progress, firstBeat, lastBeat, unlockedAt, fails,
      finished, lit: lamps.filter(lamp => lamp.intensity > 0).length }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of instanced) batch.dispose();
      for (const material of materials) material.dispose();
      voxel.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
