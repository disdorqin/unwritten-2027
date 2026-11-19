import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, type Scene } from 'three';
import {
  CAPTURE_MS, POINT_RADIUS, SnowWallField, WALL_CELL, WALL_BLOCK_HP, WALL_MAX_LAYERS, WALL_TOWN_CAP,
  classifyWallSite, wallCellCentre,
} from '../../../src/presence/snowfight';
import type { Box } from './landmark-kit';
import type { TownSnowballTarget } from './town-snow-target';

export const fortressBattleMs = 360_000;

type FortressCell = { gx: number; gy: number; layers: number; sealsBell?: boolean };
export type FortressBlueprint = {
  walls: readonly FortressCell[];
  bell: { east: number; north: number };
};
type Position = { east: number; north: number };
type FortressResult = { reason: 'captured' | 'timeout'; elapsedMs: number; wallHits: number; destroyed: number };

/** 从已验场地蓝图创建本地攻坚试局。 */
export function createFortressAssault(options: {
  scene: Scene;
  heightAt(east: number, north: number): number;
  canEnter(east: number, north: number): boolean;
  now(): number;
}) {
  const height = WALL_CELL;
  const halfCell = WALL_CELL / 2;
  const wallMesh = new InstancedMesh(
    new BoxGeometry(WALL_CELL, height, WALL_CELL),
    new MeshLambertMaterial(),
    WALL_TOWN_CAP,
  );
  wallMesh.name = 'solo fortress walls';
  wallMesh.count = 0;
  wallMesh.visible = false;
  wallMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  options.scene.add(wallMesh);
  const pose = new Object3D();
  const color = new Color();
  let field: SnowWallField | undefined;
  let config: FortressBlueprint | undefined;
  let startAt = 0;
  let lastAt = 0;
  let captureAt: number | undefined;
  let wallHits = 0;
  let destroyed = 0;
  let result: FortressResult | undefined;
  let targets: TownSnowballTarget[] = [];
  let wallColliders: Box[] = [];

  function refreshWalls() {
    const activeField = field;
    const boxes: Box[] = [];
    targets = (activeField?.snapshot() ?? []).map((block, index) => {
      const { gx, gy, layer, hp } = block;
      const x = wallCellCentre(gx);
      const north = wallCellCentre(gy);
      const y = options.heightAt(x, north) + layer * height;
      const z = -north;
      pose.position.set(x, y + height / 2, z);
      pose.updateMatrix();
      wallMesh.setMatrixAt(index, pose.matrix);
      wallMesh.setColorAt(index, color.set('#eef6ff').multiplyScalar(hp === 3 ? 1 : hp === 2 ? .82 : .6));
      boxes.push({
        min: [x - halfCell, y, z - halfCell],
        max: [x + halfCell, y + height, z + halfCell],
      });
      return {
        id: `fortress-wall:${gx}:${gy}:${layer}`,
        label: '雪墙',
        x, y, z, radius: halfCell, height, shape: 'box',
        onHit() {
          const now = options.now();
          if (!activeField || activeField !== field || now >= startAt + fortressBattleMs) return;
          const outcome = activeField.damage(gx, gy, layer, now);
          if (!outcome) return;
          wallHits++;
          if ('destroyed' in outcome) destroyed += outcome.destroyed.length;
          refreshWalls();
        },
      } satisfies TownSnowballTarget;
    });
    wallColliders = boxes;
    wallMesh.count = targets.length;
    wallMesh.visible = targets.length > 0;
    wallMesh.instanceMatrix.needsUpdate = true;
    if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    if (wallMesh.visible) wallMesh.computeBoundingSphere();
  }

  function start(blueprint: FortressBlueprint) {
    if (field || !blueprint.walls.some(wall => wall.sealsBell)) return false;
    const next = new SnowWallField();
    const now = options.now();
    const bell = blueprint.bell;
    if (!Number.isFinite(bell.east) || !Number.isFinite(bell.north) ||
        !options.canEnter(bell.east, bell.north) || !Number.isFinite(options.heightAt(bell.east, bell.north))) return false;
    for (const { gx, gy, layers } of blueprint.walls) {
      if (!Number.isInteger(gx) || !Number.isInteger(gy) || !Number.isInteger(layers) ||
          layers < 1 || layers > WALL_MAX_LAYERS || next.height(gx, gy) !== 0) return false;
      const east = wallCellCentre(gx), north = wallCellCentre(gy);
      if (classifyWallSite(east, north) || !options.canEnter(east, north) ||
          !Number.isFinite(options.heightAt(east, north))) return false;
      for (let layer = 0; layer < layers; layer++) {
        if ('reason' in next.place(gx, gy, 1, 1, now)) return false;
      }
    }
    field = next;
    config = { bell: { ...bell }, walls: blueprint.walls.map(wall => ({ ...wall })) };
    startAt = lastAt = now;
    captureAt = undefined;
    result = undefined;
    wallHits = destroyed = 0;
    refreshWalls();
    return true;
  }

  function finish(reason: FortressResult['reason'], elapsedMs: number) {
    result = { reason, elapsedMs, wallHits, destroyed };
    field = config = undefined;
    captureAt = undefined;
    refreshWalls();
  }

  function update(position?: Position) {
    if (!field || !config) return;
    lastAt = Math.max(lastAt, options.now());
    if (lastAt >= startAt + fortressBattleMs) {
      finish('timeout', fortressBattleMs);
      return;
    }
    const { bell, walls } = config;
    const occupied = position && Math.hypot(position.east - bell.east, position.north - bell.north) <= POINT_RADIUS;
    const activeField = field;
    if (!occupied || walls.some(wall => wall.sealsBell && activeField.height(wall.gx, wall.gy) > 0)) {
      captureAt = undefined;
      return;
    }
    captureAt ??= lastAt;
    if (lastAt - captureAt >= CAPTURE_MS) finish('captured', lastAt - startAt);
  }

  function smash(gx: number, gy: number, speed: number) {
    const now = options.now();
    if (!field || field.height(gx, gy) !== 1 || !Number.isFinite(speed) ||
        speed <= 6 || speed > 20 || now >= startAt + fortressBattleMs) return false;
    for (let i = 0; i < WALL_BLOCK_HP; i++) {
      const outcome = field.damage(gx, gy, 0, now);
      if (outcome && 'destroyed' in outcome) {
        destroyed += outcome.destroyed.length;
        refreshWalls();
        return true;
      }
    }
    return false;
  }

  return {
    start, update, smash,
    targets: (): readonly TownSnowballTarget[] => targets,
    colliders: (): readonly Box[] => wallColliders,
    state: () => ({
      active: field !== undefined,
      remainingMs: field ? Math.max(0, startAt + fortressBattleMs - lastAt) : 0,
      captureMs: captureAt === undefined ? 0 : lastAt - captureAt,
      blocks: field?.size ?? 0,
      result,
    }),
  };
}
