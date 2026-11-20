import {
  BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshLambertMaterial, Object3D, Vector3,
} from 'three';
import type { UndergroundMiningTargetView } from '../../../src/shared/underground-mining';

const oreTints = {
  stardust: { stone: '#a97849', glow: '#8a481f', crystal: true },
  ordinary: { stone: '#80614b', glow: '#000000', crystal: false },
  crystal: { stone: '#758da8', glow: '#203756', crystal: true },
  white: { stone: '#d5e4e1', glow: '#334946', crystal: true },
  amethyst: { stone: '#9979ad', glow: '#422651', crystal: true },
  moonstone: { stone: '#e0dcce', glow: '#000000', crystal: false },
} as const;

type Options = Readonly<{
  id: string;
  /** World-space rock face and its outward normal, supplied by the registered site. */
  face: Vector3;
  normal: Vector3;
  /** Pass the accepted target to use its mineral, or an explicit palette for standalone models. */
  ore: keyof typeof oreTints | Pick<UndergroundMiningTargetView, 'mineral'>;
}>;

function tintForMineral(mineral?: string) {
  switch (mineral) {
    case 'stardust': return oreTints.stardust;
    case 'blue-crystal': return oreTints.crystal;
    case 'ordinary-ice-crystal': return oreTints.white;
    case 'amethyst-cluster': return oreTints.amethyst;
    case 'moonstone': return oreTints.moonstone;
    default: return oreTints.ordinary;
  }
}

export function createUndergroundOreCoreMaterial(mineral: string) {
  const tint = tintForMineral(mineral);
  return new MeshLambertMaterial({ color: tint === oreTints.ordinary ? '#9a805c' : tint.stone,
    emissive: tint.glow, emissiveIntensity: .25 });
}

// One batched cluster. The local Z axis points out of the rock after placement.
const nodules = [
  [-.30, -.07, -.015, .15, .13, .13, .32],
  [-.17, .10, -.025, .12, .22, .15, -.37],
  [-.03, -.05, -.03, .21, .26, .16, .19],
  [.12, .10, -.005, .105, .18, .11, -.22],
  [.27, -.02, -.02, .16, .17, .13, .5],
] as const;

const cracks = [
  [0, .02, -.11, .10], [-.11, .10, -.22, .07], [-.22, .07, -.32, .11],
  [0, .02, .13, .10], [.13, .10, .25, .05], [.25, .05, .31, .09],
  [0, .02, -.06, -.09], [-.06, -.09, -.15, -.15], [-.15, -.15, -.26, -.14],
  [.02, .02, .16, -.05], [.16, -.05, .25, -.12], [.25, -.12, .39, -.13],
  [-.11, .10, -.09, .19], [.13, .10, .10, .21], [-.06, -.09, .01, -.22],
] as const;

export function createUndergroundOreVein({ id, face, normal, ore }: Options) {
  if (!id || ![...face.toArray(), ...normal.toArray()].every(Number.isFinite) || normal.lengthSq() === 0) {
    throw new RangeError('A mining vein needs a registered rock-face position and normal');
  }
  const tint = typeof ore === 'string' ? oreTints[ore] : tintForMineral(ore.mineral);
  const group = new Group();
  group.name = 'ore-vein:' + id;
  group.position.copy(face);
  group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal.clone().normalize());

  const stones = tint.crystal ? new CylinderGeometry(.16, .78, 1.7, 5) : new IcosahedronGeometry(1);
  const rock = new MeshLambertMaterial({ color: tint.stone, emissive: tint.glow, emissiveIntensity: .25, flatShading: true });
  const cluster = new InstancedMesh(stones, rock, nodules.length);
  cluster.name = 'ore-cluster';
  const pose = new Object3D();
  nodules.forEach(([x, y, z, width, height, depth, turn], i) => {
    pose.position.set(x, y, z);
    pose.rotation.set(tint.crystal ? .62 : .25, turn * .8, turn);
    pose.scale.set(width, height, depth);
    pose.updateMatrix();
    cluster.setMatrixAt(i, pose.matrix);
  });
  cluster.instanceMatrix.needsUpdate = true;
  cluster.computeBoundingBox();
  cluster.computeBoundingSphere();

  const fissures = new BufferGeometry();
  fissures.setAttribute('position', new Float32BufferAttribute(cracks.flatMap(([x, y, nextX, nextY]) =>
    [x, y, .132, nextX, nextY, .132]), 3));
  const darkLines = new LineBasicMaterial({ color: '#322922' });
  const fracture = new LineSegments(fissures, darkLines);
  fracture.name = 'ore-cracks';
  const scarShape = new IcosahedronGeometry(1);
  const scarPaint = new MeshLambertMaterial({ color: '#463e35', flatShading: true });
  const scar = new Mesh(scarShape, scarPaint);
  scar.name = 'ore-scar';
  scar.scale.set(.43, .22, .035);
  scar.position.z = -.01;
  fracture.visible = scar.visible = false;
  group.add(cluster, fracture, scar);
  let disposed = false;

  return {
    group,
    sync(target: UndergroundMiningTargetView): boolean {
      if (disposed || target.id !== id || target.kind !== 'ore') return false;
      cluster.visible = !target.open;
      fracture.visible = !target.open && target.hits > 0;
      fissures.setDrawRange(0, Math.ceil(cracks.length * target.hits / target.strikes) * 2);
      scar.visible = target.open;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      cluster.dispose();
      stones.dispose();
      rock.dispose();
      fissures.dispose();
      darkLines.dispose();
      scarShape.dispose();
      scarPaint.dispose();
    },
  };
}
