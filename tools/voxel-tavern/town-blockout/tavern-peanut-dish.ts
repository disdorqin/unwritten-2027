import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

// Tavern peanut dish (zone-1 built piece, approved 2026-11-21): a small
// bar-top dish of fried peanuts. Three touches by design: see it on the
// bar (ZA-20 places it), pick peanuts up (ZB-22 pickup grammar owns the
// interaction), feed them to 小未 (her behaviour table already lists
// 炒花生 as feedable; ZB-25 consumes). This module is only the prop +
// its pickup anchor spec; it carries no interaction logic of its own.

export const PEANUT_DISH_PICKUP_ID = 'tavern-peanut-dish';
/** Peanuts are taken a few at a time; the dish refills on the tavern's own rhythm. */
export const PEANUT_DISH_SERVING = 3;

const boxGeometry = new BoxGeometry();
const ceramic = new MeshLambertMaterial({ color: '#c3d2e1' });
const ceramicRim = new MeshLambertMaterial({ color: '#8a8378' });
const peanutShell = new MeshLambertMaterial({ color: '#a98a56' });
const peanutSkin = new MeshLambertMaterial({ color: '#8a4a34' });

function part(parent: Group, material: MeshLambertMaterial, x: number, y: number, z: number,
  size: [number, number, number], yaw = 0) {
  const mesh = new Mesh(boxGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.rotation.y = yaw;
  parent.add(mesh);
  return mesh;
}

/** A ~26 cm dish; origin at the counter surface under the dish centre. */
export function createPeanutDish() {
  const dish = new Group();
  dish.name = 'tavern-peanut-dish';
  part(dish, ceramicRim, 0, 0.015, 0, [0.3, 0.03, 0.3]);
  part(dish, ceramic, 0, 0.045, 0, [0.26, 0.03, 0.26]);
  // A small heap of peanuts: shells with a few skinned kernels on top.
  const heap: [number, number, number, number][] = [
    [-0.06, 0.075, -0.04, 0.4], [0.05, 0.075, -0.06, 1.1], [0, 0.075, 0.05, 2.0],
    [-0.08, 0.075, 0.05, 2.6], [0.08, 0.075, 0.03, 0.9], [0.02, 0.095, -0.01, 1.7],
    [-0.03, 0.095, 0.02, 0.2],
  ];
  for (const [x, y, z, yaw] of heap) part(dish, peanutShell, x, y, z, [0.045, 0.028, 0.03], yaw);
  part(dish, peanutSkin, -0.01, 0.105, -0.03, [0.03, 0.02, 0.022], 0.7);
  part(dish, peanutSkin, 0.045, 0.1, 0.045, [0.03, 0.02, 0.022], 2.4);
  dish.userData.pickup = {
    id: PEANUT_DISH_PICKUP_ID,
    serving: PEANUT_DISH_SERVING,
    // Anchor at dish centre, hand height above the counter surface.
    anchor: { up: 0.12, radius: 0.45 },
    feedsMascot: true,
  };
  return dish;
}

/**
 * Host signature for ZA-20's tavern builder: place the dish on the bar
 * counter top near the fire-side end, at counter-local (x, counterTopY, z).
 */
export function mountPeanutDish(parent: Group, at: { x: number; y: number; z: number }, yaw = 0) {
  const dish = createPeanutDish();
  dish.position.set(at.x, at.y, at.z);
  dish.rotation.y = yaw;
  parent.add(dish);
  return {
    group: dish,
    pickupId: PEANUT_DISH_PICKUP_ID,
    dispose() { parent.remove(dish); },
  };
}
