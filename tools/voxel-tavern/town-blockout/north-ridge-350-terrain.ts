import { BufferGeometry, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';

type HeightAt = (east: number, north: number) => number;
type Site = { east: number; north: number; height: number; width: number; depth: number };

export const northRidgeFrame = { width: 640, depth: 800 } as const;
export const northRidgeSummit = { east: 320, north: 650, height: 350, width: 64, depth: 64 } as const;
export const northRidgeMidStation = { east: 440, north: 520, height: 140, width: 30, depth: 24 } as const;
export const northRidgeNorthWall = { west: 290, east: 350, south: 690, north: 770 } as const;
export const northRidgeCableAnchors = [[526, 329], [440, 520], [336, 640]] as const;

const floor = 18;
const southRadius = 380;
const northRadius = 170;
const eastWestRadius = 330;
const foothillNorth = northRidgeSummit.north - southRadius;
// The shoulder ends at the southern boundary of the formally reserved rock face.
const terraceShoulder = northRidgeNorthWall.south - (northRidgeSummit.north + northRidgeSummit.depth / 2);
const snowColor = '#d6e4f2';
const terrainShoulder = 5;

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function fade(value: number) {
  const clamped = clampUnit(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function northRidgeDistance(east: number, north: number) {
  const northDelta = north - northRidgeSummit.north;
  return Math.hypot((east - northRidgeSummit.east) / eastWestRadius,
    northDelta / (northDelta < 0 ? southRadius : northRadius));
}

function profileAt(distance: number) {
  return floor + (northRidgeSummit.height - floor) * Math.max(0, 1 - distance) ** 1.6;
}

export function northRidgeProfileHeight(east: number, north: number) {
  return profileAt(northRidgeDistance(east, north));
}

function terraceWeight(site: Site, east: number, north: number) {
  const outsideEast = Math.max(0, Math.abs(east - site.east) - site.width / 2);
  const outsideNorth = Math.max(0, Math.abs(north - site.north) - site.depth / 2);
  return 1 - fade(Math.hypot(outsideEast, outsideNorth) / terraceShoulder);
}

export function sampleNorthRidge350(east: number, north: number) {
  let height = northRidgeProfileHeight(east, north);
  const midWeight = terraceWeight(northRidgeMidStation, east, north);
  height += (northRidgeMidStation.height - height) * midWeight;
  const summitWeight = terraceWeight(northRidgeSummit, east, north);
  height += (Math.max(347, height) - height) * summitWeight;
  return height;
}

export function isNorthRidgeNorthWall(east: number, north: number) {
  return east >= northRidgeNorthWall.west && east <= northRidgeNorthWall.east &&
    north >= northRidgeNorthWall.south && north <= northRidgeNorthWall.north;
}

export function sampleNorthRidgeOverTerrain(heightBelow: HeightAt, east: number, north: number) {
  if (north < foothillNorth) return heightBelow(east, north);
  const distance = northRidgeDistance(east, north);
  if (distance >= 1) return heightBelow(east, north);
  // Use the existing terrain sampler's five-metre shoulder convention at the
  // elliptical footprint. The reference profile stays intact further inside.
  const edgeDistance = (1 - distance) * (north <= northRidgeSummit.north ? southRadius : northRadius);
  const blend = fade(edgeDistance / terrainShoulder);
  const underlay = heightBelow(east, north);
  return underlay + (sampleNorthRidge350(east, north) - underlay) * blend;
}

export function createNorthRidge350Block(heightBelow: HeightAt, sampleStep = 2) {
  return buildNorthRidgeMesh(
    (east, north) => sampleNorthRidgeOverTerrain(heightBelow, east, north), foothillNorth, sampleStep,
  );
}

/** Standalone northern mesh with a seam at the existing world's northern edge. */
export function createNorthRidge350NorthernExtension(heightBelow: HeightAt, legacyNorth: number, sampleStep = 2) {
  if (legacyNorth < foothillNorth || legacyNorth >= northRidgeFrame.depth || !Number.isFinite(legacyNorth)) {
    throw new RangeError('Invalid legacy terrain boundary.');
  }
  function heightAt(east: number, north: number) {
    const base = heightBelow(east, Math.min(north, legacyNorth));
    if (north <= legacyNorth) return base;
    const ridge = sampleNorthRidgeOverTerrain(() => base, east, north);
    return base + (ridge - base) * fade((north - legacyNorth) / terrainShoulder);
  }
  return buildNorthRidgeMesh(heightAt, legacyNorth, sampleStep);
}

function buildNorthRidgeMesh(heightAt: HeightAt, startNorth: number, sampleStep: number) {
  if (!Number.isInteger(sampleStep) || sampleStep < 1) throw new RangeError('Use a positive whole-metre grid step.');
  const columns = Math.ceil(northRidgeFrame.width / sampleStep) + 1;
  const rows = Math.ceil((northRidgeFrame.depth - startNorth) / sampleStep) + 1;
  const vertices = new Float32Array(columns * rows * 3);
  for (let row = 0; row < rows; row++) {
    const north = Math.min(northRidgeFrame.depth, startNorth + row * sampleStep);
    for (let column = 0; column < columns; column++) {
      const east = Math.min(northRidgeFrame.width, column * sampleStep);
      const offset = (row * columns + column) * 3;
      vertices[offset] = east;
      vertices[offset + 1] = heightAt(east, north);
      vertices[offset + 2] = -north;
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const here = row * columns + column;
      indices.push(here, here + 1, here + columns, here + 1, here + columns + 1, here + columns);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const material = new MeshLambertMaterial({ color: snowColor });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'north-ridge-350-terrain';
  return {
    mesh, heightAt,
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
