import {
  BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Vector3, type Object3D,
} from 'three';

export type UndergroundMineSpiritPoint = Readonly<{
  east: number;
  north: number;
  height: number;
  /** Radians from the scene's forward (-Z) axis. */
  yaw?: number;
}>;

type TraceOptions = Readonly<{
  parent: Object3D;
  domainId: string;
  footprints: readonly UndergroundMineSpiritPoint[];
  lamps: readonly UndergroundMineSpiritPoint[];
  silhouettes: readonly UndergroundMineSpiritPoint[];
}>;
type Visibility = Readonly<{ activeDomain?: string; soulSightGranted?: boolean }>;
type XYZ = readonly [number, number, number];
type Part = readonly [position: XYZ, size: XYZ, tint?: string];

const boot: readonly Part[] = [
  [[0, .015, -.081], [.101, .012, .104]],
  [[0, .015, -.146], [.086, .012, .038]],
  [[0, .015, -.012], [.075, .012, .061]],
  [[0, .015, .068], [.090, .012, .076]],
];
const lampFrame: readonly Part[] = [
  [[0, .028, 0], [.22, .056, .17]],
  [[0, .272, 0], [.226, .046, .181]],
  [[-.081, .142, 0], [.041, .222, .136]],
  [[.081, .142, 0], [.041, .222, .136]],
  [[0, .16, .066], [.159, .021, .022]],
  [[-.05, .322, 0], [.017, .075, .020]],
  [[.05, .322, 0], [.017, .075, .020]],
  [[0, .367, 0], [.116, .018, .020]],
];
const wick: readonly Part[] = [
  [[0, .116, 0], [.11, .108, .089], '#b18b54'],
  [[0, .155, .005], [.048, .044, .047], '#ddba77'],
];
const miner: readonly Part[] = [
  [[-.10, .09, -.028], [.14, .17, .25], '#43433e'],
  [[.10, .09, -.028], [.14, .17, .25], '#43433e'],
  [[-.10, .41, 0], [.16, .66, .20], '#5a5750'],
  [[.10, .41, 0], [.16, .66, .20], '#55534b'],
  [[0, .84, 0], [.39, .27, .25], '#626056'],
  [[0, 1.12, 0], [.38, .34, .23], '#68645a'],
  [[-.24, 1.024, .005], [.12, .44, .17], '#656056'],
  [[.24, 1.024, .005], [.12, .44, .17], '#5d5a51'],
  [[0, 1.425, -.007], [.222, .263, .214], '#7a7466'],
  [[0, 1.565, -.031], [.284, .097, .248], '#5e5b51'],
  [[0, 1.53, -.171], [.258, .032, .106], '#6a6253'],
];

/** Decorative traces only. The host resolves each encounter's location, audience and story/night flag. */
export function mountUndergroundMineSpiritTraces({ parent, domainId, footprints, lamps, silhouettes }: TraceOptions) {
  if (!domainId.trim() || ![...footprints, ...lamps, ...silhouettes].every(({ east, north, height, yaw }) =>
    [east, north, height, yaw ?? 0].every(Number.isFinite))) {
    throw new RangeError('Invalid mine spirit trace placement');
  }
  const group = new Group();
  group.name = 'underground-mine-spirit-traces';
  group.visible = false;
  const geometry = new BoxGeometry();
  const batches: InstancedMesh<BoxGeometry, MeshLambertMaterial>[] = [];
  const up = new Vector3(0, 1, 0);

  function addBatch(name: string, points: readonly UndergroundMineSpiritPoint[], parts: readonly Part[],
    material: MeshLambertMaterial) {
    if (!points.length) {
      material.dispose();
      return;
    }
    const batch = new InstancedMesh(geometry, material, points.length * parts.length);
    batch.name = name;
    // Trace props may appear inside the walkable area but never take a gameplay raycast.
    batch.raycast = () => {};
    let index = 0;
    for (const { east, north, height, yaw = 0 } of points) {
      const base = new Vector3(east, height, -north);
      const rotation = new Quaternion().setFromAxisAngle(up, yaw);
      for (const [offset, size, tint] of parts) {
        const position = new Vector3(...offset).applyQuaternion(rotation).add(base);
        batch.setMatrixAt(index, new Matrix4().compose(position, rotation, new Vector3(...size)));
        if (tint) batch.setColorAt(index, new Color(tint));
        index++;
      }
    }
    batch.computeBoundingSphere();
    group.add(batch);
    batches.push(batch);
  }

  addBatch('mine-spirit-bootprints', footprints, boot,
    new MeshLambertMaterial({ color: '#363631', emissive: '#363631', emissiveIntensity: .07 }));
  addBatch('mine-spirit-lamp-frames', lamps, lampFrame, new MeshLambertMaterial({ color: '#4c473d' }));
  addBatch('mine-spirit-lamp-wicks', lamps, wick,
    new MeshLambertMaterial({ emissive: '#a77238', emissiveIntensity: .26 }));
  addBatch('mine-spirit-silhouettes', silhouettes, miner,
    new MeshLambertMaterial({ emissive: '#575245', emissiveIntensity: .19 }));
  parent.add(group);

  let disposed = false;
  return {
    group,
    sync({ activeDomain, soulSightGranted }: Visibility) {
      if (!disposed) group.visible = activeDomain === domainId && soulSightGranted === true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const batch of batches) {
        batch.dispose();
        batch.material.dispose();
      }
      geometry.dispose();
      group.visible = false;
      group.removeFromParent();
      group.clear();
    },
  };
}
