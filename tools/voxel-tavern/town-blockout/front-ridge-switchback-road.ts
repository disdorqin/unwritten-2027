import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, Group,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace,
} from 'three';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';

export type SwitchbackPoint = { east: number; north: number; height: number; cum: number };

const MAX_GRADE = 0.105;
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
 */
export function buildSwitchbackCenterline(
  terrainAt: (east: number, north: number) => number = sampleNorthRidge350,
): SwitchbackPoint[] {
  const raw: { east: number; north: number }[] = [];
  // Toe road: surveyed, nearly flat.
  const toe: [number, number][] = [[290, 300], [350, 301], [400, 304], [460, 312], [500, 320], [526, 329]];
  for (const [east, north] of toe) raw.push({ east, north });

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
  // relaxation sweeps, with the surveyed anchors pinned (mid terrace
  // 140, cloud terrace 347). The projection is the closest legal
  // profile: it departs from the terrain only where a terrace blend
  // edge would otherwise break the grade cap.
  const heights = sampled.map(point => terrainAt(point.east, point.north));
  const plans = sampled.map((point, i) => i === 0 ? 0
    : Math.hypot(point.east - sampled[i - 1]!.east, point.north - sampled[i - 1]!.north));
  const pins = new Map<number, number>();
  sampled.forEach((point, i) => {
    if (point.east === 440 && point.north === 520) pins.set(i, 140);
    if (point.east === 336 && point.north === 640) pins.set(i, 347);
  });
  // Per stretch between anchors: forward and backward band-clamped
  // envelopes of the samples (each step moves at most the grade cap
  // from its neighbour, tracking the terrain inside that band), then
  // the lower of the two. Both envelopes are grade-legal, so their
  // minimum is too, and the anchor pins land exact.
  const stretches: [number, number, number, number][] = [];
  const midIndex = pins.size ? [...pins.keys()].sort((a, b) => a - b)[0]! : -1;
  const endIndex = sampled.length - 1;
  if (midIndex > 0) {
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
    for (let i = from; i <= to; i++) {
      const lower = Math.max(startH - MAX_GRADE * cums[i - from]!,
        pinH - MAX_GRADE * (total - cums[i - from]!));
      const upper = Math.min(startH + MAX_GRADE * cums[i - from]!,
        pinH + MAX_GRADE * (total - cums[i - from]!));
      const f = forward[i - from]!;
      heights[i] = f < lower ? lower : f > upper ? upper : f;
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

export function createFrontRidgeSwitchbackRoad(
  terrainAt: (east: number, north: number) => number = sampleNorthRidge350,
) {
  const centreline = buildSwitchbackCenterline(terrainAt);
  const totalLength = centreline.at(-1)!.cum;
  const group = new Group();
  group.name = 'front-ridge-switchback-road';
  const disposers: (() => void)[] = [];

  // --- Ribbon: road rows at profile height, shoulder rows on the terrain.
  const rowsAt = (point: SwitchbackPoint, dirE: number, dirN: number) => {
    const perpE = -dirN, perpN = dirE;
    return [-SHOULDER, -ROAD_HALF, ROAD_HALF, SHOULDER].map(lateral => {
      const east = point.east + perpE * lateral;
      const north = point.north + perpN * lateral;
      const onRoad = Math.abs(lateral) <= ROAD_HALF;
      return { east, north, height: onRoad ? point.height : terrainAt(east, north), onRoad };
    });
  };
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const gravel = [0.52, 0.46, 0.38];
  const gravelDark = [0.42, 0.37, 0.30];
  for (let i = 0; i < centreline.length; i++) {
    const point = centreline[i]!;
    const prev = centreline[Math.max(0, i - 1)]!;
    const next = centreline[Math.min(centreline.length - 1, i + 1)]!;
    let dirE = next.east - prev.east, dirN = next.north - prev.north;
    const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
    const rows = rowsAt(point, dirE, dirN);
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
  ribbon.name = 'switchback-road-ribbon';
  group.add(ribbon);
  disposers.push(() => { ribbonGeometry.dispose(); (ribbon.material as MeshLambertMaterial).dispose(); });

  // --- Height override: nearest centreline sample via a 12 m cell hash.
  const cell = 12;
  const hash = new Map<string, number[]>();
  centreline.forEach((point, i) => {
    const key = `${Math.floor(point.east / cell)},${Math.floor(point.north / cell)}`;
    const list = hash.get(key) ?? []; list.push(i); hash.set(key, list);
  });
  function nearest(east: number, north: number): { point: SwitchbackPoint; distance: number; lateral: number } | undefined {
    let best: { point: SwitchbackPoint; distance: number; lateral: number } | undefined;
    const cx = Math.floor(east / cell), cn = Math.floor(north / cell);
    for (let x = cx - 1; x <= cx + 1; x++) for (let n = cn - 1; n <= cn + 1; n++) {
      for (const i of hash.get(`${x},${n}`) ?? []) {
        const point = centreline[i]!;
        const distance = Math.hypot(east - point.east, north - point.north);
        if (!best || distance < best.distance) {
          const next = centreline[Math.min(centreline.length - 1, i + 1)]!;
          const prev = centreline[Math.max(0, i - 1)]!;
          let dirE = next.east - prev.east, dirN = next.north - prev.north;
          const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
          const lateral = (east - point.east) * -dirN + (north - point.north) * dirE;
          best = { point, distance, lateral };
        }
      }
    }
    return best;
  }
  function heightAt(east: number, north: number): number | undefined {
    const near = nearest(east, north);
    if (!near) return undefined;
    const lateralAbs = Math.abs(near.lateral);
    if (near.distance > SHOULDER + 2) return undefined;
    if (lateralAbs <= ROAD_HALF) return near.point.height + 0.06;
    if (lateralAbs <= SHOULDER) {
      const t = (lateralAbs - ROAD_HALF) / (SHOULDER - ROAD_HALF);
      const smooth = t * t * (3 - 2 * t);
      return (near.point.height + 0.06) * (1 - smooth) + terrainAt(east, north) * smooth;
    }
    return undefined;
  }

  // --- Entities: fog-lamp chain, mileage stones, hairpin rest benches, signs.
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const timber = new MeshLambertMaterial({ color: '#5d4630' });
  disposers.push(() => { stone.dispose(); timber.dispose(); });
  const lampCores: Mesh[] = [];
  const lampMaterial = new MeshBasicMaterial({ color: '#3a3230' });
  disposers.push(() => lampMaterial.dispose());
  let nextLamp = 30;
  let nextStone = 500;
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
      nextStone += 500;
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

  let disposed = false;
  return {
    group, centreline, totalLength, heightAt,
    surfaceAt: heightAt,
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

function setInstance(mesh: InstancedMesh, index: number, x: number, y: number, z: number) {
  mesh.setMatrixAt(index, new Matrix4().makeTranslation(x, y, z));
  mesh.instanceMatrix.needsUpdate = true;
}
