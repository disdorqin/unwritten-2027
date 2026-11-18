import { Color, Matrix4, Object3D, type InstancedMesh } from 'three';
import { layout } from './terrain';

type Point = readonly [east: number, north: number];
type Part = {
  at: readonly [number, number, number];
  size: readonly [number, number, number];
  tint: string;
  joint: number;
  expression?: 'eye' | 'glint';
};
type GroundAt = (east: number, north: number) => number | undefined;

const wool = '#fff1d9', shadedWool = '#dfc6a4', gold = '#e9aa3d';
const scarf = '#ad3645', hoof = '#302b35', eye = '#191b23';
const torso = 0, head = 1, tail = 2, bell = 3, frontLeftLeg = 4;
const [west, , , north] = layout.plaza.bounds;

// The tree trunk sits west of the wish board anchor.
export const mascotHome = [west + 9.25, north - 2.75] as const;
const heart = [232, 190] as const;
const marketGate = [154, 97.9] as const;
const marketApproach = [[191, 181], [172, 175], [151, 156], [127, 140], [108, 114],
  [129, 86], [154, 79.62]] as const;
const towerForecourt = [226, 211.1] as const;

export const mascotPatrolPoints: readonly Point[] = [
  mascotHome, [205, 206.7], [220, 201], heart, [220, 181.8], ...marketApproach,
  marketGate, ...[...marketApproach].reverse(),
  [198, 180.2], [203, 186], [204, 200], [209, 207], [217, 209.2], towerForecourt,
  [217, 208.2], [209, 207.5], mascotHome,
];

function makeParts(): readonly Part[] {
  const list: Part[] = [];
  const box = (joint: number, tint: string, x: number, y: number, z: number, w: number, h: number, d: number,
    expression?: Part['expression']) => list.push({ joint, tint, at: [x, y, z], size: [w, h, d], expression });
  box(torso, shadedWool, 0, .338, -.036, .26, .274, .34);
  // Hand-set fleece offsets follow the front, side and rear silhouettes in the approved drawings.
  const fleece = [
    [-.104,.476,-.190,.087],[-.027,.481,-.184,.086],[.058,.475,-.184,.091],[.117,.459,-.164,.076],
    [-.114,.482,-.109,.091],[-.031,.495,-.104,.092],[.055,.492,-.104,.088],[.128,.477,-.083,.081],
    [-.114,.477,-.028,.082],[-.047,.489,-.021,.091],[.038,.487,-.019,.089],[.120,.462,.011,.085],
    [-.084,.470,.057,.097],[.001,.480,.067,.089],[.080,.477,.061,.093],[.097,.449,.118,.084],
    [-.149,.417,-.178,.084],[-.161,.405,-.101,.089],[-.152,.425,-.016,.096],[-.145,.399,.061,.086],
    [-.120,.380,.119,.078],[-.131,.358,-.151,.075],[-.128,.357,-.060,.075],
    [.146,.407,-.183,.087],[.158,.411,-.104,.093],[.155,.397,-.019,.089],[.142,.416,.057,.084],
    [.127,.373,.122,.076],[.135,.349,-.145,.075],[.130,.350,-.054,.075],
  ] as const;
  for (const [index, [x, y, z, size]] of fleece.entries()) {
    box(torso, index % 6 === 0 ? shadedWool : wool, x, y, z, size, size * .94, size);
  }
  box(head, wool, 0, .451, .168, .242, .215, .212);
  const forelock = [
    [-.100,.528,.208,.070],[-.061,.553,.224,.065],[-.013,.548,.231,.072],[.045,.558,.222,.069],
    [.093,.538,.218,.069],[-.102,.539,.139,.068],[-.040,.560,.142,.075],[.032,.554,.139,.078],
    [.096,.544,.135,.064],[-.078,.541,.079,.069],[-.010,.546,.077,.074],[.064,.542,.073,.069],
    [-.063,.510,.257,.058],[.015,.519,.261,.059],
  ] as const;
  for (const [index, [x, y, z, size]] of forelock.entries()) {
    box(head, index % 5 === 0 ? shadedWool : wool, x, y, z, size, size * .97, size);
  }
  // The additional inner turn implements Thomas's approval annotation for the 3D horns.
  const horn = [
    [.100,.525,.120],[.139,.542,.102],[.161,.570,.077],[.178,.601,.049],[.183,.610,.013],
    [.180,.594,-.022],[.158,.567,-.037],[.129,.548,-.020],[.108,.561,.006],[.103,.584,.027],[.126,.593,.031],
  ] as const;
  for (const side of [-1, 1]) {
    for (const [index, [x, y, z]] of horn.entries()) {
      const size = index >= 8 ? .036 : .045;
      box(head, gold, side * x, y, z, size, size, size);
    }
    box(head, wool, side * .147, .468, .193, .087, .049, .072);
    box(head, '#f1d7c2', side * .161, .455, .224, .052, .024, .024);
    box(head, eye, side * .062, .455, .278, .034, .038, .019, 'eye');
    box(head, '#fffafa', side * .062 + .008, .465, .289, .012, .012, .006, 'glint');
    box(head, eye, side * .018, .397, .275, .016, .008, .011);
  }
  box(head, eye, 0, .390, .276, .025, .012, .010);
  box(torso, scarf, 0, .361, .213, .231, .048, .048);
  box(torso, scarf, 0, .361, .079, .198, .043, .036);
  for (const x of [-.100, .100]) box(torso, scarf, x, .361, .146, .041, .047, .119);
  box(torso, scarf, -.065, .346, .241, .075, .038, .032);
  box(torso, scarf, -.040, .313, .248, .065, .047, .029);
  box(torso, scarf, -.016, .282, .256, .057, .046, .025);
  box(torso, scarf, .004, .250, .259, .052, .046, .027);
  box(bell, gold, .016, .214, .271, .050, .048, .040);
  box(bell, hoof, .016, .199, .293, .028, .006, .007);
  for (const [index, [x, z]] of ([[-.088,.116],[.088,.116],[-.088,-.151],[.088,-.151]] as const).entries()) {
    box(frontLeftLeg + index, wool, x, .125, z, .072, .17, .072);
    box(frontLeftLeg + index, hoof, x, .025, z + .005, .075, .05, .080);
  }
  box(tail, shadedWool, 0, .366, -.215, .084, .069, .066);
  box(tail, wool, -.006, .401, -.247, .078, .073, .072);
  box(tail, wool, -.009, .440, -.274, .061, .068, .065);
  return list;
}

export const townMascotParts = makeParts();

const legs = [
  [-.088, .201, .116], [.088, .201, .116], [-.088, .201, -.151], [.088, .201, -.151],
] as const;
const pivots: readonly (readonly [number, number, number])[] = [
  [0, .338, -.036], [0, .390, .100], [0, .367, -.205], [0, .260, .259], ...legs,
];
const hour = 3_600_000, outing = 720_000;
const stops = new Set<Point>([heart, marketGate, towerForecourt]);

function traceSegment(from: Point, to: Point, groundAt: GroundAt) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) * 2));
  let previous = groundAt(...from);
  if (previous === undefined) return false;
  for (let i = 1; i <= steps; i++) {
    const fraction = i / steps;
    const ground = groundAt(from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction);
    if (ground === undefined || Math.abs(ground - previous) > .43) return false;
    previous = ground;
  }
  return true;
}

type RouteLeg = { from: Point; to: Point; length: number; yaw: number; pause: number };
export function makeMascotPatrol(groundAt: GroundAt) {
  const legs: RouteLeg[] = [];
  let length = 0, pauses = 0;
  for (let index = 1; index < mascotPatrolPoints.length; index++) {
    const from = mascotPatrolPoints[index - 1], to = mascotPatrolPoints[index];
    if (!traceSegment(from, to, groundAt)) return undefined;
    const [dx, dn] = [to[0] - from[0], to[1] - from[1]];
    const pause = stops.has(to) ? 15_000 : 0;
    const metres = Math.hypot(dx, dn);
    length += metres;
    pauses += pause;
    legs.push({ from, to, length: metres, yaw: Math.atan2(dx, -dn), pause });
  }
  return { legs, millisecondsPerMetre: (outing - pauses) / length };
}

export type MascotPatrol = ReturnType<typeof makeMascotPatrol>;

export function sampleMascotLocation(now: number, patrol: MascotPatrol) {
  const home = { x: mascotHome[0], n: mascotHome[1], yaw: Math.PI / 8, speed: 0 };
  if (!patrol) return home;
  let elapsed = ((now % hour) + hour) % hour;
  if (elapsed >= outing) return home;
  for (const { from, to, length, yaw, pause } of patrol.legs) {
    const travel = length * patrol.millisecondsPerMetre;
    if (elapsed < travel) {
      const t = elapsed / travel;
      return { x: from[0] + (to[0] - from[0]) * t, n: from[1] + (to[1] - from[1]) * t,
        yaw, speed: 1000 / patrol.millisecondsPerMetre };
    }
    elapsed -= travel;
    if (elapsed < pause) return { x: to[0], n: to[1], yaw, speed: 0 };
    elapsed -= pause;
  }
  return home;
}

export type TownMascotOptions = {
  now: () => number;
  groundAt: GroundAt;
  visible: (east: number, north: number, ground: number) => boolean;
};

export function addMascotToNpcBatch(batch: InstancedMesh, start: number, options: TownMascotOptions) {
  const root = new Object3D();
  const pose = new Object3D();
  const partTransform = new Object3D();
  const matrix = new Matrix4(), color = new Color();
  const animated = pivots.map(() => new Matrix4());
  townMascotParts.forEach(({ tint }, index) => batch.setColorAt(start + index, color.set(tint)));
  batch.count = start;
  let patrol: MascotPatrol;
  let planned = false;
  let lastTick = NaN, shown = false;

  return function update() {
    if (!planned) {
      patrol = makeMascotPatrol(options.groundAt);
      planned = true;
    }
    const now = options.now();
    // Share repeatable location and movement phase while limiting instance writes to 25 Hz.
    const tick = Math.floor(now / 40) * 40;
    const point = sampleMascotLocation(tick, patrol);
    const ground = options.groundAt(point.x, point.n);
    if (ground === undefined || !options.visible(point.x, point.n, ground)) {
      if (shown) { batch.count = start; shown = false; }
      return false;
    }
    if (shown && tick === lastTick) return false;
    shown = true;
    batch.count = start + townMascotParts.length;
    lastTick = tick;
    const seconds = tick / 1000;
    const idlePhase = seconds % 60;
    const rest = !point.speed ? Math.max(0, Math.min(1, idlePhase - 41, 49 - idlePhase)) : 0;
    const grazing = !point.speed && !rest && seconds % 21 >= 18 && seconds % 21 < 19.2;
    const step = point.speed ? Math.sin(seconds * point.speed * 2.2 * Math.PI * 2) : 0;
    const bounce = point.speed ? Math.abs(step) * .012 : Math.sin(seconds * 2.8) * .004;

    // Hooves sit above the town's thin paving and turf dressing.
    root.position.set(point.x, ground + .020, -point.n);
    root.rotation.set(0, point.yaw, 0);
    root.updateMatrix();
    for (const [joint, pivot] of pivots.entries()) {
      const hindLeg = joint >= frontLeftLeg + 2;
      const bodyDrop = joint < frontLeftLeg ? bounce - rest * (joint === tail ? .042 : .033) : -rest * (hindLeg ? .041 : .025);
      pose.position.set(pivot[0], pivot[1] + bodyDrop, pivot[2]);
      const pitch = joint === head ? (grazing ? Math.PI / 10 : .11 * rest)
        : joint === bell ? -.11 * step
        : joint >= frontLeftLeg ? step * (joint === frontLeftLeg || joint === frontLeftLeg + 3 ? .36 : -.36) +
          rest * (hindLeg ? -.67 : .40) : 0;
      const yaw = joint === tail ? Math.sin(seconds * (point.speed ? 9 : 5.027)) * .21 * (1 - rest * .62) : 0;
      pose.rotation.set(pitch, yaw, 0);
      pose.updateMatrix();
      animated[joint].multiplyMatrices(root.matrix, pose.matrix);
    }

    for (const [index, { at, size, joint, expression }] of townMascotParts.entries()) {
      const pivot = pivots[joint];
      partTransform.position.set(at[0] - pivot[0], at[1] - pivot[1] - (expression ? rest * .011 : 0), at[2] - pivot[2]);
      partTransform.scale.set(size[0], size[1] * (1 - rest * (expression === 'eye' ? .8 : expression === 'glint' ? 1 : 0)), size[2]);
      partTransform.updateMatrix();
      matrix.multiplyMatrices(animated[joint], partTransform.matrix);
      batch.setMatrixAt(start + index, matrix);
    }
    return true;
  };
}
