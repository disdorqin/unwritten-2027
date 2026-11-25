import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry,
  Quaternion, SRGBColorSpace, Vector3,
} from 'three';
import type { Box, Ramp } from './landmark-kit';
import { museumDetailAxis, museumHorizontalScale } from './museum-scale';
import { addOpaqueMuseumLabels, type OpaqueMuseumLabel } from './museum-label-atlas';
import { createMuseumLabelCanvas, type MuseumLabelStyle } from './museum-label-canvas';
import { useLandmarkEmissionMask } from './landmark-label';

type Point = readonly [number, number, number];
export type MuseumLight = { position: Point; color: string; power: number; distance: number };
export type MuseumBuilder = ReturnType<typeof createMuseumBuilder>;
const up = new Vector3(0, 1, 0);

export function createMuseumBuilder({ mergeLabelSizes = false } = {}) {
  const group = new Group();
  group.scale.set(museumHorizontalScale, 1, museumHorizontalScale);
  const interior = new Group();
  interior.name = 'Museum interior exhibits';
  let mounting = group;
  const chunkPair = () => [false, true].map(() => ({ matrices: [] as Matrix4[], colors: [] as Color[] }));
  const chunks = new Map([[group, chunkPair()], [interior, chunkPair()]]);
  function detailInterior(build: () => void) {
    mounting = interior;
    try { build(); }
    finally { mounting = group; }
  }
  const panels = { positions: [] as number[], colors: [] as number[] };
  const transform = new Object3D();
  const rotation = new Quaternion();
  const beamVector = new Vector3();
  const colliders: Box[] = [], floors: Box[] = [], ramps: Ramp[] = [], lights: MuseumLight[] = [];
  const bounds = (x: number, y: number, z: number, w: number, h: number, d: number): Box => ({
    min: [x - w / 2, y - h / 2, z - d / 2], max: [x + w / 2, y + h / 2, z + d / 2],
  });
  function add(paint: string, x: number, y: number, z: number, w: number, h: number, d: number, orientation: Quaternion, luminous = false) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    transform.position.set(x, y, z);
    transform.quaternion.copy(orientation);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    const target = chunks.get(mounting)![Number(luminous)];
    target.matrices.push(transform.matrix.clone());
    target.colors.push(new Color(paint));
  }
  function box(paint: string, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, emissive = false) {
    add(paint, x, y, z, w, h, d, rotation.setFromAxisAngle(up, ry), emissive);
  }
  function detailBox(paint: string, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, emissive = false) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const east = museumDetailAxis(x, w, museumHorizontalScale);
    const vertical = museumDetailAxis(y, h, 1);
    const south = museumDetailAxis(z, d, museumHorizontalScale);
    box(paint, east.center, vertical.center, south.center, east.size, vertical.size, south.size, ry, emissive);
  }
  function collider(x: number, y: number, z: number, w: number, h: number, d: number) {
    colliders.push(bounds(x, y, z, w, h, d));
  }
  function solid(paint: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    box(paint, x, y, z, w, h, d);
    collider(x, y, z, w, h, d);
  }
  function floor(x: number, top: number, z: number, w: number, d: number, thickness = .16) {
    floors.push(bounds(x, top - thickness / 2, z, w, thickness, d));
  }
  function beam(paint: string, a: Point, b: Point, thickness: number) {
    beamVector.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = beamVector.length();
    add(paint, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
      thickness, length, thickness, rotation.setFromUnitVectors(up, beamVector.normalize()));
  }
  function panel(paint: string, a: Point, b: Point, c: Point, d: Point) {
    const tint = new Color(paint);
    for (const point of [a, b, c, a, c, d]) {
      panels.positions.push(...point);
      panels.colors.push(tint.r, tint.g, tint.b);
    }
  }
  const chroniclePainters: { paint: (data: never) => boolean; texture: CanvasTexture }[] = [];
  function chronicleFace(face: { source: HTMLCanvasElement; paint: (data: never) => boolean } | undefined,
    x: number, y: number, z: number, w: number, h: number, ry = 0) {
    if (!face || typeof document === 'undefined') return;
    const texture = new CanvasTexture(face.source);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mounting.add(mesh);
    chroniclePainters.push({ paint: face.paint, texture });
  }
  const labelCanvases = new Map<string, HTMLCanvasElement>();
  const transparentTextures = new Map<HTMLCanvasElement, CanvasTexture>();
  const opaqueLabels: OpaqueMuseumLabel[] = [];
  const smallLabels: Mesh[] = [];
  function label(text: string, x: number, y: number, z: number, w: number, h: number, ry = 0, options: MuseumLabelStyle = {}) {
    if (typeof document === 'undefined') return;
    const { background = '#341d18', color = '#ffe4a0', accent = '#a4783d', border = true } = options;
    const key = JSON.stringify([text, w / h, background, color, accent, border]);
    let canvas = labelCanvases.get(key);
    if (!canvas) {
      canvas = createMuseumLabelCanvas(text, w, h, { background, color, accent, border });
      labelCanvases.set(key, canvas);
    }
    if (background !== 'transparent') {
      opaqueLabels.push({ source: canvas, parent: mounting, x, y, z, width: w, height: h, yaw: ry });
      return;
    }
    // Leave translucent signs individually sorted by Three.js.
    let texture = transparentTextures.get(canvas);
    if (!texture) {
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      transparentTextures.set(canvas, texture);
    }
    const mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture, transparent: true }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mounting.add(mesh);
    if (h <= 1.2) smallLabels.push(mesh);
  }
  function light(x: number, y: number, z: number, color: string, power: number, distance: number) {
    lights.push({ position: [x, y, z], color, power, distance });
  }
  function finish(mergeUnlit = false) {
    const geometry = new BoxGeometry();
    for (const [section, pair] of chunks) {
      const [lit, luminous] = pair;
      if (mergeUnlit && lit.matrices.length && luminous.matrices.length) {
        const sectionGeometry = geometry.clone();
        const material = new MeshLambertMaterial();
        useLandmarkEmissionMask(material, true);
        const mesh = new InstancedMesh(sectionGeometry, material, lit.matrices.length + luminous.matrices.length);
        const mask = new Float32Array(mesh.count);
        mask.fill(1, lit.matrices.length);
        sectionGeometry.setAttribute('landmarkEmission', new InstancedBufferAttribute(mask, 1));
        [...lit.matrices, ...luminous.matrices].forEach((matrix, index) => {
          mesh.setMatrixAt(index, matrix);
          mesh.setColorAt(index, index < lit.colors.length ? lit.colors[index] : luminous.colors[index - lit.colors.length]);
        });
        mesh.computeBoundingSphere();
        section.add(mesh);
        continue;
      }
      pair.forEach(({ matrices, colors }, index) => {
        if (!matrices.length) return;
        const material = index ? new MeshBasicMaterial() : new MeshLambertMaterial();
        const mesh = new InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colors[i]); });
        mesh.computeBoundingSphere();
        section.add(mesh);
      });
    }
    addOpaqueMuseumLabels(opaqueLabels, smallLabels, { mergeSizes: mergeLabelSizes });
    if (interior.children.length) {
      group.add(interior);
      group.userData.detailInterior = interior;
    }
    if (panels.positions.length) {
      const surfaces = new BufferGeometry();
      surfaces.setAttribute('position', new Float32BufferAttribute(panels.positions, 3));
      surfaces.setAttribute('color', new Float32BufferAttribute(panels.colors, 3));
      surfaces.computeVertexNormals();
      group.add(new Mesh(surfaces, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide })));
    }
    function scaleBounds<T extends Box>(shape: T): T {
      const scale = ([x, y, z]: number[]) => [x * museumHorizontalScale, y, z * museumHorizontalScale];
      return { ...shape, min: scale(shape.min), max: scale(shape.max) };
    }
    Object.assign(group.userData, {
      colliders: colliders.map(scaleBounds), floors: floors.map(scaleBounds), ramps: ramps.map(scaleBounds),
      smallLabels, chroniclePainters,
      lights: lights.map(light => ({ ...light, position: [light.position[0] * museumHorizontalScale, light.position[1], light.position[2] * museumHorizontalScale] })),
    });
    return group;
  }
  return { group, box, detailBox, detailInterior, solid, collider, floor, beam, panel, label, chronicleFace, light, ramps, finish };
}
