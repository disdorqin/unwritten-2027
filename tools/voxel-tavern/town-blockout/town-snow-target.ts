import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, Vector3, type Scene } from 'three';
import type { TownActivity } from './town-activity';

export type TownSnowballTarget = {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  onHit(incomingX: number, incomingZ: number): void;
};

export const snowPracticeStand = [223, 166] as const;
export const snowPracticeTarget = [223, 173] as const;

export function createSnowPracticeTarget(scene: Scene, heightAt: (east: number, north: number) => number):
  TownActivity & { snowballTargets: readonly TownSnowballTarget[] } {
  const [east, north] = snowPracticeTarget;
  const ground = heightAt(east, north);
  // The profile is shared by a single instance batch. Details face the snowy practice lane.
  const pieces = [
    [0, .18, 0, 1.10, .36, .93, '#c8d8e8'],
    [0, .50, 0, 1.20, .41, 1.06, '#e5eef7'],
    [0, .77, 0, 1.04, .16, .90, '#e9f2f9'],
    [0, .93, 0, .81, .19, .73, '#ecf4fc'],
    [0, 1.16, 0, .92, .40, .79, '#ebf3fa'],
    [0, 1.44, 0, .69, .17, .62, '#dfecf8'],
    [0, 1.58, 0, .60, .17, .55, '#eff6fc'],
    [0, 1.78, 0, .72, .31, .66, '#f2f7fb'],
    [0, 2.00, 0, .66, .16, .61, '#e7f0f9'],
    [0, 2.115, 0, .83, .10, .78, '#312c3f'],
    [0, 2.24, 0, .60, .22, .55, '#374257'],
    [0, 2.15, .01, .61, .07, .565, '#914758'],
    [0, 1.48, 0, .74, .11, .66, '#a93c4e'],
    [.17, 1.32, .41, .16, .31, .058, '#b74457'],
    [.17, 1.193, .44, .16, .06, .062, '#ead899'],
    [-.13, 1.85, .34, .07, .07, .056, '#322f41'],
    [.13, 1.85, .34, .07, .07, .056, '#322f41'],
    [0, 1.76, .43, .09, .085, .21, '#dc843b'],
    [0, 1.16, .407, .073, .081, .045, '#464353'],
    [0, .90, .378, .075, .078, .042, '#464353'],
    [-.49, 1.02, .13, .12, .13, .15, '#b3c8de'],
    [.49, 1.02, .13, .12, .13, .15, '#b3c8de'],
  ] as const;
  const model = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), pieces.length);
  model.name = 'town-snow-practice-target';
  model.instanceMatrix.setUsage(DynamicDrawUsage);
  const transform = new Object3D();
  const tilt = new Vector3();
  const color = new Color();
  const reboundTime = .34;
  let remaining = 0;
  let side = 0;
  let forward = 0;

  function pose(rebound: number) {
    for (let i = 0; i < pieces.length; i++) {
      const [x, y, z, width, height, depth] = pieces[i];
      transform.position.set(east + x + side * y * rebound * .12,
        ground + y * (1 - rebound * .07), -north + z + forward * y * rebound * .12);
      if (rebound > 0) transform.quaternion.setFromAxisAngle(tilt, rebound * .12);
      else transform.quaternion.identity();
      transform.scale.set(width, height, depth);
      transform.updateMatrix();
      model.setMatrixAt(i, transform.matrix);
    }
    model.instanceMatrix.needsUpdate = true;
  }

  pieces.forEach((piece, index) => model.setColorAt(index, color.set(piece[6])));
  pose(0);
  model.computeBoundingSphere();
  model.boundingSphere!.radius += .3;
  scene.add(model);

  const target: TownSnowballTarget = {
    id: 'snow-practice',
    label: '练习雪人',
    x: east,
    y: ground,
    z: -north,
    radius: .58,
    height: 2.35,
    onHit(x, z) {
      const length = Math.hypot(x, z);
      const directed = Number.isFinite(length) && length > 0;
      side = directed ? x / length : 0;
      forward = directed ? z / length : 1;
      tilt.set(forward, 0, -side);
      remaining = reboundTime;
    },
  };

  return {
    spots: [],
    snowballTargets: [target],
    blocked(x, n, feet) { return feet < ground + 2.35 && Math.hypot(x - east, n - north) < .85; },
    update(dt) {
      if (!remaining) return;
      remaining = Math.max(0, remaining - dt);
      pose(Math.sin(Math.PI * remaining / reboundTime));
    },
  };
}
