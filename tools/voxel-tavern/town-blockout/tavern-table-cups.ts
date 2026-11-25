import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, type Scene } from 'three';
import type { TavernRecipe } from './tavern-mix-book';
import type { TavernCupRow } from './tavern-seats';

const glaze = '#a98a56';
const ceramic = '#5d4630';
const parts = [
  [0, .015, 0, .146, .030, .143, ceramic],
  [-.062, .078, 0, .022, .104, .143, ceramic],
  [.062, .078, 0, .022, .104, .143, glaze],
  [0, .078, -.060, .104, .104, .023, ceramic],
  [0, .078, .060, .104, .104, .023, glaze],
  [.104, .105, 0, .063, .024, .026, glaze],
  [.104, .049, 0, .063, .024, .026, ceramic],
  [.134, .077, 0, .021, .071, .028, ceramic],
  [0, .097, 0, .102, .025, .100],
] as const;

export function createTavernTableCups(scene: Scene) {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), parts.length);
  batch.name = '酒馆 · 就座酒杯';
  batch.instanceMatrix.setUsage(DynamicDrawUsage);
  batch.count = 0;
  batch.visible = false;
  scene.add(batch);

  const pose = new Object3D();
  const color = new Color();
  let current: TavernCupRow | undefined;
  let shownColor: string | undefined;
  function update(row: TavernCupRow | undefined, drink: TavernRecipe | undefined) {
    if (!row || !drink) {
      batch.visible = false;
      batch.count = 0;
      current = undefined;
      shownColor = undefined;
      return;
    }
    if (current === row && shownColor === drink.color) return;

    current = row;
    shownColor = drink.color;
    const cos = Math.cos(row.yaw);
    const sin = Math.sin(row.yaw);
    pose.rotation.y = -row.yaw;
    for (const [index, [x, y, z, w, h, d, tint]] of parts.entries()) {
      pose.position.set(row.x + x * cos - z * sin, row.y + y, -row.n + x * sin + z * cos);
      pose.scale.set(w, h, d);
      pose.updateMatrix();
      batch.setMatrixAt(index, pose.matrix);
      batch.setColorAt(index, color.set(tint ?? drink.color));
    }
    batch.count = parts.length;
    batch.instanceMatrix.needsUpdate = true;
    batch.instanceColor!.needsUpdate = true;
    batch.computeBoundingSphere();
    batch.visible = true;
  }

  return { update };
}
