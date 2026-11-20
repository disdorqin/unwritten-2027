import { BoxGeometry, BufferAttribute, Color, Mesh, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const glyphs = [
  [
    '....#....', '.#######.', '....#....', '#########', '...###...',
    '..#.#.#..', '.#..#..#.', '#...#...#', '....#....',
  ],
  [
    '....#....', '..#####..', '..#.#.#..', '..#.#.#..', '#########',
    '...#.#...', '..#...#..', '.#.....#.', '#.......#',
  ],
  [
    '..#####..', '..#...#..', '..#####..', '.........', '#########',
    '...#.....', '..#####..', '......#..', '....##...',
  ],
] as const;
const crescent = ['....###', '..####.', '.###...', '.##....', '.##....', '..##...', '...####'] as const;
const fallingArc = ['##......', '..##....', '....#...', '.....#..', '......##'] as const;

const statusCenter = { x: 0, y: 1.51, z: 3.68 };
const plateHeight = .34;
const plateCenter = { x: 0, y: 2.62, z: 3.776 };

export function buildOrbitalStatusWall(baseMaterial: MeshStandardMaterial) {
  const parts: BoxGeometry[] = [];
  function part(color: Color, x: number, y: number, z: number, w: number, h: number, d: number) {
    const geometry = new BoxGeometry(w, h, d).translate(x - statusCenter.x, y - statusCenter.y, z - statusCenter.z);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) color.toArray(colors, index);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(geometry);
  }

  const edge = new Color(0x62717c);
  const backing = new Color(0x2e3944);
  const letters = new Color(0xbccbd4);
  const coldSilver = new Color(0xd4ecf6);
  const strokeDepth = .006;
  const front = plateCenter.z - .036;
  part(baseMaterial.color, statusCenter.x, statusCenter.y, statusCenter.z, 4.45, 1.74, .29);
  part(edge, plateCenter.x, plateCenter.y, plateCenter.z, 1.48, plateHeight, .052);
  part(backing, plateCenter.x, plateCenter.y, plateCenter.z - .029, 1.43, plateHeight - .04, .012);

  function paint(rows: readonly string[], faceX: number, top: number, cell: number, color: Color) {
    for (const [row, pixels] of rows.entries()) {
      for (const stroke of pixels.matchAll(/#+/g)) {
        const cells = stroke[0].length;
        const column = stroke.index + (cells - 1) / 2;
        // The plaque faces the room. Its right edge is negative world X from inside.
        part(color, -(faceX + column * cell), top - row * cell, front, cells * cell, cell, strokeDepth);
      }
    }
  }

  paint(crescent, -.60, 2.713, .022, coldSilver);
  paint(fallingArc, -.46, 2.64, .017, coldSilver);
  for (const [index, glyph] of glyphs.entries()) paint(glyph, -.17 + index * .243, 2.704, .021, letters);

  const geometry = mergeGeometries(parts);
  for (const entry of parts) entry.dispose();
  if (!geometry) throw new Error('The orbital wall and plaque must share one opaque geometry.');
  const material = baseMaterial.clone();
  material.color.set(0xffffff);
  material.vertexColors = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'orbital-status-wall';
  mesh.position.set(statusCenter.x, statusCenter.y, statusCenter.z);
  mesh.userData.nameplate = { text: '未央号', motif: 'half-moon-and-descending-arc', y: plateCenter.y, north: -plateCenter.z };
  return mesh;
}
