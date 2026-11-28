import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, third-round rest shelter with interior dressing
 * (2026-11-27 four-sector sprint, atlas cell `rest-shelter-interior`).
 *
 * A walk-in rest shelter on a stone shoulder of the east subpeak's south
 * flank: a level stone deck on stacked masonry footings, a stone-and-timber
 * shell with a south-facing door, and the interior life the shell implies —
 * hearth, benches, a shelf, a sleeping platform, a pot and a wall lamp. The
 * summit field is never rewritten: the deck datum is the highest sampled
 * corner, and every footing is cut from `heightAt`.
 *
 * This module never owns a height function, never grades terrain, never
 * declares a world anchor / presence / loot / gate authority, and emits
 * nothing at E<300 / N<480 or inside the 32 m shared boundary. It does not
 * touch the E02 camp (742/802), the E05 sled chute, the E01 landform, or any
 * D2 site; those stay clear.
 */

export type ShelterHeightAt = (east: number, north: number) => number | undefined;

export const c2EastShelterSpec = Object.freeze({
  centre: { east: 620, north: 860 },
  half: 7,
  reserved: [
    { east: 773.257, north: 739.208, radius: 20 }, // lower-cloud pavilion (D2)
    { east: 760, north: 590, radius: 16 },         // east-gully site (D2)
    { east: 390, north: 1120, radius: 22 },        // skywatch ruins (D2)
  ],
  sectorWest: 300, sectorSouth: 480,
  palette: [
    '#c9c1ab', // 0 stone plinth
    '#e5dcc5', // 1 light stone (lamp)
    '#8d8577', // 2 dark stone (roof)
    '#6b5035', // 3 dark timber wall
    '#8a6a45', // 4 timber furnishing
    '#4a3827', // 5 dark timber (bed/shelf)
    '#d4622e', // 6 ember
    '#f0ebd9', // 7 bedding/pot
  ] as const,
});

export type ShelterPiece = Readonly<{
  family: 'plinth' | 'wall' | 'roof' | 'hearth' | 'furnish';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastShelterSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Deck datum is the highest sampled corner, so no footing is buried. */
export function shelterDeckDatum(heightAt: ShelterHeightAt): number | undefined {
  const c = c2EastShelterSpec.centre, h = c2EastShelterSpec.half;
  let highest = -Infinity;
  for (const de of [-h, 0, h]) for (const dn of [-h, 0, h]) {
    const y = heightAt(c.east + de, c.north + dn);
    if (y === undefined || !Number.isFinite(y)) return undefined;
    highest = Math.max(highest, y);
  }
  return Number.isFinite(highest) ? highest + .4 : undefined;
}

export function planC2EastShelter(heightAt: ShelterHeightAt): readonly ShelterPiece[] {
  const datum = shelterDeckDatum(heightAt);
  if (datum === undefined) return [];
  const out: ShelterPiece[] = [];
  const c = c2EastShelterSpec.centre, half = c2EastShelterSpec.half;
  const push = (family: ShelterPiece['family'], e: number, n: number, bottom: number,
    w: number, h: number, d: number, yaw = 0, shade = 0) => {
    if (e < c2EastShelterSpec.sectorWest || n < c2EastShelterSpec.sectorSouth) return;
    if (reservedDistance(e, n) < 2) return;
    out.push({ family, east: e, north: n, y: bottom, w, h, d, yaw, shade });
  };

  // Deck: 4x4 cut stones over the 14 m square, each with stacked masonry
  // courses down to the exact sampled ground below it (solid shoulder, not
  // stilts). Reuses the E02 camp footing pattern.
  const cells = 4, cell = (half * 2) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const e = c.east - half + cell * (i + .5);
      const n = c.north - half + cell * (j + .5);
      const ground = heightAt(e, n);
      if (ground === undefined || datum - ground > 7) continue;
      const top = datum - .12;
      push('plinth', e, n, top, cell - .12, .24, cell - .12, 0, (i + j) % 5);
      const foot = ground - 4;
      const courses = Math.max(1, Math.ceil((top - foot) / 1.6));
      const rise = (top - foot) / courses;
      for (let k = 0; k < courses; k++) {
        push('plinth', e, n, foot + rise * k, cell - .12 - k * .06,
          rise + .02, cell - .12 - k * .06, 0, 5 + (k % 2));
      }
    }
  }
  // Perimeter lip stones make the deck edge readable.
  for (let i = 0; i < cells; i++) {
    for (const side of [-1, 1]) {
      const e = c.east - half + cell * (i + .5);
      push('plinth', e, c.north + side * (half - .1), datum, cell - .1, .42, .55, 0, 2);
      const eSide = c.east + side * (half - .1);
      const n = c.north - half + cell * (i + .5);
      push('plinth', eSide, n, datum, .55, .42, cell - .1, 0, 2);
    }
  }

  // Stone-and-timber shell: back wall against the hill, east/west jambs,
  // south wall split around a south-facing door. Roof slab on top.
  push('wall', c.east, c.north + 3.5, datum, 9, 3.5, .8, 0, 3);     // back
  push('wall', c.east - 4.5, c.north, datum, .8, 3.5, 7, 0, 4);    // west jamb
  push('wall', c.east + 4.5, c.north, datum, .8, 3.5, 7, 0, 4);    // east jamb
  push('wall', c.east - 2.8, c.north - 3.5, datum, 2.8, 3.5, .8, 0, 3); // south left of door
  push('wall', c.east + 2.8, c.north - 3.5, datum, 2.8, 3.5, .8, 0, 3); // south right of door
  push('roof', c.east, c.north, datum + 3.5, 9.4, .5, 7.4, 0, 2);   // roof slab
  // Door lintel over the south opening.
  push('wall', c.east, c.north - 3.5, datum + 2.6, 2.4, .9, .8, 0, 4);

  // Interior dressing on the deck top. The hearth is the focus; benches, a
  // shelf, a sleeping platform, a pot and a wall lamp fill the rest. No real
  // light source: the lamp is palette-only.
  // Hearth: stone ring with an ember bed at the centre.
  const hearth = { east: c.east, north: c.north };
  push('hearth', hearth.east, hearth.north, datum, 1.6, .18, 1.6, 0, 0);
  for (let i = 0; i < 8; i++) {
    const theta = i / 8 * Math.PI * 2;
    push('hearth', hearth.east + Math.cos(theta) * 1.15, hearth.north + Math.sin(theta) * 1.15,
      datum + .18, .55, .34, .55, theta, i % 2 ? 2 : 1);
  }
  push('hearth', hearth.east, hearth.north, datum + .18, .5, .22, .5, 0, 6); // ember
  // Two benches flanking the hearth.
  push('furnish', c.east - 2.4, c.north + 1.4, datum, 2.2, .5, .9, 0, 4);
  push('furnish', c.east + 2.4, c.north + 1.4, datum, 2.2, .5, .9, 0, 4);
  // Shelf against the back wall.
  push('furnish', c.east, c.north + 2.6, datum, 2.4, 2, .7, 0, 5);
  push('furnish', c.east, c.north + 2.6, datum + 1.2, 2.2, .25, .6, 0, 1); // shelf top
  // Sleeping platform in the east corner: boards plus a bedding roll.
  push('furnish', c.east + 3.4, c.north + 1.4, datum, 2.2, .3, 2, 0, 5);
  push('furnish', c.east + 3.4, c.north + 1.4, datum + .3, 2, .3, 1.8, 0, 7);
  // A pot in the west corner.
  push('furnish', c.east - 3.4, c.north + 1.6, datum, .8, .9, .8, 0, 7);
  // Wall lamp on the back wall (visual only, no light authority).
  push('furnish', c.east, c.north + 3.5, datum + 2.4, .6, .5, .35, 0, 1);

  return out;
}

function makePaletteTexture() {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = ((x * 7 + y * 11 + (x >> 2) * (y >> 3)) % 19) - 9;
      const seam = x === 0 || y === 0 ? -14 : 0;
      const value = 255 + grain + seam;
      pixels[i] = Math.min(255, Math.max(0, value));
      pixels[i + 1] = Math.min(255, Math.max(0, value - 2));
      pixels[i + 2] = Math.min(255, Math.max(0, value - 6));
      pixels[i + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2EastShelter(
  heightAt: ShelterHeightAt,
  pieces: readonly ShelterPiece[] = planC2EastShelter(heightAt),
) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-shelter';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-shelter-boxes';
  const transform = new Object3D();
  const tint = new Color();
  const box = new Matrix4();
  let index = 0;
  for (const piece of pieces) {
    transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
    transform.rotation.set(0, piece.yaw, 0);
    transform.scale.set(piece.w, piece.h, piece.d);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(c2EastShelterSpec.palette[piece.shade % 8]!));
    index++;
  }
  mesh.count = index;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  const colliders = pieces.map(p => ({
    west: p.east - Math.max(p.w, p.d) / 2, east: p.east + Math.max(p.w, p.d) / 2,
    south: p.north - Math.max(p.w, p.d) / 2, north: p.north + Math.max(p.w, p.d) / 2,
    bottom: p.y, top: p.y + p.h,
  }));
  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    for (const c of colliders) {
      const dx = Math.max(c.west - east, 0, east - c.east);
      const dn = Math.max(c.south - north, 0, north - c.north);
      if (Math.hypot(dx, dn) < radius && feet + body > c.bottom && feet < c.top) return true;
    }
    return false;
  }
  function dispose() {
    group.removeFromParent();
    mesh.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }
  return { group, mesh, pieces, colliders, blocked, dispose,
    stats: () => ({
      pieces: pieces.length, batches: 1, lights: 0,
      plinth: pieces.filter(p => p.family === 'plinth').length,
      wall: pieces.filter(p => p.family === 'wall').length,
      roof: pieces.filter(p => p.family === 'roof').length,
      hearth: pieces.filter(p => p.family === 'hearth').length,
      furnish: pieces.filter(p => p.family === 'furnish').length,
    }) };
}
