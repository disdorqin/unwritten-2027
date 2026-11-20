import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture,
  DodecahedronGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, NearestFilter,
  PointLight, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type CraterRoad = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
type Site = { east: number; north: number; height: number; radius: number };
type Placement = Site & { kind: 'camp' | 'lamp' | 'strata'; id: string };

const palette = {
  stone: '#8a8378', ochre: '#a98a56', earth: '#5d4630',
  pine: '#44503c', night: '#2c3648', snow: '#e8ecf0',
  ember: '#e08a3c', crystal: '#7fd4c8', rust: '#8a4a34',
} as const;
const crater = createMeteorCrater(meteorCraterFixturePlan);
const lipBearing = meteorCraterFixturePlan.mainTrail.startBearing;
const trailSamples = Array.from({ length: 1025 }, (_, i) => crater.mainTrailPoint(i / 1024));

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

/** Outdoor archaeological dressing. It leaves the sealed shaft/stone and ZA-22 collision intact. */
export function mountZa31CraterCamp(road: CraterRoad) {
  const { anchor, heightAt } = road;
  const group = new Group();
  group.name = 'za31-crater-camp';
  const placements: Placement[] = [];
  const lights: { lamp: PointLight; intensity: number; phase: number }[] = [];
  const earth = pixelMaterial(palette.earth, palette.night, 70, palette.rust);
  const stone = pixelMaterial(palette.stone, palette.earth, 19, palette.night);
  const ochre = pixelMaterial(palette.ochre, palette.earth, 103, palette.stone);
  const canvas = pixelMaterial(palette.pine, palette.earth, 45, palette.stone);
  canvas.side = DoubleSide;
  const iron = pixelMaterial(palette.night, palette.rust, 129, palette.earth);
  const snow = pixelMaterial(palette.snow, palette.stone, 168);
  const embers = new MeshStandardMaterial({ color: palette.ember, emissive: palette.ember, emissiveIntensity: 1.3, roughness: .82 });
  const ice = new MeshStandardMaterial({ color: palette.crystal, emissive: palette.crystal, emissiveIntensity: .27, flatShading: true, roughness: .72 });
  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const yaw = anchor.yaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);

  function toWorld(x: number, n: number) {
    return { east: anchor.east + x * c + n * s, north: anchor.north + n * c - x * s };
  }

  function place(kind: Placement['kind'], id: string, localE: number, localN: number, radius: number) {
    const { east, north } = toWorld(localE, localN);
    const height = heightAt(east, north);
    if (height === undefined || Math.hypot(localE, localN) < 8 + radius) return;
    const overlapsTrail = trailSamples.some(p => Math.hypot(p.east - localE, p.north - localN) < 2.25 + radius);
    if (overlapsTrail) return;
    const site = { kind, id, east, north, height, radius };
    placements.push(site);
    return site;
  }

  function polar(radius: number, angle: number) {
    return [radius * Math.sin(angle), radius * Math.cos(angle)] as const;
  }

  function add(material: MeshStandardMaterial, source: BufferGeometry, site: Site,
    offset: [number, number, number], rotations: [number, number, number]) {
    const geometry = source.index ? source.toNonIndexed() : source;
    geometry.rotateX(rotations[0]).rotateZ(rotations[2]).rotateY(rotations[1]);
    geometry.translate(site.east + offset[0], site.height + offset[1], -site.north + offset[2]);
    const batch = batches.get(material) ?? [];
    batch.push(geometry);
    batches.set(material, batch);
    if (source !== geometry) source.dispose();
  }

  function box(material: MeshStandardMaterial, site: Site, size: [number, number, number],
    offset: [number, number, number], angle = 0, roll = 0) {
    add(material, new BoxGeometry(...size), site, offset, [0, angle, roll]);
  }

  function shard(material: MeshStandardMaterial, site: Site, radius: number, length: number,
    offset: [number, number, number], lean: number, turn: number) {
    add(material, new ConeGeometry(radius, length, 5), site, offset, [0, turn, lean]);
  }

  function light(site: Site, height: number, intensity: number, distance: number, phase: number) {
    const lamp = new PointLight(new Color(palette.ember), intensity, distance, 2);
    lamp.position.set(site.east, site.height + height, -site.north);
    group.add(lamp);
    lights.push({ lamp, intensity, phase });
  }

  const floorBearing = lipBearing;
  const tent = place('camp', 'collapsed-tent', ...polar(14.7, floorBearing - .29), 2.5);
  if (tent) {
    const direction = yaw + floorBearing - .1;
    const roof = new ConeGeometry(1.83, 1.56, 4);
    roof.scale(1, 1, 1.19);
    add(canvas, roof, tent, [0, .79, 0], [0, direction, .10]);
    const flap = new ConeGeometry(.91, .79, 3);
    flap.scale(1, 1, .84);
    add(earth, flap, tent, [0, .32, .78], [0, direction + .16, .16]);
    for (const side of [-1, 1]) {
      box(iron, tent, [.12, .47, .13], [side * 1.42, .11, .84], .2, side * .2);
      box(snow, tent, [.72, .12, .48], [side * .70, .08, -.81], .27);
    }
    box(earth, tent, [.13, .18, 2.59], [.15, .17, .28], .79);
  }

  const fire = place('camp', 'fire-ring', ...polar(13.3, floorBearing + .06), 1.38);
  if (fire) {
    add(earth, new CylinderGeometry(.99, .95, .055, 9), fire, [0, .026, 0], [0, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const geometry = new DodecahedronGeometry(.24 + (i % 3) * .035);
      geometry.scale(1.21, .68, .96);
      add(i % 3 === 0 ? earth : stone, geometry, fire,
        [Math.sin(angle) * .92, .11, Math.cos(angle) * .92], [.12, angle, .15]);
    }
    box(iron, fire, [.85, .16, .20], [0, .11, 0], .53);
    box(earth, fire, [.80, .14, .19], [0, .12, .08], -.74);
    for (let i = 0; i < 4; i++) shard(embers, fire, .05 + i * .011, .13 + i * .035,
      [Math.sin(i * 2) * .26, .17, Math.cos(i * 2) * .22], .18, i);
    light(fire, .36, 4.5, 4.7, 1.7);
  }

  const tools = place('camp', 'open-toolbox', ...polar(14.4, floorBearing + .36), 1.28);
  if (tools) {
    box(earth, tools, [1.19, .42, .65], [0, .22, 0], .29);
    box(ochre, tools, [1.18, .13, .06], [0, .45, .30]);
    box(iron, tools, [.91, .05, .47], [0, .45, 0]);
    box(ochre, tools, [1.09, .11, .55], [0, .55, -.40], .1, .26);
    box(iron, tools, [.29, .15, .06], [.05, .26, .34]);
    box(earth, tools, [.87, .09, .13], [.58, .08, .52], .38);
    box(iron, tools, [.10, .17, .36], [.96, .11, .36], .46);
  }

  const rails = place('camp', 'broken-railhead', ...polar(17.5, floorBearing + .14), 2.34);
  if (rails) {
    for (let i = 0; i < 5; i++) {
      box(earth, rails, [1.51, .14, .25], [0, .07, (i - 2) * .65], i === 0 ? .15 : 0);
    }
    box(iron, rails, [.13, .16, 2.99], [-.43, .21, -.1], .024);
    box(iron, rails, [.13, .16, 1.98], [.43, .21, -.49]);
    box(iron, rails, [.13, .16, .76], [.51, .18, 1.02], .28, -.24);
    box(earth, rails, [1.24, .43, .21], [0, .29, 1.27]);
  }

  const lampLocations = [.10, .25, .40, .56, .71, .85, .96].map(progress => {
    const point = crater.mainTrailPoint(progress);
    return polar(Math.hypot(point.east, point.north) + 3.02, Math.atan2(point.east, point.north));
  });
  lampLocations.push(polar(12.6, lipBearing + Math.PI - .44));
  for (const [index, position] of lampLocations.entries()) {
    const site = place('lamp', `guiding-lamp-${index + 1}`, ...position, .55);
    if (!site) continue;
    box(earth, site, [.18, 1.45, .20], [0, .51, 0], index);
    box(ochre, site, [.42, .10, .39], [0, 1.19, 0], index);
    box(iron, site, [.33, .12, .31], [0, 1.57, 0], index);
    box(embers, site, [.16, .31, .16], [0, 1.38, 0], index);
    for (const x of [-.105, .105]) {
      for (const z of [-.105, .105]) box(iron, site, [.036, .34, .038], [x, 1.38, z]);
    }
    if (index === 2 || index === 7) light(site, 1.39, 5.5, 5.1, 3.7 * index);
  }

  // Surveyed cuts, from the outer ledge to the floor. Angles steer clear of each spiral turn.
  const strata = [
    { radius: 44.8, angle: 3.12 }, { radius: 43.4, angle: 4.32 }, { radius: 42.2, angle: 5.10 },
    { radius: 35.7, angle: 2.55 }, { radius: 34.4, angle: 3.69 }, { radius: 33.2, angle: 4.25 },
    { radius: 25.8, angle: 2.54 }, { radius: 24.5, angle: 3.22 }, { radius: 23.1, angle: 4.30 },
  ];
  for (const [index, row] of strata.entries()) {
    const bearing = lipBearing + row.angle;
    const site = place('strata', `cut-face-${index + 1}`, ...polar(row.radius, bearing), 1.78);
    if (!site) continue;
    const turn = -(yaw + bearing);
    const alongEast = Math.cos(yaw + bearing);
    const alongSouth = Math.sin(yaw + bearing);
    const outwardEast = Math.sin(yaw + bearing);
    const outwardSouth = -Math.cos(yaw + bearing);
    for (let bed = 0; bed < 3; bed++) {
      const geometry = new DodecahedronGeometry(1);
      geometry.scale(1.24 + bed * .06, .25 + bed * .06, .77 - bed * .10);
      const east = outwardEast * (bed - 1) * .48;
      const south = outwardSouth * (bed - 1) * .48;
      const ground = heightAt(site.east + east, site.north - south) ?? site.height;
      add([earth, stone, ochre][bed], geometry, site,
        [east, ground - site.height + .19, south], [.53, turn, (bed - 1) * .12]);
    }
    const growth = .49 + index * .075;
    for (const offset of [-1, 0, 1]) {
      const east = alongEast * offset * .28 + outwardEast * .53;
      const south = alongSouth * offset * .28 + outwardSouth * .53;
      const ground = heightAt(site.east + east, site.north - south) ?? site.height;
      const length = growth * (1 - Math.abs(offset) * .33);
      shard(ice, site, .116 + .041 * Number(offset === 0), length,
        [east, ground - site.height + length * .43, south], offset * .18, turn);
    }
  }

  function update(elapsedSeconds: number) {
    for (const { lamp, intensity, phase } of lights) {
      lamp.intensity = intensity * (1 + .075 * Math.sin(elapsedSeconds * 4.2 + phase) +
        .045 * Math.sin(elapsedSeconds * 7.7 + phase));
    }
    embers.emissiveIntensity = 1.28 + .08 * Math.sin(elapsedSeconds * 5.1);
  }

  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    const mesh = new Mesh(geometry, material);
    if (material === embers) {
      // A visible ember batch updates its local lights without a global scene tick.
      mesh.onBeforeRender = () => update(performance.now() / 1000);
    }
    group.add(mesh);
  }

  return { group, placements, update };
}
