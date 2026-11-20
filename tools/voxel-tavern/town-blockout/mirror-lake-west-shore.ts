import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import type { LakePoint } from './mirror-lake-zone-sample';

export const mirrorSouthShorePath = [
  [85, 131], [60, 124], [35, 132], [24, 160], [24.5, 182],
] as const satisfies readonly LakePoint[];
export const mirrorSouthShoreWidth = 2;

export function mirrorSouthShoreSamples(step: number) {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError('Invalid south shore sample step.');
  const samples: { east: number; north: number; sideEast: number; sideNorth: number }[] = [];
  for (const [index, [east, north]] of mirrorSouthShorePath.slice(0, -1).entries()) {
    const [nextEast, nextNorth] = mirrorSouthShorePath[index + 1];
    const dx = nextEast - east;
    const dn = nextNorth - north;
    const segmentLength = Math.hypot(dx, dn);
    const steps = Math.ceil(segmentLength / step);
    for (let i = 0; i <= steps; i++) {
      samples.push({ east: east + dx * i / steps, north: north + dn * i / steps,
        sideEast: -dn / segmentLength, sideNorth: dx / segmentLength });
    }
  }
  return samples;
}

/** Local block-owned path surface. The caller supplies the walkable ground. */
export function createMirrorSouthShorePath(heightAt: (east: number, north: number) => number) {
  const halfWidth = mirrorSouthShoreWidth / 2;
  const points: ReturnType<typeof mirrorSouthShoreSamples> = [];
  for (const point of mirrorSouthShoreSamples(.5)) {
    const previous = points.at(-1);
    if (previous && previous.east === point.east && previous.north === point.north) {
      const sideEast = previous.sideEast + point.sideEast;
      const sideNorth = previous.sideNorth + point.sideNorth;
      const projection = sideEast * point.sideEast + sideNorth * point.sideNorth;
      previous.sideEast = sideEast / projection;
      previous.sideNorth = sideNorth / projection;
    } else points.push(point);
  }
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [i, p] of points.entries()) {
    for (const side of [-halfWidth, halfWidth]) {
      const east = p.east + p.sideEast * side;
      const north = p.north + p.sideNorth * side;
      vertices.push(east, heightAt(east, north) + .045, -north);
    }
    if (i === 0) continue;
    const right = i * 2;
    indices.push(right - 2, right, right - 1, right - 1, right, right + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new MeshLambertMaterial({ color: '#becbd4', polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'mirror-lake-south-shore-path';
  return {
    mesh,
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
