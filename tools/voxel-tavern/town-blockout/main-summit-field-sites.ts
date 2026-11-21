import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry,
} from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';

type HeightAt = (east: number, north: number) => number | undefined;

const stone = () => new MeshLambertMaterial({ color: '#6d7276' });
const timber = () => new MeshLambertMaterial({ color: '#6d4c33' });
const iron = () => new MeshLambertMaterial({ color: '#3c4147' });
const brass = () => new MeshLambertMaterial({ color: '#b08d4f' });
const rust = () => new MeshLambertMaterial({ color: '#8a4f26' });

function box(group: Group, material: MeshLambertMaterial, name: string,
  size: [number, number, number], east: number, base: number, north: number, disposers: (() => void)[]) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(east, base + size[1] / 2, -north);
  group.add(mesh);
  disposers.push(() => mesh.geometry.dispose());
  return mesh;
}

/** Wish-lock rail (§3.10) on the cloud terrace edge: hang a lock, see the count. */
export function createWishLockPoint(site: { east: number; north: number; height: number }) {
  const group = new Group();
  group.name = 'cloud-terrace-wish-lock-point';
  const disposers: (() => void)[] = [];
  const ironMat = iron(), brassMat = brass();
  disposers.push(() => { ironMat.dispose(); brassMat.dispose(); });
  const { east, north, height } = site;
  for (const side of [-1.9, 1.9]) {
    box(group, ironMat, 'wish-lock-post', [.12, 1.25, .12], east + side, height, north, disposers);
  }
  box(group, ironMat, 'wish-lock-rail', [4, .09, .09], east, height + 1.12, north, disposers);
  {
    const lockGeometry = new BoxGeometry(.2, .26, .07);
    const locks = new InstancedMesh(lockGeometry, brassMat, 6);
    locks.name = 'wish-lock-sample';
    const shackleGeometry = new TorusGeometry(.07, .018, 5, 10, Math.PI);
    const shackles = new InstancedMesh(shackleGeometry, ironMat, 6);
    shackles.name = 'wish-lock-shackle';
    const matrix = new Matrix4();
    for (let i = 0; i < 6; i++) {
      const lockEast = east - 1.55 + i * .62;
      matrix.makeTranslation(lockEast, height + .82 + .13, -north);
      locks.setMatrixAt(i, matrix);
      matrix.makeTranslation(lockEast, height + 1.1, -north);
      shackles.setMatrixAt(i, matrix);
    }
    locks.instanceMatrix.needsUpdate = true;
    shackles.instanceMatrix.needsUpdate = true;
    group.add(locks, shackles);
    disposers.push(() => { lockGeometry.dispose(); shackleGeometry.dispose(); });
  }
  let disposed = false;
  return {
    group, site,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}

/** Wind-shelter hut (§3.11): three stone walls, lean-to roof, fire pit, stores. */
export function buildWindShelter(name: string, east: number, north: number, base: number) {
  const group = new Group();
  group.name = name;
  const disposers: (() => void)[] = [];
  const stoneMat = stone(), timberMat = timber();
  disposers.push(() => { stoneMat.dispose(); timberMat.dispose(); });
  box(group, stoneMat, 'shelter-back-wall', [3.4, 1.7, .35], east, base, north + 1.5, disposers);
  box(group, stoneMat, 'shelter-side-wall', [.35, 1.5, 3], east - 1.6, base, north, disposers);
  box(group, stoneMat, 'shelter-side-wall', [.35, 1.5, 3], east + 1.6, base, north, disposers);
  const roof = box(group, timberMat, 'shelter-roof', [3.9, .12, 3.9], east, base + 1.78, north + .2, disposers);
  roof.rotation.x = .16;
  // Fire pit: stone ring and ember heart (the warmth source, unlit by day).
  {
    const pitGeometry = new BoxGeometry(.3, .22, .24);
    const pit = new InstancedMesh(pitGeometry, stoneMat, 7);
    pit.name = 'shelter-fire-pit';
    const matrix = new Matrix4();
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      matrix.makeTranslation(east + Math.cos(angle) * .55, base + .11, -(north + Math.sin(angle) * .55));
      pit.setMatrixAt(i, matrix);
    }
    pit.instanceMatrix.needsUpdate = true;
    group.add(pit);
    disposers.push(() => pitGeometry.dispose());
  }
  const ember = new Mesh(new PlaneGeometry(.5, .5), new MeshBasicMaterial({ color: '#ff7a26' }));
  ember.rotation.x = -Math.PI / 2;
  ember.position.set(east, base + .06, -north);
  ember.name = 'shelter-fire-ember';
  group.add(ember);
  disposers.push(() => { ember.geometry.dispose(); ember.material.dispose(); });
  box(group, timberMat, 'shelter-food-box', [.7, .45, .5], east - 1.05, base, north + .95, disposers);
  const rope = new Mesh(new TorusGeometry(.15, .05, 6, 12), timberMat);
  rope.position.set(east + 1.05, base + .35, -(north + .95));
  rope.name = 'shelter-spare-rope';
  group.add(rope);
  disposers.push(() => rope.geometry.dispose());
  // Duty tally marks on the back wall; the newest row stops last year.
  const tallyMat = iron();
  disposers.push(() => tallyMat.dispose());
  {
    const tallyGeometry = new BoxGeometry(.05, .22, .03);
    const tally = new InstancedMesh(tallyGeometry, tallyMat, 14);
    tally.name = 'shelter-duty-tally';
    const matrix = new Matrix4();
    let index = 0;
    for (let row = 0; row < 4; row++) {
      for (let mark = 0; mark <= row + 1; mark++) {
        matrix.makeTranslation(east - .6 + mark * .16, base + .95 + row * .3 + .11, -(north + 1.31));
        tally.setMatrixAt(index++, matrix);
      }
    }
    tally.instanceMatrix.needsUpdate = true;
    group.add(tally);
    disposers.push(() => tallyGeometry.dispose());
  }
  let disposed = false;
  return {
    group, east, north, base,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}

/**
 * Sky-watch relic (§3.13): ruined round stone base, a broken brass
 * observation frame with rust that reads as rust, and three star-chart
 * slabs. Pushing the slabs together is the interaction round's business.
 */
export function createSkyWatchRelic(anchor: MainSummitTrailPoint, heightAt: HeightAt) {
  const group = new Group();
  group.name = 'sky-watch-relic';
  const disposers: (() => void)[] = [];
  const stoneMat = stone(), brassMat = brass(), rustMat = rust();
  disposers.push(() => { stoneMat.dispose(); brassMat.dispose(); rustMat.dispose(); });
  // 80 m off the trail, on the side away from the summit.
  const away = Math.hypot(anchor.east - 50, anchor.north - 1000) || 1;
  const east = anchor.east + ((anchor.east - 50) / away) * 80;
  const north = anchor.north + ((anchor.north - 1000) / away) * 80;
  const base = heightAt(east, north) ?? anchor.height;
  {
    const ringGeometry = new BoxGeometry(1.1, .55, .6);
    const ring = new InstancedMesh(ringGeometry, stoneMat, 9);
    ring.name = 'watch-base-ring';
    const matrix = new Matrix4();
    let index = 0;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      if (i === 4) continue; // one base stone fallen away
      const cos = Math.cos(-angle), sin = Math.sin(-angle);
      // Rotation about Y by -angle, composed manually to keep imports lean.
      matrix.set(
        cos, 0, sin, east + Math.cos(angle) * 2.6,
        0, 1, 0, base + .275,
        -sin, 0, cos, -(north + Math.sin(angle) * 2.6),
        0, 0, 0, 1,
      );
      ring.setMatrixAt(index++, matrix);
    }
    ring.instanceMatrix.needsUpdate = true;
    group.add(ring);
    disposers.push(() => ringGeometry.dispose());
  }
  box(group, stoneMat, 'watch-fallen-stone', [1.1, .5, .6], east + 4.4, base - .15, north + 2.2, disposers)
    .rotation.z = .4;
  const frame = new Mesh(new TorusGeometry(1.15, .07, 6, 18, Math.PI * 1.25), brassMat);
  frame.name = 'watch-brass-frame';
  frame.position.set(east, base + 1.15, -north);
  frame.rotation.z = .5;
  group.add(frame);
  disposers.push(() => frame.geometry.dispose());
  for (let i = 0; i < 4; i++) {
    box(group, rustMat, 'watch-frame-rust', [.3, .18, .1],
      east + Math.cos(i * 1.4) * 1.1, base + 1.1 + Math.sin(i * 1.4) * 1.05, north + .12, disposers);
  }
  box(group, rustMat, 'watch-frame-rust-streak', [.12, .7, .04], east + .4, base + .35, north + .1, disposers);
  const slabs: { east: number; north: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const slabEast = east - 1.6 + i * 1.7;
    const slabNorth = north + 4.6;
    const slabBase = heightAt(slabEast, slabNorth) ?? base;
    const slab = box(group, stoneMat, 'watch-star-slab', [1.35, .14, 1.8], slabEast, slabBase, slabNorth, disposers);
    slab.rotation.x = -.28;
    slabs.push({ east: slabEast, north: slabNorth });
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 340;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#565e63';
        ctx.fillRect(0, 0, 256, 340);
        ctx.fillStyle = '#e8e2cf';
        let seed = 11 + i * 7;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const stars: [number, number][] = [];
        for (let s = 0; s < 14; s++) {
          const x = 20 + rand() * 216, y = 20 + rand() * 300;
          stars.push([x, y]);
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#c9c0a4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 1; s < 6; s++) { ctx.moveTo(...stars[s - 1]!); ctx.lineTo(...stars[s]!); }
        ctx.stroke();
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        const face = new Mesh(new PlaneGeometry(1.2, 1.6), new MeshBasicMaterial({ map: texture }));
        face.rotation.x = -Math.PI / 2 - .28;
        face.position.set(slabEast, slabBase + .24, -slabNorth + .18);
        face.name = 'watch-star-slab-chart';
        group.add(face);
        disposers.push(() => { face.geometry.dispose(); face.material.dispose(); texture.dispose(); });
      }
    }
  }
  let disposed = false;
  return {
    group, site: { east, north, height: base }, slabs,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}

/** Trail snow poles: red-tipped markers every ~90 m so the corridor never reads empty. */
export function createTrailMarkers(trailPoints: readonly MainSummitTrailPoint[], heightAt: HeightAt) {
  const group = new Group();
  group.name = 'main-summit-trail-markers';
  const spots: { east: number; north: number; base: number }[] = [];
  for (let i = 45; i < trailPoints.length - 10; i += 90) {
    const point = trailPoints[i]!;
    const next = trailPoints[i + 6]!;
    const dx = next.east - point.east, dn = next.north - point.north;
    const length = Math.hypot(dx, dn) || 1;
    const side = (i / 90) % 2 === 0 ? 1 : -1;
    const east = point.east + (-dn / length) * 2.4 * side;
    const north = point.north + (dx / length) * 2.4 * side;
    const base = heightAt(east, north);
    if (base !== undefined) spots.push({ east, north, base });
  }
  const poleGeometry = new CylinderGeometry(.045, .055, 1.7, 5);
  const poleMaterial = new MeshLambertMaterial({ color: '#7a4b2a' });
  const poles = new InstancedMesh(poleGeometry, poleMaterial, spots.length);
  poles.name = 'trail-marker-poles';
  const tipGeometry = new BoxGeometry(.3, .16, .02);
  const tipMaterial = new MeshLambertMaterial({ color: '#c93a2c' });
  const tips = new InstancedMesh(tipGeometry, tipMaterial, spots.length);
  tips.name = 'trail-marker-flags';
  const matrix = new Matrix4();
  for (const [i, spot] of spots.entries()) {
    matrix.identity();
    matrix.setPosition(spot.east, spot.base + .85, -spot.north);
    poles.setMatrixAt(i, matrix);
    matrix.setPosition(spot.east + .14, spot.base + 1.58, -spot.north);
    tips.setMatrixAt(i, matrix);
  }
  poles.instanceMatrix.needsUpdate = true;
  tips.instanceMatrix.needsUpdate = true;
  group.add(poles, tips);
  let disposed = false;
  return {
    group, count: spots.length,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); group.clear();
      poleGeometry.dispose(); poleMaterial.dispose();
      tipGeometry.dispose(); tipMaterial.dispose();
    },
  };
}
