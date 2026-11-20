import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, type Scene } from 'three';
import type { TavernRecipe } from './tavern-mix-book';
import type { TavernCupRow } from './tavern-seats';

const glaze = '#e8c9a0';
const ceramic = '#b87959';
const parts = [
  [0, .013, 0, .126, .026, .123, ceramic],
  [-.053, .066, 0, .020, .09, .123, glaze],
  [.053, .066, 0, .020, .09, .123, glaze],
  [0, .066, -.052, .090, .09, .019, ceramic],
  [0, .066, .052, .090, .09, .019, glaze],
  [0, .082, 0, .088, .025, .084],
] as const;

export function createTavernTableCups(scene: Scene, limit: number) {
  const batch = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial({
    emissive: '#5b2b1b', emissiveIntensity: .31,
  }), limit * parts.length);
  batch.name = '酒馆 · 就座酒杯';
  batch.instanceMatrix.setUsage(DynamicDrawUsage);
  batch.count = 0;
  batch.visible = false;
  scene.add(batch);

  const pose = new Object3D();
  const color = new Color();
  const shown: TavernRecipe[] = [];
  let current: TavernCupRow | undefined;
  function update(row: TavernCupRow | undefined, drinks: readonly TavernRecipe[]) {
    const count = row ? Math.min(limit, drinks.length) : 0;
    if (!count) {
      batch.visible = false;
      batch.count = 0;
      shown.length = 0;
      current = undefined;
      return;
    }
    if (!row || (current === row && shown.length === count && shown.every((drink, index) => drink === drinks[index]))) return;

    current = row;
    shown.length = count;
    const cos = Math.cos(row.yaw);
    const sin = Math.sin(row.yaw);
    pose.rotation.y = -row.yaw;
    let index = 0;
    for (let cup = 0; cup < count; cup++) {
      const drink = drinks[cup];
      shown[cup] = drink;
      const offset = (cup - (limit - 1) / 2) * .20;
      for (const [x, y, z, w, h, d, tint] of parts) {
        pose.position.set(row.x + (offset + x) * cos - z * sin,
          row.y + y, -row.n + (offset + x) * sin + z * cos);
        pose.scale.set(w, h, d);
        pose.updateMatrix();
        batch.setMatrixAt(index, pose.matrix);
        batch.setColorAt(index++, color.set(tint ?? drink.color));
      }
    }
    batch.count = index;
    batch.instanceMatrix.needsUpdate = true;
    batch.instanceColor!.needsUpdate = true;
    batch.computeBoundingSphere();
    batch.visible = true;
  }

  return { update };
}
