import {
  BoxGeometry, BufferAttribute, BufferGeometry, DataTexture, DynamicDrawUsage, Group, InstancedMesh,
  LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Points, PointsMaterial, Sphere, Vector3,
} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
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
    iron: new MeshStandardMaterial({ color: 0x555a5c, map:makeCampGrain('iron'), metalness: .32, roughness: .79 }),
    edge: new MeshStandardMaterial({ color: 0x818b8b, map:makeCampGrain('iron'), metalness: .26, roughness: .84 }),
    timber: new MeshStandardMaterial({ color: 0x886744, map:makeCampGrain('wood'), roughness: .96 }),
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
  // Foot, riveted socket, two reinforcement collars and actual gearbox.
  block(group, timber, 0, .48, 0, .21, .96, .23);
  block(group, iron, 0, .045, 0, .30, .09, .30);
  block(group, edge, 0, .112, 0, .25, .055, .25);
  for(const x of [-.115,.115])for(const z of [-.115,.115])
    block(group, edge, x, .101, z, .037, .038, .037);
  for(const y of [.24,.66]){
    block(group, iron, 0,y,0,.25,.087,.265);
    for(const x of [-.105,.105])block(group,edge,x,y,-.142,.038,.039,.023);
  }
  block(group, iron, 0, .92, 0, .31, .32, .30);
  // Cutaway-looking voxel frame rather than a bare cube. All panels
  // are surface hardware; the lever continues to own its old stage.
  block(group, edge,0,1.087,0,.30,.027,.29);
  block(group, edge,0,.755,0,.30,.026,.29);
  for(const s of [-1,1]){
    block(group,edge,s*.146,.92,0,.024,.27,.28);
    for(const y of [.813,1.027])block(group,edge,s*.113,y,-.157,.033,.036,.021);
  }
  block(group,edge,0,.92,-.158,.18,.18,.022);
  block(group,iron,0,.92,-.177,.115,.115,.025);
  for(const y of [.87,.97])block(group,edge,0,y,.158,.22,.023,.019);
  const handle = new Group();
  handle.name = 'crystal-gate-switch-handle';
  handle.position.set(0, .92, -.15);
  group.add(handle);
  block(handle, edge, 0, .18, 0, .065, .4, .07);
  block(handle, iron,0,.045,0,.103,.116,.09);
  block(handle, edge,0,.045,-.057,.063,.063,.027);
  block(handle, timber, 0, .38, -.11, .09, .09, .24);
  for(const z of [-.204,-.016])block(handle,iron,0,.38,z,.102,.102,.033);
  for(const z of [-.154,-.107,-.060])block(handle,edge,0,.38,z,.096,.096,.018);
  // The same few materials, batched separately on the fixed frame
  // and rotating handle. No 30-draw lever for each side of the gate.
  for(const p of [group,handle])for(const mat of [iron,edge,timber]){
    const meshes=p.children.filter((child):child is Mesh=>child instanceof Mesh&&child.material===mat);
    if(meshes.length<2)continue;
    const batch=new InstancedMesh(meshes[0].geometry,mat,meshes.length);
    meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);p.remove(mesh)});
    batch.computeBoundingSphere();p.add(batch);
  }
  return {
    group,
    update(stage: UndergroundMineGateStage) {
      handle.rotation.z = stage === 'closed' ? -.65 : stage === 'ajar' ? .4 : 1.1;
    },
  };
}

/** Conservative physical envelope of buildGateSwitch, including every
 * accepted handle pose. z is Three local +Z, not geographic north. */
export function r30GateSwitchBlocks(x:number,y:number,z:number,radius:number,height:number){
 const boxes=[{minX:-.16,maxX:.16,minY:0,maxY:1.102,minZ:-.19,maxZ:.17},
  {minX:-.42,maxX:.31,minY:.86,maxY:1.37,minZ:-.39,maxZ:-.08}];
 return boxes.some(b=>b.maxY>y+.025&&b.minY<y+height&&
   Math.hypot(Math.max(0,b.minX-x,x-b.maxX),Math.max(0,b.minZ-z,z-b.maxZ))<radius);
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
      group.traverse(child=>{if(child instanceof InstancedMesh)child.dispose()});
      shape.dispose();
      for (const material of Object.values(materials)) {material.map?.dispose();material.dispose()}
    },
  };
}

function buildGateOpeningEffects(group: Group, box: BoxGeometry, { width, height, thickness }: Gate) {
  const airCount = 12;
  const fadeSize = 16;
  const pixels = new Uint8Array(fadeSize * fadeSize * 4).fill(255);
  for (let y = 0; y < fadeSize; y++) {
    for (let x = 0; x < fadeSize; x++) {
      const radius = Math.hypot((x + .5) * 2 / fadeSize - 1, (y + .5) * 2 / fadeSize - 1);
      pixels[(y * fadeSize + x) * 4 + 3] = Math.round(255 * Math.max(0, 1 - radius) ** 2);
    }
  }
  const sprite = new DataTexture(pixels, fadeSize, fadeSize);
  sprite.magFilter = sprite.minFilter = LinearFilter;
  sprite.needsUpdate = true;
  const airGeometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(airCount * 3), 3).setUsage(DynamicDrawUsage);
  airGeometry.setAttribute('position', positions);
  airGeometry.boundingSphere = new Sphere(new Vector3(0, .15, -.6), width / 2 + 1);
  const airMaterial = new PointsMaterial({
    map: sprite, color: 0xb4e2e8, size: .62, opacity: .64, transparent: true, depthWrite: false,
  });
  const air = new Points(airGeometry, airMaterial);
  air.name = 'mine-crystal-gate-cold-air';

  const frostMaterial = new MeshBasicMaterial({ color: 0xa8dce5 });
  const frost = new InstancedMesh(box, frostMaterial, 10);
  frost.name = 'mine-crystal-gate-falling-frost';
  frost.instanceMatrix.setUsage(DynamicDrawUsage);
  frost.boundingSphere = new Sphere(new Vector3(0, height / 2, 0), Math.hypot(width / 2 + .25, height / 2 + .2, thickness));
  const chip = new Object3D();
  group.add(air, frost);

  let lastStage: UndergroundMineGateStage = 'closed';
  let openedAt: number | undefined;
  return {
    update(stage: UndergroundMineGateStage, now: number) {
      if (stage === 'ajar' && lastStage === 'closed') openedAt = now;
      if (stage === 'closed' || !Number.isFinite(openedAt)) openedAt = undefined;
      lastStage = stage;
      const elapsed = openedAt === undefined ? Infinity : Math.max(0, now - openedAt);
      air.visible = stage === 'ajar' && Number.isFinite(elapsed);
      frost.visible = elapsed < 1_050;
      if (air.visible) {
        for (let i = 0; i < airCount; i++) {
          const travel = (elapsed / 1_450 + i % 4 / 4) % 1;
          const center = width * .30 * (Math.floor(i / 4) - 1);
          positions.setXYZ(
            i, center + Math.sin(travel * Math.PI + i) * travel * .16,
            .042 + travel * .11, thickness / 2 - travel * 1.35,
          );
        }
        positions.needsUpdate = true;
      }
      if (frost.visible) {
        for (let i = 0; i < frost.count; i++) {
          const side = i < frost.count / 2 ? -1 : 1;
          const offset = i % (frost.count / 2);
          const age = Math.max(0, elapsed - offset * 36) / 1_000;
          const size = .023 + .006 * (offset % 3);
          chip.position.set(
            side * (width / 2 + .03 + (offset % 3 - 1) * .05 + age * .04),
            Math.max(size / 2, height - .15 - offset * .078 - 4.9 * age * age),
            -thickness / 2 - .04 - age * .18,
          );
          chip.scale.set(size * 1.15, size, size * .75);
          chip.rotation.set(i * .7 + age * 5, i * .13, i * .49 + age * 2);
          chip.updateMatrix();
          frost.setMatrixAt(i, chip.matrix);
        }
        frost.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      airGeometry.dispose();
      airMaterial.dispose();
      sprite.dispose();
      frostMaterial.dispose();
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
  const openingEffects = buildGateOpeningEffects(group, shape, gate);

  function update(stage: UndergroundMineGateStage, now = performance.now()) {
    const gap = gate.gapFor(stage);
    leaf.position.y = gap;
    leaf.scale.y = height - gap;
    leaf.visible = gap < height;
    spill.visible = gap > 0;
    cold.opacity = stage === 'open' ? .48 : .24;
    winch.update(stage);
    openingEffects.update(stage, now);
  }

  update('closed');
  return {
    group, update, winchPosition,
    dispose() {
      group.removeFromParent();
      group.traverse(child => { if (child instanceof InstancedMesh) child.dispose(); });
      openingEffects.dispose();
      shape.dispose();
      for (const material of [iron, edge, oxide, timber, cold, crystal]) {material.map?.dispose();material.dispose()}
    },
  };
}
