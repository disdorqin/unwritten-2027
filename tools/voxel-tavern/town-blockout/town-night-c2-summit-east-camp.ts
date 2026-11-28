import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east sector, second round: a wind-sheltered camp on the steep east
 * flank, plus the stone plinth that makes a level standing floor possible.
 *
 * The east shoulder has no natural flat ground (the gentlest sampled patch
 * is still about 48% grade), so the camp is founded on a stepped stone deck
 * that is graded from the canonical surface and supported all the way down
 * to it. The summit field is never rewritten: every support column is cut
 * from `heightAt`, and the deck exists only where the sampled/synthesised
 * difference is bounded.
 */

export type CampHeightAt = (east: number, north: number) => number | undefined;

export const c2EastCampSpec = Object.freeze({
  centre: { east: 742, north: 802 },
  half: 8,
  // Clear of the D2 lower-cloud pavilion (773/739) and the east-gully site.
  reserved: [
    { east: 773.257, north: 739.208, radius: 20 },
    { east: 760, north: 590, radius: 16 },
  ],
  sectorWest: 300, sectorSouth: 480,
  palette: ['#c9c1ab', '#e5dcc5', '#8d8577', '#f2ead4', '#a39882', '#fff5e0', '#6f6a61', '#d8cbb0'] as const,
});

export type CampPiece = Readonly<{
  family: 'plinth' | 'hut' | 'fire' | 'flag';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

function reservedDistance(e: number, n: number) {
  let closest = Infinity;
  for (const site of c2EastCampSpec.reserved) {
    closest = Math.min(closest, Math.hypot(e - site.east, n - site.north) - site.radius);
  }
  return closest;
}

/** Deck datum is the highest sampled corner, so no support column is buried. */
export function campDeckDatum(heightAt: CampHeightAt): number | undefined {
  const c = c2EastCampSpec.centre, h = c2EastCampSpec.half;
  let highest = -Infinity;
  for (const de of [-h, 0, h]) for (const dn of [-h, 0, h]) {
    const y = heightAt(c.east + de, c.north + dn);
    if (y === undefined || !Number.isFinite(y)) return undefined;
    highest = Math.max(highest, y);
  }
  return Number.isFinite(highest) ? highest + .4 : undefined;
}

export function planC2EastCamp(heightAt: CampHeightAt): readonly CampPiece[] {
  const datum = campDeckDatum(heightAt);
  if (datum === undefined) return [];
  const out: CampPiece[] = [];
  const c = c2EastCampSpec.centre, half = c2EastCampSpec.half;
  const push = (family: CampPiece['family'], e: number, n: number, bottom: number,
    w: number, h: number, d: number, yaw = 0, shade = 0) => {
    if (e < c2EastCampSpec.sectorWest || n < c2EastCampSpec.sectorSouth) return;
    if (reservedDistance(e, n) < 2) return;
    out.push({ family, east: e, north: n, y: bottom, w, h, d, yaw, shade });
  };

  // Deck: 4x4 cut stones over the 16 m square, each with a support column
  // down to the exact sampled ground below it.
  const cells = 4, cell = (half * 2) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const e = c.east - half + cell * (i + .5);
      const n = c.north - half + cell * (j + .5);
      const ground = heightAt(e, n);
      if (ground === undefined || datum - ground > 7) continue;
      const top = datum - .12;
      push('plinth', e, n, top, cell - .12, .24, cell - .12, 0, (i + j) % 5);
      // A solid masonry mass, not four stilts. The deck must read as a stone
      // shoulder grown out of the slope: the summit renders at 100 m in the
      // far LOD and 16 m up close, so a thin column keyed to the 8 m sampler
      // would hang in the air at either LOD. Stack full-cell courses down to
      // the sampled ground and bury the final course a further 4 m.
      const foot = ground - 4;
      const courses = Math.max(1, Math.ceil((top - foot) / 1.6));
      const rise = (top - foot) / courses;
      for (let k = 0; k < courses; k++) {
        push('plinth', e, n, foot + rise * k, cell - .12 - k * .06,
          rise + .02, cell - .12 - k * .06, 0, 5 + (k % 2));
      }
    }
  }
  // Perimeter lip stones make the deck edge readable and stop a walker from
  // stepping straight off into the grade.
  for (let i = 0; i < cells; i++) {
    for (const side of [-1, 1]) {
      const e = c.east - half + cell * (i + .5);
      const nSide = c.north + side * (half - .1);
      push('plinth', e, nSide, datum, cell - .1, .42, .55, 0, 2);
      const eSide = c.east + side * (half - .1);
      const n = c.north - half + cell * (i + .5);
      push('plinth', eSide, n, datum, .55, .42, cell - .1, 0, 2);
    }
  }

  // Stone-and-timber wind hut on the uphill side of the deck. The door faces
  // downhill (south); the back wall is solid against the prevailing wind.
  push('hut', c.east - 2.2, c.north + 3.2, datum, 6.4, 3.6, 4.2, 0, 3);   // back
  push('hut', c.east - 5.5, c.north + .8, datum, .9, 3.6, 5.6, 0, 5);     // west jamb
  push('hut', c.east + 1.1, c.north + .8, datum, .9, 3.6, 5.6, 0, 5);     // east jamb
  push('hut', c.east - 2.2, c.north + 3.4, datum + 3.6, 8, .45, 5.2, 0, 2); // roof slab
  // A low bench on the sheltered side.
  push('hut', c.east - 2.2, c.north + 1.2, datum, 4.6, .55, 1.1, 0, 4);

  // Camp fire: a stone ring with an unlit ember bed. No real light and no
  // particle system; the warm read comes from the palette only.
  const fire = { east: c.east + 2.6, north: c.north - 3.2 };
  push('fire', fire.east, fire.north, datum, 2.3, .18, 2.3, 0, 6);
  for (let i = 0; i < 8; i++) {
    const theta = i / 8 * Math.PI * 2;
    push('fire', fire.east + Math.cos(theta) * 1.65, fire.north + Math.sin(theta) * 1.65,
      datum + .18, .7, .34, .7, theta, i % 2 ? 1 : 4);
  }

  // Wind sock mast: a real pole plus two cloth tabs, no animation authority.
  push('flag', c.east + 5.8, c.north - 5.4, datum, .32, 6.2, .32, 0, 5);
  push('flag', c.east + 6.7, c.north - 5.4, datum + 4.8, 1.8, .9, .08, 0, 7);
  push('flag', c.east + 6.5, c.north - 5.4, datum + 3.7, 1.4, .7, .08, 0, 7);

  return out;
}

function makePaletteTexture() {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = ((x * 5 + y * 13 + (x >> 2) * (y >> 3)) % 17) - 8;
    const value = 255 + grain - (x === 0 || y === 0 ? 16 : 0);
    pixels[i] = Math.min(255, Math.max(0, value));
    pixels[i + 1] = Math.min(255, Math.max(0, value - 3));
    pixels[i + 2] = Math.min(255, Math.max(0, value - 9));
    pixels[i + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = NearestFilter; texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2EastCamp(heightAt: CampHeightAt, pieces: readonly CampPiece[] = planC2EastCamp(heightAt)) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-camp';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-camp-boxes';
  const pose = new Object3D(), tint = new Color();
  pieces.forEach((p, i) => {
    pose.position.set(p.east, p.y + p.h / 2, -p.north);
    pose.rotation.set(0, p.yaw, 0);
    pose.scale.set(p.w, p.h, p.d);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, tint.set(c2EastCampSpec.palette[p.shade % 8]!));
  });
  mesh.count = pieces.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  // The deck datum is walkable; hut, hearth ring, mast and parapet are solid.
  const solids = pieces.filter(p => p.family !== 'plinth' || p.h > .3 || p.y < (campDeckDatum(heightAt) ?? 0) - .2);
  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    for (const p of solids) {
      const dx = Math.max(Math.abs(east - p.east) - p.w / 2, 0);
      const dn = Math.max(Math.abs(north - p.north) - p.d / 2, 0);
      if (Math.hypot(dx, dn) < radius && feet + body > p.y && feet < p.y + p.h) return true;
    }
    return false;
  }
  function dispose() {
    group.removeFromParent();
    mesh.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
  }
  return { group, mesh, pieces, solids, blocked, dispose,
    stats: () => ({ pieces: pieces.length, batches: 1, lights: 0,
      deckDatum: campDeckDatum(heightAt),
      hut: pieces.filter(p => p.family === 'hut').length,
      fire: pieces.filter(p => p.family === 'fire').length,
      flag: pieces.filter(p => p.family === 'flag').length }) };
}
