import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { createMainSummitCable } from './main-summit-cable';
import { sampleTownD2R30Height } from './town-d2-r30-domain';

type SummitCable = ReturnType<typeof createMainSummitCable>;

/**
 * D2-R02: dense, terrain-supported towers for the canonical 1920 m line-two
 * cable on the R30 massif. The rope survey, cabin physics and station geometry
 * are untouched; this module only adds solid towers between rope and ground.
 * Every tower base sits on the R30 height field and every top reaches the rope,
 * so the line is never a floating wire over a 150 m void.
 */
export type TownD2R30CableTowersOptions = Readonly<{
  cable?: SummitCable;
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
  /** Metres between towers along the rope (default 60). */
  spacing?: number;
}>;

export type TownD2R30CableTowersStats = Readonly<{
  towers: number;
  spacing: number;
  ropeMetres: number;
  maxTowerHeight: number;
  minClearance: number;
  drawCalls: number;
  triangles: number;
  skipNearStation: number;
}>;

const DEFAULTS = Object.freeze({ spacing: 60, skipNearStation: 45, towerTop: .35, ropeHalfSpan: 3 });

export function createTownD2R30CableTowers(options: TownD2R30CableTowersOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const spacing = options.spacing ?? DEFAULTS.spacing;
  if (!Number.isFinite(arrivalHeight) || !Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError('Invalid D2-R02 cable tower parameters.');
  }
  const cable = options.cable ?? createMainSummitCable(0, 10_000, arrivalHeight);
  const heightAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  const groundAt = (east: number, north: number) => {
    const value = heightAt(east, north, arrivalHeight);
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  };

  const group = new Group();
  group.name = 'town-d2-r30-cable-towers';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const iron = new MeshLambertMaterial({ color: '#5a6268' });
  iron.name = 'town-d2-r30-cable-tower-iron';
  materials.add(iron);

  const rope = cable.ropes[0];
  const ropeLength = rope.totalMetres;
  let meshIndex = 0;
  const addMesh = (tower: Group, geometry: BufferGeometry) => {
    geometries.add(geometry);
    const mesh = new Mesh(geometry, iron);
    mesh.name = `town-d2-r30-cable-tower-mesh-${++meshIndex}`;
    tower.add(mesh);
  };

  let towers = 0, maxHeight = 0, minClearance = Infinity, skipped = 0;
  for (let distance = DEFAULTS.skipNearStation; distance < ropeLength - DEFAULTS.skipNearStation; distance += spacing) {
    const at = rope.sample(distance);
    const ground = groundAt(at.east, at.north);
    if (ground === undefined) { skipped++; continue; }
    const ropeHeight = at.height - DEFAULTS.towerTop;
    const height = ropeHeight - ground;
    if (height <= 1) { skipped++; continue; }
    towers++;
    maxHeight = Math.max(maxHeight, height);
    minClearance = Math.min(minClearance, height);

    const tower = new Group();
    tower.name = `town-d2-r30-cable-tower-${towers}`;
    tower.position.set(at.east, 0, -at.north);
    addMesh(tower, new CylinderGeometry(.28, .62, height, 6).translate(0, ground + height / 2, 0));
    // Crossbar spans both rope lines so one tower supports both cabins.
    const bar = new BoxGeometry(DEFAULTS.ropeHalfSpan * 2 + 1.5, .3, .35);
    bar.rotateY(-at.heading);
    bar.translate(0, ropeHeight + .25, 0);
    addMesh(tower, bar);
    // A diagonal brace makes the tall spans a readable rigid frame.
    if (height > 12) {
      const brace = new BoxGeometry(.18, height * .45, .18);
      brace.rotateZ(.32);
      brace.translate(0, ground + height * .3, 0);
      addMesh(tower, brace);
    }
    group.add(tower);
  }

  let triangles = 0;
  for (const geometry of geometries) {
    triangles += (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  }
  const stats: TownD2R30CableTowersStats = Object.freeze({
    towers,
    spacing,
    ropeMetres: ropeLength,
    maxTowerHeight: towers ? maxHeight : 0,
    minClearance: towers ? minClearance : 0,
    drawCalls: geometries.size,
    triangles,
    skipNearStation: skipped,
  });
  group.userData = {
    owner: 'D2-R02', visualOnly: true, includesWorldCollision: false,
    modifiesHeightAt: false, modifiesCable: false, stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  return {
    group,
    stats: () => stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
