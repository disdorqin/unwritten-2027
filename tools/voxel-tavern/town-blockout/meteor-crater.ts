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

  return {
    heightOffsetAt,
    terraceHeightOffsetAt,
    maxMainTrailGrade,
    mainTrailPoint(progress: number) {
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError('Crater trail progress must be between 0 and 1.');
      }
      return pointAt(progress);
    },
  };
}
