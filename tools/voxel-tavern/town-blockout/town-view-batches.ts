import {
  Box3, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DynamicDrawUsage, FrontSide, Frustum,
  Group, InstancedBufferAttribute, InstancedMesh, Material, Matrix4, PlaneGeometry, StaticDrawUsage, Vector3, type Camera, type Object3D,
} from 'three';

type Instance = { matrix: Matrix4; inverse?: Matrix4; tint?: Color; bounds: Box3 };
type Source = { instances: Instance[]; bounds: Box3; quads?: Matrix4[]; caps?: BufferGeometry[]; world: Matrix4; version: number };
type InstanceFace = { instance: Instance; face?: Matrix4 };
type Submission = { geometry: BufferGeometry; material: Material; order: number; frames: InstanceFace[]; count: number; mesh?: InstancedMesh };

export function createTownViewBatches() {
  const group = new Group();
  group.name = 'Visible aerial instances';
  const sources = new WeakMap<InstancedMesh, Source | null>();
  const previousProjection = new Matrix4();
  const previousSources: InstancedMesh[] = [];
  const visibleSources: InstancedMesh[] = [];
  const submissions = new Map<string, Submission>();
  const quadMatrices = new WeakMap<BoxGeometry, Matrix4[]>();
  const cylinderIndices = new WeakMap<CylinderGeometry, BufferGeometry[]>();
  const suppressed = new Map<InstancedMesh, number>();
  const frustum = new Frustum();
  const viewProjection = new Matrix4();
  const faceMatrix = new Matrix4();
  const localEye = new Vector3();
  const quad = new PlaneGeometry();
  let active = false;

  function boxQuads(geometry: BoxGeometry) {
    let cached = quadMatrices.get(geometry);
    if (cached) return cached;
    const { position, uv, normal } = geometry.attributes;
    if (!geometry.index || position.count !== 24 || geometry.groups.length !== 6 ||
        Object.keys(geometry.attributes).length !== 3) return undefined;
    cached = [];
    for (const { start, count } of geometry.groups) {
      if (count !== 6) return undefined;
      const indices = Array.from({ length: count }, (_, i) => geometry.index!.getX(start + i));
      const corner = (u: number, v: number) => indices.find(index => uv.getX(index) === u && uv.getY(index) === v);
      const startCorner = corner(0, 0), horizontal = corner(1, 0), vertical = corner(0, 1);
      if (startCorner === undefined || horizontal === undefined || vertical === undefined) return undefined;
      const origin = new Vector3().fromBufferAttribute(position, startCorner);
      const x = new Vector3().fromBufferAttribute(position, horizontal).sub(origin);
      const y = new Vector3().fromBufferAttribute(position, vertical).sub(origin);
      const z = new Vector3().fromBufferAttribute(normal, startCorner);
      if (new Vector3().crossVectors(x, y).dot(z) <= 0) return undefined;
      const center = origin.addScaledVector(x, .5).addScaledVector(y, .5);
      cached.push(new Matrix4().makeBasis(x, y, z).setPosition(center));
    }
    quadMatrices.set(geometry, cached);
    return cached;
  }

  function cylinderVariants(geometry: CylinderGeometry) {
    const cached = cylinderIndices.get(geometry);
    if (cached) return cached;
    const original = geometry.index;
    const bounds = geometry.boundingBox!;
    if (!original || geometry.groups.length !== 3 || geometry.parameters.openEnded) return undefined;
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    for (const { start, count, materialIndex } of geometry.groups) {
      if (!materialIndex) continue;
      if (materialIndex !== 1 && materialIndex !== 2) return undefined;
      const direction = materialIndex === 1 ? 1 : -1;
      const y = direction === 1 ? bounds.max.y : bounds.min.y;
      for (let i = start; i < start + count; i++) {
        const vertex = original.getX(i);
        if (positions.getY(vertex) !== y || normals.getY(vertex) !== direction ||
            normals.getX(vertex) || normals.getZ(vertex)) return undefined;
      }
    }
    // Keep the identical side vertices and UVs, with top/bottom index ranges selected separately.
    const variants = [0, 1, 2, 3].map(mask => {
      if (mask === 3) return geometry;
      const target = new BufferGeometry(), indices: number[] = [];
      for (const [name, attribute] of Object.entries(geometry.attributes)) target.setAttribute(name, attribute);
      for (const { start, count, materialIndex } of geometry.groups) {
        if (materialIndex && !(mask & materialIndex)) continue;
        for (let i = start; i < start + count; i++) indices.push(original.getX(i));
      }
      target.setIndex(indices);
      return target;
    });
    cylinderIndices.set(geometry, variants);
    return variants;
  }

  function collect(source: InstancedMesh) {
    let cached = sources.get(source);
    if (cached === null) return null;
    if (cached && cached.version === source.instanceMatrix.version && cached.world.equals(source.matrixWorld)) return cached;
    const geometry = source.geometry;
    if (Object.values(geometry.attributes).some(attribute => attribute instanceof InstancedBufferAttribute)) {
      sources.set(source, null);
      return null;
    }
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const local = geometry.boundingBox!;
    const bounds = new Box3();
    const quads = geometry instanceof BoxGeometry ? boxQuads(geometry) : undefined;
    const caps = geometry instanceof CylinderGeometry ? cylinderVariants(geometry) : undefined;
    const instances: Instance[] = [];
    for (let i = 0; i < source.count; i++) {
      const matrix = new Matrix4();
      source.getMatrixAt(i, matrix);
      matrix.premultiply(source.matrixWorld);
      if (matrix.determinant() <= 0) {
        sources.set(source, null);
        return null;
      }
      const entry: Instance = { matrix, bounds: local.clone().applyMatrix4(matrix) };
      if (source.instanceColor) {
        entry.tint = new Color();
        source.getColorAt(i, entry.tint);
      }
      if (quads || caps) entry.inverse = matrix.clone().invert();
      instances.push(entry);
      bounds.union(entry.bounds);
    }
    cached = { instances, bounds, quads, caps, world: source.matrixWorld.clone(), version: source.instanceMatrix.version };
    sources.set(source, cached);
    return cached;
  }

  function restore() {
    for (const [source, layers] of suppressed) source.layers.mask = layers;
    suppressed.clear();
  }

  function visibleBoxFaces(source: BufferGeometry, instance: Instance, eye: Vector3) {
    const box = source.boundingBox!;
    localEye.copy(eye).applyMatrix4(instance.inverse!);
    const margin = .0001;
    let mask = 0;
    if (localEye.x >= box.max.x - margin) mask |= 1;
    if (localEye.x <= box.min.x + margin) mask |= 2;
    if (localEye.y >= box.max.y - margin) mask |= 4;
    if (localEye.y <= box.min.y + margin) mask |= 8;
    if (localEye.z >= box.max.z - margin) mask |= 16;
    if (localEye.z <= box.min.z + margin) mask |= 32;
    return mask;
  }

  function record(stream: Submission, instance: Instance, face?: Matrix4) {
    const slot = stream.frames[stream.count];
    if (slot) {
      slot.instance = instance;
      slot.face = face;
    } else stream.frames.push({ instance, face });
    stream.count++;
  }

  function eligible(item: Object3D): item is InstancedMesh<BufferGeometry, Material> {
    return item instanceof InstancedMesh && !!item.count && !Array.isArray(item.material) &&
      item.instanceMatrix.usage === StaticDrawUsage && !item.material.transparent && item.material.side === FrontSide &&
      item.material.onBeforeCompile === Material.prototype.onBeforeCompile;
  }

  function warm(roots: readonly Object3D[]) {
    const deadline = performance.now() + 1;
    for (const root of roots) {
      root.updateMatrixWorld();
      root.traverse(item => {
        if (performance.now() < deadline && eligible(item) && !sources.has(item)) collect(item);
      });
      if (performance.now() >= deadline) return;
    }
  }

  function update(enabled: boolean, camera: Camera, roots: readonly Object3D[]) {
    if (!enabled && !active) return;
    group.visible = enabled;
    if (!enabled) {
      restore();
      previousSources.length = 0;
      active = false;
      return;
    }
    active = true;
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    visibleSources.length = 0;
    for (const root of roots) {
      root.updateMatrixWorld();
      root.traverseVisible(item => {
        if (eligible(item) && (camera.layers.mask & (suppressed.get(item) ?? item.layers.mask))) visibleSources.push(item);
      });
    }
    if (viewProjection.equals(previousProjection) && visibleSources.length === previousSources.length &&
        visibleSources.every((item, index) => {
          const source = sources.get(item);
          return item === previousSources[index] && (source === null ||
            (!!source && source.version === item.instanceMatrix.version && source.world.equals(item.matrixWorld)));
        })) return;
    previousProjection.copy(viewProjection);
    previousSources.length = 0;
    previousSources.push(...visibleSources);
    restore();
    frustum.setFromProjectionMatrix(viewProjection);
    for (const submission of submissions.values()) submission.count = 0;

    for (const item of visibleSources) {
        const material = item.material as Material;
        const source = collect(item);
        if (!source) continue;
        suppressed.set(item, item.layers.mask);
        item.layers.mask = 0;
        if (!frustum.intersectsBox(source.bounds)) continue;
        const { quads, caps } = source;
        const getStream = (geometry: BufferGeometry) => {
          const key = geometry.id + ':' + material.uuid + ':' + item.renderOrder + ':' + Number(!!item.instanceColor);
          let stream = submissions.get(key);
          if (!stream) submissions.set(key, stream = { geometry, material, order: item.renderOrder, frames: [], count: 0 });
          return stream;
        };
        if (caps) {
          const streams = caps.map(getStream);
          const bounds = item.geometry.boundingBox!;
          for (const instance of source.instances) {
            if (!frustum.intersectsBox(instance.bounds)) continue;
            localEye.copy(camera.position).applyMatrix4(instance.inverse!);
            // A perspective eye below the top plane cannot see its front face, and vice versa.
            const mask = Number(localEye.y >= bounds.max.y - .0001) | (Number(localEye.y <= bounds.min.y + .0001) << 1);
            record(streams[mask], instance);
          }
        } else if (quads) {
          const stream = getStream(quad);
          for (const instance of source.instances) {
            if (!frustum.intersectsBox(instance.bounds)) continue;
            const mask = visibleBoxFaces(item.geometry, instance, camera.position);
            for (let side = 0; side < 6; side++) if (mask & (1 << side)) record(stream, instance, quads[side]);
          }
        } else {
          const stream = getStream(item.geometry);
          for (const instance of source.instances) if (frustum.intersectsBox(instance.bounds)) record(stream, instance);
        }
    }

    for (const stream of submissions.values()) {
      const { geometry, material, order, frames, count } = stream;
      let mesh = stream.mesh;
      if (!count) {
        if (mesh) mesh.visible = false;
        continue;
      }
      if (!mesh || mesh.instanceMatrix.count < count) {
        if (mesh) {
          mesh.removeFromParent();
          mesh.dispose();
        }
        mesh = new InstancedMesh(geometry, material, 2 ** Math.ceil(Math.log2(count)));
        mesh.name = 'Culled town geometry';
        mesh.frustumCulled = false;
        mesh.renderOrder = order;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        if (frames[0].instance.tint) {
          mesh.setColorAt(0, frames[0].instance.tint);
          mesh.instanceColor!.setUsage(DynamicDrawUsage);
        }
        group.add(mesh);
        stream.mesh = mesh;
      }
      for (let index = 0; index < count; index++) {
        const { instance: { matrix, tint }, face } = frames[index];
        mesh.setMatrixAt(index, face ? faceMatrix.multiplyMatrices(matrix, face) : matrix);
        if (tint) mesh.setColorAt(index, tint);
      }
      mesh.count = count;
      mesh.visible = true;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  return { group, update, warm };
}
