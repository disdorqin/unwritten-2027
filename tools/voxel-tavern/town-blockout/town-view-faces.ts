import { BufferAttribute, BufferGeometry, DynamicDrawUsage, FrontSide, InstancedMesh, Material, Matrix4, Mesh, SkinnedMesh, Vector3, type Object3D } from 'three';

type Axis = 'x' | 'y' | 'z';
type Plane = { axis: Axis; positive: boolean; levels: Float32Array; indices: Uint32Array };
type Model = { mesh: Mesh; source: BufferGeometry; filtered: BufferGeometry; fixed: Uint32Array;
  planes: Plane[]; index: BufferAttribute; inverse: Matrix4; cell: Vector3 };
const eyeCellWidth = 6;
const margin = .001;

export function createTownViewFaces() {
  const cache = new WeakMap<Mesh, Model | null>();
  const active = new Set<Model>();
  const localEye = new Vector3();
  const current = new Set<Model>();

  function collect(mesh: Mesh): Model | null {
    const source = mesh.geometry;
    const vertices = source.getAttribute('position');
    const original = source.index;
    const count = original?.count ?? vertices.count;
    if (count < 3_000 || source.drawRange.start || source.drawRange.count !== Infinity || source.morphAttributes.position?.length ||
        mesh.matrixWorld.determinant() <= 0) return null;
    const axes = ['x', 'y', 'z'] as const;
    const triangles: { level: number; indices: [number, number, number] }[][] = Array.from({ length: 6 }, () => []);
    const fixed: number[] = [];
    for (let i = 0; i + 2 < count; i += 3) {
      const a = original?.getX(i) ?? i, b = original?.getX(i + 1) ?? i + 1, c = original?.getX(i + 2) ?? i + 2;
      const ax = vertices.getX(a), ay = vertices.getY(a), az = vertices.getZ(a);
      const bx = vertices.getX(b), by = vertices.getY(b), bz = vertices.getZ(b);
      const cx = vertices.getX(c), cy = vertices.getY(c), cz = vertices.getZ(c);
      let side: number = -1, level = 0, winding = 0;
      if (ax === bx && bx === cx) {
        side = 0; level = ax; winding = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      } else if (ay === by && by === cy) {
        side = 2; level = ay; winding = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      } else if (az === bz && bz === cz) {
        side = 4; level = az; winding = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      }
      if (side < 0 || !winding) fixed.push(a, b, c);
      else triangles[side + Number(winding < 0)].push({ level, indices: [a, b, c] });
    }
    if (fixed.length > count * .75) return null;
    const planes: Plane[] = [];
    triangles.forEach((items, i) => {
      if (!items.length) return;
      items.sort((a, b) => a.level - b.level);
      const levels = new Float32Array(items.length);
      const indices = new Uint32Array(items.length * 3);
      items.forEach((item, row) => {
        levels[row] = item.level;
        indices.set(item.indices, row * 3);
      });
      planes.push({ axis: axes[i >> 1], positive: i % 2 === 0, levels, indices });
    });
    const filtered = new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) filtered.setAttribute(name, attribute);
    if (!source.boundingSphere) source.computeBoundingSphere();
    filtered.boundingSphere = source.boundingSphere;
    const index = new BufferAttribute(new Uint32Array(count), 1);
    index.setUsage(DynamicDrawUsage);
    filtered.setIndex(index);
    return { mesh, source, filtered, fixed: Uint32Array.from(fixed), planes, index,
      inverse: mesh.matrixWorld.clone().invert(), cell: new Vector3(Infinity, Infinity, Infinity) };
  }

  function split(levels: Float32Array, max: number) {
    let lo = 0, hi = levels.length;
    while (lo < hi) {
      const middle = (lo + hi) >> 1;
      if (levels[middle] <= max) lo = middle + 1;
      else hi = middle;
    }
    return lo;
  }

  function refresh(model: Model, eye: Vector3) {
    localEye.copy(eye).applyMatrix4(model.inverse);
    const x = Math.floor(localEye.x / eyeCellWidth), y = Math.floor(localEye.y / eyeCellWidth), z = Math.floor(localEye.z / eyeCellWidth);
    if (model.cell.x === x && model.cell.y === y && model.cell.z === z) return;
    model.cell.set(x, y, z);
    const indices = model.index.array as Uint32Array;
    indices.set(model.fixed);
    let count = model.fixed.length;
    for (const plane of model.planes) {
      // Use the entire cell occupied by the camera, so triangles crossing its view plane remain present.
      const low = model.cell[plane.axis] * eyeCellWidth;
      const location = plane.positive ? low + eyeCellWidth + margin : low - margin;
      const boundary = split(plane.levels, location) * 3;
      const selection = plane.positive ? plane.indices.subarray(0, boundary) : plane.indices.subarray(boundary);
      indices.set(selection, count);
      count += selection.length;
    }
    model.filtered.setDrawRange(0, count);
    model.index.clearUpdateRanges();
    model.index.addUpdateRange(0, count);
    model.index.needsUpdate = true;
  }

  function update(enabled: boolean, eye: Vector3, roots: Iterable<Object3D>) {
    current.clear();
    if (enabled) for (const root of roots) {
      root.updateMatrixWorld();
      root.traverseVisible(item => {
        if (!eligible(item)) return;
        const model = find(item);
        if (!model) return;
        refresh(model, eye);
        item.geometry = model.filtered;
        current.add(model);
      });
    }
    for (const model of active) {
      if (!current.has(model)) {
        model.mesh.geometry = model.source;
        active.delete(model);
      }
    }
    for (const model of current) active.add(model);
  }

  function eligible(item: Object3D): item is Mesh<BufferGeometry, Material> {
    return item instanceof Mesh && !(item instanceof InstancedMesh) && !(item instanceof SkinnedMesh) &&
      !Array.isArray(item.material) && !item.material.transparent && item.material.side === FrontSide &&
      item.material.onBeforeCompile === Material.prototype.onBeforeCompile;
  }

  function find(item: Mesh) {
    if (cache.has(item)) return cache.get(item);
    const model = collect(item);
    cache.set(item, model);
    return model;
  }

  function warm(roots: Iterable<Object3D>) {
    const deadline = performance.now() + 1;
    for (const root of roots) {
      root.updateMatrixWorld();
      root.traverse(item => {
        if (performance.now() < deadline && eligible(item) && !cache.has(item)) find(item);
      });
      if (performance.now() >= deadline) return;
    }
  }

  return { update, warm };
}
