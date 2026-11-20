import { BoxGeometry, DataTexture, MeshLambertMaterial, NearestFilter, SRGBColorSpace } from 'three';

const pixelsPerMetre = 24;
const rust = 0x8a4a34;
const runoff = 0x5d4630;
const bareMetal = 0x8a8378;

function grain(x: number, y: number, seed: number) {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 83, 668265263) ^ Math.imul(seed, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Bake each face at the same world scale, including the thin edges of the box. */
export function createClayMetalPanel(width: number, height: number, depth: number, baseColor: number, seed: number) {
  const dimensions = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]] as const;
  let atlasWidth = 0;
  const faces = dimensions.map(([w, h]) => {
    const face = { x: atlasWidth, width: Math.max(1, Math.round(w * pixelsPerMetre)),
      height: Math.max(1, Math.round(h * pixelsPerMetre)) };
    atlasWidth += face.width;
    return face;
  });
  const atlasHeight = Math.max(...faces.map(face => face.height));
  const texels = new Uint8Array(atlasWidth * atlasHeight * 4);
  const geometry = new BoxGeometry(width, height, depth);
  const uvs = geometry.attributes.uv!;
  const indices = geometry.index!;

  for (const [faceIndex, face] of faces.entries()) {
    const faceSeed = seed + faceIndex * 47;
    const { width: w, height: h, x: offset } = face;
    const paint = (x: number, y: number, color: number, shade = 1) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const pixel = ((h - 1 - y) * atlasWidth + offset + x) * 4;
      texels[pixel] = Math.min(255, Math.round((color >> 16 & 255) * shade));
      texels[pixel + 1] = Math.min(255, Math.round((color >> 8 & 255) * shade));
      texels[pixel + 2] = Math.min(255, Math.round((color & 255) * shade));
      texels[pixel + 3] = 255;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const edge = Math.min(x, y, w - x - 1, h - y - 1);
        const patches = grain(Math.floor(x / 4), Math.floor(y / 3), faceSeed) % 5;
        const speck = grain(x, y, faceSeed) % 3;
        const shade = edge === 0 ? .58 : edge === 1 ? .77 : .86 + patches * .045 + speck * .025;
        paint(x, y, baseColor, shade);
      }
    }
    for (let y = 2; y < h - 4; y += 16) {
      for (let x = 2; x < w - 4; x += 16) {
        const spot = grain(x, y, faceSeed);
        if (spot % 5 > 1) continue;
        const cx = x + 2 + (spot >>> 8) % 10;
        const cy = y + (spot >>> 16) % 7;
        const length = 4 + (spot >>> 21) % 6;
        for (let stain = 2; stain <= length; stain++) {
          paint(cx, cy + stain, runoff, 1 - .045 * stain);
          if (stain < length / 2) paint(cx + 1, cy + stain, runoff, .82);
        }
        const radius = 2 + (spot >>> 27) % 2;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const roughness = (grain(cx + dx, cy + dy, faceSeed) % 5 - 2) * .12;
            if (dx ** 2 / radius ** 2 + dy ** 2 / 4 > 1 + roughness) continue;
            paint(cx + dx, cy + dy, rust, .78 + (grain(dx, dy, faceSeed) % 5) * .08);
          }
        }
        paint(cx - 1, cy - 1, bareMetal);
        if (radius > 2) paint(cx, cy - 1, bareMetal, 1.1);
      }
    }

    const { start, count } = geometry.groups[faceIndex]!;
    // Each face has its own four vertices. Sample the centres of the edge texels.
    for (const vertex of new Set(Array.from({ length: count }, (_, i) => indices.getX(start + i)))) {
      const u = (offset + .5 + uvs.getX(vertex) * (w - 1)) / atlasWidth;
      const v = (.5 + uvs.getY(vertex) * (h - 1)) / atlasHeight;
      uvs.setXY(vertex, u, v);
    }
  }

  const map = new DataTexture(texels, atlasWidth, atlasHeight);
  map.name = 'clay-metal-wear';
  map.colorSpace = SRGBColorSpace;
  map.minFilter = NearestFilter;
  map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return { geometry, material: new MeshLambertMaterial({ map }) };
}
