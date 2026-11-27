import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial,
  StaticDrawUsage,
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
 *
 * D2-R10 (2026-11-25): the towers ship as three instanced batches (mast,
 * crossbar, brace) instead of 90 individual meshes. The per-tower transforms,
 * radii and heights are unchanged — only the draw submission is collapsed, so
 * a 1,920 m ropeway line no longer costs 90 draw calls for 1,452 triangles.
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

  // Unit-height shapes carry the per-tower scale in the instance matrix, so
  // one geometry serves every tower while the silhouette stays identical.
  const mastShape = new CylinderGeometry(.28, .62, 1, 6);
  const barShape = new BoxGeometry(DEFAULTS.ropeHalfSpan * 2 + 1.5, .3, .35);
  const braceShape = new BoxGeometry(.18, 1, .18);
  geometries.add(mastShape);
  geometries.add(barShape);
  geometries.add(braceShape);

  const rope = cable.ropes[0];
  const ropeLength = rope.totalMetres;
  const towers: Array<{ east: number; north: number; heading: number; ground: number; ropeHeight: number; height: number }> = [];
  let maxHeight = 0, minClearance = Infinity, skipped = 0;
  for (let distance = DEFAULTS.skipNearStation; distance < ropeLength - DEFAULTS.skipNearStation; distance += spacing) {
    const at = rope.sample(distance);
    const ground = groundAt(at.east, at.north);
    if (ground === undefined) { skipped++; continue; }
    const ropeHeight = at.height - DEFAULTS.towerTop;
    const height = ropeHeight - ground;
    if (height <= 1) { skipped++; continue; }
    towers.push({ east: at.east, north: at.north, heading: at.heading, ground, ropeHeight, height });
    maxHeight = Math.max(maxHeight, height);
    minClearance = Math.min(minClearance, height);
  }

  const braces = towers.filter(tower => tower.height > 12);
  const mastTriangles = (mastShape.getIndex()?.count ?? mastShape.getAttribute('position').count) / 3;
  const barTriangles = (barShape.getIndex()?.count ?? barShape.getAttribute('position').count) / 3;
  const braceTriangles = (braceShape.getIndex()?.count ?? braceShape.getAttribute('position').count) / 3;

  const batches: InstancedMesh[] = [];
  const addBatch = (
    name: string, shape: BufferGeometry,
    list: ReadonlyArray<(typeof towers)[number]>,
    build: (tower: (typeof towers)[number], matrix: Matrix4) => void,
  ) => {
    if (!list.length) return;
    const mesh = new InstancedMesh(shape, iron, list.length);
    mesh.name = `town-d2-r30-cable-tower-${name}`;
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    const matrix = new Matrix4();
    list.forEach((tower, index) => {
      build(tower, matrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    batches.push(mesh);
  };

  const towerPlacement = new Matrix4();
  addBatch('mast', mastShape, towers, (tower, matrix) => {
    towerPlacement.makeTranslation(tower.east, 0, -tower.north);
    matrix.copy(towerPlacement)
      .multiply(new Matrix4().makeTranslation(0, tower.ground + tower.height / 2, 0))
      .multiply(new Matrix4().makeScale(1, tower.height, 1));
  });
  addBatch('crossbar', barShape, towers, (tower, matrix) => {
    towerPlacement.makeTranslation(tower.east, 0, -tower.north);
    matrix.copy(towerPlacement)
      .multiply(new Matrix4().makeTranslation(0, tower.ropeHeight + .25, 0))
      .multiply(new Matrix4().makeRotationY(-tower.heading));
  });
  addBatch('brace', braceShape, braces, (tower, matrix) => {
    towerPlacement.makeTranslation(tower.east, 0, -tower.north);
    matrix.copy(towerPlacement)
      .multiply(new Matrix4().makeTranslation(0, tower.ground + tower.height * .3, 0))
      .multiply(new Matrix4().makeRotationZ(.32))
      .multiply(new Matrix4().makeScale(1, tower.height * .45, 1));
  });

  const triangles = towers.length * (mastTriangles + barTriangles) + braces.length * braceTriangles;
  const stats: TownD2R30CableTowersStats = Object.freeze({
    towers: towers.length,
    spacing,
    ropeMetres: ropeLength,
    maxTowerHeight: towers.length ? maxHeight : 0,
    minClearance: towers.length ? minClearance : 0,
    drawCalls: batches.length,
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
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R02 cable towers are disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      iron.color.set(value ? '#414951' : '#5a6268');
    },
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
