import { BoxGeometry, BufferAttribute, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const shipName = '未央号';
const motif = 'half-moon-and-descending-arc';

// Retains the tested S-2 nameplate's stepped relief. The rest of the lettering is
// a 16px raster of Noto Sans CJK SC Bold, baked into geometry for font-free preview.
const shipGlyphs = [
  ['....#....', '.#######.', '....#....', '#########', '...###...', '..#.#.#..', '.#..#..#.', '#...#...#', '....#....'],
  ['....#....', '..#####..', '..#.#.#..', '..#.#.#..', '#########', '...#.#...', '..#...#..', '.#.....#.', '#.......#'],
  ['..#####..', '..#...#..', '..#####..', '.........', '#########', '...#.....', '..#####..', '......#..', '....##...'],
] as const;
const halfMoon = ['....###', '..####.', '.###...', '.##....', '.##....', '..##...', '...####'] as const;
const descendingArc = ['##......', '..##....', '....#...', '.....#..', '......##'] as const;
const letters: Readonly<Record<string, readonly number[]>> = {
  气: [0x0800, 0x1c00, 0x1ffe, 0x3ffe, 0x3ff8, 0x6ffc, 0x6000, 0x3ff8, 0x1ff8, 0x0018, 0x0018, 0x0018, 0x001a, 0x001b, 0x000e, 0x0006],
  闸: [0x2000, 0x37fe, 0x3bfe, 0x1006, 0x6ff6, 0x6ff6, 0x6db6, 0x6ff6, 0x6ff6, 0x6db6, 0x6ff6, 0x6ff6, 0x6186, 0x6186, 0x618e, 0x600c],
  舱: [0x1830, 0x1838, 0x7e78, 0x7eec, 0x7ecc, 0x7f86, 0x6ffe, 0x7efc, 0xfecc, 0x76cc, 0x7efc, 0x6ed0, 0x66c2, 0x66c6, 0x6efe, 0x4e7c],
  驾: [0x7f7e, 0x7f6e, 0x3366, 0x7f7e, 0x6000, 0x1ff8, 0x1ff8, 0x0838, 0x1c30, 0x1ffe, 0x000e, 0x7fe6, 0x7ff6, 0x001c, 0x001c, 0x0000],
  驶: [0x7c30, 0x7cfe, 0x6dfe, 0x6db6, 0x6db6, 0x6db6, 0x6dfe, 0x7ffe, 0x7eb0, 0x06f0, 0x7ee0, 0xfe70, 0x04f8, 0x1fde, 0x1d06, 0x0000],
  传: [0x18e0, 0x1bfe, 0x3bfe, 0x30c0, 0x77fe, 0xf7fe, 0x7180, 0x31fc, 0x33fe, 0x301c, 0x30b8, 0x31f0, 0x3070, 0x3038, 0x3010, 0x0000],
  送: [0x718c, 0x3198, 0x1bfe, 0x03fe, 0x0060, 0x7060, 0x77fe, 0x37fe, 0x30f0, 0x30f8, 0x338c, 0x370c, 0x7e00, 0xefff, 0x43fe, 0x0000],
  维: [0x10d8, 0x18d8, 0x30d8, 0x31fe, 0x6ffe, 0x7f98, 0x7bfe, 0x19fe, 0x3198, 0x7d98, 0x79fe, 0x01fe, 0x0d98, 0x7dff, 0x61fe, 0x0180],
  生: [0x1980, 0x1980, 0x3980, 0x3ffc, 0x3ffe, 0x6180, 0x6180, 0x0180, 0x1ffc, 0x1ffc, 0x0180, 0x0180, 0x0180, 0x0180, 0x7ffe, 0x7ffe],
};

// X-east / N-north / Y-up, on the audited S-1/S-2 two-room candidate.
export const orbitalCabinSignPlacements = [
  { id: 'airlock-nameplate', room: 'airlock', kind: 'nameplate', text: shipName,
    x: 0, n: -3.776, y: 2.62, yaw: Math.PI, width: 1.48, height: .34, depth: .052 },
  { id: 'cockpit-nameplate', room: 'cockpit', kind: 'nameplate', text: shipName,
    x: 5.375, n: 6.92, y: 2.58, yaw: -Math.PI / 2, width: 1.48, height: .34, depth: .052 },
  { id: 'to-cockpit', room: 'airlock', kind: 'cabin-door', text: '驾驶舱',
    x: 0, n: 3.16, y: 2.74, yaw: 0, width: 1.04, height: .24, depth: .045, supportTop: 2.95 },
  { id: 'to-airlock', room: 'cockpit', kind: 'cabin-door', text: '气闸舱',
    x: 0, n: 4.79, y: 2.94, yaw: Math.PI, width: 1.04, height: .24, depth: .045, supportTop: 3.14 },
  { id: 'teleport', room: 'airlock', kind: 'status', text: '传送', indicator: 'status-teleport',
    x: -1.05, n: -3.526, y: 2.18, yaw: Math.PI, width: .46, height: .166, depth: .031 },
  { id: 'life-support', room: 'airlock', kind: 'status', text: '维生', indicator: 'status-life-support',
    x: 1.05, n: -3.526, y: 2.18, yaw: Math.PI, width: .46, height: .166, depth: .031 },
] as const;
type Placement = typeof orbitalCabinSignPlacements[number];

function buildSign(placement: Placement, material: MeshStandardMaterial) {
  const { width, height, depth } = placement;
  const parts: BoxGeometry[] = [];
  const silver = new Color(0xd4ecf6);
  const ink = new Color(0xc0cbd0);
  const edge = new Color(0x62717c);
  const backing = new Color(0x2e3944);
  function part(color: Color, x: number, y: number, z: number, w: number, h: number, d: number) {
    const box = new BoxGeometry(w, h, d).translate(x, y, z);
    const colors = new Float32Array(box.getAttribute('position').count * 3);
    for (let index = 0; index < colors.length; index += 3) color.toArray(colors, index);
    box.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(box);
  }

  part(edge, 0, 0, 0, width, height, depth);
  part(backing, 0, 0, depth / 2, width - .045, height - .038, .006);
  const frontage = depth / 2 + .006;
  function paint(rows: readonly string[], left: number, top: number, cell: number, color: Color) {
    for (const [row, pixels] of rows.entries()) {
      for (const stroke of pixels.matchAll(/#+/g)) {
        const cells = stroke[0].length;
        const column = stroke.index + (cells - 1) / 2;
        part(color, left + column * cell, top - row * cell, frontage, cells * cell, cell, .005);
      }
    }
  }

  if (placement.kind === 'nameplate') {
    paint(halfMoon, -.60, .096, .022, silver);
    paint(descendingArc, -.46, .021, .017, silver);
    for (const [index, glyph] of shipGlyphs.entries()) paint(glyph, -.17 + index * .243, .084, .021, ink);
  } else {
    const cell = placement.kind === 'status' ? .0065 : .009;
    const glyphStep = 18 * cell;
    const textLeft = -(placement.text.length * glyphStep - 3 * cell) / 2;
    for (const [index, letter] of [...placement.text].entries()) {
      const rows = letters[letter]!.map(bits => bits.toString(2).padStart(16, '0').replace(/1/g, '#'));
      paint(rows, textLeft + index * glyphStep, 7.5 * cell, cell, ink);
    }
  }
  if (placement.kind === 'cabin-door') {
    const span = placement.supportTop - placement.y - height / 2;
    for (const side of [-1, 1]) part(edge, side * .38, height / 2 + span / 2, -.005, .035, span, .06);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error('The cabin sign requires one opaque geometry.');
  const mesh = new Mesh(geometry, material);
  mesh.name = `orbital-sign-${placement.id}`;
  mesh.position.set(placement.x, placement.y, -placement.n);
  mesh.rotation.y = placement.yaw;
  mesh.userData.sign = { ...placement, motif: placement.kind === 'nameplate' ? motif : undefined };
  return mesh;
}

/** Detached, display-only indoor assets. Nothing in this set mounts on an exterior gate. */
export function createOrbitalCabinSignage({ existingAirlockPlaque = false }: { existingAirlockPlaque?: boolean } = {}) {
  const group = new Group();
  group.name = 'orbital-cabin-signage';
  const material = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .82, metalness: .22 });
  const inventory = orbitalCabinSignPlacements.map(placement => {
    const inherited = existingAirlockPlaque && placement.id === 'airlock-nameplate';
    if (!inherited) group.add(buildSign(placement, material));
    return { ...placement, origin: inherited ? 's2-wall' : 's11-sign' };
  });
  let disposed = false;
  return {
    group, inventory,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const child of group.children) (child as Mesh).geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}

/** The isolated S-2 wall has its own integrated plaque. Reuse it rather than layering copies. */
export function mountOrbitalCabinSignage(roomHost: Group) {
  const wall = roomHost.getObjectByName('orbital-status-wall');
  if (!wall || !roomHost.getObjectByName('orbital-airlock') || !roomHost.getObjectByName('orbital-cockpit') ||
      roomHost.getObjectByName('orbital-cabin-signage')) throw new RangeError('Expected a bare two-room orbital host.');
  const existing = wall.userData.nameplate;
  if (existing && (existing.text !== shipName || existing.motif !== motif)) {
    throw new RangeError('The existing airlock plaque must match the S-2 motif and name.');
  }
  const signs = createOrbitalCabinSignage({ existingAirlockPlaque: Boolean(existing) });
  roomHost.add(signs.group);
  return signs;
}
