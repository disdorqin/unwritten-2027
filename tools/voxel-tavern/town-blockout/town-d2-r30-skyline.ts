import { BufferGeometry, Float32BufferAttribute, Color } from 'three';
import { mainSummitBounds } from './main-summit-block';
import { buildTownD2R30ChunkGeometry } from './town-d2-r30-massif';
import {
  sampleTownD2R30Height, townD2R30GridAxis, townD2R30Spec,
} from './town-d2-r30-domain';

/**
 * Distant town-view silhouette of the real D2 massif.
 *
 * 2026-11-27 P0 fix ("巨型彩色斜墙"): the previous revision connected every
 * boundary edge to a flared foot at Y=-100 (east*1.22, north+140). Rendered
 * DoubleSide/fog:false that is a giant coloured curtain with no collision,
 * which is exactly the wall the live-play review saw. A distant shell is
 * still legitimate LOD, but its skirt must be the SAME closed, grounded
 * perimeter the walkable massif uses: vertical walls down to the canonical
 * floor and a bottom cap, no flare, no offset, no sub-floor spike.
 *
 * This module owns only geometry. The viewer material (side/fog) is window A's
 * file; `userData.skylineMaterial` records the intended closed-mesh setting.
 */
const deepRock = new Color('#414b53');
/** Atmospheric haze for the far silhouette: distant lowlands fade toward this
 * cool grey-blue while high peaks stay clear, matching the reference far/near
 * join without creating a second height source. */
const SKYLINE_HAZE = new Color('#9bacad');
const SKYLINE_SOUTH = 600;
const SKYLINE_ARRIVAL = 347;

const smoothstep = (lower: number, upper: number, value: number) => {
  const weight = Math.max(0, Math.min(1, (value - lower) / (upper - lower)));
  return weight * weight * (3 - 2 * weight);
};

export const townD2R30SkylineContract = Object.freeze({
  south: SKYLINE_SOUTH,
  north: mainSummitBounds.north,
  spacing: townD2R30Spec.farSpacing,
  floorHeight: townD2R30Spec.floorHeight,
  arrivalHeight: SKYLINE_ARRIVAL,
  /** No lateral flare and no north offset: the skirt is vertical. */
  outerExpansion: 1,
  skirtNorthOffset: 0,
  /** A closed shell can be drawn FrontSide with ordinary distance fog. */
  material: Object.freeze({ side: 'front', fog: true, vertexColors: true }),
});

export function buildR30TownSkyline() {
  const { west, east, north } = mainSummitBounds;
  const south = SKYLINE_SOUTH;
  const spacing = townD2R30Spec.farSpacing;
  const top = buildTownD2R30ChunkGeometry({
    key: 'town-skyline', row: 0, column: 0, west, east, south, north,
    centreEast: 0, centreNorth: (south + north) / 2,
  }, spacing, SKYLINE_ARRIVAL);
  const positions = Array.from(top.getAttribute('position').array);
  const colors = Array.from(top.getAttribute('color').array);
  const indices = Array.from(top.getIndex()!.array);
  const topCount = positions.length / 3;

  const eastAxis = townD2R30GridAxis(west, east, spacing);
  const northAxis = townD2R30GridAxis(south, north, spacing);
  const columns = eastAxis.length;
  const rows = northAxis.length;
  const vertexAt = (column: number, row: number) => row * columns + column;

  // R4 atmospheric haze: the distant silhouette reads lighter and cooler at
  // low altitude and keeps its clear massif colour near the peaks, so the far
  // skyline matches the reference far/near join without a second height
  // source. Only the vertex colour changes; every top Y still samples the
  // canonical height field exactly (sector-audit nearFarSameSource stays <1e-4).
  const hazeTemp = new Color();
  for (let index = 0; index < topCount; index++) {
    const height = positions[index * 3 + 1]!;
    const hazeWeight = smoothstep(townD2R30Spec.baseHeight, townD2R30Spec.summitHeight, height);
    if (hazeWeight >= 1) continue;
    hazeTemp.setRGB(colors[index * 3]!, colors[index * 3 + 1]!, colors[index * 3 + 2]!);
    hazeTemp.lerp(SKYLINE_HAZE, 1 - hazeWeight);
    colors[index * 3] = hazeTemp.r;
    colors[index * 3 + 1] = hazeTemp.g;
    colors[index * 3 + 2] = hazeTemp.b;
  }

  // Perimeter in the same winding massifPerimeter uses: south face L→R,
  // east face S→N, north face R→L, west face N→S. One shared ring so the
  // skirt and the bottom cap have no T-junctions.
  const ring: number[] = [];
  for (let column = 0; column < columns; column++) ring.push(vertexAt(column, 0));
  for (let row = 1; row < rows; row++) ring.push(vertexAt(columns - 1, row));
  for (let column = columns - 2; column >= 0; column--) ring.push(vertexAt(column, rows - 1));
  for (let row = rows - 2; row >= 1; row--) ring.push(vertexAt(0, row));

  // Vertical skirt: each foot keeps its top vertex's east/-north exactly and
  // drops to the canonical floor. The foot colour blends the hazed top colour
  // into deep rock, so the skirt reads as a real rock massif rather than a
  // flat coloured wall. No x*1.22, no north+140, no -100 anywhere.
  const feet = new Map<number, number>();
  const skirtTemp = new Color();
  for (const topIndex of ring) {
    if (feet.has(topIndex)) continue;
    const footIndex = positions.length / 3;
    positions.push(
      positions[topIndex * 3]!,
      townD2R30Spec.floorHeight,
      positions[topIndex * 3 + 2]!,
    );
    skirtTemp.setRGB(colors[topIndex * 3]!, colors[topIndex * 3 + 1]!, colors[topIndex * 3 + 2]!);
    skirtTemp.lerp(deepRock, .58);
    colors.push(skirtTemp.r, skirtTemp.g, skirtTemp.b);
    feet.set(topIndex, footIndex);
  }
  for (let index = 0; index < ring.length; index++) {
    const here = ring[index]!, next = ring[(index + 1) % ring.length]!;
    const footHere = feet.get(here)!, footNext = feet.get(next)!;
    indices.push(here, footHere, next, next, footHere, footNext);
  }

  // Bottom cap at the same floor height; a closed shell has no see-through
  // sides from any camera and needs no DoubleSide crutch.
  const centre = positions.length / 3;
  positions.push(0, townD2R30Spec.floorHeight, -(south + north) / 2);
  colors.push(deepRock.r, deepRock.g, deepRock.b);
  for (let index = 0; index < ring.length; index++) {
    const here = feet.get(ring[index]!)!, next = feet.get(ring[(index + 1) % ring.length]!)!;
    indices.push(centre, next, here);
  }

  const result = new BufferGeometry();
  result.name = 'town-d2-r30-same-source-skyline';
  result.setAttribute('position', new Float32BufferAttribute(positions, 3));
  result.setAttribute('color', new Float32BufferAttribute(colors, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  result.userData.r30TopVertexCount = topCount;
  result.userData.r30FootHeight = townD2R30Spec.floorHeight;
  result.userData.r30RingVertexCount = ring.length;
  result.userData.r30ClosedShell = true;
  result.userData.skylineMaterial = { ...townD2R30SkylineContract.material };
  top.dispose();
  return result;
}
