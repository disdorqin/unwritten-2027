import {
  BoxGeometry, BufferGeometry, CanvasTexture, DataTexture, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { createTerrainGrid } from './terrain';

type Terrain = ReturnType<typeof createTerrainGrid>;

const palette = {
  stone: '#8a8378', stoneDark: '#5d564c', ochre: '#a98a56', earth: '#5d4630',
  timberLight: '#a36b48', pineGreen: '#44503c', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', slate: '#4b5066', paper: '#e8e0cc', flagRed: '#aa5147', gold: '#c68d4d',
} as const;

function pixelMaterial(base: string, shade: string, seed: number, accent = shade) {
  const tones = [base, shade, accent].map(color => Number.parseInt(color.slice(1), 16));
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = (Math.imul(x + 11, 733) ^ Math.imul(y + 13, 199) ^ seed) & 15;
      const crack = (2 * y + x + Math.floor(x / 4)) % 17 === 0;
      const tone = tones[crack ? 2 : Number(grain < 4)];
      data.set([tone >>> 16, (tone >>> 8) & 255, tone & 255, 255], 4 * (y * size + x));
    }
  }
  const map = new DataTexture(data, size, size);
  map.magFilter = map.minFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 1 });
}

/** The town emblem: a half moon with a falling arc (船徽/镇志纹样, drawn, never captioned). */
export function drawHalfMoonFallingArc(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * .14;
  ctx.beginPath();
  ctx.arc(cx, cy, r * .62, Math.PI * .35, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + r * .3, cy - r * .28, r * .34, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * .1;
  ctx.beginPath();
  ctx.arc(cx + r * .1, cy - r * .1, r * 1.05, Math.PI * 1.05, Math.PI * 1.62);
  ctx.stroke();
  ctx.restore();
}

/**
 * Shankou node scenery (corridor spec scenery set, sequence 4): boundary stone,
 * timber gate arch with the town flag, the guard's duty shelter, and the
 * town-side wooden sign. Scenery only — the pass itself is guarded by people
 * (ZB-28), never by these pieces; the walkable corridor is window A's build.
 * All four stand east of the rail portal stub, around the corridor mouth.
 */
export function buildShankouNodeScenery(grid: Terrain) {
  const group = new Group();
  group.name = 'shankou-node-scenery';

  const stone = pixelMaterial(palette.stone, palette.stoneDark, 59, palette.earth);
  const stoneDark = pixelMaterial(palette.stoneDark, palette.night, 97, palette.stone);
  const timber = pixelMaterial(palette.earth, palette.night, 41, palette.stone);
  const timberWarm = pixelMaterial(palette.ochre, palette.earth, 79, palette.timberLight);
  const greenWood = pixelMaterial(palette.pineGreen, palette.night, 113, palette.earth);
  const slate = pixelMaterial(palette.slate, palette.night, 151, palette.stone);
  const snow = pixelMaterial(palette.snow, palette.stone, 211);
  const emberMat = new MeshStandardMaterial({
    color: palette.ember, emissive: palette.ember, emissiveIntensity: 1.1, roughness: .9,
  });

  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  function push(mat: MeshStandardMaterial, g: BufferGeometry) {
    const batch = batches.get(mat) ?? [];
    batch.push(g);
    batches.set(mat, batch);
  }
  function part(mat: MeshStandardMaterial, geo: BufferGeometry, east: number, h: number, north: number,
    yaw = 0, pitch = 0, roll = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (roll) g.rotateZ(roll);
    if (pitch) g.rotateX(pitch);
    if (yaw) g.rotateY(yaw);
    g.translate(east, h, -north);
    push(mat, g);
    if (g !== geo) geo.dispose();
  }
  function box(mat: MeshStandardMaterial, east: number, h: number, north: number,
    sx: number, sy: number, sz: number, yaw = 0, pitch = 0, roll = 0) {
    part(mat, new BoxGeometry(sx, sy, sz), east, h, north, yaw, pitch, roll);
  }
  /** A canvas face standing off a piece, looking along (fe, fn) in (east, north).
   * The canvas keeps the plane's own aspect so glyphs are never stretched. */
  function face(east: number, h: number, north: number, fe: number, fn: number, off: number,
    w: number, hh: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * 220); canvas.height = Math.round(hh * 220);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, canvas.width, canvas.height);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const plane = new Mesh(
      new PlaneGeometry(w, hh),
      new MeshBasicMaterial({ map: texture, side: 2 }),
    );
    plane.position.set(east + fe * off, h, -(north + fn * off));
    plane.rotation.y = Math.atan2(fe, -fn);
    group.add(plane);
  }

  const sites: { id: string; east: number; north: number }[] = [];
  const site = (id: string, east: number, north: number) => {
    sites.push({ id, east, north });
    return { east, north };
  };

  // ---------- timber gate arch （牌坊） across the corridor mouth, town flag ----------
  {
    const { east, north } = site('gate-arch', 306, 530);
    const gw = grid.heightAt(302.5, 530), ge = grid.heightAt(309.5, 530);
    for (const [px, g] of [[302.5, gw], [309.5, ge]] as const) {
      box(stone, px, g + .25, north, 1, .5, 1);
      box(timber, px, g + 2.55, north, .34, 4.6, .34);
    }
    const top = Math.max(gw, ge);
    box(timber, east, top + 4.62, north, 8.6, .42, .5);
    box(timber, east, top + 3.3, north, 7.6, .3, .36);
    box(slate, east, top + 5.02, north, 9, .16, 1.1);
    box(snow, east, top + 5.16, north, 9, .12, 1);
    for (const s of [-1, 1]) box(timberWarm, east + s * 3.1, top + 3.95, north, .18, .95, .18);
    // Town flag under the top beam: red field, gold half-moon falling arc.
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 340;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = palette.flagRed; ctx.fillRect(0, 0, 256, 340);
        ctx.strokeStyle = 'rgba(60,20,16,.6)'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 240, 324);
        drawHalfMoonFallingArc(ctx, 128, 150, 74, palette.gold);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const flag = new Mesh(
          new PlaneGeometry(1.15, 1.55),
          new MeshBasicMaterial({ map: texture, side: 2 }),
        );
        flag.position.set(east, top + 3.62, -north - .42);
        group.add(flag);
        box(timber, east, top + 4.42, north - .42, 1.3, .07, .07);
      }
    }
  }

  // ---------- boundary stone （界石）: 「山口」 + the emblem, facing town ----------
  {
    const { east, north } = site('boundary-stone', 300.5, 527);
    const g = grid.heightAt(east, north);
    box(stoneDark, east, g + .22, north, 1.7, .44, .9);
    box(stone, east, g + 1.42, north, 1.15, 2, .4);
    box(stone, east, g + 2.52, north, .95, .22, .34);
    face(east, g + 1.42, north, 0, -1, .22, .95, 1.8, (c, w, h) => {
      c.fillStyle = '#8a8378'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2e2a24';
      c.font = `bold ${Math.round(h * .3)}px "Noto Sans SC", serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('山', w / 2, h * .27);
      c.fillText('口', w / 2, h * .58);
      drawHalfMoonFallingArc(c, w / 2, h * .84, h * .07, '#3a342a');
    });
  }

  // ---------- guard duty shelter: the crater shed's make, in pine green ----------
  {
    const { east, north } = site('guard-shelter', 314, 522);
    const g = grid.heightAt(east, north);
    const yaw = -Math.PI / 2; // open side faces west, toward the gate
    const fr = { e: Math.sin(yaw), n: Math.cos(yaw) };
    const at = (dx: number, dz: number) => ({
      east: east + Math.cos(yaw) * dx + fr.e * dz,
      north: north - Math.sin(yaw) * dx + fr.n * dz,
    });
    for (const [px, pz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]] as const) {
      const p = at(px, pz);
      box(greenWood, p.east, g + 1.25, p.north, .2, 2.5, .2, yaw);
    }
    const back = at(0, -1.32);
    box(greenWood, back.east, g + 1.2, back.north, 3.6, 2.4, .12, yaw);
    box(slate, east, g + 2.68, north, 4.3, .16, 3.4, yaw, .07);
    box(snow, east, g + 2.84, north, 4.1, .12, 3.2, yaw, .07);
    const bench = at(-.7, .4);
    box(greenWood, bench.east, g + .5, bench.north, 1.7, .09, .45, yaw);
    const brazier = at(.8, .5);
    box(stoneDark, brazier.east, g + .3, brazier.north, .62, .6, .62, yaw);
    box(emberMat, brazier.east, g + .68, brazier.north, .44, .12, .44, yaw);
    for (let i = 0; i < 4; i++) {
      const log = at(-1.15 + (i % 2) * .3, -.75 + Math.floor(i / 2) * .28);
      box(timber, log.east, g + .16 + Math.floor(i / 2) * .24, log.north, .95, .2, .22, yaw + (i % 2) * .16);
    }
  }

  // ---------- town-side wooden sign ----------
  {
    const { east, north } = site('town-sign', 303, 492);
    const g = grid.heightAt(east, north);
    for (const s of [-1, 1]) box(timber, east + s * .85, g + 1, north, .13, 2, .13);
    box(timberWarm, east, g + 1.95, north, 2.2, 1.1, .08);
    face(east, g + 1.95, north, 0, -1, .07, 2.05, .95, (c, w, h) => {
      c.fillStyle = '#a36b48'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#2e2015'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold ${Math.round(h * .42)}px "Noto Sans SC", sans-serif`;
      c.fillText('山口', w / 2, h * .34);
      c.font = `bold ${Math.round(h * .24)}px "Noto Sans SC", sans-serif`;
      c.fillText('站、道皆往北', w / 2, h * .76);
    });
  }

  for (const [mat, geos] of batches) {
    const joined = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
    if (!joined) continue;
    joined.computeBoundingSphere();
    const mesh = new Mesh(joined, mat);
    mesh.name = `shankou-scenery-${mat.uuid.slice(0, 6)}`;
    group.add(mesh);
  }
  return { group, sites };
}
