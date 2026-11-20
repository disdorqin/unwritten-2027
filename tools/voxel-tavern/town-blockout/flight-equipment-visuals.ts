import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';

type ReadonlyPoint = readonly [number, number, number];
type VoxelPart = { position: ReadonlyPoint; size: ReadonlyPoint; color: string };
type Mount = Readonly<{ position: ReadonlyPoint; forward: ReadonlyPoint }>;

const forward = [0, 0, 1] as const;
const aft = [0, 0, -1] as const;

/** Metres in each asset's local frame: +X right, +Y up, +Z forward. */
export const flightEquipmentMounts = {
  snowWing: {
    leftHand: { position: [-.34, -.37, .32], forward },
    rightHand: { position: [.34, -.37, .32], forward },
    boosterBay: { position: [0, -.25, -.15], forward },
  },
  booster: {
    wingSocket: { position: [0, .23, .15], forward },
    leftExhaust: { position: [-.19, -.025, -.60], forward: aft },
    rightExhaust: { position: [.19, -.025, -.60], forward: aft },
  },
} as const satisfies Record<string, Record<string, Mount>>;

function voxelAsset<M extends Record<string, Mount>>(name: string, parts: VoxelPart[], mounts: M) {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial();
  const batch = new InstancedMesh(geometry, material, parts.length);
  batch.name = name + '-voxels';
  const transform = new Object3D();
  const color = new Color();
  for (const [index, part] of parts.entries()) {
    transform.position.fromArray(part.position);
    transform.scale.fromArray(part.size);
    transform.updateMatrix();
    batch.setMatrixAt(index, transform.matrix);
    batch.setColorAt(index, color.set(part.color));
  }
  batch.instanceMatrix.needsUpdate = true;
  batch.instanceColor!.needsUpdate = true;
  batch.computeBoundingBox();
  batch.computeBoundingSphere();

  const group = new Group();
  group.name = name;
  group.add(batch);
  for (const [key, mount] of Object.entries(mounts)) {
    const marker = new Object3D();
    marker.name = 'mount:' + key;
    marker.position.fromArray(mount.position);
    group.add(marker);
  }
  let disposed = false;
  return {
    group,
    mounts,
    bounds: batch.boundingBox!.clone(),
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      batch.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

const wingStrips = [
  // Inner and outer X, leading and trailing Z, chord height.
  [.16, .47, .56, -.56, .045],
  [.47, .78, .52, -.63, .048],
  [.78, 1.09, .45, -.69, .054],
  [1.09, 1.40, .35, -.75, .067],
  [1.40, 1.68, .23, -.78, .089],
  [1.68, 1.90, .06, -.77, .123],
] as const;

// Recess the trim from both cloth edges so overlapping side faces are never coplanar.
const wingTrimInset = .002;

/** An unpowered cloth wing, with a detachable ventral mounting cradle. */
export function createSnowWingVisual() {
  const parts: VoxelPart[] = [];
  const put = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    parts.push({ color, position: [x, y, z], size: [w, h, d] });
  };
  const canvas = ['#d8e8ed', '#cbdfe8', '#e7f2f4', '#b8d3e0'];
  const binding = '#42667e';
  const frost = '#9ebcca';
  const wood = '#78543e';
  const fastener = '#9faeb3';

  put('#e5eef0', 0, .045, .02, .36, .08, 1.08);
  put(wood, 0, -.025, .02, .16, .12, 1.19);
  put(binding, 0, .066, .604, .18, .07, .12);
  put(wood, 0, -.106, .02, .78, .10, .14);
  put(binding, 0, -.196, -.15, .50, .108, .55);
  for (const side of [-1, 1]) {
    for (const [index, [inner, outer, lead, trail, y]] of wingStrips.entries()) {
      const width = outer - inner;
      const x = side * (inner + outer) / 2;
      const chord = lead - trail;
      // Alternating panels and exposed battens make the cloth structure visible at rest.
      for (let panel = 0; panel < 4; panel++) {
        put(canvas[(panel + index) % canvas.length], x, y,
          trail + chord * (panel + .5) / 4, width, .048, chord / 4);
      }
      const trimWidth = width - 2 * wingTrimInset;
      put(index < 4 ? binding : frost, x, y + .016, lead - .019, trimWidth, .065, .064);
      put(frost, x, y - .01, trail + .022, trimWidth, .052, .064);
      put('#a18169', side * (inner + .045), y - .032, (trail + lead) / 2,
        .058, .062, chord - .086);
      put('#ecf4f4', side * (outer - .022 - wingTrimInset), y + .025, lead - .12, .044, .036, .16);
    }

    put(binding, side * .222, -.245, -.15, .061, .072, .52);
    put(fastener, side * .223, -.197, .064, .073, .054, .087);
    put(wood, side * .34, -.24, .32, .08, .21, .096);
    put(wood, side * .34, -.152, .235, .081, .10, .29);
    put('#443326', side * .34, -.37, .32, .185, .081, .087);
    for (let segment = 0; segment < 4; segment++) {
      const offset = (segment - 1.5) * .036;
      put(segment % 2 ? '#825e45' : '#644735', side * .34 + offset, -.37, .32, .03, .084, .09);
    }
  }
  return voxelAsset('snow-wing', parts, flightEquipmentMounts.snowWing);
}

/** Freestanding forged module; the upper key meets the snow wing's cradle. */
export function createFlightBoosterVisual() {
  const parts: VoxelPart[] = [];
  const put = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    parts.push({ color, position: [x, y, z], size: [w, h, d] });
  };
  const iron = '#3f4a55';
  const edge = '#626d74';
  const dark = '#29313b';
  const brass = '#9a7850';
  const crystal = '#93cfd0';

  // The insets sit flush with the forged casing. Cool colors are material only, with no light.
  put(iron, 0, -.012, -.015, .69, .30, .78);
  put(edge, 0, .104, .17, .75, .073, .50);
  put(dark, 0, -.139, .035, .60, .082, .70);
  put(edge, 0, -.028, .37, .43, .237, .16);
  put(iron, 0, .157, .15, .36, .064, .27);
  put(brass, 0, .202, .15, .27, .056, .194);
  for (const side of [-1, 1]) {
    put(edge, side * .333, -.025, .003, .098, .276, .69);
    put(brass, side * .386, -.018, .09, .036, .155, .24);
    put(dark, side * .408, -.018, .09, .020, .125, .184);
    for (let index = 0; index < 3; index++) {
      put(index === 1 ? '#bce4db' : crystal, side * .422, -.018,
        .09 + (index - 1) * .049, .019, index === 1 ? .098 : .078, .043);
    }
    for (const z of [-.24, .255]) {
      put(brass, side * .278, .141, z, .082, .032, .068);
      put(dark, side * .359, -.10, z, .069, .033, .046);
    }
    put(iron, side * .19, -.025, -.406, .298, .276, .22);
    put(brass, side * .19, -.025, -.497, .316, .28, .099);
    // Four cuboids form a stepped, open lip around a recessed thrust aperture.
    for (const edgeSign of [-1, 1]) {
      put(edge, side * .19 + edgeSign * .114, -.025, -.558, .058, .244, .084);
      put(edge, side * .19, -.025 + edgeSign * .095, -.558, .171, .054, .084);
    }
    put(dark, side * .19, -.025, -.546, .172, .137, .035);
    put(crystal, side * .19, -.025, -.571, .070, .061, .021);
  }
  return voxelAsset('flight-booster', parts, flightEquipmentMounts.booster);
}
