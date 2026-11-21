import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Vector3,
} from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';

export type BellPost = Readonly<{
  index: number; east: number; north: number; height: number; arc: number;
}>;

/**
 * Bell-post array (§4, cloud segment): nine posts at ~30 m spacing along
 * the deepest stretch of the trail's cloud band (380–560 m). Each post
 * carries a brass bell and a fog lamp; the lamp chain's lighting rhythm
 * belongs to the gameplay rules (B window) — this module owns the posts,
 * the lamps, and a per-lamp switch for the rules to drive. Post parts are
 * instanced (five draws); lamp cores stay individual so the rules can
 * light them one by one.
 */
export function createMainSummitBellPosts(points: readonly MainSummitTrailPoint[]) {
  const group = new Group();
  group.name = 'main-summit-bell-posts';
  const disposers: (() => void)[] = [];
  const timber = new MeshLambertMaterial({ color: '#5d4630' });
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const brass = new MeshLambertMaterial({ color: '#b08d4f' });
  const iron = new MeshLambertMaterial({ color: '#3c4147' });
  disposers.push(() => { timber.dispose(); stone.dispose(); brass.dispose(); iron.dispose(); });

  // Arc-length table, then the cloud band's middle 240 m.
  const arc: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    arc.push(arc[i - 1]! + Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height));
  }
  const band = points.map((point, i) => ({ point, arc: arc[i]! }))
    .filter(({ point }) => point.height >= 380 && point.height <= 560);
  const bandMid = (band[0]!.arc + band[band.length - 1]!.arc) / 2;
  const startArc = bandMid - 120;
  const at = (target: number) => {
    let i = arc.findIndex(value => value >= target);
    if (i < 0) i = points.length - 1;
    if (i === 0) return { ...points[0]! };
    const f = (target - arc[i - 1]!) / Math.max(arc[i]! - arc[i - 1]!, 1e-6);
    const a = points[i - 1]!, b = points[i]!;
    return {
      east: a.east + (b.east - a.east) * f,
      north: a.north + (b.north - a.north) * f,
      height: a.height + (b.height - a.height) * f,
    };
  };

  const spots: { east: number; north: number; base: number }[] = [];
  const posts: BellPost[] = [];
  for (let index = 0; index < 9; index++) {
    const postArc = startArc + index * 30;
    const spot = at(postArc);
    // Offset 1.3 m to the left of the direction of travel.
    const ahead = at(postArc + 4);
    const dx = ahead.east - spot.east, dz = ahead.north - spot.north;
    const len = Math.hypot(dx, dz) || 1;
    const east = spot.east + (-dz / len) * 1.3;
    const north = spot.north + (dx / len) * 1.3;
    spots.push({ east, north, base: spot.height });
    posts.push({ index, east, north, height: spot.height, arc: postArc });
  }

  const parts: { name: string; geometry: BufferGeometry;
    material: MeshLambertMaterial; place: (s: { east: number; north: number; base: number }) => Vector3 }[] = [
    { name: 'bell-post-base', geometry: new BoxGeometry(.5, .4, .5), material: stone,
      place: s => new Vector3(s.east, s.base + .2, -s.north) },
    { name: 'bell-post-pole', geometry: new CylinderGeometry(.06, .09, 2.6, 6), material: timber,
      place: s => new Vector3(s.east, s.base + .4 + 1.3, -s.north) },
    { name: 'bell-post-arm', geometry: new BoxGeometry(.9, .07, .07), material: timber,
      place: s => new Vector3(s.east, s.base + 2.85, -s.north) },
    { name: 'bell-post-bell', geometry: new ConeGeometry(.16, .3, 8), material: brass,
      place: s => new Vector3(s.east - .3, s.base + 2.62, -s.north) },
    { name: 'bell-post-lamp', geometry: new BoxGeometry(.2, .26, .2), material: iron,
      place: s => new Vector3(s.east + .3, s.base + 2.6, -s.north) },
  ];
  const matrix = new Matrix4();
  for (const part of parts) {
    const mesh = new InstancedMesh(part.geometry, part.material, spots.length);
    mesh.name = part.name;
    spots.forEach((spot, i) => {
      matrix.makeTranslation(...part.place(spot).toArray());
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    disposers.push(() => part.geometry.dispose());
  }
  const lampMaterial = new MeshBasicMaterial({ color: '#ffc46b' });
  disposers.push(() => lampMaterial.dispose());
  const lampCores: Mesh[] = [];
  const coreGeometry = new BoxGeometry(.12, .16, .12);
  disposers.push(() => coreGeometry.dispose());
  for (const spot of spots) {
    const core = new Mesh(coreGeometry, lampMaterial);
    core.name = 'bell-post-lamp-core';
    core.position.set(spot.east + .3, spot.base + 2.6, -spot.north);
    core.visible = false;
    group.add(core);
    lampCores.push(core);
  }

  let disposed = false;
  return {
    group, posts,
    /** Rules-side switch (B window): light one lamp, or clear with -1. */
    setLamp(index: number, on: boolean) {
      const core = lampCores[index];
      if (core) core.visible = on;
    },
    setAllLamps(on: boolean) {
      for (const core of lampCores) core.visible = on;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}
