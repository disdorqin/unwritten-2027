import {
  BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail, mainSummitTrailSpec, type MainSummitTrailPoint } from './main-summit-trail';
import { sampleTownD2R30Height } from './town-d2-r30-domain';

/**
 * D2-R02: real support for the canonical 5590 m switchback walkway on the R30
 * solid massif. The surveyed centreline and tread heights stay canonical (P-1
 * survey); this module only builds the earthworks that make that tread meet the
 * R30 terrain — cut/fill shoulders that feather back to the massif and solid
 * piers under spans over deep gullies. No route, height field, collision
 * authority or public viewer is changed.
 */
export type TownD2R30TrailSupportOptions = Readonly<{
  trailPoints?: readonly MainSummitTrailPoint[];
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
  /** Metres between sampled cross-sections (default 6). */
  sectionStep?: number;
  /** Half-width of the cut/fill shoulder beyond the 3 m tread (default 5). */
  shoulderWidth?: number;
}>;

export type TownD2R30TrailSupportStats = Readonly<{
  sections: number;
  span: number;
  treadTriangles: number;
  earthworkTriangles: number;
  pierQuads: number;
  /** Six-sided bearing beams, one per bridged section. */
  beamQuads: number;
  maxGap: number;
  maxBury: number;
  supportedSections: number;
  bridgedSections: number;
  width: number;
  draws: number;
  triangles: number;
  surveyedPoints: number;
}>;

const DEFAULTS = Object.freeze({
  sectionStep: 6,
  shoulderWidth: 5,
  pierDrop: .6,
  treadLift: .07,
  shoulderLift: .05,
  beamDepth: .35,
  pierRadius: .9,
  bridgeColor: '#8d9598',
  cutColor: '#6a6f63',
  fillColor: '#7a6a54',
  treadColor: '#bac2bf',
});

type Section = Readonly<{
  east: number;
  north: number;
  height: number;
  ground: number;
  /** Unit normal to the centreline, pointing to the sampled shoulder. */
  nx: number;
  nz: number;
}>;

function defaultTrail(arrivalHeight: number): { points: readonly MainSummitTrailPoint[]; dispose: () => void } {
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  const points = createMainSummitTrail(block.heightAt, arrivalHeight).points;
  return { points, dispose: () => block.dispose() };
}

function makeGeometry(
  positions: number[], indices: number[], name: string,
  color: string, colors?: number[],
): Mesh<BufferGeometry, MeshLambertMaterial> {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new MeshLambertMaterial({ color, vertexColors: Boolean(colors) });
  material.name = `${name}-lambert`;
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

export function createTownD2R30TrailSupport(options: TownD2R30TrailSupportOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const sectionStep = options.sectionStep ?? DEFAULTS.sectionStep;
  const shoulderWidth = options.shoulderWidth ?? DEFAULTS.shoulderWidth;
  const half = mainSummitTrailSpec.width / 2;
  if (![arrivalHeight, sectionStep].every(Number.isFinite) || sectionStep <= 0) {
    throw new RangeError('Invalid D2-R02 trail support parameters.');
  }
  if (!Number.isFinite(shoulderWidth) || shoulderWidth < half) {
    throw new RangeError('shoulderWidth must be at least the half tread width.');
  }
  const source = options.trailPoints ? { points: options.trailPoints, dispose: () => {} }
    : defaultTrail(arrivalHeight);
  const heightAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  const groundAt = (east: number, north: number) => {
    const value = heightAt(east, north, arrivalHeight);
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  };

  try {
    const points = source.points;
    if (!Array.isArray(points) || points.length < 3 || points.some(point =>
      !point || ![point.east, point.north, point.height].every(Number.isFinite))) {
      throw new RangeError('D2-R02 trail support needs a finite polyline.');
    }

    // Resample by travelled distance: one cross-section per `sectionStep` m.
    const sections: Section[] = [];
    let accumulated = Infinity; // force the first point to be sampled
    let previous = points[0]!;
    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      accumulated += Math.hypot(point.east - previous.east, point.north - previous.north);
      previous = point;
      if (accumulated < sectionStep && sections.length) continue;
      accumulated = 0;
      const before = points[Math.max(0, index - 1)]!;
      const after = points[Math.min(points.length - 1, index + 1)]!;
      const de = after.east - before.east, dn = after.north - before.north;
      const length = Math.hypot(de, dn);
      if (length < 1e-6) continue;
      const nx = -dn / length, nz = de / length;
      const ground = groundAt(point.east + nx * shoulderWidth, point.north + nz * shoulderWidth);
      if (ground === undefined) continue;
      sections.push({ east: point.east, north: point.north, height: point.height, ground, nx, nz });
    }
    if (sections.length < 2) throw new RangeError('D2-R02 trail support produced too few sections.');

    // Layout per section: [0]=left tread, [1]=right tread,
    // [2]=left shoulder ground, [3]=right shoulder ground.
    const treadPos: number[] = [], treadIdx: number[] = [];
    const earthPos: number[] = [], earthCol: number[] = [], earthIdx: number[] = [];
    const pierPos: number[] = [], pierIdx: number[] = [];
    let pierQuads = 0, beamQuads = 0;
    const cut = new Color(DEFAULTS.cutColor), fill = new Color(DEFAULTS.fillColor);
    const tint = new Color();

    for (const [index, section] of sections.entries()) {
      const { east, north, height, ground, nx, nz } = section;
      const y = height + DEFAULTS.treadLift;
      const sx = east + nx * shoulderWidth, sz = -(north + nz * shoulderWidth);
      const lx = east - nx * shoulderWidth, lz = -(north - nz * shoulderWidth);
      for (const sign of [-1, 1]) {
        const edgeX = east + nx * half * sign, edgeZ = -(north + nz * half * sign);
        treadPos.push(edgeX, y, edgeZ);
      }
      treadPos.push(lx, ground + DEFAULTS.shoulderLift, lz, sx, ground + DEFAULTS.shoulderLift, sz);
      if (index > 0) {
        const p = (index - 1) * 4, c = index * 4;
        treadIdx.push(p, p + 1, c, c, p + 1, c + 1);             // 3 m walking strip
        earthIdx.push(p, p + 2, c, c, p + 2, c + 2);             // left cut/fill
        earthIdx.push(p + 1, c + 1, p + 3, p + 3, c + 1, c + 3); // right cut/fill
      }
      // Shoulder colour follows cut (tread above terrain) vs fill (below).
      tint.copy(height > ground ? fill : cut);
      for (let corner = 0; corner < 4; corner++) earthCol.push(tint.r, tint.g, tint.b);

      const gap = height - ground;
      if (gap > DEFAULTS.pierDrop) {
        const r = DEFAULTS.pierRadius;
        // The visible tread is a zero-thickness surface. Put the bearing beam
        // directly below that plane, then land every pier on its underside.
        const beamTop = y, beamBottom = y - DEFAULTS.beamDepth;
        for (const [px, pz] of [[sx, sz], [lx, lz]]) {
          const pier = pierPos.length / 3;
          pierPos.push(
            px - r, beamBottom, pz - r, px + r, beamBottom, pz - r,
            px + r, beamBottom, pz + r, px - r, beamBottom, pz + r,
            px - r, ground, pz - r, px + r, ground, pz - r,
            px + r, ground, pz + r, px - r, ground, pz + r,
          );
          for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
            pierIdx.push(pier + a, pier + b, pier + a + 4, pier + b, pier + b + 4, pier + a + 4);
          }
          pierIdx.push(pier, pier + 2, pier + 1, pier, pier + 3, pier + 2);
          pierQuads += 5;
        }
        const beam = pierPos.length / 3;
        const minX = Math.min(lx, sx) - r, maxX = Math.max(lx, sx) + r;
        const minZ = Math.min(lz, sz) - r, maxZ = Math.max(lz, sz) + r;
        pierPos.push(
          minX, beamTop, minZ, maxX, beamTop, minZ,
          maxX, beamTop, maxZ, minX, beamTop, maxZ,
          minX, beamBottom, minZ, maxX, beamBottom, minZ,
          maxX, beamBottom, maxZ, minX, beamBottom, maxZ,
        );
        for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
          pierIdx.push(beam + a, beam + b, beam + a + 4, beam + b, beam + b + 4, beam + a + 4);
        }
        pierIdx.push(
          beam, beam + 1, beam + 2, beam, beam + 2, beam + 3,
          beam + 4, beam + 6, beam + 5, beam + 4, beam + 7, beam + 6,
        );
        beamQuads += 6;
      }
    }

    // Split the packed buffer into the 2-vertex tread and the 2-vertex earthwork
    // so each stays a single indexed draw with its own material family.
    const treadOnly: number[] = [], earthOnly: number[] = [];
    for (let index = 0; index < sections.length; index++) {
      const o = index * 12;
      treadOnly.push(treadPos[o]!, treadPos[o + 1]!, treadPos[o + 2]!, treadPos[o + 3]!, treadPos[o + 4]!, treadPos[o + 5]!);
      earthOnly.push(treadPos[o + 6]!, treadPos[o + 7]!, treadPos[o + 8]!, treadPos[o + 9]!, treadPos[o + 10]!, treadPos[o + 11]!);
    }
    const treadIndices: number[] = [], earthIndices: number[] = [];
    for (let index = 0; index < sections.length - 1; index++) {
      const p = index * 2, c = p + 2;
      treadIndices.push(p, p + 1, c, c, p + 1, c + 1);
      earthIndices.push(p, c, p + 1, p + 1, c, c + 1);
      earthIndices.push(p + 2, p + 3, c + 2, c + 2, p + 3, c + 3);
    }
    const tread = makeGeometry(treadOnly, treadIndices, 'town-d2-r30-trail-tread', DEFAULTS.treadColor);
    const earth = makeGeometry(earthOnly, earthIndices, 'town-d2-r30-trail-earthwork', '#ffffff', earthCol);
    const piers = pierPos.length ? makeGeometry(pierPos, pierIdx, 'town-d2-r30-trail-piers', '#ffffff') : undefined;
    if (piers) {
      // R5: a vertical stone gradient on the piers and beams so the bridge
      // supports read as real cut stone rather than a flat fill. The colour
      // rides on the geometry; the material colour stays a multiplier so the
      // existing night tint still works.
      const pierPosition = piers.geometry.getAttribute('position');
      const pierColors = new Float32Array(pierPosition.count * 3);
      const stoneTop = new Color('#9a9388'), stoneBottom = new Color('#5e574d');
      let pierMinY = Infinity, pierMaxY = -Infinity;
      for (let index = 0; index < pierPosition.count; index++) {
        const y = pierPosition.getY(index);
        if (y < pierMinY) pierMinY = y;
        if (y > pierMaxY) pierMaxY = y;
      }
      const pierSpan = pierMaxY - pierMinY || 1;
      for (let index = 0; index < pierPosition.count; index++) {
        const t = (pierPosition.getY(index) - pierMinY) / pierSpan;
        const c = stoneTop.clone().lerp(stoneBottom, t);
        pierColors[index * 3] = c.r;
        pierColors[index * 3 + 1] = c.g;
        pierColors[index * 3 + 2] = c.b;
      }
      piers.geometry.setAttribute('color', new Float32BufferAttribute(pierColors, 3));
      piers.material.vertexColors = true;
      // Beam tops coincide with the canonical tread plane; bias the support
      // backwards in depth so the walking surface wins without a visible gap.
      piers.material.polygonOffset = true;
      piers.material.polygonOffsetFactor = 1;
      piers.material.polygonOffsetUnits = 1;
    }

    const group = new Group();
    group.name = 'town-d2-r30-trail-support';
    group.add(tread, earth);
    if (piers) group.add(piers);

    let maxGap = -Infinity, maxBury = Infinity, bridged = 0, supported = 0, span = 0;
    for (const [index, section] of sections.entries()) {
      const gap = section.height - section.ground;
      maxGap = Math.max(maxGap, gap);
      maxBury = Math.min(maxBury, gap);
      if (gap > DEFAULTS.pierDrop) bridged++; else supported++;
      if (index > 0) {
        const prev = sections[index - 1]!;
        span += Math.hypot(section.east - prev.east, section.north - prev.north);
      }
    }
    const tri = (mesh: Mesh) => (mesh.geometry.getIndex()!.count) / 3;
    const stats: TownD2R30TrailSupportStats = Object.freeze({
      sections: sections.length,
      span,
      treadTriangles: tri(tread),
      earthworkTriangles: tri(earth),
      pierQuads,
      beamQuads,
      maxGap,
      maxBury,
      supportedSections: supported,
      bridgedSections: bridged,
      width: mainSummitTrailSpec.width,
      draws: group.children.length,
      triangles: tri(tread) + tri(earth) + (piers ? tri(piers) : 0),
      surveyedPoints: points.length,
    });
    group.userData = {
      owner: 'D2-R02', visualOnly: true, includesWorldCollision: false,
      modifiesHeightAt: false, modifiesRoute: false, stats,
      coordinateConvention: 'x=east,y=height,z=-north',
    };

    let disposed = false;
    return {
      group,
      stats: () => stats,
      setNight(value: boolean) {
        if (disposed) throw new Error('The D2-R02 trail support is disposed.');
        if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
        (tread.material as MeshLambertMaterial).color.set(value ? '#7d8595' : DEFAULTS.treadColor);
        (earth.material as MeshLambertMaterial).color.set(value ? '#59626d' : '#ffffff');
        // The piers carry a vertex-colour stone gradient; the material colour
        // is a multiplier, so white leaves the gradient intact at day.
        (piers?.material as MeshLambertMaterial | undefined)?.color.set(value ? '#5c6672' : '#ffffff');
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
        for (const mesh of group.children) {
          const m = mesh as Mesh;
          m.geometry.dispose();
          (m.material as MeshLambertMaterial).dispose();
        }
        group.clear();
        group.userData.disposed = true;
      },
    };
  } finally {
    source.dispose();
  }
}
