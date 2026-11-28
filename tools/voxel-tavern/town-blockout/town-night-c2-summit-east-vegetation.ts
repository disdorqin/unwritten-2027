import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,MeshLambertMaterial,NearestFilter,Object3D,RGBAFormat,StaticDrawUsage} from 'three';

/**
 * C2 east-sector vegetation and snow-rock clusters (second round).
 *
 * D2 already owns the lowland forest in the cloud band (about 380-560 m).
 * This module fills only the east shoulder's higher belt above that forest,
 * and never plants on the camp, the landform shelves or the reserved D2 sites.
 * Every tree/rock is seated on the one canonical summit heightAt sampler.
 */

export type VegetationHeightAt = (east: number, north: number) => number | undefined;

export const c2EastVegetationSpec = Object.freeze({
  // Above the D2 cloud-band forest top, below the east shoulder crest.
  minHeight: 528, maxHeight: 690,
  sectorWest: 332, sectorSouth: 512,
  shoulder: { east: 590, north: 1080, radius: 210 },
  clear: [
    { east: 742, north: 802, radius: 17 },   // C2-E02 camp deck
    { east: 773.257, north: 739.208, radius: 24 }, // D2 lower-cloud pavilion
    { east: 760, north: 590, radius: 19 },   // D2 east-gully site
    { east: 390, north: 1120, radius: 24 },  // D2 watch ruins
  ],
  palette: ['#31463c', '#426048', '#587154', '#7d8a68', '#c8cfc4', '#e8eee3', '#6d6357', '#3a4b45'] as const,
});

export type VegetationKind = 'pine' | 'flagpine' | 'shrub' | 'rock';
export type VegetationPiece = Readonly<{
  kind: VegetationKind;
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

const hash = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

export function planC2EastVegetation(heightAt: VegetationHeightAt): readonly VegetationPiece[] {
  const out: VegetationPiece[] = [];
  const spec = c2EastVegetationSpec;
  let seed = 0, placed = 0;
  const rand = () => hash(++seed);
  const occupied: { east: number; north: number; radius: number }[] = [];

  function place(e: number, n: number, kind: VegetationKind) {
    const ground = heightAt(e, n);
    if (ground === undefined || !Number.isFinite(ground)) return;
    if (ground < spec.minHeight || ground > spec.maxHeight) return;
    if (e < spec.sectorWest || n < spec.sectorSouth) return;
    const scale = .75 + rand() * .75;
    const base = kind === 'pine' ? 4.4 : kind === 'flagpine' ? 3.8 : kind === 'shrub' ? 1.8 : 2.2;
    const radius = base * scale * .5;
    if (Math.hypot(e - spec.shoulder.east, n - spec.shoulder.north) > spec.shoulder.radius) return;
    if (spec.clear.some(site => Math.hypot(e - site.east, n - site.north) < site.radius + radius)) return;
    // Height/slope bands: pines lower, flagged pines mid, shrub and exposed
    // rock near the crest. No tree is uniformly repeated across the slope.
    const t = (ground - spec.minHeight) / (spec.maxHeight - spec.minHeight);
    if (kind === 'pine' && t > .34) return;
    if (kind === 'flagpine' && (t < .12 || t > .6)) return;
    if (kind === 'shrub' && t < .38) return;
    if (kind === 'rock' && t < .45) return;
    const slope = Math.max(
      Math.abs((heightAt(e + radius, n) ?? Infinity) - ground),
      Math.abs((heightAt(e - radius, n) ?? Infinity) - ground),
      Math.abs((heightAt(e, n + radius) ?? Infinity) - ground),
      Math.abs((heightAt(e, n - radius) ?? Infinity) - ground),
    ) / radius;
    if (slope > (kind === 'rock' ? 1.1 : .62)) return;
    if (occupied.some(o => Math.hypot(e - o.east, n - o.north) < (o.radius + radius) * .9)) return;
    const h = kind === 'pine' ? 10 * scale : kind === 'flagpine' ? 8 * scale : kind === 'shrub' ? 2.2 * scale : 1.7 * scale;
    const shade = kind === 'pine' ? (rand() < .5 ? 0 : 1)
      : kind === 'flagpine' ? (rand() < .5 ? 2 : 7)
      : kind === 'shrub' ? 3 : (rand() < .5 ? 4 : 5);
    out.push({ kind, east: e, north: n, y: ground, w: radius * 2, h, d: radius * 2,
      yaw: rand() * Math.PI * 2, shade });
    occupied.push({ east: e, north: n, radius });
    placed++;
  }

  // Grouped clusters, not evenly spaced tree farming.
  for (let i = 0; i < 320; i++) {
    const ce = spec.shoulder.east - 190 + rand() * 380;
    const cn = spec.shoulder.north - 190 + rand() * 380;
    const ground = heightAt(ce, cn);
    if (ground === undefined) continue;
    const t = (ground - spec.minHeight) / (spec.maxHeight - spec.minHeight);
    if (t < 0 || t > 1) continue;
    const kind: VegetationKind = t < .22 ? 'pine' : t < .42 ? 'flagpine' : t < .65 ? 'shrub' : 'rock';
    const count = kind === 'pine' ? 7 : kind === 'flagpine' ? 5 : 3;
    for (let j = 0; j < count; j++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (kind === 'rock' ? 15 : 22);
      place(ce + Math.cos(a) * r, cn + Math.sin(a) * r, kind);
    }
  }
  return out;
}

function makePaletteTexture() {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = ((x * 3 + y * 17 + (x >> 3) * (y >> 2)) % 15) - 7;
    const value = 255 + grain - (x === 0 || y === 0 ? 18 : 0);
    pixels[i] = Math.min(255, Math.max(0, value - 6));
    pixels[i + 1] = Math.min(255, Math.max(0, value));
    pixels[i + 2] = Math.min(255, Math.max(0, value - 10));
    pixels[i + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.magFilter = NearestFilter; texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2EastVegetation(heightAt: VegetationHeightAt,
  pieces: readonly VegetationPiece[] = planC2EastVegetation(heightAt)) {
  const group = new Group();
  group.name = 'town-night-c2-summit-east-vegetation';
  const texture = makePaletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-east-vegetation-boxes';
  const pose = new Object3D(), tint = new Color();
  pieces.forEach((p, i) => {
    // Trunks and rocks sit on the ground; their authored bottom is y.
    pose.position.set(p.east, p.y + p.h / 2, -p.north);
    pose.rotation.set(0, p.yaw, 0);
    pose.scale.set(p.w, p.h, p.d);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, tint.set(c2EastVegetationSpec.palette[p.shade % 8]!));
  });
  mesh.count = pieces.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);

  // Only trunks and rocks are solid; shrubs are visual-only ground cover.
  const solids = pieces.filter(p => p.kind !== 'shrub');
  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    for (const p of solids) {
      const dx = Math.max(Math.abs(east - p.east) - p.w / 2, 0);
      const dn = Math.max(Math.abs(north - p.north) - p.d / 2, 0);
      if (Math.hypot(dx, dn) < radius && feet + body > p.y && feet < p.y + p.h) return true;
    }
    return false;
  }
  function updateView(east: number, north: number) {
    // One batch: distance visibility is handled by the host LOD/culling.
    mesh.visible = Math.hypot(east - c2EastVegetationSpec.shoulder.east,
      north - c2EastVegetationSpec.shoulder.north) < 900;
  }
  function dispose() {
    group.removeFromParent();
    mesh.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
  }
  return { group, mesh, pieces, solids, blocked, updateView, dispose,
    stats: () => ({ pieces: pieces.length, batches: 1, lights: 0,
      pine: pieces.filter(p => p.kind === 'pine').length,
      flagpine: pieces.filter(p => p.kind === 'flagpine').length,
      shrub: pieces.filter(p => p.kind === 'shrub').length,
      rock: pieces.filter(p => p.kind === 'rock').length }) };
}
