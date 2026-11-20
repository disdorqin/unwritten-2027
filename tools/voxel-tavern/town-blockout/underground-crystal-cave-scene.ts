import {
  BoxGeometry, BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh,
  MeshLambertMaterial, PointLight, type Material,
} from 'three';
import {
  crystalCave, crystalCaveFloorAt, crystalCaveRegionAt, crystalCaveRoofAt, crystalCaveSites, type CavePoint, type Mineral,
} from './underground-crystal-cave';

type Vertex = readonly [number, number, number];
type Face = readonly [Vertex, Vertex, Vertex, Vertex];

const mineralFinish: Record<Mineral, readonly [color: string, light: string]> = {
  'ordinary-ice-crystal': ['#a2dfe9', '#80d2e8'],
  'amethyst-cluster': ['#9373c9', '#886ecf'],
  'blue-crystal': ['#61bad9', '#83e4f3'],
  moonstone: ['#c1cbd1', '#c1d5df'],
};

function createSurface() {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const shade = new Color();
  function add(face: Face, tint: number, flip = false) {
    const base = vertices.length / 3;
    for (const [i, v] of face.entries()) {
      vertices.push(...v);
      const tone = tint + (i % 2 ? .026 : 0);
      shade.setRGB(tone * .82, tone * .93, tone);
      colors.push(shade.r, shade.g, shade.b);
    }
    if (flip) indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    else indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  function finish() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  return { add, finish };
}

function buildCaveShell() {
  const floor = createSurface(), roof = createSurface(), walls = createSurface();
  const bounds = crystalCave.bounds;
  for (let north = bounds.south; north < bounds.north; north++) {
    for (let east = bounds.west; east < bounds.east; east++) {
      const zone = crystalCaveRegionAt(east + .5, north + .5);
      if (zone === undefined) continue;
      const sw = [east, north] as const, se = [east + 1, north] as const;
      const nw = [east, north + 1] as const, ne = [east + 1, north + 1] as const;
      const foot = ([e, n]: CavePoint): Vertex => [e, crystalCaveFloorAt(e, n)!, -n];
      const head = ([e, n]: CavePoint): Vertex => [e, crystalCaveRoofAt(e, n), -n];
      const mottling = ((Math.abs(east * 17 + north * 23) % 11) - 5) * .009;
      const base = zone === 'dark-passage' ? .12 : .26;
      floor.add([foot(sw), foot(se), foot(nw), foot(ne)], base + mottling);
      roof.add([head(sw), head(se), head(nw), head(ne)], base * .8 + mottling, true);
      for (const [nextE, nextN, a, b] of [
        [east - .5, north + .5, nw, sw], [east + 1.5, north + .5, se, ne],
        [east + .5, north - .5, sw, se], [east + .5, north + 1.5, ne, nw],
      ] as const) {
        if (crystalCaveRegionAt(nextE, nextN) !== undefined) continue;
        walls.add([foot(a), foot(b), head(a), head(b)], base + mottling - .055);
      }
    }
  }
  return { floor: floor.finish(), roof: roof.finish(), walls: walls.finish() };
}

/** Single shared faceted mesh, rooted at the rock contact and tapered to one apex. */
function crystalPrism() {
  const vertices: number[] = [];
  const indices: number[] = [];
  const sides = 6;
  for (const [height, radius] of [[0, .54], [.16, 1], [.78, .82]]) {
    for (let i = 0; i < sides; i++) {
      const angle = i * 2 * Math.PI / sides;
      vertices.push(radius! * Math.cos(angle), height!, radius! * Math.sin(angle));
    }
  }
  vertices.push(.08, 1, .035);
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    for (const base of [0, sides]) indices.push(base + i, base + sides + i, base + next, base + next, base + sides + i, base + sides + next);
    indices.push(2 * sides + i, 3 * sides, 2 * sides + next);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Creates only static terrain, decorative crystals and local cold lighting. The caller owns the domain host. */
export function mountUndergroundCrystalCave(owner: Group) {
  const group = new Group();
  group.name = 'underground-crystal-cave-u9';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const lights: PointLight[] = [];
  const columnLights: PointLight[] = [];
  const rock = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, flatShading: true });
  materials.add(rock);
  for (const [part, geometry] of Object.entries(buildCaveShell())) {
    geometries.add(geometry);
    const mesh = new Mesh(geometry, rock);
    mesh.name = `crystal-cave-${part}`;
    group.add(mesh);
  }

  function finish(color: string, emissive: string, transparent: boolean, intensity: number) {
    const material = new MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity,
      opacity: transparent ? .81 : 1, transparent, flatShading: true });
    materials.add(material);
    return material;
  }

  const lenses = {
    'ordinary-ice-crystal': finish(...mineralFinish['ordinary-ice-crystal'], true, .36),
    'amethyst-cluster': finish(...mineralFinish['amethyst-cluster'], true, .31),
    'blue-crystal': finish(...mineralFinish['blue-crystal'], true, .35),
    moonstone: finish(...mineralFinish.moonstone, false, .17),
  };
  const columnFinish = finish(...mineralFinish['blue-crystal'], true, .55);
  const prism = crystalPrism();
  geometries.add(prism);

  function placeShard(parent: Group, material: Material, e: number, n: number, y: number, h: number, r: number) {
    const shard = new Mesh(prism, material);
    shard.name = 'faceted-shard';
    shard.position.set(e, y, -n);
    shard.scale.set(r, h, r);
    shard.rotation.z = crystalCave.growthAngleRadians;
    parent.add(shard);
  }

  function placeLight(name: string, e: number, n: number, y: number, color: string, power: number, reach: number) {
    const light = new PointLight(color, power, reach, 2);
    light.name = name;
    light.position.set(e, y, -n);
    group.add(light);
    lights.push(light);
    return light;
  }

  for (const site of crystalCaveSites) {
    const [e, n] = site.point;
    const floor = crystalCaveFloorAt(e, n)!;
    const stem = new Group();
    stem.name = site.id;
    const isColumn = site.role === 'column';
    const material = isColumn ? columnFinish : lenses[site.mineral];
    placeShard(stem, material, e, n, floor, site.height, site.radius);
    for (const [side, direction, fraction] of [[-.55, .30, .47], [.46, -.55, .57], [.16, .67, .31]]) {
      const x = e + side! * site.radius;
      const nn = n + direction! * site.radius;
      placeShard(stem, lenses[site.mineral], x, nn, crystalCaveFloorAt(x, nn)!, site.height * fraction!, site.radius * .39);
    }
    if (isColumn) columnLights.push(placeLight(`light-${site.id}`, e, n, floor + 2.7, '#a8e8ff', 19, 18));
    if (site.id === 'forest-turn-1' || site.id === 'forest-turn-2' || site.id === 'forest-exit') {
      placeLight(`foot-${site.id}`, e, n, floor + .30, mineralFinish[site.mineral][1], 1.3, 2.25);
    }
    group.add(stem);
  }

  const stone = finish('#656a74', '#273048', false, .09);
  const milky = finish('#afb8c6', '#b7c5de', false, .24);
  function box(name: string, material: Material, x: number, y: number, n: number, east: number, height: number, north: number) {
    const geometry = new BoxGeometry(east, height, north);
    geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, -n);
    group.add(mesh);
    return mesh;
  }

  const mirrorY = crystalCaveFloorAt(29.9, 32)!;
  box('natural-moonstone-mirror-wall', milky, 29.91, mirrorY + 1.42, 32, .16, 2.84, 3.62);
  for (let east = 14; east <= 29; east += 1.5) {
    const height = 1.45 + .5 * Math.sin(east * 4);
    for (const n of [30.06, 33.94]) {
      box('milky-vein-stratum', milky, east, crystalCaveFloorAt(east, n)! + height / 2, n, 1.49, height, .13);
    }
  }
  placeLight('moonstone-reflected-light', 24, 32, crystalCaveFloorAt(24, 32)! + 1.6, '#b4c0d9', 9, 11);

  for (const [index, point] of [crystalCave.hallFirePad, crystalCave.poolFirePad].entries()) {
    const [e, n] = point;
    box(`future-camp-pad-${index}`, stone, e, crystalCaveFloorAt(e, n)! - .06, n, 1.9, .16, 1.9);
  }
  // A visual pool only. Its basin sits on the same traversable surface model; U-3 owns water behaviour.
  const pool = crystalCave.pool;
  const [poolEast, poolNorth] = pool.centre;
  const water = new MeshLambertMaterial({ color: '#6cbdc9', opacity: .57, transparent: true,
    emissive: '#10415b', emissiveIntensity: .40, side: DoubleSide, depthWrite: false });
  materials.add(water);
  const waterGeometry = new CircleGeometry(1, 48);
  waterGeometry.scale(pool.eastRadius, pool.northRadius, 1);
  waterGeometry.rotateX(-Math.PI / 2);
  geometries.add(waterGeometry);
  const poolMesh = new Mesh(waterGeometry, water);
  poolMesh.name = 'shallow-underground-water';
  poolMesh.position.set(poolEast, pool.waterY, -poolNorth);
  group.add(poolMesh);
  placeLight('cold-reflection-over-pool', poolEast, poolNorth, pool.waterY + 2.1, '#8cdbe9', 18, 11);
  for (const [i, [e, n]] of [[-2.8, 56], [.2, 55.5], [1.5, 57], [-3.3, 58.7], [.5, 58], [-.6, 57.1]].entries()) {
    placeShard(group, lenses['ordinary-ice-crystal'], e!, n!, crystalCaveFloorAt(e!, n!)!, .12 + .023 * i, .12);
  }

  owner.add(group);
  function update(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    const amount = .5 - .5 * Math.cos(seconds * 2 * Math.PI / crystalCave.pulsePeriodSeconds);
    columnFinish.emissiveIntensity = .5 + .14 * amount;
    for (const light of columnLights) light.intensity = 19 + 5 * amount;
  }
  let disposed = false;
  return { group, update, dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    group.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const light of lights) light.dispose();
  } };
}
