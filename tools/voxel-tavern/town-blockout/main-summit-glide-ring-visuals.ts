import {
  BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, TorusGeometry,
} from 'three';
import type { SummitGlideRing } from './main-summit-glide-rings';

const rimSegments = 40;
const opening = 1 / Math.cos(Math.PI / rimSegments);

export function mountSummitGlideRingVisuals(owner: Group, rings: readonly SummitGlideRing[]) {
  const group = new Group();
  group.name = 'main-summit-glide-rings';

  // The innermost polygon edge stays outside the measured crossing disk.
  const railShape = new TorusGeometry(opening + .075, .052, 6, rimSegments);
  const lightShape = new TorusGeometry(opening + .018, .018, 6, rimSegments);
  const clipShape = new BoxGeometry(.12, .065, .17);
  const palette = {
    next: { rail: 0x644a38, light: 0xffc375, clip: 0xffe3b0 },
    upcoming: { rail: 0x4a5a64, light: 0xf3dcc0, clip: 0xd2bda4 },
    cleared: { rail: 0x53676b, light: 0x91c7b7, clip: 0xaeddcd },
  } as const;
  const materialFor = ({ rail, light, clip }: (typeof palette)[keyof typeof palette]) => ({
    rail: new MeshLambertMaterial({ color: rail }),
    light: new MeshBasicMaterial({ color: light, toneMapped: false }),
    clip: new MeshLambertMaterial({ color: clip }),
  });
  const next = materialFor(palette.next);
  const upcoming = materialFor(palette.upcoming);
  const cleared = materialFor(palette.cleared);
  const clipTransform = new Object3D();
  const ringViews = rings.map(ring => {
    const work = new Group();
    work.name = ring.id;
    work.position.set(ring.east, ring.height, -ring.north);
    work.rotation.y = Math.PI - ring.heading;
    work.scale.setScalar(ring.radius);

    const rail = new Mesh(railShape, upcoming.rail);
    rail.name = 'glide-ring-rail';
    const light = new Mesh(lightShape, upcoming.light);
    light.name = 'glide-ring-light';
    const clips = new InstancedMesh(clipShape, upcoming.clip, 4);
    clips.name = 'glide-ring-clips';
    for (let clip = 0; clip < clips.count; clip++) {
      const angle = (clip + .5) * Math.PI / 2;
      clipTransform.position.set(1.105 * Math.cos(angle), 1.105 * Math.sin(angle), 0);
      clipTransform.rotation.z = angle + Math.PI / 2;
      clipTransform.updateMatrix();
      clips.setMatrixAt(clip, clipTransform.matrix);
    }
    clips.computeBoundingSphere();
    work.add(rail, light, clips);
    group.add(work);
    return { rail, light, clips };
  });

  let appliedProgress = -1;
  let disposed = false;
  function setProgress(passed: number) {
    if (disposed || passed === appliedProgress) return;
    appliedProgress = passed;
    for (const [index, view] of ringViews.entries()) {
      const material = index < passed ? cleared : index === passed ? next : upcoming;
      view.rail.material = material.rail;
      view.light.material = material.light;
      view.clips.material = material.clip;
    }
  }

  setProgress(0);
  owner.add(group);
  return {
    group,
    setProgress,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const view of ringViews) view.clips.dispose();
      for (const shape of [railShape, lightShape, clipShape]) shape.dispose();
      for (const materials of [next, upcoming, cleared]) {
        for (const material of Object.values(materials)) material.dispose();
      }
      group.clear();
    },
  };
}
