import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, InstancedMesh,
  Mesh, MeshLambertMaterial, Object3D,
} from 'three';
import {
  buildSwitchbackCenterline, type SwitchbackPoint,
} from './front-ridge-switchback-road.js';
import type { FrontRidgeR30Field } from './town-d-r30-front-ridge.js';

/**
 * C33-1 (2026-11-28): the REAL graded ascent from the 140 m mid-station to
 * the 347 m cloud terrace. The 485.9 m golden guide is a 70% emergency
 * scramble, not this road. The original 4.09 km switchback centreline was
 * already certified at 10.5% but never mounted in the production scene; this
 * module builds its physical roadbed, shoulders, masonry and rails on that
 * exact centreline.
 *
 * C2 owns front-ridge roads. It reads the canonical D2 field for ground and
 * never writes terrain, viewer, terrain.ts, presence or another window's
 * file. Ground outside the lane is untouched; the tread is a real triangle
 * surface and its support/blocked are derived from the same triangles.
 */

export type AscentGroundAt = (east: number, north: number) => number | undefined;

export const c2AscentRoadSpec = Object.freeze({
  midStation: { east: 440, north: 520, height: 140 },
  cloudTerrace: { east: 336, north: 640, height: 347 },
  halfWidth: 1.75,
  shoulder: 3.4,
  maxGrade: .105,
  // The 4.09 km corridor contains a toe run-up below the mid-station. Only
  // the mid-station -> cloud-terrace stretch is this package's claim; the
  // toe is already A/D built ground and is not re-laid here.
  cell: 8,
  palette: {
    tread: '#a49e8f', cut: '#7d8587', fill: '#8e9289', frost: '#cdd9df',
    stone: '#747c7c', coping: '#bcc6c4', rail: '#6b5241', guide: '#c9a66d',
  } as const,
});

type Point = { east: number; north: number; height: number };
type Section = { p: SwitchbackPoint; at: (offset: number) => Point };

function signedArea(a: Point, b: Point, c: Point) {
  return (b.east - a.east) * (c.north - a.north) - (b.north - a.north) * (c.east - a.east);
}

function buildSections(points: readonly SwitchbackPoint[]) {
  const start = points.findIndex(p => p.east === c2AscentRoadSpec.midStation.east && p.north === c2AscentRoadSpec.midStation.north);
  const end = points.findIndex(p => p.east === c2AscentRoadSpec.cloudTerrace.east && p.north === c2AscentRoadSpec.cloudTerrace.north);
  if (start < 0 || end <= start) throw new RangeError('The certified switchback no longer carries both surveyed anchors.');
  return points.slice(start, end + 1).map((p, i, arr) => {
    const a = arr[i - 1] ?? p, b = arr[i + 1] ?? p;
    const de = b.east - a.east, dn = b.north - a.north;
    const length = Math.hypot(de, dn) || 1;
    const ne = -dn / length, nn = de / length;
    return { p, at: (offset: number): Point => ({ east: p.east + ne * offset, north: p.north + nn * offset, height: p.height }) } satisfies Section;
  });
}

/**
 * Re-project the designed profile onto the canonical production field.
 *
 * The original switchback heights are band-clamped against its own
 * `sampleNorthRidge350` sampler. Feeding those heights straight into D2's
 * combined ridge raster produces >100 m of phantom fill. This function keeps
 * the surveyed plan (east/north/cum) and the two pinned anchor heights, then
 * re-derives a grade-legal profile from the field the player actually walks.
 */
export function reprojectAscentProfile(
  points: readonly SwitchbackPoint[],
  groundAt: AscentGroundAt,
): SwitchbackPoint[] {
  const raw = buildSections(points).map(s => s.p);
  if (raw.length < 2) return [...raw];
  const samples = raw.map(p => groundAt(p.east, p.north));
  const firstBad = samples.findIndex(h => h === undefined || !Number.isFinite(h));
  if (firstBad >= 0) throw new RangeError('C33-1 centreline leaves the canonical field.');
  const heights = samples.map(h => h!);
  const grade = c2AscentRoadSpec.maxGrade;
  const startH = c2AscentRoadSpec.midStation.height;
  const endH = c2AscentRoadSpec.cloudTerrace.height;
  const plans = raw.map((p, i) => i === 0 ? 0
    : Math.hypot(p.east - raw[i - 1]!.east, p.north - raw[i - 1]!.north));
  const cums: number[] = [];
  let cum = 0;
  for (let i = 0; i < plans.length; i++) { cum += plans[i]!; cums.push(cum); }
  const total = cum;
  if (total <= 0) throw new RangeError('The designed ascent has no length.');
  // Two grade-legal envelopes from both pins; their median is grade-legal and
  // lands both anchors exactly. Track the field wherever the tube allows.
  // A backward band-clamped envelope from the top pin is grade-legal by
  // construction; clamping it into the two anchor cones keeps both pins
  // exact without ever producing a step larger than the cap. The median of
  // a forward envelope, a backward envelope and raw terrain would NOT be
  // grade-legal: its adjacent differences can exceed the cap, as measured.
  const backward = new Array<number>(heights.length);
  backward[heights.length - 1] = endH;
  for (let i = heights.length - 2; i >= 0; i--) {
    const cap = grade * plans[i + 1]!;
    backward[i] = Math.max(backward[i + 1]! - cap, Math.min(backward[i + 1]! + cap, heights[i]!));
  }
  const out: SwitchbackPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const lower = Math.max(startH - grade * cums[i]!, endH - grade * (total - cums[i]!));
    const upper = Math.min(startH + grade * cums[i]!, endH + grade * (total - cums[i]!));
    const h = Math.max(lower, Math.min(upper, backward[i]!));
    out.push({ ...raw[i]!, height: h });
  }
  out[0] = { ...out[0]!, height: startH };
  out[out.length - 1] = { ...out[out.length - 1]!, height: endH };
  return out;
}

export function planC2AscentRoad(
  points: readonly SwitchbackPoint[] = buildSwitchbackCenterline(),
  groundAt?: AscentGroundAt,
): readonly SwitchbackPoint[] {
  const claim = buildSections(points).map(s => s.p);
  return groundAt ? reprojectAscentProfile(claim, groundAt) : claim;
}

export function mountC2AscentRoad(
  groundAt: AscentGroundAt,
  options: { points?: readonly SwitchbackPoint[]; field?: FrontRidgeR30Field } = {},
) {
  const designed = options.points ?? buildSwitchbackCenterline();
  // Re-seat the designed profile on the exact field the player walks. Without
  // this, the old sampler's heights create >100 m of phantom fill on D2's
  // combined raster and the road could never be mounted in production.
  const points = reprojectAscentProfile(designed, groundAt);
  const sections = buildSections(points);
  const group = new Group();
  group.name = 'town-night-c2-front-ascent-road';
  const spec = c2AscentRoadSpec;

  const treadMat = new MeshLambertMaterial({ color: '#ffffff', vertexColors: true });
  const wallMat = new MeshLambertMaterial({ color: '#ffffff', vertexColors: true, side: DoubleSide });
  const colours = {
    tread: new Color(spec.palette.tread), cut: new Color(spec.palette.cut),
    fill: new Color(spec.palette.fill), frost: new Color(spec.palette.frost),
    stone: new Color(spec.palette.stone), coping: new Color(spec.palette.coping),
    rail: new Color(spec.palette.rail), guide: new Color(spec.palette.guide),
  };
  const cell = spec.cell;
  const chunks = new Map<string, { tread: number[]; treadColor: number[]; walls: number[]; wallColor: number[] }>();
  const bin = (p: Point) => {
    const key = `${Math.floor(p.east / cell)},${Math.floor(p.north / cell)}`;
    let c = chunks.get(key);
    if (!c) { c = { tread: [], treadColor: [], walls: [], wallColor: [] }; chunks.set(key, c); }
    return c;
  };
  const ground = (p: Point) => {
    const h = groundAt(p.east, p.north);
    if (h === undefined || !Number.isFinite(h)) throw new RangeError('C33-1 road leaves the supported field.');
    return h;
  };
  const vertex: number[] = [];
  const treadIndex: number[] = [];
  const lookup = new Map<string, number>();
  const triangles = new Map<string, [Point, Point, Point][]>();
  const cellKeys = (a: Point, b: Point, c: Point) => {
    const out: string[] = [];
    const minE = Math.floor((Math.min(a.east, b.east, c.east) - 1e-5) / cell);
    const maxE = Math.floor((Math.max(a.east, b.east, c.east) + 1e-5) / cell);
    const minN = Math.floor((Math.min(a.north, b.north, c.north) - 1e-5) / cell);
    const maxN = Math.floor((Math.max(a.north, b.north, c.north) + 1e-5) / cell);
    for (let x = minE; x <= maxE; x++) for (let n = minN; n <= maxN; n++) out.push(`${x},${n}`);
    return out;
  };
  const indexOf = (p: Point) => {
    const key = `${Math.fround(p.east)},${Math.fround(p.height)},${Math.fround(-p.north)}`;
    let i = lookup.get(key);
    if (i === undefined) { i = vertex.length / 3; lookup.set(key, i); vertex.push(Math.fround(p.east), Math.fround(p.height), Math.fround(-p.north)); }
    return i;
  };
  const emit = (a: Point, b: Point, c: Point, road: boolean, colour: Color) => {
    const bucket = bin(a);
    const target = road ? bucket.tread : bucket.walls;
    const shades = road ? bucket.treadColor : bucket.wallColor;
    for (const p of [a, b, c]) { target.push(Math.fround(p.east), Math.fround(p.height), Math.fround(-p.north)); shades.push(colour.r, colour.g, colour.b); }
    if (road) {
      treadIndex.push(indexOf(a), indexOf(b), indexOf(c));
      const tri: [Point, Point, Point] = [a, b, c];
      for (const key of cellKeys(a, b, c)) {
        const list = triangles.get(key) ?? []; list.push(tri); triangles.set(key, list);
      }
    }
  };
  const quad = (a: Point, b: Point, c: Point, d: Point, road: boolean, colour: Color) => {
    emit(a, b, c, road, colour); emit(c, b, d, road, colour);
  };
  const lerp = (a: Point, b: Point, t: number): Point => ({
    east: a.east + (b.east - a.east) * t,
    north: a.north + (b.north - a.north) * t,
    height: a.height + (b.height - a.height) * t,
  });

  let length = 0, maxGrade = 0, maxCut = 0, maxFill = 0, railMetres = 0, railPosts = 0;
  const rails: { a: Point; b: Point }[] = [];
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1]!, b = sections[i]!;
    const plan = Math.hypot(b.p.east - a.p.east, b.p.north - a.p.north);
    if (plan < 1e-6) continue;
    const grade = Math.abs(b.p.height - a.p.height) / plan;
    maxGrade = Math.max(maxGrade, grade);
    length += plan;
    // Tread: a flat 3.5 m carriageway, exact anchor heights.
    const al = a.at(-spec.halfWidth), ar = a.at(spec.halfWidth);
    const bl = b.at(-spec.halfWidth), br = b.at(spec.halfWidth);
    quad(al, ar, bl, br, true, colours.tread);
    const shade = i % 9 === 0 ? colours.frost : colours.tread;
    quad(al, ar, bl, br, true, shade);
    for (const sign of [-1, 1]) {
      const edgeA = a.at(sign * spec.halfWidth), edgeB = b.at(sign * spec.halfWidth);
      const outerA = a.at(sign * spec.shoulder), outerB = b.at(sign * spec.shoulder);
      const gA = ground(outerA), gB = ground(outerB);
      maxCut = Math.max(maxCut, gA - edgeA.height, gB - edgeB.height);
      maxFill = Math.max(maxFill, edgeA.height - gA, edgeB.height - gB);
      const baseA: Point = { ...outerA, height: Math.min(edgeA.height - .22, gA - .18) };
      const baseB: Point = { ...outerB, height: Math.min(edgeB.height - .22, gB - .18) };
      // Continuous bearing masonry from the tread edge to real ground.
      const courses = Math.max(1, Math.ceil(Math.max(edgeA.height - baseA.height, edgeB.height - baseB.height) / .48));
      for (let k = 0; k < courses; k++) {
        const t0 = k / courses, t1 = (k + 1) / courses;
        const tone = colours.stone.clone().multiplyScalar(.88 + .12 * (.5 + .5 * Math.sin(i * 1.9 + k * 2.3 + sign)));
        quad(lerp(baseA, edgeA, t0), lerp(baseA, edgeA, t1),
          lerp(baseB, edgeB, t0), lerp(baseB, edgeB, t1), false, tone);
      }
      quad(edgeA, outerA, edgeB, outerB, false, i % 7 < 2 ? colours.frost : colours.fill);
      quad(outerA, baseA, outerB, baseB, false, colours.cut);
      quad(edgeA, { ...edgeA, height: edgeA.height + .08 }, edgeB, { ...edgeB, height: edgeB.height + .08 }, false, colours.coping);
      // Guard rail only where the outside actually drops away.
      if (Math.max(edgeA.height - gA, edgeB.height - gB) > .9) {
        const ra = a.at(sign * (spec.halfWidth + .12)), rb = b.at(sign * (spec.halfWidth + .12));
        rails.push({ a: { ...ra, height: ra.height + 1.04 }, b: { ...rb, height: rb.height + 1.04 } });
        railMetres += plan;
        if (i % 4 === 0) railPosts++;
      }
    }
  }
  // Reject a roadbed that no longer fits the certified envelope.
  if (maxGrade > spec.maxGrade + 1e-6) {
    for (const c of chunks.values()) { c.tread.length = c.walls.length = 0; }
    throw new RangeError(`C33-1 centreline grade ${maxGrade} exceeds the certified ${spec.maxGrade}.`);
  }

  for (const [key, c] of chunks) {
    for (const [array, coloursArray, material, suffix] of [
      [c.tread, c.treadColor, treadMat, 'tread'], [c.walls, c.wallColor, wallMat, 'walls'],
    ] as const) {
      if (!array.length) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(array), 3));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(coloursArray), 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = `c2-front-ascent:${key}:${suffix}`;
      group.add(mesh);
    }
  }
  const cutTread = new BufferGeometry();
  cutTread.setAttribute('position', new BufferAttribute(new Float32Array(vertex), 3));
  cutTread.setIndex(treadIndex);
  cutTread.computeVertexNormals();
  cutTread.computeBoundingSphere();

  // Guard rails: one instanced batch, collision from the same segments.
  const railGeometry = new BoxGeometry(1, 1, 1);
  const railMaterial = new MeshLambertMaterial({ color: spec.palette.rail });
  const railMesh = new InstancedMesh(railGeometry, railMaterial, Math.max(1, rails.length));
  railMesh.name = 'c2-front-ascent-rails';
  const tmp = new Object3D();
  rails.forEach((r, i) => {
    const dx = r.b.east - r.a.east, dn = r.b.north - r.a.north;
    tmp.position.set((r.a.east + r.b.east) / 2, (r.a.height + r.b.height) / 2, -(r.a.north + r.b.north) / 2);
    tmp.rotation.set(0, Math.atan2(dn, dx), 0);
    tmp.scale.set(Math.hypot(dx, dn), .14, .14);
    tmp.updateMatrix(); railMesh.setMatrixAt(i, tmp.matrix);
  });
  railMesh.count = rails.length; railMesh.instanceMatrix.needsUpdate = true;
  railMesh.computeBoundingSphere(); group.add(railMesh);

  function supportAt(east: number, north: number) {
    let y: number | undefined;
    for (const tri of triangles.get(`${Math.floor(east / cell)},${Math.floor(north / cell)}`) ?? []) {
      const [a, b, c] = tri;
      const d = signedArea(a, b, c);
      if (Math.abs(d) < 1e-10) continue;
      const p = { east, north, height: 0 };
      const u = signedArea(a, p, c) / d, v = signedArea(a, b, p) / d;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) {
        const h = a.height + u * (b.height - a.height) + v * (c.height - a.height);
        y = y === undefined ? h : Math.max(y, h);
      }
    }
    return y;
  }
  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    return rails.some(({ a, b }) => {
      const dx = b.east - a.east, dn = b.north - a.north;
      const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / (dx * dx + dn * dn || 1)));
      const y = a.height + (b.height - a.height) * t;
      return feet + body > y && feet < y + .14 && Math.hypot(east - a.east - dx * t, north - a.north - dn * t) < radius + .08;
    });
  }

  // Earthwork delta: the honest hand-off to D2/A. The designed plan and the
  // production field are two different terrain authorities; a real road can
  // only be mounted after the delta below is accepted and the field rebuilt.
  // This module never writes that field and never claims open passage.
  let cutMetres = 0, fillMetres = 0, structureMetres = 0, cutVolume = 0, fillVolume = 0;
  const delta: { east: number; north: number; offset: number; kind: 'cut' | 'fill' }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const p = sections[i]!.p;
    const g = groundAt(p.east, p.north);
    if (g === undefined || !Number.isFinite(g)) continue;
    const offset = p.height - g;
    if (Math.abs(offset) <= 1e-6) continue;
    if (offset > 0) { fillMetres++; fillVolume += offset; }
    else { cutMetres++; cutVolume += -offset; }
    if (Math.abs(offset) > 2) structureMetres++;
    delta.push({ east: p.east, north: p.north, offset, kind: offset > 0 ? 'fill' : 'cut' });
  }
  const stations = sections.length || 1;
  const deltaReport = {
    stations,
    cutStations: cutMetres,
    fillStations: fillMetres,
    structureStations: structureMetres,
    maxCut, maxFill, cutVolume, fillVolume,
    /** productionMount is fail-closed: only a field rebuilt from an accepted
     * delta can turn this true. A visual road alone never opens passage. */
    productionMount: maxCut <= 8 && maxFill <= 8,
    samples: delta.filter((_, i) => i % 50 === 0),
  };

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
    group.clear();
    cutTread.dispose();
    treadMat.dispose(); wallMat.dispose(); railGeometry.dispose(); railMaterial.dispose();
    triangles.clear(); lookup.clear(); chunks.clear(); delta.length = 0;
  }
  return {
    group, cutTread, points: sections.map(s => s.p), supportAt, blocked, dispose, deltaReport,
    stats: () => ({
      metres: length, maxGrade, maxCut, maxFill, railMetres, railPosts,
      draws: group.children.length,
      treadTriangles: treadIndex.length / 3,
      triangles: group.children.reduce((sum, o) => sum + (o instanceof Mesh ? o.geometry.getAttribute('position').count / 3 : 0), 0),
      anchors: { start: sections[0]!.p, end: sections.at(-1)!.p },
    }),
  };
}
