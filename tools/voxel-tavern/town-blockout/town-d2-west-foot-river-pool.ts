import {
  BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DodecahedronGeometry,
  DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, RingGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  northRidgeProfileHeight, sampleNorthRidge350,
} from './north-ridge-350-terrain';
import { buildSwitchbackCenterline, type SwitchbackPoint } from './front-ridge-switchback-road';
import { createTerrainGrid, riverX, waterHeight } from './terrain';
import { northernRiver } from './town-extension';

export type TownD2WestFootRiverPoolSite = Readonly<{
  east: number;
  north: number;
  waterLevel: number;
  radius: number;
  groundHeight: number;
  ridgeHeight: number;
  foothillNorth: number;
  distanceSouthOfFoothill: number;
  riverOffset: number;
}>;

export type TownD2WestFootRiverPoolClearance = Readonly<{
  roadDistance: number;
  roadHalfWidth: number;
  shoulder: number;
  requiredClearance: number;
  poolClearance: number;
  bankClearance: number;
  inletClearance: number;
  minimumDetailClearance: number;
}>;

export type TownD2WestFootRiverPoolSurvey = Readonly<{
  site: TownD2WestFootRiverPoolSite;
  clearance: TownD2WestFootRiverPoolClearance;
}>;

const ROAD_HALF = 1.75;
const SHOULDER = 3.4;
const REQUIRED_CLEARANCE = ROAD_HALF + SHOULDER;
const POOL_RADIUS_CAP = 18;
const BANK_OUTER = 1.25;
const INLET_REACH = 1.8;
const INLET_HALF_WIDTH = 3.3;
const SURVEY_STEP = .25;
const DETAIL_SAFETY = .5;

let cachedSurvey: TownD2WestFootRiverPoolSurvey | undefined;

function pointSegmentDistance(east: number, north: number, a: SwitchbackPoint, b: SwitchbackPoint) {
  const dx = b.east - a.east, dn = b.north - a.north;
  const lengthSquared = dx * dx + dn * dn || 1;
  const t = Math.max(0, Math.min(1, ((east - a.east) * dx + (north - a.north) * dn) / lengthSquared));
  return Math.hypot(east - a.east - t * dx, north - a.north - t * dn);
}

function roadDistanceAt(line: readonly SwitchbackPoint[], east: number, north: number) {
  let distance = Infinity;
  for (let i = 1; i < line.length; i++) {
    distance = Math.min(distance, pointSegmentDistance(east, north, line[i - 1]!, line[i]!));
  }
  return distance;
}

function inletClearanceAt(line: readonly SwitchbackPoint[], north: number, radius: number) {
  const start = north + radius * .7;
  const end = north + radius + INLET_REACH;
  let clearance = Infinity;
  for (let i = 0; i <= 40; i++) {
    const sampleNorth = start + (end - start) * i / 40;
    clearance = Math.min(clearance, roadDistanceAt(line, riverX(sampleNorth), sampleNorth) - INLET_HALF_WIDTH);
  }
  return clearance;
}

export function surveyTownD2WestFootRiverPool(): TownD2WestFootRiverPoolSurvey {
  if (cachedSurvey) return cachedSurvey;
  const grid = createTerrainGrid();
  const road = buildSwitchbackCenterline(sampleNorthRidge350, grid.heightAt);
  const ridgeFloor = northRidgeProfileHeight(0, 0);
  const riverJointNorth = northernRiver.at(-1)![1];
  let foothillNorth = 0;
  for (let north = 0; north <= riverJointNorth; north += SURVEY_STEP) {
    if (northRidgeProfileHeight(riverX(north), north) <= ridgeFloor + 1e-6) continue;
    let south = north - SURVEY_STEP, here = north;
    for (let i = 0; i < 40; i++) {
      const mid = (south + here) / 2;
      if (northRidgeProfileHeight(riverX(mid), mid) > ridgeFloor + 1e-6) here = mid;
      else south = mid;
    }
    foothillNorth = south;
    break;
  }
  if (!Number.isFinite(foothillNorth) || foothillNorth <= 0) {
    throw new Error('AW-3 survey: the northern river has no measured southern ridge foothill.');
  }

  let selected: { north: number; east: number; radius: number; roadDistance: number;
    bankClearance: number; inletClearance: number } | undefined;
  for (let north = Math.floor(foothillNorth / SURVEY_STEP) * SURVEY_STEP;
    north >= foothillNorth - 4; north -= SURVEY_STEP) {
    const east = riverX(north);
    const roadDistance = roadDistanceAt(road, east, north);
    const radiusLimit = roadDistance - REQUIRED_CLEARANCE - BANK_OUTER - DETAIL_SAFETY;
    const radius = Math.min(POOL_RADIUS_CAP, Math.floor(radiusLimit * 2) / 2);
    if (radius < 12) continue;
    const bankClearance = roadDistance - radius - BANK_OUTER;
    const inletClearance = inletClearanceAt(road, north, radius);
    if (roadDistance - radius <= DETAIL_SAFETY || bankClearance <= DETAIL_SAFETY ||
      inletClearance <= REQUIRED_CLEARANCE + DETAIL_SAFETY) continue;
    selected = { north, east, radius, roadDistance, bankClearance, inletClearance };
    break;
  }
  if (!selected) throw new Error('AW-3 survey: no west-foot river site clears the switchback corridor.');

  const site: TownD2WestFootRiverPoolSite = Object.freeze({
    east: selected.east,
    north: selected.north,
    waterLevel: waterHeight,
    radius: selected.radius,
    groundHeight: grid.groundHeightAt(selected.east, selected.north),
    ridgeHeight: sampleNorthRidge350(selected.east, selected.north),
    foothillNorth,
    distanceSouthOfFoothill: foothillNorth - selected.north,
    riverOffset: selected.east - riverX(selected.north),
  });
  const clearance: TownD2WestFootRiverPoolClearance = Object.freeze({
    roadDistance: selected.roadDistance,
    roadHalfWidth: ROAD_HALF,
    shoulder: SHOULDER,
    requiredClearance: REQUIRED_CLEARANCE,
    poolClearance: selected.roadDistance - selected.radius,
    bankClearance: selected.bankClearance,
    inletClearance: selected.inletClearance,
    minimumDetailClearance: Math.min(selected.bankClearance, selected.inletClearance),
  });
  cachedSurvey = Object.freeze({ site, clearance });
  return cachedSurvey;
}

type Family = 'bed' | 'shallow' | 'stoneLight' | 'stoneDark' | 'timber' | 'reeds';
type GeometryBatch = Record<Family, BufferGeometry[]>;

function nonIndexed(geometry: BufferGeometry) {
  if (!geometry.index) return geometry;
  const result = geometry.toNonIndexed();
  geometry.dispose();
  return result;
}

function transformed(geometry: BufferGeometry, position: Vector3, yaw = 0, scale?: Vector3) {
  const matrix = new Matrix4().compose(position, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
    scale ?? new Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
  return nonIndexed(geometry);
}

function flatDisk(radius: number, segments: number, y: number) {
  const positions: number[] = [0, y, 0];
  const uvs: number[] = [.5, .5];
  const colors: number[] = [.88, .96, .98];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const ripple = 1 + .018 * Math.sin(angle * 5) + .012 * Math.sin(angle * 9 + .7);
    positions.push(Math.cos(angle) * radius * ripple, y, Math.sin(angle) * radius * ripple);
    uvs.push(.5 + Math.cos(angle) * .5, .5 + Math.sin(angle) * .5);
    const tint = .9 + .08 * Math.sin(angle * 3 + .4);
    colors.push(.72 * tint, .88 * tint, .92 * tint);
    if (i > 0) indices.push(0, i + 1, i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function creekRibbon(startNorth: number, endNorth: number, startHalfWidth: number, endHalfWidth: number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const steps = Math.max(4, Math.ceil(Math.abs(endNorth - startNorth) / .75));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const north = startNorth + (endNorth - startNorth) * t;
    const east = riverX(north);
    const halfWidth = startHalfWidth + (endHalfWidth - startHalfWidth) * t;
    positions.push(east - halfWidth, waterHeight + .025, -north, east + halfWidth, waterHeight + .025, -north);
    uvs.push(0, t, 1, t);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Visual-only pond, inlet and short outflow. No terrain, water or collider authority is changed. */
export function createTownD2WestFootRiverPool() {
  const { site, clearance } = surveyTownD2WestFootRiverPool();
  const group = new Group();
  group.name = 'town-d2-west-foot-river-pool';
  group.userData = {
    includesWorldCollision: false,
    visualOnly: true,
    waterLevelAuthority: 'terrain.waterHeight',
    site,
    clearance,
  };
  const grid = createTerrainGrid();
  const centre = new Vector3(site.east, site.waterLevel, -site.north);
  const tangentEast = riverX(site.north + .25) - riverX(site.north - .25);
  const tangentNorth = .5;
  const tangent = new Vector3(tangentEast, 0, -tangentNorth).normalize();
  const right = new Vector3().crossVectors(tangent, new Vector3(0, 1, 0)).normalize();
  const batches: GeometryBatch = { bed: [], shallow: [], stoneLight: [], stoneDark: [], timber: [], reeds: [] };
  const groundAt = (east: number, north: number) => grid.groundHeightAt(east, north);
  const put = (family: Family, geometry: BufferGeometry, position: Vector3, yaw = 0, scale?: Vector3) => {
    batches[family].push(transformed(geometry, position, yaw, scale));
  };
  const local = (across: number, along: number, y: number) => centre.clone()
    .addScaledVector(right, across).addScaledVector(tangent, along).setY(y);
  const inChannelGap = (across: number, along: number) =>
    (along > site.radius * .7 && Math.abs(across) < 3.7) ||
    (along < -site.radius * .7 && Math.abs(across) < 3.1);

  // A dark basin and a pale shallow shelf remain below the authoritative Y=5 surface.
  put('bed', new CylinderGeometry(site.radius * .91, site.radius * .84, 1.1, 48), centre.clone().setY(3.65));
  const shelf = new RingGeometry(site.radius * .68, site.radius * .965, 64);
  shelf.rotateX(-Math.PI / 2);
  batches.shallow.push(transformed(shelf, centre.clone().setY(4.58)));

  // Irregular block banks: every block meets the measured ground, with a low inner lip.
  for (let i = 0; i < 56; i++) {
    const angle = i / 56 * Math.PI * 2 + .035 * Math.sin(i * 2.7);
    const across = Math.cos(angle) * (site.radius + .48);
    const along = Math.sin(angle) * (site.radius + .48);
    if (inChannelGap(across, along)) continue;
    const east = centre.x + right.x * across + tangent.x * along;
    const north = site.north - right.z * across - tangent.z * along;
    const top = Math.max(site.waterLevel + .42, groundAt(east, north) + .32);
    const height = i % 7 === 0 ? 1.05 : .76;
    put(i % 4 === 0 ? 'stoneDark' : 'stoneLight',
      new BoxGeometry(1.28 + .16 * Math.sin(i * 1.9), height, 1.02),
      local(across, along, top - height / 2), -angle + Math.PI / 2);
  }
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2 + .11 * Math.sin(i * 4.1);
    const radial = site.radius + .72 + .32 * Math.sin(i * 2.3);
    const across = Math.cos(angle) * radial, along = Math.sin(angle) * radial;
    if (inChannelGap(across, along)) continue;
    const east = centre.x + right.x * across + tangent.x * along;
    const north = site.north - right.z * across - tangent.z * along;
    const size = .42 + .22 * (Math.sin(i * 8.3) * .5 + .5);
    put(i % 3 === 0 ? 'stoneLight' : 'stoneDark', new DodecahedronGeometry(1, 0),
      local(across, along, Math.max(site.waterLevel + .12, groundAt(east, north) + size * .45)),
      angle, new Vector3(size * 1.25, size * .72, size));
  }

  // Stone-lined inlet leaves a central overflow; timber posts mark the interception.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const along = site.radius * .78 + i * .57;
      const across = side * (2.65 + .08 * i);
      const east = centre.x + right.x * across + tangent.x * along;
      const north = site.north - right.z * across - tangent.z * along;
      put(i % 2 ? 'stoneLight' : 'stoneDark', new BoxGeometry(.72, .72, .82),
        local(across, along, Math.max(site.waterLevel + .18, groundAt(east, north) + .26)),
        side * .12);
    }
    const across = side * 2.75;
    const east = centre.x + right.x * across + tangent.x * (site.radius + INLET_REACH);
    const north = site.north - right.z * across - tangent.z * (site.radius + INLET_REACH);
    const base = Math.max(site.waterLevel - .45, groundAt(east, north));
    put('timber', new CylinderGeometry(.13, .17, 1.65, 7), local(across, site.radius + INLET_REACH, base + .825));
  }
  put('timber', new BoxGeometry(5.85, .2, .24),
    local(0, site.radius + INLET_REACH, site.waterLevel + 1.22), 0);
  for (const side of [-1, 1]) {
    put('stoneLight', new BoxGeometry(1.18, .58, .74),
      local(side * 1.48, site.radius + 1.02, site.waterLevel + .12), side * .08);
  }

  // Low outlet stones and reeds make both water edges readable at first-person height.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const along = -site.radius - i * 1.15;
      const across = side * 2.45;
      const east = centre.x + right.x * across + tangent.x * along;
      const north = site.north - right.z * across - tangent.z * along;
      put('stoneDark', new BoxGeometry(.68, .56, .86),
        local(across, along, Math.max(site.waterLevel + .1, groundAt(east, north) + .2)), side * .09);
    }
  }
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2 + .17;
    const across = Math.cos(angle) * (site.radius + .8);
    const along = Math.sin(angle) * (site.radius + .8);
    if (inChannelGap(across, along) || i % 4 === 0) continue;
    const east = centre.x + right.x * across + tangent.x * along;
    const north = site.north - right.z * across - tangent.z * along;
    const base = Math.max(site.waterLevel - .12, groundAt(east, north));
    for (let stem = 0; stem < 3; stem++) {
      const height = .72 + .22 * Math.sin(i * 3.1 + stem);
      put('reeds', new CylinderGeometry(.018, .026, height, 5),
        local(across + (stem - 1) * .13, along + .08 * Math.sin(stem * 2), base + height / 2),
        stem * .7);
    }
  }
  const driftPosition = local(-4.1, -site.radius + .2, 0);
  put('timber', new BoxGeometry(2.7, .22, .28),
    local(-4.1, -site.radius + .2,
      Math.max(site.waterLevel + .42, groundAt(driftPosition.x, -driftPosition.z) + .16)), -.38);

  const materials: Record<Family, MeshLambertMaterial> = {
    bed: new MeshLambertMaterial({ color: '#354f52' }),
    shallow: new MeshLambertMaterial({ color: '#9b9b7c' }),
    stoneLight: new MeshLambertMaterial({ color: '#858a80' }),
    stoneDark: new MeshLambertMaterial({ color: '#596660' }),
    timber: new MeshLambertMaterial({ color: '#72523a' }),
    reeds: new MeshLambertMaterial({ color: '#8b8b58' }),
  };
  const names: Record<Family, string> = {
    bed: 'pool-basin-bed', shallow: 'pool-shallow-shelf', stoneLight: 'pool-stone-bank-light',
    stoneDark: 'pool-stone-bank-dark', timber: 'pool-timber-weir-and-driftwood', reeds: 'pool-shore-reeds',
  };
  for (const family of Object.keys(batches) as Family[]) {
    const pieces = batches[family];
    if (!pieces.length) continue;
    const geometry = mergeGeometries(pieces);
    pieces.forEach(piece => piece.dispose());
    if (!geometry) throw new Error(`AW-3 pool: failed to merge ${family} geometry.`);
    const mesh = new Mesh(geometry, materials[family]);
    mesh.name = names[family];
    group.add(mesh);
  }

  // Paint the existing river slot without editing its height field.
  const poolWater = flatDisk(site.radius * .985, 72, site.waterLevel + .025);
  poolWater.translate(site.east, 0, -site.north);
  const waterMaterial = new MeshBasicMaterial({
    color: '#78aeb7', vertexColors: true, transparent: true, opacity: .86,
    depthTest: true, depthWrite: false, side: DoubleSide,
  });
  const water = new Mesh(poolWater, waterMaterial);
  water.name = 'pool-water';
  water.renderOrder = 3;
  group.add(water);

  const inletWater = creekRibbon(site.north + site.radius * .68,
    site.north + site.radius + INLET_REACH, 2.55, 2.15);
  const outletWater = creekRibbon(site.north - site.radius * .68,
    site.north - site.radius - 7.5, 2.45, 1.75);
  const creekMaterial = waterMaterial.clone();
  creekMaterial.vertexColors = false;
  const inlet = new Mesh(inletWater, creekMaterial);
  inlet.name = 'pool-inlet-water';
  inlet.renderOrder = 3;
  const outlet = new Mesh(outletWater, creekMaterial.clone());
  outlet.name = 'pool-outflow-water';
  outlet.renderOrder = 3;
  group.add(inlet, outlet);

  const rippleMaterial = new MeshBasicMaterial({
    color: '#d0e5e3', transparent: true, opacity: .28,
    depthTest: true, depthWrite: false, side: DoubleSide,
  });
  const rippleParts: BufferGeometry[] = [];
  for (const [radius, start, length] of [[4.8, .2, 2.2], [7.4, 2.7, 1.7], [10.6, 4.2, 1.25]]) {
    const ring = new RingGeometry(radius, radius + .055, 36, 1, start, length);
    ring.rotateX(-Math.PI / 2);
    ring.translate(site.east + 1.2, site.waterLevel + .045, -site.north - .7);
    rippleParts.push(nonIndexed(ring));
  }
  const ripples = new Mesh(mergeGeometries(rippleParts)!, rippleMaterial);
  rippleParts.forEach(part => part.dispose());
  ripples.name = 'pool-surface-ripples';
  ripples.renderOrder = 4;
  group.add(ripples);

  let disposed = false;
  return {
    group,
    site,
    waterLevel: site.waterLevel,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      const geometries = new Set<BufferGeometry>();
      const ownedMaterials = new Set<MeshBasicMaterial | MeshLambertMaterial>();
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(material => ownedMaterials.add(material));
      });
      geometries.forEach(geometry => geometry.dispose());
      ownedMaterials.forEach(material => material.dispose());
      group.clear();
    },
  };
}
