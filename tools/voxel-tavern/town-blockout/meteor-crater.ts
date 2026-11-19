export const meteorCraterRimRadius = 55;
export const meteorCraterFloorRadius = 20;
export const meteorCraterDepth = 35;

const fullTurn = 2 * Math.PI;
const descentRadius = meteorCraterRimRadius - meteorCraterFloorRadius;
const rimRoundingTolerance = 4 * Number.EPSILON * meteorCraterRimRadius;

export type MeteorCraterTerrace = Readonly<{
  outerRadius: number;
  innerRadius: number;
  depth: number;
}>;

export type MeteorCraterTrail = Readonly<{
  /** Radians clockwise from north at the rim. */
  startBearing: number;
  turns: number;
  /** Width from the centreline to the start of the shoulder, measured radially. */
  halfWidth: number;
  shoulderWidth: number;
  /** Maximum rise over horizontal distance, as a ratio. */
  maxGrade: number;
}>;

export type MeteorCraterPlan = Readonly<{
  /** Three terraces in order from the rim to the floor. */
  terraces: readonly [MeteorCraterTerrace, MeteorCraterTerrace, MeteorCraterTerrace];
  mainTrail: MeteorCraterTrail;
}>;

function positiveAngle(angle: number) {
  const remainder = angle % fullTurn;
  return remainder < 0 ? remainder + fullTurn : remainder;
}

export function createMeteorCrater({ terraces, mainTrail }: MeteorCraterPlan) {
  if (terraces.length !== 3) throw new RangeError('The crater needs three terraces.');

  const profile = [{ radius: meteorCraterRimRadius, depth: 0 }];
  for (const { outerRadius, innerRadius, depth } of terraces) {
    const outer = profile[profile.length - 1];
    if (![outerRadius, innerRadius, depth].every(Number.isFinite) ||
      outerRadius >= outer.radius || innerRadius >= outerRadius || innerRadius <= meteorCraterFloorRadius ||
      depth <= outer.depth || depth >= meteorCraterDepth) {
      throw new RangeError('Crater terraces must narrow and descend from rim to floor, with slopes between them.');
    }
    profile.push({ radius: outerRadius, depth }, { radius: innerRadius, depth });
  }
  profile.push({ radius: meteorCraterFloorRadius, depth: meteorCraterDepth });

  const { startBearing, turns, halfWidth, shoulderWidth, maxGrade } = mainTrail;
  const sweep = turns * fullTurn;
  const corridorRadius = halfWidth + shoulderWidth;
  if (![startBearing, sweep, halfWidth, shoulderWidth, maxGrade, corridorRadius].every(Number.isFinite) ||
    sweep <= 0 || halfWidth <= 0 || shoulderWidth <= 0 || maxGrade <= 0 ||
    corridorRadius * 2 >= descentRadius ||
    (turns > 1 && corridorRadius * 2 >= descentRadius / turns)) {
    throw new RangeError('Crater main trail needs a clear, non-overlapping corridor.');
  }

  // A linear radial descent steepens toward the floor as the circumference shrinks.
  const maxMainTrailGrade = meteorCraterDepth / Math.hypot(descentRadius, sweep * meteorCraterFloorRadius);
  if (maxMainTrailGrade > maxGrade) throw new RangeError('Crater main trail exceeds the supplied grade limit.');
  const bearing = positiveAngle(startBearing);

  function pointAt(progress: number) {
    const angle = bearing + sweep * progress;
    const radius = meteorCraterRimRadius - descentRadius * progress;
    return {
      east: radius * Math.sin(angle),
      north: radius * Math.cos(angle),
      heightOffset: progress === 0 ? 0 : -meteorCraterDepth * progress,
    };
  }

  const entry = pointAt(0);
  const exit = pointAt(1);

  function terraceHeightOffsetAt(radius: number) {
    if (!Number.isFinite(radius) || radius < 0 || radius > meteorCraterRimRadius + rimRoundingTolerance) return undefined;
    if (radius >= meteorCraterRimRadius) return 0;
    if (radius <= meteorCraterFloorRadius) return -meteorCraterDepth;
    for (let i = 1; i < profile.length; i++) {
      const inner = profile[i];
      if (radius >= inner.radius) {
        const outer = profile[i - 1];
        const fraction = (outer.radius - radius) / (outer.radius - inner.radius);
        return -(outer.depth + (inner.depth - outer.depth) * fraction);
      }
    }
  }

  function heightOffsetAt(east: number, north: number) {
    const radius = Math.hypot(east, north);
    const bowlHeight = terraceHeightOffsetAt(radius);
    if (bowlHeight === undefined || radius <= meteorCraterFloorRadius || radius >= meteorCraterRimRadius) {
      return bowlHeight;
    }

    const angle = positiveAngle(Math.atan2(east, north) - bearing);
    let distance = Math.hypot(east - entry.east, north - entry.north);
    let trailProgress = 0;
    const exitDistance = Math.hypot(east - exit.east, north - exit.north);
    if (exitDistance < distance) {
      distance = exitDistance;
      trailProgress = 1;
    }
    if (angle <= sweep) {
      // Find the closest crossing of this bearing without iterating over the turns.
      const desiredAngle = sweep * (meteorCraterRimRadius - radius) / descentRadius;
      const lastTurn = Math.floor((sweep - angle) / fullTurn);
      const turn = Math.max(0, Math.min(lastTurn, Math.round((desiredAngle - angle) / fullTurn)));
      const progress = (angle + turn * fullTurn) / sweep;
      const radialDistance = Math.abs(radius - (meteorCraterRimRadius - descentRadius * progress));
      if (radialDistance < distance) {
        distance = radialDistance;
        trailProgress = progress;
      }
    }

    if (distance >= corridorRadius) return bowlHeight;
    const shoulder = Math.max(0, distance - halfWidth) / shoulderWidth;
    const shoulderBlend = shoulder * shoulder * (3 - 2 * shoulder);
    const trailBoundaryDistance = descentRadius * Math.min(trailProgress, 1 - trailProgress);
    const boundaryFeather = Math.min(corridorRadius, trailBoundaryDistance);
    // Join the crater rim and floor at their existing heights without lifting their edges.
    const boundaryBlend = boundaryFeather === 0 ? 1 : Math.min(1,
      Math.min(meteorCraterRimRadius - radius, radius - meteorCraterFloorRadius) / boundaryFeather);
    const trailHeight = -meteorCraterDepth * trailProgress;
    return bowlHeight + (trailHeight - bowlHeight) * (1 - shoulderBlend) * boundaryBlend;
  }

  /** Preview mesh only. Its indexed Float32 triangles are also the walk sample surface. */
  function buildPreviewSurface(shaftRadius: number) {
    if (!Number.isFinite(shaftRadius) || shaftRadius <= 0 || shaftRadius >= meteorCraterFloorRadius) {
      throw new RangeError('The preview shaft radius must fit inside the crater floor.');
    }
    const radianPadding = sweep * corridorRadius / descentRadius;
    // Extend the standing band onto the flat apron/floor before blending it out.
    const apron = meteorCraterRimRadius + 2 * corridorRadius;
    const minAngle = -radianPadding, maxAngle = sweep + radianPadding;
    const offsets = [-corridorRadius, -halfWidth, 0, halfWidth, corridorRadius];
    const fixedRadii = [shaftRadius, ...profile.map(row => row.radius), apron];
    const spokes = Math.ceil(apron * fullTurn / .75);
    const angles = Array.from({ length: spokes + 1 }, (_, i) => i * fullTurn / spokes);
    for (const angle of [0, sweep, minAngle, maxAngle]) angles.push(positiveAngle(angle));
    // Break exactly where a moving cross-section row crosses a stationary terrace row.
    for (const radius of fixedRadii) for (const offset of offsets) {
      const crossing = sweep * (meteorCraterRimRadius + offset - radius) / descentRadius;
      if (crossing > minAngle && crossing < maxAngle) angles.push(positiveAngle(crossing));
    }
    angles.sort((a, b) => a - b);
    const breaks = [0, ...angles.filter((angle, i) => angle > 1e-8 &&
      angle < fullTurn - 1e-8 && angle - angles[i - 1] >= 1e-8), fullTurn];

    function turnsAt(angle: number) {
      const start = Math.ceil((minAngle - angle - 1e-10) / fullTurn);
      const end = Math.floor((maxAngle - angle + 1e-10) / fullTurn);
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    const radiusAt = (angle: number) => meteorCraterRimRadius - descentRadius * angle / sweep;
    function vertexHeight(angle: number, radius: number) {
      const ground = terraceHeightOffsetAt(radius) ?? 0;
      let distance = corridorRadius, trailAngle = 0;
      for (const turn of turnsAt(angle)) {
        const candidate = angle + turn * fullTurn;
        const separation = Math.abs(radius - radiusAt(candidate));
        if (separation < distance) {
          distance = separation;
          trailAngle = candidate;
        }
      }
      if (distance >= corridorRadius) return ground;
      const shoulder = Math.max(0, distance - halfWidth) / shoulderWidth;
      const blend = shoulder * shoulder * (3 - 2 * shoulder);
      const road = -meteorCraterDepth * Math.max(0, Math.min(1, trailAngle / sweep));
      return road + (ground - road) * blend;
    }

    const vertices: number[] = [], faces: number[] = [];
    const sliceFaces: number[] = [];
    const addPoint = (angle: number, radius: number) => {
      vertices.push(
        Math.fround(radius * Math.sin(angle + bearing)),
        Math.fround(vertexHeight(angle, radius)),
        Math.fround(-radius * Math.cos(angle + bearing)),
      );
    };
    const addFace = (a: number, b: number, c: number) => {
      const ax = vertices[a * 3], az = vertices[a * 3 + 2];
      const bx = vertices[b * 3], bz = vertices[b * 3 + 2];
      const cx = vertices[c * 3], cz = vertices[c * 3 + 2];
      if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 1e-9) faces.push(a, b, c);
    };
    for (let slice = 0; slice < breaks.length - 1; slice++) {
      sliceFaces.push(faces.length);
      const start = breaks[slice], end = breaks[slice + 1];
      const midpoint = (start + end) / 2;
      const rows = [
        ...fixedRadii.map(radius => [radius, radius] as const),
        ...turnsAt(midpoint).flatMap(turn => offsets.map(offset => [
          radiusAt(start + turn * fullTurn) + offset, radiusAt(end + turn * fullTurn) + offset,
        ] as const)).filter(([a, b]) => (a + b) / 2 >= shaftRadius),
      ].sort(([a, b], [c, d]) => a + b - c - d);
      const base = vertices.length / 3;
      for (const [a, b] of rows) {
        addPoint(start, a);
        addPoint(end, b);
      }
      for (let row = 1; row < rows.length; row++) {
        const inner = base + row * 2 - 2;
        addFace(inner, inner + 3, inner + 2);
        addFace(inner, inner + 1, inner + 3);
      }
    }
    sliceFaces.push(faces.length);
    const positions = new Float32Array(vertices), indices = new Uint32Array(faces);

    function heightAt(east: number, north: number) {
      if (!Number.isFinite(east) || !Number.isFinite(north)) return;
      const bearingAtPoint = positiveAngle(Math.atan2(east, north) - bearing);
      let lo = 0, hi = breaks.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (breaks[mid] <= bearingAtPoint) lo = mid;
        else hi = mid;
      }
      const z = -north;
      const slices = breaks.length - 1;
      for (const slice of [lo, (lo + slices - 1) % slices, (lo + 1) % slices]) {
        for (let i = sliceFaces[slice]; i < sliceFaces[slice + 1]; i += 3) {
          const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
          const ax = positions[a], az = positions[a + 2];
          const bx = positions[b], bz = positions[b + 2];
          const cx = positions[c], cz = positions[c + 2];
          const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          const u = ((bz - cz) * (east - cx) + (cx - bx) * (z - cz)) / det;
          const v = ((cz - az) * (east - cx) + (ax - cx) * (z - cz)) / det;
          const w = 1 - u - v;
          if (Math.min(u, v, w) >= -1e-7) return u * positions[a + 1] + v * positions[b + 1] + w * positions[c + 1];
        }
      }
    }
    return { positions, indices, heightAt };
  }

  return {
    heightOffsetAt,
    terraceHeightOffsetAt,
    maxMainTrailGrade,
    buildPreviewSurface,
    mainTrailPoint(progress: number) {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError('Crater trail progress must be between 0 and 1.');
      }
      return pointAt(progress);
    },
  };
}
