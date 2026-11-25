import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MainSummitTrailPoint } from './main-summit-trail';

type HeightAt = (east: number, north: number) => number | undefined;
type BoxPiece = Readonly<{
  size: readonly [number, number, number];
  east: number;
  base: number;
  north: number;
  rotation?: readonly [number, number, number];
  color?: string;
}>;

const stone = () => new MeshLambertMaterial({ color: '#6d7276' });
const timber = () => new MeshLambertMaterial({ color: '#6d4c33' });
const iron = () => new MeshLambertMaterial({ color: '#3c4147' });
const brass = () => new MeshLambertMaterial({ color: '#b08d4f' });
const rust = () => new MeshLambertMaterial({ color: '#8a4f26' });

/** One immutable unit-box batch per material; instance transforms retain the surveyed art. */
function boxBatch(group: Group, geometry: BoxGeometry, material: MeshLambertMaterial,
  name: string, pieces: readonly BoxPiece[]) {
  const mesh = new InstancedMesh(geometry, material, pieces.length);
  mesh.name = name;
  const transform = new Object3D();
  const tint = new Color();
  pieces.forEach((piece, index) => {
    transform.position.set(piece.east, piece.base + piece.size[1] / 2, -piece.north);
    transform.rotation.set(...(piece.rotation ?? [0, 0, 0]));
    transform.scale.set(...piece.size);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (piece.color) mesh.setColorAt(index, tint.set(piece.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
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
  const ironGeometry = new BoxGeometry(1, 1, 1);
  const structure = boxBatch(group, ironGeometry, ironMat, 'wish-lock-rail', [
    { size: [.12, 1.25, .12], east: east - 1.9, base: height, north },
    { size: [.12, 1.25, .12], east: east + 1.9, base: height, north },
    { size: [4, .09, .09], east, base: height + 1.12, north },
  ]);
  disposers.push(() => { structure.dispose(); ironGeometry.dispose(); });
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
    disposers.push(() => {
      locks.dispose(); shackles.dispose(); lockGeometry.dispose(); shackleGeometry.dispose();
    });
  }
  let disposed = false;
  return {
    group, site, pieces: 15, draws: 3,
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
  const timberMat = timber();
  const boxMaterial = new MeshLambertMaterial({ color: '#ffffff' });
  disposers.push(() => { boxMaterial.dispose(); timberMat.dispose(); });
  const shelterPieces: BoxPiece[] = [
    { size: [3.4, 1.7, .35], east, base, north: north + 1.5, color: '#6d7276' },
    { size: [.35, 1.5, 3], east: east - 1.6, base, north, color: '#6d7276' },
    { size: [.35, 1.5, 3], east: east + 1.6, base, north, color: '#6d7276' },
  ];
  // Fire pit: stone ring and ember heart (the warmth source, unlit by day).
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    shelterPieces.push({
      size: [.3, .22, .24], east: east + Math.cos(angle) * .55, base,
      north: north + Math.sin(angle) * .55, color: '#6d7276',
    });
  }
  shelterPieces.push(
    { size: [3.9, .12, 3.9], east, base: base + 1.78, north: north + .2,
      rotation: [.16, 0, 0], color: '#6d4c33' },
    { size: [.7, .45, .5], east: east - 1.05, base, north: north + .95, color: '#6d4c33' },
  );
  // Duty tally marks on the back wall; the newest row stops last year.
  // All opaque Lambert boxes share one unit geometry and instance colours.
  for (let row = 0; row < 4; row++) {
    for (let mark = 0; mark <= row + 1; mark++) {
      shelterPieces.push({
        size: [.05, .22, .03], east: east - .6 + mark * .16,
        base: base + .95 + row * .3, north: north + 1.31, color: '#3c4147',
      });
    }
  }
  const boxGeometry = new BoxGeometry(1, 1, 1);
  const boxes = boxBatch(group, boxGeometry, boxMaterial, 'shelter-static-lambert-boxes', shelterPieces);
  disposers.push(() => { boxes.dispose(); boxGeometry.dispose(); });
  const emberMaterial = new MeshBasicMaterial({ color: '#ff7a26' });
  const ember = new Mesh(new PlaneGeometry(.5, .5), emberMaterial);
  ember.rotation.x = -Math.PI / 2;
  ember.position.set(east, base + .06, -north);
  ember.name = 'shelter-fire-ember';
  group.add(ember);
  disposers.push(() => { ember.geometry.dispose(); emberMaterial.dispose(); });
  const rope = new Mesh(new TorusGeometry(.15, .05, 6, 12), timberMat);
  rope.position.set(east + 1.05, base + .35, -(north + .95));
  rope.name = 'shelter-spare-rope';
  group.add(rope);
  disposers.push(() => rope.geometry.dispose());
  let disposed = false;
  return {
    group, east, north, base, pieces: 28, draws: 3,
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
  const stonePieces: BoxPiece[] = [];
  for (let i = 0; i < 10; i++) {
    if (i === 4) continue; // one base stone fallen away
    const angle = (i / 10) * Math.PI * 2;
    stonePieces.push({
      size: [1.1, .55, .6], east: east + Math.cos(angle) * 2.6, base,
      north: north + Math.sin(angle) * 2.6, rotation: [0, -angle, 0],
    });
  }
  stonePieces.push({
    size: [1.1, .5, .6], east: east + 4.4, base: base - .15,
    north: north + 2.2, rotation: [0, 0, .4],
  });
  const slabs: { east: number; north: number; base: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const slabEast = east - 1.6 + i * 1.7;
    const slabNorth = north + 4.6;
    const slabBase = heightAt(slabEast, slabNorth) ?? base;
    stonePieces.push({
      size: [1.35, .14, 1.8], east: slabEast, base: slabBase,
      north: slabNorth, rotation: [-.28, 0, 0],
    });
    slabs.push({ east: slabEast, north: slabNorth, base: slabBase });
  }
  // Ring, fallen stone and all three slabs are immutable boxes in one
  // material family; their original surveyed transforms become instances.
  const boxGeometry = new BoxGeometry(1, 1, 1);
  const masonry = boxBatch(group, boxGeometry, stoneMat, 'watch-star-slab', stonePieces);
  const rustPieces: BoxPiece[] = [];
  for (let i = 0; i < 4; i++) {
    rustPieces.push({
      size: [.3, .18, .1], east: east + Math.cos(i * 1.4) * 1.1,
      base: base + 1.1 + Math.sin(i * 1.4) * 1.05, north: north + .12,
    });
  }
  rustPieces.push({ size: [.12, .7, .04], east: east + .4, base: base + .35, north: north + .1 });
  const rustBoxes = boxBatch(group, boxGeometry, rustMat, 'watch-frame-rust', rustPieces);
  disposers.push(() => {
    masonry.dispose(); rustBoxes.dispose(); boxGeometry.dispose();
  });
  const frame = new Mesh(new TorusGeometry(1.15, .07, 6, 18, Math.PI * 1.25), brassMat);
  frame.name = 'watch-brass-frame';
  frame.position.set(east, base + 1.15, -north);
  frame.rotation.z = .5;
  group.add(frame);
  disposers.push(() => frame.geometry.dispose());
  const chartCanvases: HTMLCanvasElement[] = [];
  const chartGeometries: PlaneGeometry[] = [];
  for (const [i, slab] of slabs.entries()) {
    const { east: slabEast, north: slabNorth, base: slabBase } = slab;
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
        chartCanvases.push(canvas);
        const geometry = new PlaneGeometry(1.2, 1.6);
        const transform = new Object3D();
        transform.rotation.x = -Math.PI / 2 - .28;
        transform.position.set(slabEast, slabBase + .24, -slabNorth + .18);
        transform.updateMatrix();
        geometry.applyMatrix4(transform.matrix);
        // A two-pixel gutter prevents neighbouring charts bleeding through
        // mipmaps while keeping every original star and line unchanged.
        const uv = geometry.getAttribute('uv');
        const u0 = (2 + i * 260) / 784, u1 = (258 + i * 260) / 784;
        const v0 = 2 / 344, v1 = 342 / 344;
        for (let vertex = 0; vertex < uv.count; vertex++) {
          uv.setXY(vertex, u0 + uv.getX(vertex) * (u1 - u0), v0 + uv.getY(vertex) * (v1 - v0));
        }
        chartGeometries.push(geometry);
      }
    }
  }
  const chartCount = chartGeometries.length;
  if (chartCount) {
    const atlas = document.createElement('canvas');
    atlas.width = 784; atlas.height = 344;
    const context = atlas.getContext('2d')!;
    chartCanvases.forEach((canvas, i) => context.drawImage(canvas, 2 + i * 260, 2));
    const geometry = mergeGeometries(chartGeometries, false);
    chartGeometries.forEach(chart => chart.dispose());
    if (!geometry) throw new Error('Sky-watch chart atlas could not be batched');
    const texture = new CanvasTexture(atlas);
    texture.colorSpace = SRGBColorSpace;
    const charts = new Mesh(geometry, new MeshBasicMaterial({ map: texture }));
    charts.name = 'watch-star-slab-chart';
    group.add(charts);
    disposers.push(() => { charts.geometry.dispose(); charts.material.dispose(); texture.dispose(); });
  }
  let disposed = false;
  return {
    group, site: { east, north, height: base },
    slabs: slabs.map(({ east, north }) => ({ east, north })),
    pieces: 19 + chartCount, draws: 3 + (chartCount ? 1 : 0),
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
