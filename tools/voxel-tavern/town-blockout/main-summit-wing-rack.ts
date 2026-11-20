import { Box3, BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { isWithinSummitWingRackReach, summitWingRackStand } from '../../../src/shared/summit-wing-pickup';
import { createSnowWingVisual } from './flight-equipment-visuals';

type Size = readonly [width: number, height: number, depth: number];

export { summitWingRackStand };

export function mountMainSummitWingRack(owner: Group) {
  const group = new Group();
  group.name = 'main-summit-wing-rack';
  const geometry = new BoxGeometry();
  const materials = {
    timber: new MeshLambertMaterial({ color: '#73543d' }),
    grain: new MeshLambertMaterial({ color: '#9a7657' }),
    iron: new MeshLambertMaterial({ color: '#48464a' }),
    brass: new MeshLambertMaterial({ color: '#bf9b63' }),
  };
  const frameColliders: Box3[] = [];
  const floor = summitWingRackStand.height;
  const mid = summitWingRackStand.north;

  function addPart(name: string, east: number, north: number, lift: number, size: Size,
    surface: keyof typeof materials, solid = true) {
    const mesh = new Mesh(geometry, materials[surface]);
    mesh.name = name;
    mesh.position.set(east, floor + lift, -north);
    mesh.scale.set(...size);
    group.add(mesh);
    if (solid) frameColliders.push(new Box3().setFromObject(mesh));
  }

  for (const offset of [-1.55, 1.55]) {
    const north = mid + offset;
    addPart('rack-foot', 67.92, north, .075, [.90, .15, .36], 'timber');
    addPart('rack-upright', 68.19, north, 1.18, [.22, 2.16, .22], 'timber');
    addPart('rack-upright-shoe', 68.19, north, .20, [.25, .15, .25], 'iron');
    addPart('rack-upright-cap', 68.19, north, 2.28, [.25, .08, .26], 'grain');
  }
  addPart('rack-lower-rail', 68.12, mid, .65, [.18, .18, 3.16], 'timber');
  addPart('rack-cradle-rail', 68.12, mid, 1.26, [.18, .17, 3.16], 'grain');
  for (const north of [mid - .34, mid + .34]) {
    addPart('rack-cradle-peg', 67.94, north, 1.15, [.46, .16, .14], 'timber');
    addPart('rack-cradle-keeper', 67.73, north, 1.24, [.06, .17, .16], 'iron');
  }
  addPart('rack-wing-plaque', 68.00, mid, .65, [.10, .23, .40], 'iron');
  addPart('rack-wing-plaque-emblem', 67.94, mid, .66, [.02, .055, .25], 'brass', false);
  for (const north of [mid - .095, mid + .095]) {
    addPart('rack-wing-plaque-tip', 67.94, north, .70, [.02, .025, .065], 'brass', false);
  }

  const wing = createSnowWingVisual();
  wing.group.name = 'snow-wing-rack-cloth';
  // Turn the cloth toward the aisle and keep its span parallel to the hut's east wall.
  wing.group.rotation.set(Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
  wing.group.position.set(67.63, floor + 1.55, -mid);
  wing.group.updateMatrix();
  const wingCollider = wing.bounds.clone().applyMatrix4(wing.group.matrix);
  group.add(wing.group);
  owner.add(group);

  function intersectsBody(box: Box3, east: number, north: number, feet: number, radius: number, bodyHeight: number) {
    if (feet + bodyHeight - .025 <= box.min.y || feet + .025 >= box.max.y) return false;
    const dx = Math.max(box.min.x - east, 0, east - box.max.x);
    const dz = Math.max(box.min.z + north, 0, -north - box.max.z);
    return Math.hypot(dx, dz) < radius;
  }

  return {
    group,
    stand: summitWingRackStand,
    canReach: isWithinSummitWingRackReach,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      return frameColliders.some(box => intersectsBody(box, east, north, feet, radius, bodyHeight)) ||
        (wing.group.visible && intersectsBody(wingCollider, east, north, feet, radius, bodyHeight));
    },
    setClaimed(claimed: boolean) {
      wing.group.visible = !claimed;
    },
    dispose() {
      group.removeFromParent();
      wing.dispose();
      group.clear();
      geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
