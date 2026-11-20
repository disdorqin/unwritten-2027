import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { UndergroundMineGateStage } from '../../../src/presence/underground-mine-gate.js';
import type { createUndergroundMineExpansionShell } from './underground-mine-expansion-shell.js';

type Gate = NonNullable<ReturnType<typeof createUndergroundMineExpansionShell>['gate']>;
type SwitchPose = Readonly<{
  position: readonly [x: number, y: number, z: number];
  /** Three.js yaw in the mounted scene. */
  yaw: number;
}>;

function createSwitchMaterials() {
  return {
    iron: new MeshStandardMaterial({ color: 0x414952, metalness: .32, roughness: .79 }),
    edge: new MeshStandardMaterial({ color: 0x68717a, metalness: .26, roughness: .84 }),
    timber: new MeshStandardMaterial({ color: 0x635244, roughness: .96 }),
  };
}

function createBlockFactory(shape: BoxGeometry) {
  return function block(parent: Group, material: MeshStandardMaterial | MeshBasicMaterial,
      x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new Mesh(shape, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  };
}

function buildGateSwitch(block: ReturnType<typeof createBlockFactory>, { iron, edge, timber }: ReturnType<typeof createSwitchMaterials>) {
  const group = new Group();
  block(group, timber, 0, .48, 0, .21, .96, .23);
  block(group, iron, 0, .92, 0, .31, .32, .30);
  const handle = new Group();
  handle.name = 'crystal-gate-switch-handle';
  handle.position.set(0, .92, -.15);
  group.add(handle);
  block(handle, edge, 0, .18, 0, .065, .4, .07);
  block(handle, timber, 0, .38, -.11, .09, .09, .24);
  return {
    group,
    update(stage: UndergroundMineGateStage) {
      handle.rotation.z = stage === 'closed' ? -.65 : stage === 'ajar' ? .4 : 1.1;
    },
  };
}

/** Mount in the registered crystal domain and dispatch interaction through its accepted-foot authority. */
export function createUndergroundCrystalReturnSwitch({ position, yaw }: SwitchPose) {
  if (![...position, yaw].every(Number.isFinite)) throw new RangeError('Invalid crystal return switch pose');
  const shape = new BoxGeometry();
  const materials = createSwitchMaterials();
  const { group, update } = buildGateSwitch(createBlockFactory(shape), materials);
  group.name = 'crystal-gate-return-switch';
  group.position.set(...position);
  group.rotation.y = yaw;
  update('closed');

  let disposed = false;
  return {
    group, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      shape.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

/** The mine layout supplies the same opening and clearance to rendering and movement. */
export function createUndergroundCrystalGate(gate: Gate) {
  const { position, width, height, thickness } = gate;
  const group = new Group();
  group.name = 'mine-crystal-gate';
  group.position.set(...position);
  const leaf = new Group();
  leaf.name = 'mine-crystal-gate-leaf';
  group.add(leaf);

  const shape = new BoxGeometry();
  const switchMaterials = createSwitchMaterials();
  const { iron, edge, timber } = switchMaterials;
  const oxide = new MeshStandardMaterial({ color: 0x6e5044, roughness: .95 });
  const cold = new MeshBasicMaterial({ color: 0x82e4ed, transparent: true, depthWrite: false });
  const crystal = new MeshStandardMaterial({ color: 0x8dc6cc, emissive: 0x243d42, roughness: .38 });
  const block = createBlockFactory(shape);

  // Leaf child heights are normalized. Its bottom tracks the actual passage clearance.
  block(leaf, iron, 0, .5, 0, width, 1, thickness);
  for (const side of [-1, 1]) {
    const face = side * (thickness / 2 + .018);
    for (const line of [.11, .51, .9]) {
      block(leaf, edge, 0, line, face, width * .99, .035, .036);
      for (const offset of [-.43, -.22, 0, .22, .43]) {
        block(leaf, oxide, width * offset, line, face + side * .022, .055, .018, .024);
      }
    }
    for (const seam of [-.25, 0, .25]) block(leaf, edge, width * seam, .5, face, .027, .96, .022);
  }
  for (const side of [-1, 1]) {
    const jamb = side * (width / 2 + .065);
    block(group, iron, jamb, height / 2, -.1, .13, height, .28);
    for (let index = 0; index < 4; index++) {
      const chip = block(group, crystal, jamb + side * (.12 + index * .052), .17 + index * .18,
        -.16 - index * .066, .065, .13 + index * .023, .09);
      chip.rotation.z = side * (.2 + index * .17);
    }
  }
  block(group, edge, 0, height + .12, -.06, width + .5, .24, .3);
  block(group, iron, 0, height + .33, -.09, width + .34, .20, .25);

  const winchPosition = [position[0] - width / 2 - .28, position[1], position[2] - .78] as const;
  const winch = buildGateSwitch(block, switchMaterials);
  winch.group.name = 'mine-crystal-gate-winch';
  winch.group.position.set(winchPosition[0] - position[0], 0, winchPosition[2] - position[2]);
  group.add(winch.group);

  const spill = block(group, cold, 0, .006, .02, width * .93, .01, .68);
  spill.name = 'mine-crystal-gate-cold-spill';

  function batchParts(parent: Group, material: MeshStandardMaterial) {
    const parts = parent.children.filter((child): child is Mesh => child instanceof Mesh && child.material === material);
    if (parts.length < 2) return;
    const batch = new InstancedMesh(shape, material, parts.length);
    for (const [index, part] of parts.entries()) {
      part.updateMatrix();
      batch.setMatrixAt(index, part.matrix);
      parent.remove(part);
    }
    batch.computeBoundingSphere();
    parent.add(batch);
  }

  batchParts(leaf, edge);
  batchParts(leaf, oxide);
  batchParts(group, iron);
  batchParts(group, crystal);

  function update(stage: UndergroundMineGateStage) {
    const gap = gate.gapFor(stage);
    leaf.position.y = gap;
    leaf.scale.y = height - gap;
    leaf.visible = gap < height;
    spill.visible = gap > 0;
    cold.opacity = stage === 'open' ? .48 : .24;
    winch.update(stage);
  }

  update('closed');
  return {
    group, update, winchPosition,
    dispose() {
      group.removeFromParent();
      group.traverse(child => { if (child instanceof InstancedMesh) child.dispose(); });
      shape.dispose();
      for (const material of [iron, edge, oxide, timber, cold, crystal]) material.dispose();
    },
  };
}
