import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';

type Position = Readonly<{ east: number; north: number; height: number }>;
type Solid = Readonly<{ e: number; n: number; y: number; width: number; depth: number; height: number }>;
/** Normalized authority values; min and max delimit the safe firing band. */
type ForgeHeat = Readonly<{ level: number; min: number; max: number }>;

/** Untransformed U-10-local site. The shared host places it in the final underground domain. */
export const warriorForgeHallSite = { east: 142, north: 4.9, height: -165 } as const;

export function createWarriorForgeHall(site: Position = warriorForgeHallSite) {
  if (![site.east, site.north, site.height].every(Number.isFinite)) throw new RangeError('Invalid warrior forge site');
  const group = new Group();
  group.name = 'warrior-city-forge-hall';
  group.position.set(site.east, site.height, -site.north);
  const stone = new MeshStandardMaterial({ color: 0x59616c, roughness: .96 });
  const paving = new MeshStandardMaterial({ color: 0x4b5159, roughness: .93 });
  const brick = new MeshStandardMaterial({ color: 0x66544d, roughness: .88 });
  const iron = new MeshStandardMaterial({ color: 0x333b40, roughness: .72, metalness: .35 });
  const ember = new MeshStandardMaterial({ color: 0xcb6c36, emissive: 0xe4521d, emissiveIntensity: 1.4 });
  const shape = new BoxGeometry();
  const solids: Solid[] = [];
  function block(e: number, n: number, y: number, width: number, depth: number, height: number,
      material: MeshStandardMaterial, collision = false) {
    const mesh = new Mesh(shape, material);
    mesh.position.set(e, y + height / 2, -n);
    mesh.scale.set(width, height, depth);
    group.add(mesh);
    if (collision) solids.push({ e, n, y, width, depth, height });
    return mesh;
  }

  block(0, 4.8, -.32, 10.4, 10.4, .32, paving);
  for (const east of [-5, 5]) {
    for (let row = 0; row < 5; row++) block(east, 4.85, row * .67, .52, 10, .67, stone, true);
  }
  for (let row = 0; row < 5; row++) block(0, 9.65, row * .67, 9.8, .52, .67, stone, true);
  for (const east of [-3.28, 3.28]) block(east, .08, 0, 3.81, .56, 3.35, stone, true);
  block(0, .08, 2.72, 2.74, .68, .63, stone, true);
  block(0, 4.8, 3.35, 10.55, 10.45, .27, stone);

  // The later brick footing sits against the back wall, below the older cut stone.
  for (const east of [-2.85, -2.37, -1.89, -1.41]) block(east, 9.12, 0, .43, .42, .28, brick, true);
  block(-2, 5.1, 0, 1.38, .88, .79, stone, true).name = 'forge-stone-table';
  block(2, 7.23, 0, 2.18, 1.3, 1.9, brick, true).name = 'forge-hearth';
  block(2, 6.56, .9, 1.03, .06, .49, ember).name = 'forge-mouth';
  block(2, 7.45, 1.9, .79, .85, 2.47, brick, true).name = 'forge-chimney';
  block(3.46, 6.55, 0, .46, .58, .96, iron, true).name = 'forge-bellows';
  const light = new PointLight(0xffa064, 11, 12, 2);
  light.position.set(2, 1.42, -6.48);
  group.add(light);

  const gauge = new Group();
  gauge.name = 'forge-heat-gauge';
  gauge.position.set(2, 1.64, -6.55);
  gauge.visible = false;
  group.add(gauge);
  const gaugeWidth = 1.52;
  const cold = new MeshStandardMaterial({ color: 0x5078a5, emissive: 0x182c52 });
  const working = new MeshStandardMaterial({ color: 0xb58b3d, emissive: 0x68451b });
  const hot = new MeshStandardMaterial({ color: 0xab4b43, emissive: 0x681711 });
  const pointer = new MeshStandardMaterial({ color: 0xffeacd, emissive: 0xffd7ac, emissiveIntensity: .65 });

  function gaugePiece(name: string, width: number, height: number, depth: number, z: number,
      material: MeshStandardMaterial) {
    const mesh = new Mesh(shape, material);
    mesh.name = name;
    mesh.position.z = z;
    mesh.scale.set(width, height, depth);
    gauge.add(mesh);
    return mesh;
  }
  gaugePiece('forge-heat-frame', gaugeWidth + .16, .28, .06, 0, iron);
  const coldBand = gaugePiece('forge-heat-cold', 1, .15, .015, .04, cold);
  const workingBand = gaugePiece('forge-heat-working', 1, .15, .015, .04, working);
  const hotBand = gaugePiece('forge-heat-hot', 1, .15, .015, .04, hot);
  const indicator = gaugePiece('forge-heat-indicator', .115, .115, .05, .072, pointer);
  indicator.rotation.z = Math.PI / 4;

  function setBand(band: Mesh, from: number, to: number) {
    band.visible = from < to;
    band.scale.x = gaugeWidth * (to - from);
    band.position.x = gaugeWidth * ((from + to) / 2 - .5);
  }

  function updateHeat(fire: ForgeHeat | undefined) {
    if (!fire || !Number.isFinite(fire.level) || !Number.isFinite(fire.min) || !Number.isFinite(fire.max) ||
        fire.min < 0 || fire.max > 1 || fire.min >= fire.max) {
      gauge.visible = false;
      return;
    }
    const { level, min, max } = fire;
    setBand(coldBand, 0, min);
    setBand(workingBand, min, max);
    setBand(hotBand, max, 1);
    indicator.position.x = gaugeWidth * (Math.max(0, Math.min(1, level)) - .5);
    const band = level < min ? cold : level > max ? hot : working;
    pointer.emissive.copy(band.color);
    gauge.visible = true;
  }

  function absolute(e: number, n: number): Position {
    return { east: site.east + e, north: site.north + n, height: site.height };
  }
  const entry = absolute(0, 0);
  const stand = { place: absolute(-2, 4.09), stoke: absolute(3.46, 5.86), collect: absolute(2, 6.01) };

  function floorHeightAt(east: number, north: number) {
    if (Math.abs(east - site.east) <= 5.2 && north - site.north >= -.4 && north - site.north <= 10) return site.height;
  }
  function canStand(east: number, north: number, radius = .27, height = 1.8) {
    if (!Number.isFinite(radius) || !Number.isFinite(height) || radius <= 0 || height <= 0 ||
        floorHeightAt(east, north) === undefined) return false;
    return !solids.some(box => box.y < height && Math.hypot(
      Math.max(0, Math.abs(east - site.east - box.e) - box.width / 2),
      Math.max(0, Math.abs(north - site.north - box.n) - box.depth / 2),
    ) < radius);
  }
  return {
    group, entry, stand, floorHeightAt, canStand, updateHeat,
    colliders: solids.map(box => ({
      min: [site.east + box.e - box.width / 2, site.height + box.y, -site.north - box.n - box.depth / 2],
      max: [site.east + box.e + box.width / 2, site.height + box.y + box.height, -site.north - box.n + box.depth / 2],
    })),
    dispose() {
      group.removeFromParent();
      shape.dispose();
      for (const material of [stone, paving, brick, iron, ember, cold, working, hot, pointer]) material.dispose();
    },
  };
}
