import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial } from 'three';
import type { Box } from './landmark-kit';
import { mascotPenBounds } from './mascot-patrol-sites';

const finishes = {
  post: '#6c5341', rail: '#8a6c50', roof: '#4b5b60',
  snow: '#dbe6ef', hay: '#b29a62', trough: '#574d46',
};
type Timber = keyof typeof finishes;

export function buildMascotPen(heightAt: (east: number, north: number) => number) {
  const { west, east, south, north, entrance } = mascotPenBounds;
  const group = new Group();
  group.name = 'mascot-sheep-pen';
  const colliders: Box[] = [];
  group.userData.colliders = colliders;
  const parts = new Map<Timber, Matrix4[]>();

  function box(kind: Timber, x: number, n: number, y: number, w: number, h: number, d: number, solid = false) {
    const instances = parts.get(kind) ?? [];
    if (!parts.has(kind)) parts.set(kind, instances);
    instances.push(new Matrix4().makeScale(w, h, d).setPosition(x, y, -n));
    if (solid) colliders.push({ min: [x - w / 2, y - h / 2, -n - d / 2], max: [x + w / 2, y + h / 2, -n + d / 2] });
  }

  const posts = new Set<string>();
  function post(x: number, n: number) {
    const key = `${x}:${n}`;
    if (posts.has(key)) return;
    posts.add(key);
    const y = heightAt(x, n);
    box('post', x, n, y + .52, .19, 1.27, .19, true);
    box('snow', x, n, y + 1.18, .23, .06, .23);
  }
  function fence(x0: number, n0: number, x1: number, n1: number) {
    const length = Math.hypot(x1 - x0, n1 - n0);
    const spans = Math.ceil(length / 1.85);
    const dx = (x1 - x0) / spans, dn = (n1 - n0) / spans;
    post(x0, n0);
    for (let i = 1; i <= spans; i++) {
      const x = x0 + i * dx, n = n0 + i * dn;
      post(x, n);
      const midX = x - dx / 2, midN = n - dn / 2;
      const y = heightAt(midX, midN);
      const w = dx === 0 ? .14 : Math.abs(dx) + .04;
      const d = dn === 0 ? .14 : Math.abs(dn) + .04;
      box('rail', midX, midN, y + .43, w, .15, d, true);
      box('rail', midX, midN, y + .85, w, .15, d, true);
      box('snow', midX, midN, y + .94, w - .02, .04, d - .02);
    }
  }
  fence(west, south, east, south);
  fence(west, north, east, north);
  fence(west, south, west, north);
  fence(east, south, east, entrance.south);
  fence(east, entrance.north, east, north);
  // A short stretch of low fence continues the edge of the town past the enclosure.
  fence(west, north, west, north + 2);

  // Wind shelter with a rear plank wall and an open front towards the yard.
  const shed = { east: west + 2.12, north: north - 1.14 };
  const shedHeight = heightAt(shed.east, shed.north);
  for (const x of [shed.east - 1.62, shed.east + 1.62]) {
    for (const n of [shed.north - .70, shed.north + .73]) {
      box('post', x, n, shedHeight + .99, .20, 2.13, .20, true);
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = shed.east - 1.62 + (i + .5) * .324;
    box(i % 3 === 0 ? 'post' : 'rail', x, shed.north + .73, shedHeight + .99, .308, 2.02, .13, true);
    box('roof', x, shed.north + .05, shedHeight + 2.11, .35, .17, 2.19, true);
  }
  box('roof', shed.east, shed.north - .99, shedHeight + 2.09, 3.75, .16, .19);
  box('snow', shed.east - .09, shed.north + .19, shedHeight + 2.23, 3.38, .08, 1.67);
  for (const x of [shed.east - .85, shed.east + .16, shed.east + .98]) {
    const y = heightAt(x, shed.north);
    box('hay', x, shed.north, y + .03, .71, .11, .75);
    box('hay', x + .1, shed.north - .05, y + .08, .48, .08, .49);
  }
  const troughX = west + 3.23, troughN = south + .75;
  const troughY = heightAt(troughX, troughN);
  box('trough', troughX, troughN, troughY + .19, 1.75, .34, .58, true);
  for (const n of [troughN - .25, troughN + .25]) {
    box('rail', troughX, n, troughY + .4, 1.75, .13, .11);
  }
  box('hay', troughX, troughN, troughY + .37, 1.53, .17, .38);

  const geometry = new BoxGeometry();
  for (const [kind, instances] of parts) {
    const batch = new InstancedMesh(geometry, new MeshLambertMaterial({ color: finishes[kind] }), instances.length);
    batch.name = `mascot-pen-${kind}`;
    instances.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
    batch.computeBoundingSphere();
    group.add(batch);
  }
  return group;
}
