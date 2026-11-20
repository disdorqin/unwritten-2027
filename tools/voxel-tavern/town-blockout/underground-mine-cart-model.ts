import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DataTexture, Euler, Float32BufferAttribute, Group, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, NearestFilter, Quaternion, SRGBColorSpace, Vector3,
} from 'three';

type XYZ = readonly [number, number, number];

const wheelRadius = .155;
const wheelWidth = .082;
const wheels = [
  [-.50, wheelRadius, -.365], [.50, wheelRadius, -.365],
  [-.50, wheelRadius, .365], [.50, wheelRadius, .365],
] as const;

function makeIronGrain() {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const shade = 191 + ((x * 137 + y * 57 + x * y * 43) % 57);
      pixels.set([shade, shade, shade, 255], index);
    }
  }
  const grain = new DataTexture(pixels, size, size);
  grain.name = 'mine-cart-pitted-iron';
  grain.colorSpace = SRGBColorSpace;
  grain.magFilter = NearestFilter;
  grain.minFilter = NearestFilter;
  grain.needsUpdate = true;
  return grain;
}

function makeOpenBin() {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  function rim(x: number, y: number, z: number): readonly XYZ[] {
    return [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
  }
  function quad(a: XYZ, b: XYZ, c: XYZ, d: XYZ) {
    const first = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    uvs.push(0, 0, 0, 1, 1, 1, 1, 0);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const shellFoot = rim(.31, .31, .43);
  const shellLip = rim(.43, .73, .54);
  const insideFoot = rim(.286, .36, .407);
  const insideLip = rim(.399, .73, .509);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quad(shellFoot[i]!, shellLip[i]!, shellLip[next]!, shellFoot[next]!);
    quad(insideFoot[i]!, insideFoot[next]!, insideLip[next]!, insideLip[i]!);
    quad(shellLip[i]!, insideLip[i]!, insideLip[next]!, shellLip[next]!);
  }
  quad(shellFoot[0]!, shellFoot[1]!, shellFoot[2]!, shellFoot[3]!);
  quad(insideFoot[0]!, insideFoot[3]!, insideFoot[2]!, insideFoot[1]!);
  const bin = new BufferGeometry();
  bin.setAttribute('position', new Float32BufferAttribute(positions, 3));
  bin.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  bin.setIndex(indices);
  bin.computeVertexNormals();
  return bin;
}

/** Local coordinates in metres. The origin is on the two rail heads, with the cart facing −Z. */
export function createUndergroundMineCartModel() {
  const group = new Group();
  group.name = 'underground-mine-cart';
  const grain = makeIronGrain();
  const iron = new MeshStandardMaterial({ color: '#475052', map: grain, roughness: .96, metalness: .14 });
  const frame = new MeshStandardMaterial({ color: '#343939', map: grain, roughness: .88, metalness: .22 });
  const edge = new MeshStandardMaterial({ color: '#787b70', map: grain, roughness: .83, metalness: .21 });
  const oxide = new MeshStandardMaterial({ color: '#785d45', map: grain, roughness: 1 });
  const blocks = new BoxGeometry();
  const drums = new CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12, 1);
  drums.rotateZ(Math.PI / 2);
  const bin = makeOpenBin();
  const shell = new Mesh(bin, iron);
  shell.name = 'mine-cart-open-bin';
  group.add(shell);

  const batches = new Map<MeshStandardMaterial, Matrix4[]>();
  function box(material: MeshStandardMaterial, position: XYZ, size: XYZ, rotation: XYZ = [0, 0, 0]) {
    const transform = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(...size));
    const batch = batches.get(material);
    if (batch) batch.push(transform);
    else batches.set(material, [transform]);
  }

  for (const x of [-.235, .235]) {
    box(frame, [x, .265, 0], [.105, .10, .99]);
  }
  for (const z of [-.365, .365]) {
    box(frame, [0, wheelRadius, z], [1.002, .068, .068]);
    box(frame, [0, .245, z * 1.25], [.75, .085, .08]);
  }
  // Worn top strips and raised ribs frame a genuinely open bin.
  for (const side of [-1, 1]) {
    box(edge, [side * .418, .735, 0], [.044, .033, 1.108]);
    box(edge, [0, .735, side * .529], [.84, .033, .042]);
    for (const z of [-.338, .338]) {
      box(frame, [side * .38, .535, z], [.052, .415, .067], [0, 0, -side * .279]);
      box(edge, [side * .413, .64, z], [.041, .041, .043]);
      box(edge, [side * .344, .41, z], [.041, .041, .043]);
      box(oxide, [side * .40, .604, z + .03], [.024, .055, .04], [0, 0, -side * .279]);
    }
    box(frame, [side * .235, .585, .627], [.056, .058, .241], [-.13, 0, 0]);
    box(oxide, [side * .235, .584, .539], [.096, .095, .025]);
  }
  box(edge, [0, .604, .758], [.534, .058, .061]);
  box(frame, [0, .607, .761], [.352, .064, .064]);
  for (const [x, y, z] of wheels) {
    box(edge, [x + Math.sign(x) * .036, y, z], [.031, .086, .087]);
  }
  const instanced: InstancedMesh[] = [];
  for (const [material, transforms] of batches) {
    const mesh = new InstancedMesh(blocks, material, transforms.length);
    mesh.name = material === edge ? 'mine-cart-worn-edges-and-push-handle' : 'mine-cart-frame-detail';
    transforms.forEach((transform, index) => mesh.setMatrixAt(index, transform));
    mesh.computeBoundingSphere();
    instanced.push(mesh);
    group.add(mesh);
  }

  const rollers = new InstancedMesh(drums, frame, wheels.length);
  const fasteners = new InstancedMesh(blocks, oxide, wheels.length);
  rollers.name = 'mine-cart-four-rail-wheels';
  fasteners.name = 'mine-cart-wheel-face-fasteners';
  instanced.push(rollers, fasteners);
  group.add(rollers, fasteners);
  const pose = new Matrix4();
  const marker = new Matrix4().makeScale(.018, .043, .025);
  let displayedTravel: number | undefined;
  let disposed = false;
  function setWheelTravel(travelMetres: number) {
    if (disposed || !Number.isFinite(travelMetres) || travelMetres === displayedTravel) return;
    displayedTravel = travelMetres;
    const angle = -(travelMetres % (2 * Math.PI * wheelRadius)) / wheelRadius;
    for (const [index, [x, y, z]] of wheels.entries()) {
      pose.makeRotationX(angle).setPosition(x, y, z);
      rollers.setMatrixAt(index, pose);
      marker.setPosition(x + Math.sign(x) * .042, y + .091 * Math.cos(angle), z + .091 * Math.sin(angle));
      fasteners.setMatrixAt(index, marker);
    }
    rollers.instanceMatrix.needsUpdate = true;
    fasteners.instanceMatrix.needsUpdate = true;
    rollers.computeBoundingSphere();
    fasteners.computeBoundingSphere();
  }
  setWheelTravel(0);

  return {
    group, setWheelTravel,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of instanced) mesh.dispose();
      bin.dispose();
      blocks.dispose();
      drums.dispose();
      for (const material of [iron, frame, edge, oxide]) material.dispose();
      grain.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
