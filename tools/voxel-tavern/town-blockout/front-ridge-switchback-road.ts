import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, Group,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace,
} from 'three';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createTerrainGrid } from './terrain';

export type SwitchbackPoint = { east: number; north: number; height: number; cum: number };

const MAX_GRADE = 0.105;
let cachedGrid: ReturnType<typeof createTerrainGrid> | undefined;
/** Host (town) grid sampler: the walking height field the road must
 *  meet on the toe and entry stretches. Built lazily, once. */
export function hostGridAt(east: number, north: number): number {
  cachedGrid ??= createTerrainGrid();
  return cachedGrid.heightAt(east, north);
}
/** Spiral design grade: below the cap, because blended terrain samples
 *  along the laid line run a few percent hotter than the pure profile. */
const DESIGN_GRADE = 0.09;
const ROAD_HALF = 1.75;
const SHOULDER = 3.4;

/**
 * D1 switchback road (山口→基站→中山台→云海台), built as a road-height
 * OVERLAY layer per 总控 ruling 2026-11-21: terrain.ts sampling is never
 * touched. The module owns the surveyed centreline (toe road + contour
 * spirals on the elliptical cone, laid out in (d, theta) space), the
 * ribbon mesh with cut/fill shoulders, and a heightAt() the walking
 * host folds over the terrain inside the corridor band. Both-end seams
 * are A window's review.
 *
 * Anchors are the surveyed cable stations: base (526, 329, H18),
 * mid terrace (440, 520, H140), cloud terrace (336, 640, H347).
 *
 * D-6 (总控裁定批60, 2026-11-22): the toe no longer cuts straight
 * across the memorial hill (grid 46.8 at (400,304) buried the old
 * line 5-25 m). It re-routes north through the flat river-valley
 * ground: pass (290,300) -> west jog (270,300) -> north (270,460)
 * -> east (530,460) -> south to the base station, meeting the grid
 * at the pass (12.8, the 山口 teleport landing) and the station
 * platform (18.0). The toe profile follows the host grid with a
 * grade-clamped, backward-envelope projection (never buried except
 * the declared station-apron cutting, last ~24 m, depth <= 8 m).
 * The entry approach (boundary N539 -> pass) runs the same west
 * line (270,539) -> (270,460) and joins the corridor at the
 * (270,460) junction; the direct E290 line's hollow (grid 8.6) and
 * 43% shoulder cliff are bypassed, not filled.
 */
export function buildSwitchbackCenterline(
  terrainAt: (east: number, north: number) => number = sampleNorthRidge350,
  gridAt: (east: number, north: number) => number = hostGridAt,
): SwitchbackPoint[] {
  const raw: { east: number; north: number }[] = [];
  // Toe road (D-6 re-route, 总控裁定批60): the old straight toe cut
  // the memorial hill and was buried 5-25 m under the grid. The new
  // toe loops north through flat valley ground (grid 9-22) and meets
  // the grid at both ends: pass 12.8 / base platform 18.0.
  const toe: [number, number][] = [[290, 300], [270, 300], [270, 460], [530, 460], [530, 329], [526, 329]];
  for (let t = 0; t < toe.length - 1; t++) {
    const [e0, n0] = toe[t]!, [e1, n1] = toe[t + 1]!;
    const dist = Math.hypot(e1 - e0, n1 - n0);
    const steps = Math.max(1, Math.round(dist / 3));
    for (let i = t === 0 ? 0 : 1; i <= steps; i++) {
      raw.push({ east: e0 + (e1 - e0) * i / steps, north: n0 + (n1 - n0) * i / steps });
    }
  }

  // The ridge is an elliptical cone: height depends only on the
  // elliptical distance d from the summit. The road is therefore laid
  // out directly in (d, theta) space — theta sweeps the south-east
  // sector back and forth while d shrinks at exactly the rate that
  // holds the target grade, solved per step from true plan distances.
  const CENTRE = { east: 320, north: 650, radiusE: 330, radiusN: 380 };
  const posOf = (d: number, theta: number) => ({
    east: CENTRE.east + d * CENTRE.radiusE * Math.cos(theta),
    north: CENTRE.north + d * CENTRE.radiusN * Math.sin(theta),
  });
  const dOf = (east: number, north: number) => Math.hypot(
    (east - CENTRE.east) / CENTRE.radiusE, (north - CENTRE.north) / CENTRE.radiusN);
  const thetaOf = (east: number, north: number) => Math.atan2(
    (north - CENTRE.north) / CENTRE.radiusN, (east - CENTRE.east) / CENTRE.radiusE);
  const profileHeight = (d: number) => 18 + 332 * Math.max(0, 1 - d) ** 1.6;
  const profileSlope = (d: number) => d >= 1 ? 0 : 332 * 1.6 * (1 - d) ** 0.6;

  function spiral(
    start: { east: number; north: number },
    end: { east: number; north: number },
    sector: [number, number],
    summitSector?: [number, number],
    gradeScale = 1,
  ) {
    let d = dOf(start.east, start.north);
    let theta = thetaOf(start.east, start.north);
    const dEnd = dOf(end.east, end.north);
    const thetaEnd = thetaOf(end.east, end.north);
    let sign = theta <= (sector[0] + sector[1]) / 2 ? 1 : -1;
    raw.push({ east: start.east, north: start.north });
    const dThetaAt = (dd: number) => 0.0045 / Math.max(dd, 0.3);
    for (let guard = 0; guard < 30000; guard++) {
      if (d <= dEnd + 0.004 && Math.abs(theta - thetaEnd) < 0.02) break;
      const dTheta = dThetaAt(d);
      const nextTheta = theta + sign * dTheta;
      let dd: number;
      if (d >= 0.995) {
        dd = -0.004; // flat apron: walk straight in until the cone starts
      } else {
        // Solve dd so the height gain over the true plan step is the
        // target grade (two fixed-point refinements are plenty). Near
        // the top the design grade drops: the terrace pin sits above
        // the pure profile (blend cliff), so the final section needs
        // extra length in hand to climb onto it legally.
        const grade = DESIGN_GRADE * (d < 0.2 ? 0.55 : 1) * gradeScale;
        dd = -grade * 350 * dTheta / Math.max(1, profileSlope(d));
        for (let refine = 0; refine < 2; refine++) {
          const a = posOf(d, theta), b = posOf(d + dd, nextTheta);
          const plan = Math.hypot(b.east - a.east, b.north - a.north);
          const gain = profileHeight(d + dd) - profileHeight(d);
          if (gain <= 0 || plan <= 0) break;
          dd *= (grade * plan) / gain;
        }
        dd = Math.max(dd, -0.01);
      }
      d += dd;
      theta = nextTheta;
      if (theta > sector[1]) { theta = sector[1]; sign = -1; }
      if (theta < sector[0]) { theta = sector[0]; sign = 1; }
      // Near the anchor the traverses tighten; narrow the sector so
      // they do not clip the terrace blend ring before the approach.
      if (summitSector && d < dEnd + 0.08) {
        if (theta > summitSector[1]) { theta = summitSector[1]; sign = -1; }
        if (theta < summitSector[0]) { theta = summitSector[0]; sign = 1; }
      }
      raw.push(posOf(d, theta));
    }
    raw.push({ east: end.east, north: end.north });
  }

  spiral({ east: 526, north: 329 }, { east: 440, north: 520 }, [-1.30, -0.40], [-0.95, -0.55]);
  // Segment 2 runs in two phases: wind down the clean cone to the mesa
  // foot (d 0.135, south of the terrace rect, outside its blend ring),
  // then a short southern gate leg crosses the rim fade once, on the
  // anchor's own meridian. Winding inside the rim ring would trench
  // the road through the plateau corner for hundreds of metres.
  spiral({ east: 440, north: 520 }, { east: 347.7, north: 609.8 }, [-1.05, -0.15], [-1.0, -0.45]);
  spiral({ east: 347.7, north: 609.8 }, { east: 336, north: 640 }, [-1.38, -0.42], undefined, 2);

  // Resample to a uniform ~3 m, keeping the two anchor points exact.
  const anchors = [{ east: 440, north: 520 }, { east: 336, north: 640 }];
  const sampled: { east: number; north: number }[] = [raw[0]!];
  let carry = 0;
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1]!, point = raw[i]!;
    const stepPlan = Math.hypot(point.east - prev.east, point.north - prev.north);
    if (stepPlan < 0.01) continue; // segment-junction duplicate
    carry += stepPlan;
    const isAnchor = anchors.some(a => a.east === point.east && a.north === point.north);
    if (carry >= 3 || isAnchor || i === raw.length - 1) { sampled.push(point); carry = 0; }
  }
  // Heights: terrain samples projected onto the grade constraint by
  // relaxation sweeps, with the surveyed anchors pinned (base 18, mid
  // terrace 140, cloud terrace 347). The projection is the closest
  // legal profile: it departs from the terrain only where a terrace
  // blend edge would otherwise break the grade cap. D-6: the toe
  // stretch samples the HOST GRID (the walking field it must meet),
  // the spiral keeps the ridge sampler.
  const baseIndex = sampled.findIndex(point => point.east === 526 && point.north === 329);
  const heights = sampled.map((point, i) => (baseIndex >= 0 && i <= baseIndex ? gridAt : terrainAt)(point.east, point.north));
  const gridSamples = heights.slice(0, baseIndex >= 0 ? baseIndex + 1 : 0);
  const plans = sampled.map((point, i) => i === 0 ? 0
    : Math.hypot(point.east - sampled[i - 1]!.east, point.north - sampled[i - 1]!.north));
  const pins = new Map<number, number>();
  sampled.forEach((point, i) => {
    if (baseIndex >= 0 && i === baseIndex) pins.set(i, 18);
    if (point.east === 440 && point.north === 520) pins.set(i, 140);
    if (point.east === 336 && point.north === 640) pins.set(i, 347);
  });
  // Per stretch between anchors: forward and backward band-clamped
  // envelopes of the samples (each step moves at most the grade cap
  // from its neighbour, tracking the terrain inside that band), then
  // the lower of the two. Both envelopes are grade-legal, so their
  // minimum is too, and the anchor pins land exact.
  const stretches: [number, number, number, number][] = [];
  const pinKeys = [...pins.keys()].sort((a, b) => a - b);
  const midIndex = pinKeys.find(i => sampled[i]!.east === 440 && sampled[i]!.north === 520) ?? -1;
  const endIndex = sampled.length - 1;
  if (midIndex > 0 && baseIndex >= 0) {
    stretches.push([0, baseIndex, heights[0]!, 18], [baseIndex, midIndex, 18, 140], [midIndex, endIndex, 140, 347]);
  } else if (midIndex > 0) {
    stretches.push([0, midIndex, heights[0]!, 140], [midIndex, endIndex, 140, 347]);
  } else {
    stretches.push([0, endIndex, heights[0]!, 347]);
  }
  for (const [from, to, startH, pinH] of stretches) {
    // Forward band-clamped envelope of the samples from the start pin,
    // combined through the pin tube: the result is the forward envelope
    // clamped between the two pin cones (the lowest profile that can
    // still reach the far pin, the highest that can still fall back to
    // it). The median of three grade-legal functions is grade-legal,
    // both pins land exact, and outside the anchors' approach zones —
    // where the forward envelope already sits inside the tube — the
    // road is exactly the terrain-following envelope.
    let cumFrom = 0;
    const cums = new Array<number>(to - from + 1).fill(0);
    for (let i = from + 1; i <= to; i++) { cumFrom += plans[i]!; cums[i - from] = cumFrom; }
    const total = cumFrom;
    const forward = new Array<number>(to - from + 1);
    forward[0] = startH;
    for (let i = from + 1; i <= to; i++) {
      const cap = MAX_GRADE * plans[i]!;
      forward[i - from] = Math.max(forward[i - from - 1]! - cap,
        Math.min(forward[i - from - 1]! + cap, heights[i]!));
    }
    // D-6: on the toe stretch the profile must clear the host grid
    // (backward envelope of the grid samples, grade-legal by
    // construction), except where the pin cone forces the station
    // cutting descent -- there the upper cone wins and the shortfall
    // is the declared cutting, not a burial.
    const isToe = from === 0 && baseIndex >= 0 && to === baseIndex;
    const envelope = isToe ? cums.map((cumI, k) => {
      let best = -Infinity;
      for (let j = 0; j < cums.length; j++) {
        best = Math.max(best, gridSamples[j]! + 0.06 - MAX_GRADE * Math.abs(cums[j]! - cumI));
      }
      return best;
    }) : undefined;
    for (let i = from; i <= to; i++) {
      const lower = Math.max(startH - MAX_GRADE * cums[i - from]!,
        pinH - MAX_GRADE * (total - cums[i - from]!));
      const upper = Math.min(startH + MAX_GRADE * cums[i - from]!,
        pinH + MAX_GRADE * (total - cums[i - from]!));
      let v = forward[i - from]!;
      if (envelope) v = Math.max(v, envelope[i - from]!);
      heights[i] = v < lower ? lower : v > upper ? upper : v;
    }
    heights[from] = startH;
    heights[to] = pinH;
  }
  const points: SwitchbackPoint[] = [];
  let cum = 0;
  for (let i = 0; i < sampled.length; i++) {
    if (i > 0) cum += plans[i]!;
    points.push({ east: sampled[i]!.east, north: sampled[i]!.north, height: heights[i]!, cum });
  }
  return points;
}

/**
 * D-6 entry approach (总控裁定批60, item 3): the spur from the town
 * boundary (270,539) south to the corridor junction (270,460), where
 * it joins the re-routed toe's north leg. The direct E290 line is
 * bypassed, not filled: its grid shoulder climbs 43% (12.8 -> 20.9
 * over 19 m) and its hollow (grid 8.6) sits off-route. The spur
 * follows the host grid with the same grade-clamped projection
 * (pins: boundary ground / junction height from the main corridor).
 */
export function buildEntryApproach(
  junctionHeight: number,
  gridAt: (east: number, north: number) => number = hostGridAt,
): SwitchbackPoint[] {
  const raw: { east: number; north: number }[] = [];
  const leg: [number, number][] = [[270, 539], [270, 460]];
  for (let t = 0; t < leg.length - 1; t++) {
    const [e0, n0] = leg[t]!, [e1, n1] = leg[t + 1]!;
    const dist = Math.hypot(e1 - e0, n1 - n0);
    const steps = Math.max(1, Math.round(dist / 3));
    for (let i = t === 0 ? 0 : 1; i <= steps; i++) {
      raw.push({ east: e0 + (e1 - e0) * i / steps, north: n0 + (n1 - n0) * i / steps });
    }
  }
  const heights = raw.map(point => gridAt(point.east, point.north));
  const plans = raw.map((point, i) => i === 0 ? 0
    : Math.hypot(point.east - raw[i - 1]!.east, point.north - raw[i - 1]!.north));
  const cums = [0];
  for (let i = 1; i < raw.length; i++) cums.push(cums[i - 1]! + plans[i]!);
  const total = cums.at(-1)!;
  const startH = heights[0]! + 0.06;
  const endH = junctionHeight;
  const forward = [startH];
  for (let i = 1; i < raw.length; i++) {
    const cap = MAX_GRADE * plans[i]!;
    forward.push(Math.max(forward[i - 1]! - cap, Math.min(forward[i - 1]! + cap, heights[i]!)));
  }
  const points: SwitchbackPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const lower = Math.max(startH - MAX_GRADE * cums[i]!, endH - MAX_GRADE * (total - cums[i]!));
    const upper = Math.min(startH + MAX_GRADE * cums[i]!, endH + MAX_GRADE * (total - cums[i]!));
    let v = forward[i]!;
    for (let j = 0; j < raw.length; j++) {
      v = Math.max(v, heights[j]! + 0.06 - MAX_GRADE * Math.abs(cums[j]! - cums[i]!));
    }
    v = v < lower ? lower : v > upper ? upper : v;
    points.push({ east: raw[i]!.east, north: raw[i]!.north, height: v, cum: cums[i]! });
  }
  points[0]!.height = startH;
  points.at(-1)!.height = endH;
  return points;
}

export function createFrontRidgeSwitchbackRoad(
  terrainAt: (east: number, north: number) => number = sampleNorthRidge350,
  gridAt: (east: number, north: number) => number = hostGridAt,
) {
  const centreline = buildSwitchbackCenterline(terrainAt, gridAt);
  const totalLength = centreline.at(-1)!.cum;
  const group = new Group();
  group.name = 'front-ridge-switchback-road';
  const disposers: (() => void)[] = [];
  // D-6 entry spur: boundary (270,539) -> junction (270,460), pinned
  // to the main corridor's profile at the junction so the T-junction
  // has one height, not two.
  const toeEndIndex = centreline.findIndex(point => point.east === 526 && point.north === 329);
  const junction = centreline.find(point => point.east === 270 && point.north === 460)!;
  const entryCentreline = buildEntryApproach(junction.height, gridAt);

  // --- Ribbon: road rows at profile height, shoulder rows on the
  // terrain. The ground sampler is per-point: the toe and entry spur
  // sit on the host grid, the spiral on the ridge field.
  function buildRibbon(points: SwitchbackPoint[], groundAt: (east: number, north: number, index: number) => number, name: string) {
    const rowsAt = (point: SwitchbackPoint, dirE: number, dirN: number, index: number) => {
      const perpE = -dirN, perpN = dirE;
      return [-SHOULDER, -ROAD_HALF, ROAD_HALF, SHOULDER].map(lateral => {
        const east = point.east + perpE * lateral;
        const north = point.north + perpN * lateral;
        const onRoad = Math.abs(lateral) <= ROAD_HALF;
        return { east, north, height: onRoad ? point.height : groundAt(east, north, index), onRoad };
      });
    };
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const gravel = [0.52, 0.46, 0.38];
    const gravelDark = [0.42, 0.37, 0.30];
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const prev = points[Math.max(0, i - 1)]!;
      const next = points[Math.min(points.length - 1, i + 1)]!;
      let dirE = next.east - prev.east, dirN = next.north - prev.north;
      const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
      const rows = rowsAt(point, dirE, dirN, i);
      rows.forEach((row, r) => {
        positions.push(row.east, row.height + (row.onRoad ? 0.06 : 0), -row.north);
        const tint = row.onRoad ? (i % 2 === 0 ? gravel : gravelDark)
          : row.height > 200 ? [0.55, 0.57, 0.58] : row.height > 60 ? [0.38, 0.36, 0.30] : [0.34, 0.38, 0.26];
        colors.push(...tint);
      });
      if (i > 0) {
        const a = (i - 1) * 4;
        for (let r = 0; r < 3; r++) indices.push(a + r, a + r + 4, a + r + 1, a + r + 1, a + r + 4, a + r + 5);
      }
    }
    const ribbonGeometry = new BufferGeometry();
    ribbonGeometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    ribbonGeometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    ribbonGeometry.setIndex(indices);
    ribbonGeometry.computeVertexNormals();
    const ribbon = new Mesh(ribbonGeometry, new MeshLambertMaterial({ vertexColors: true, side: 2 }));
    ribbon.name = name;
    group.add(ribbon);
    disposers.push(() => { ribbonGeometry.dispose(); (ribbon.material as MeshLambertMaterial).dispose(); });
  }
  buildRibbon(centreline, (east, north, i) => (toeEndIndex >= 0 && i <= toeEndIndex ? gridAt : terrainAt)(east, north), 'switchback-road-ribbon');
  buildRibbon(entryCentreline, (east, north) => gridAt(east, north), 'switchback-entry-ribbon');

  // --- Height override: segment projection over the main corridor
  // AND the entry spur (union), with hint-coherent leg selection.
  //
  // Repair note (2026-11-22, A fold-in measurement): pure horizontal
  // nearest-point sampling flips to the adjacent leg where two legs
  // stack within ~3 m in plan (toe east leg vs the return leg near
  // (420.9, 460); the base-station leg E530 N340-377) -- up to 89 m
  // flips on 6-8% of 0.25 m samples, i.e. step walls / sudden drops
  // for the walker. The sampler now projects onto centreline
  // SEGMENTS and selects the leg in three stages: coverage (the
  // point must lie in the leg's shoulder band, with round end caps
  // at vertices), locality (only candidates near the closest
  // approach compete -- a stale vertex behind the walker, whose
  // height still equals the hint picked up passing it, must not
  // out-compete the live segment), and a combined score of vertical
  // coherence with the hint height (the walker's current height /
  // previous sample) plus a plan-distance term, so a foreign leg
  // can only steal the chain where its height is within ~half a
  // metre of the walker's own surface. Blending toward the ground
  // happens after the leg is chosen, from the chosen leg's lateral
  // offset. Without a hint the nearest local leg wins (ambiguous on
  // stacked legs by definition -- sequential samplers must pass the
  // hint). Verified: centreline 0.25 m hint-walk 0 flips over the
  // whole corridor; the two named sections 0 flips on centreline
  // and +-1.2 m band walks alike.
  const cell = 12;
  type Candidate = {
    roadHeight: number; lateral: number; distance: number; interior: boolean;
    cumMid: number;
    groundAt: (east: number, north: number) => number;
  };
  function makeCandidates(
    points: SwitchbackPoint[],
    groundFor: (point: SwitchbackPoint, index: number) => (east: number, north: number) => number,
  ) {
    const hash = new Map<string, number[]>();
    points.forEach((point, i) => {
      const key = `${Math.floor(point.east / cell)},${Math.floor(point.north / cell)}`;
      const list = hash.get(key) ?? []; list.push(i); hash.set(key, list);
    });
    return (east: number, north: number): Candidate[] => {
      const out: Candidate[] = [];
      const seen = new Set<number>();
      const cx = Math.floor(east / cell), cn = Math.floor(north / cell);
      for (let x = cx - 1; x <= cx + 1; x++) for (let n = cn - 1; n <= cn + 1; n++) {
        for (const i of hash.get(`${x},${n}`) ?? []) {
          for (const segIndex of [i - 1, i]) {
            if (segIndex < 0 || segIndex >= points.length - 1 || seen.has(segIndex)) continue;
            seen.add(segIndex);
            const a = points[segIndex]!, b = points[segIndex + 1]!;
            const vx = b.east - a.east, vy = b.north - a.north;
            const len2 = vx * vx + vy * vy || 1;
            const rawT = ((east - a.east) * vx + (north - a.north) * vy) / len2;
            const t = Math.max(0, Math.min(1, rawT));
            const px = a.east + vx * t, py = a.north + vy * t;
            const distance = Math.hypot(east - px, north - py);
            if (distance > SHOULDER + 2) continue;
            const len = Math.sqrt(len2);
            const lateral = (east - px) * (-vy / len) + (north - py) * (vx / len);
            const interior = rawT > 1e-9 && rawT < 1 - 1e-9;
            out.push({
              roadHeight: a.height + (b.height - a.height) * t + 0.06,
              // Effective lateral: perpendicular offset for interior
              // projections; on the round end caps the radial
              // distance (a signed lateral against the segment
              // direction is meaningless past the vertex and made
              // the blend jump at hairpin apexes).
              lateral: interior ? lateral : distance,
              distance,
              interior,
              cumMid: (a.cum + b.cum) / 2,
              groundAt: groundFor(a, segIndex),
            });
          }
        }
      }
      return out;
    };
  }
  const candidatesMain = makeCandidates(centreline, (_point, i) => (toeEndIndex >= 0 && i <= toeEndIndex ? gridAt : terrainAt));
  const candidatesEntry = makeCandidates(entryCentreline, () => gridAt);
  function heightAt(east: number, north: number, hintHeight?: number): number | undefined {
    const all = [...candidatesMain(east, north), ...candidatesEntry(east, north)];
    if (all.length === 0) return undefined;
    // Coverage: the point must lie inside the leg's shoulder band.
    const covering = all.filter(c => Math.abs(c.lateral) <= SHOULDER);
    if (covering.length === 0) return undefined;
    // Locality first: only candidates near the closest approach
    // compete. A stale vertex behind the walker (its height still
    // equal to the hint the walker picked up passing it) must not
    // out-compete the live segment under the walker's feet -- that
    // was the shelf-poisoning loop. Foreign legs at a crossing ARE
    // local (they pass within metres in plan), so the hint's
    // vertical coherence then decides between legs, which is the
    // disambiguation the hint exists for.
    const minDistance = Math.min(...covering.map(c => c.distance));
    const local = covering.filter(c => c.distance <= minDistance + 2.0);
    // Combined score inside the local set: vertical coherence plus
    // a plan-distance term (weight 0.5), so a foreign leg can only
    // steal the chain where its height is within ~half a metre of
    // the walker's own surface (a sub-step switch), while at true
    // crossings the coherence term dominates by tens of metres.
    const scoreOf = (c: Candidate) => hintHeight === undefined
      ? c.distance
      : Math.abs(c.roadHeight - hintHeight) + 0.5 * c.distance;
    let best = local[0]!;
    for (const cand of local) {
      const candScore = scoreOf(cand), bestScore = scoreOf(best);
      if (candScore < bestScore - 0.5 ||
          (Math.abs(candScore - bestScore) <= 0.5 &&
           Math.abs(cand.lateral) < Math.abs(best.lateral) - 1e-9)) {
        best = cand;
      }
    }
    const lateralAbs = Math.abs(best.lateral);
    if (lateralAbs <= ROAD_HALF) return best.roadHeight;
    const bt = (lateralAbs - ROAD_HALF) / (SHOULDER - ROAD_HALF);
    const smooth = bt * bt * (3 - 2 * bt);
    return best.roadHeight * (1 - smooth) + best.groundAt(east, north) * smooth;
  }

  // --- Entities: fog-lamp chain, mileage stones, hairpin rest benches, signs.
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const timber = new MeshLambertMaterial({ color: '#5d4630' });
  disposers.push(() => { stone.dispose(); timber.dispose(); });
  const lampCores: Mesh[] = [];
  const lampMaterial = new MeshBasicMaterial({ color: '#3a3230' });
  disposers.push(() => lampMaterial.dispose());
  let nextLamp = 30;
  let nextStone = 250; // spec 250 m (总控裁定批55；原 500 m)
  const lampPosts: { east: number; north: number; height: number }[] = [];
  for (let i = 2; i < centreline.length - 2; i++) {
    const point = centreline[i]!;
    if (point.cum >= nextLamp) {
      nextLamp += 60;
      const prev = centreline[i - 1]!, next = centreline[i + 1]!;
      let dirE = next.east - prev.east, dirN = next.north - prev.north;
      const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
      // Lamp on the downhill side: the side whose terrain falls away.
      const side = terrainAt(point.east - dirN * 3, point.north + dirE * 3) <= point.height ? 1 : -1;
      const east = point.east - dirN * side * (ROAD_HALF + 0.35);
      const north = point.north + dirE * side * (ROAD_HALF + 0.35);
      lampPosts.push({ east, north, height: point.height });
    }
    if (point.cum >= nextStone) {
      const km = nextStone / 1000;
      nextStone += 250;
      const post = new Mesh(new BoxGeometry(0.42, 0.95, 0.3), stone);
      post.name = `switchback-mileage-${km.toFixed(1)}km`;
      post.position.set(point.east + 2.3, point.height + 0.48, -(point.north));
      group.add(post);
      disposers.push(() => post.geometry.dispose());
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#7a7f82'; ctx.fillRect(0, 0, 128, 128);
          ctx.fillStyle = '#1f1c16'; ctx.textAlign = 'center';
          ctx.font = 'bold 44px system-ui, sans-serif';
          ctx.fillText(km.toFixed(1), 64, 62);
          ctx.font = 'bold 26px system-ui, sans-serif';
          ctx.fillText('公里', 64, 100);
          const texture = new CanvasTexture(canvas);
          texture.colorSpace = SRGBColorSpace;
          const face = new Mesh(new PlaneGeometry(0.4, 0.4), new MeshBasicMaterial({ map: texture }));
          face.position.set(point.east + 2.3, point.height + 0.62, -(point.north) + 0.17);
          group.add(face);
          disposers.push(() => { face.geometry.dispose(); face.material.dispose(); texture.dispose(); });
        }
      }
    }
  }
  const postGeometry = new CylinderGeometry(0.05, 0.06, 1.5, 5);
  const posts = new InstancedMesh(postGeometry, timber, Math.max(1, lampPosts.length));
  posts.name = 'switchback-fog-lamp-posts';
  lampPosts.forEach((lamp, i) => {
    setInstance(posts, i, lamp.east, lamp.height + 0.75, -lamp.north);
    const core = new Mesh(new BoxGeometry(0.16, 0.16, 0.16), lampMaterial.clone());
    core.name = 'switchback-fog-lamp';
    core.position.set(lamp.east, lamp.height + 1.56, -lamp.north);
    group.add(core);
    lampCores.push(core);
    disposers.push(() => { core.geometry.dispose(); (core.material as MeshBasicMaterial).dispose(); });
  });
  posts.count = lampPosts.length;
  group.add(posts);
  disposers.push(() => { postGeometry.dispose(); });

  function sign(name: string, point: SwitchbackPoint, lines: string[]) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#4c3a26'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#f0e4c8'; ctx.textAlign = 'center';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(lines[0]!, 256, 96);
    ctx.font = '38px system-ui, sans-serif';
    ctx.fillText(lines[1] ?? '', 256, 168);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const board = new Mesh(new PlaneGeometry(2.2, 1.1), new MeshBasicMaterial({ map: texture, side: 2 }));
    board.name = name;
    board.position.set(point.east + 2.6, point.height + 1.7, -point.north);
    group.add(board);
    const legs = new Mesh(new BoxGeometry(0.12, 1.8, 0.12), timber);
    legs.position.set(point.east + 2.6, point.height + 0.9, -point.north);
    group.add(legs);
    disposers.push(() => { board.geometry.dispose(); board.material.dispose(); texture.dispose(); legs.geometry.dispose(); });
  }
  sign('switchback-start-sign', centreline[0]!, ['盘山道', `全长约 ${(totalLength / 1000).toFixed(1)} 公里 · 步行登云海台`]);
  sign('switchback-top-sign', centreline.at(-1)!, ['云海台', '盘山道口 · 缆车二线站']);

  // --- D-5 supplement (总控裁定批55): hairpin benches, two wind-shelter
  // rest points, the (300,400) viewing platform, and the three cable
  // station timetable boards (texts verbatim from 总控《文本-缆车三站
  // 时刻牌-2026-11-22》, S-12/S-16/S-19; mounting only, never reword).
  const benches: Group[] = [];
  function benchAt(east: number, north: number, height: number, facing: number, name: string) {
    const bench = new Group();
    bench.name = name;
    const seat = new Mesh(new BoxGeometry(1.7, 0.12, 0.55), timber);
    seat.position.set(0, 0.5, 0);
    const back = new Mesh(new BoxGeometry(1.7, 0.62, 0.1), timber);
    back.position.set(0, 0.86, -0.26);
    const legL = new Mesh(new BoxGeometry(0.12, 0.5, 0.5), stone);
    legL.position.set(-0.7, 0.25, 0);
    const legR = new Mesh(new BoxGeometry(0.12, 0.5, 0.5), stone);
    legR.position.set(0.7, 0.25, 0);
    bench.add(seat, back, legL, legR);
    bench.position.set(east, height, -north);
    bench.rotation.y = facing;
    group.add(bench);
    benches.push(bench);
    disposers.push(() => { for (const part of [seat, back, legL, legR]) part.geometry.dispose(); });
  }
  // Hairpins: where the spiral reverses heading (turn > 120 deg) on the
  // switchback stretches; a bench sits on the uphill (cut) side.
  let lastBenchCum = -1e9;
  for (let i = 2; i < centreline.length - 2; i++) {
    const a = centreline[i - 1]!, b = centreline[i]!, c = centreline[i + 1]!;
    const v1e = b.east - a.east, v1n = b.north - a.north;
    const v2e = c.east - b.east, v2n = c.north - b.north;
    const l1 = Math.hypot(v1e, v1n) || 1, l2 = Math.hypot(v2e, v2n) || 1;
    const cos = (v1e * v2e + v1n * v2n) / (l1 * l2);
    if (cos < -0.5 && b.cum - lastBenchCum > 120) {
      lastBenchCum = b.cum;
      const perpE = -v1n / l1, perpN = v1e / l1;
      const up = terrainAt(b.east + perpE * 3, b.north + perpN * 3) >= terrainAt(b.east - perpE * 3, b.north - perpN * 3) ? 1 : -1;
      benchAt(b.east + perpE * up * 2.6, b.north + perpN * up * 2.6, b.height, Math.atan2(v1e, v1n), `switchback-bench-${b.cum.toFixed(0)}m`);
    }
  }
  // Wind-shelter rest points: lean-to roof + bench, at the mid terrace
  // and at the gate foot where the southern gate leg starts.
  const shelters: Group[] = [];
  function shelterAt(point: SwitchbackPoint, name: string) {
    const shelter = new Group();
    shelter.name = name;
    const roof = new Mesh(new BoxGeometry(3.4, 0.14, 2.6), timber);
    roof.position.set(0, 2.3, 0);
    roof.rotation.z = 0.18;
    const postA = new Mesh(new BoxGeometry(0.16, 2.3, 0.16), timber);
    postA.position.set(-1.5, 1.15, 1.1);
    const postB = postA.clone();
    postB.position.set(1.5, 1.15, 1.1);
    const wall = new Mesh(new BoxGeometry(3.4, 1.9, 0.18), stone);
    wall.position.set(0, 0.95, -1.2);
    shelter.add(roof, postA, postB, wall);
    shelter.position.set(point.east + 4.2, point.height, -point.north);
    group.add(shelter);
    shelters.push(shelter);
    benchAt(point.east + 4.2, point.north, point.height, 0, `${name}-bench`);
    disposers.push(() => { for (const part of [roof, postA, postB, wall]) part.geometry.dispose(); });
  }
  const midPoint = centreline.find(p => Math.abs(p.east - 440) < 0.01 && Math.abs(p.north - 520) < 0.01);
  const gatePoint = centreline.find(p => Math.abs(p.east - 347.7) < 0.01 && Math.abs(p.north - 609.8) < 0.01);
  if (midPoint) shelterAt(midPoint, 'switchback-shelter-mid');
  if (gatePoint) shelterAt(gatePoint, 'switchback-shelter-gate');
  // Viewing platform (300,400): the surveyed lookout stone platform
  // site (H76.9), a flat stone deck with a low parapet and a sign.
  const platform = new Group();
  platform.name = 'switchback-lookout-300-400';
  const deck = new Mesh(new CylinderGeometry(3.6, 3.9, 0.55, 10), stone);
  deck.position.set(0, 0.28, 0);
  platform.add(deck);
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (0.15 + k * 0.12);
    const parapet = new Mesh(new BoxGeometry(1.1, 0.85, 0.28), stone);
    parapet.position.set(Math.cos(a) * 3.3, 0.95, Math.sin(a) * 3.3);
    parapet.rotation.y = -a;
    platform.add(parapet);
  }
  const lookoutHeight = terrainAt(300, 400);
  platform.position.set(300, lookoutHeight, -400);
  group.add(platform);
  disposers.push(() => { deck.geometry.dispose(); });
  // Cable station timetable boards (S-12/S-16/S-19).
  const boards = createStationBoards(terrainAt, timber, stone);
  group.add(boards.group);
  disposers.push(boards.dispose);

  let disposed = false;
  return {
    group, centreline, entryCentreline, totalLength, heightAt,
    benches, shelters, platform, boards: boards.group,
    surfaceAt: (east: number, north: number, hintHeight?: number) => heightAt(east, north, hintHeight),
    setNight(night: boolean) {
      for (const core of lampCores) (core.material as MeshBasicMaterial).color.set(night ? '#ffb45c' : '#3a3230');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}

/** Cable station timetable board texts — verbatim from 总控
 * 《文本-缆车三站时刻牌-2026-11-22》 (S-12/S-16/S-19, 批53定稿).
 * Mounting only: never reword. */
export const STATION_BOARD_TEXTS = [
  { id: 'S-12', station: '山下站', east: 522.2, north: 324.2,
    title: '上山车',
    lines: ['车自山顶来 · 约二分钟一程', '晨钟后首班 · 日落前末班 · 夜里不开', '先到中山站 · 换口气再登顶'] },
  { id: 'S-16', station: '中山站', east: 434.4, north: 520.8,
    title: '中山站 · 上下通停',
    lines: ['往上 约一分钟到顶 · 往下 约一分钟回山脚', '配重在塔 · 过站先听铃', '夜里过站不停 · 听见铃声莫招手'] },
  { id: 'S-19', station: '山顶站', east: 333.6, north: 637.6,
    title: '下山车',
    lines: ['车从这儿发 · 人到即走 · 不等人齐', '风起缓发 · 雪大停发（站房里等）', '末班看日头 · 落山前准有一班'] },
] as const;

export function createStationBoards(
  terrainAt: (east: number, north: number) => number,
  timber: MeshLambertMaterial,
  stone: MeshLambertMaterial,
) {
  const group = new Group();
  group.name = 'cable-station-boards';
  const disposers: (() => void)[] = [];
  for (const board of STATION_BOARD_TEXTS) {
    const height = terrainAt(board.east, board.north);
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 384;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#4c3a26'; ctx.fillRect(0, 0, 512, 384);
        ctx.strokeStyle = '#2c2c30'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 498, 370);
        ctx.fillStyle = '#f0e4c8'; ctx.textAlign = 'center';
        ctx.font = 'bold 64px system-ui, sans-serif';
        ctx.fillText(board.title, 256, 96);
        ctx.font = '30px system-ui, sans-serif';
        board.lines.forEach((line, i) => ctx.fillText(line, 256, 168 + i * 52));
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const face = new Mesh(new PlaneGeometry(1.7, 1.28), new MeshBasicMaterial({ map: texture, side: 2 }));
        face.name = `station-board-${board.id}`;
        face.position.set(board.east, height + 1.9, -board.north);
        group.add(face);
        const frame = new Mesh(new BoxGeometry(1.86, 1.44, 0.08), stone);
        frame.position.set(board.east, height + 1.9, -board.north - 0.06);
        group.add(frame);
        const legL = new Mesh(new BoxGeometry(0.12, 1.4, 0.12), timber);
        legL.position.set(board.east - 0.7, height + 0.7, -board.north);
        const legR = legL.clone();
        legR.position.set(board.east + 0.7, height + 0.7, -board.north);
        group.add(legL, legR);
        disposers.push(() => {
          face.geometry.dispose(); face.material.dispose(); texture.dispose();
          frame.geometry.dispose(); legL.geometry.dispose(); legR.geometry.dispose();
        });
      }
    }
  }
  let disposed = false;
  return { group, dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const dispose of disposers) dispose();
  } };
}

function setInstance(mesh: InstancedMesh, index: number, x: number, y: number, z: number) {
  mesh.setMatrixAt(index, new Matrix4().makeTranslation(x, y, z));
  mesh.instanceMatrix.needsUpdate = true;
}
