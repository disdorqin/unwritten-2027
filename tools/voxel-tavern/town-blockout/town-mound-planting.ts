import {
  BoxGeometry, ConeGeometry, DataTexture, Group, InstancedMesh, MeshStandardMaterial,
  NearestFilter, Object3D, SRGBColorSpace,
} from 'three';

type Ground = Readonly<{ heightAt: (east: number, north: number) => number | undefined }>;

/**
 * The mound planting — charred forest 36 and the summit wind flags
 * (C3 fifth segment, mound face; batch 64 fixes the count: 24 charred
 * trees on the slope, 12 in the summit ring; batch 92/103 add the
 * summit wind flags). The mound BODY is C2's (ruled centre
 * E-120/N196, r21, h7.5, inside the terrain height authority); this
 * module plants ON whatever surface the live height authority
 * reports — it assumes no dome formula of its own, so when C2's
 * measured surface lands, the same code plants on the real mound.
 *
 * The old work flag at the summit heart is NOT here: it belongs to
 * the six-point mound card (window B rules, already in trunk) and
 * its straightening flag; the wind flags are separate, smaller, and
 * several — do not merge them.
 */

export const moundCentre = { east: -120, north: 196 } as const;
export const moundRadius = 21;
export const slopeTreeCount = 24;
export const summitTreeCount = 12;
export const windFlagCount = 3;

export type MoundPlantingPiece = Readonly<{
  kind: 'charred-tree' | 'wind-flag'; ring: 'slope' | 'summit' | 'flags';
  east: number; north: number; height: number;
}>;

function grain(base: number, fleck: number, streak: number) {
  const size = 16;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const pattern = (x * 11 + y * 7 + Math.floor(x / 3) * y * 3) % 31;
    const color = pattern < 4 ? fleck : x % 7 === 1 && y % 3 !== 0 ? streak : base;
    rgba.set([color >> 16, color >> 8 & 255, color & 255, 255], 4 * (x + size * y));
  }
  const map = new DataTexture(rgba, size, size);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildMoundPlanting(ground: Ground) {
  const tau = 2 * Math.PI;
  const group = new Group();
  group.name = 'mound-planting';
  const placements: MoundPlantingPiece[] = [];
  const trees: Object3D[] = [];
  const flags: Object3D[] = [];
  const random = seeded(0x3636);

  function plant(kind: MoundPlantingPiece['kind'], ring: MoundPlantingPiece['ring'],
    east: number, north: number, angle: number, scale: number, lean: number) {
    const height = ground.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) return;
    if (placements.some(p => Math.hypot(east - p.east, north - p.north) < 1.1)) return;
    const part = new Object3D();
    part.position.set(east, height, -north);
    part.rotation.set(lean, angle, 0);
    part.scale.setScalar(scale);
    part.updateMatrix();
    (kind === 'charred-tree' ? trees : flags).push(part);
    placements.push({ kind, ring, east, north, height });
  }

  // Slope ring: 24 charred trees between the mound's foot and its
  // shoulder (radii 9..18.5 of the ruled 21), leaning like the wind
  // and the burning left them — deterministic tilts, no two alike.
  for (let i = 0; i < slopeTreeCount; i++) {
    const angle = (i + random() * .5) * tau / slopeTreeCount;
    const radius = 9 + (i % 4) * 3.1 + random() * 1.2;
    plant('charred-tree', 'slope',
      moundCentre.east + radius * Math.sin(angle), moundCentre.north + radius * Math.cos(angle),
      angle + random() * .8, .85 + random() * .5, .06 + random() * .16);
  }
  // Summit ring: 12 around the top, inside the old flag's ground.
  for (let i = 0; i < summitTreeCount; i++) {
    const angle = (i + .25) * tau / summitTreeCount;
    const radius = 4.6 + (i % 2) * .7;
    plant('charred-tree', 'summit',
      moundCentre.east + radius * Math.sin(angle), moundCentre.north + radius * Math.cos(angle),
      angle, .7 + random() * .3, .04 + random() * .1);
  }
  // Wind flags: three at the summit's edge, spaced wide — the
  // crater's wind readout, read from the rim and the floor alike.
  for (let i = 0; i < windFlagCount; i++) {
    const angle = i * tau / windFlagCount + .5;
    const radius = 6.8;
    plant('wind-flag', 'flags',
      moundCentre.east + radius * Math.sin(angle), moundCentre.north + radius * Math.cos(angle),
      angle, 1, 0);
  }

  const treeGeometry = new ConeGeometry(.16, 2.6, 5);
  const treeMaterial = new MeshStandardMaterial({
    map: grain(0x2e2a26, 0x453a30, 0x17130f), flatShading: true, roughness: 1 });
  if (trees.length) {
    const batch = new InstancedMesh(treeGeometry, treeMaterial, trees.length);
    batch.name = 'mound-charred-trees';
    trees.forEach((part, index) => {
      part.position.y += 1.3 * part.scale.y;
      part.updateMatrix();
      batch.setMatrixAt(index, part.matrix);
    });
    batch.computeBoundingSphere();
    group.add(batch);
  }
  const flagGeometry = new BoxGeometry(.07, 1.9, .07);
  const flagMaterial = new MeshStandardMaterial({
    map: grain(0x8a4a34, 0xb8b0a0, 0x5d4630), flatShading: true, roughness: 1 });
  if (flags.length) {
    const batch = new InstancedMesh(flagGeometry, flagMaterial, flags.length);
    batch.name = 'mound-wind-flags';
    flags.forEach((part, index) => {
      part.position.y += .95 * part.scale.y;
      part.updateMatrix();
      batch.setMatrixAt(index, part.matrix);
    });
    batch.computeBoundingSphere();
    group.add(batch);
  }
  return { group, placements, batches: group.children.map(child => child.name) };
}
