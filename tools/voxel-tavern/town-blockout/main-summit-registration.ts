import { BoxGeometry, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';

type Point = { east: number; north: number; height: number };
type Box = { min: [number, number, number]; max: [number, number, number] };
type Area = 'summit' | 'cloud-deck';
type StampAction = 'cloud-stamp' | 'summit-stamp' | 'register-summit';
type Profile = { cloudStamped: boolean; summitStamped: boolean; summitRegistered: boolean };
type Material = keyof typeof palette;
type Part = {
  center: Point;
  size: readonly [width: number, height: number, depth: number];
  material: Material;
  rotation?: number;
};

const palette = {
  stone: '#83817d', darkStone: '#4f5255', carvedStone: '#b7b8b5', roofStone: '#5d686d',
  timber: '#694e39', warmTimber: '#9a7755', darkTimber: '#473728',
} as const;
const summitHeight = 800;
const interactionRadius = 1.1;
const interactionElevation = 0.43;

export function withinMainSummitRegistrationReach(position: Point, anchor: Point) {
  return Math.abs(anchor.height - position.height) <= interactionElevation &&
    Math.hypot(anchor.east - position.east, anchor.north - position.north) <= interactionRadius;
}

function point(east: number, north: number, height = summitHeight): Point {
  return { east, north, height };
}

function addPart(parts: Part[], colliders: Box[], center: Point, size: Part['size'],
  material: Material, solid = false, rotation?: number) {
  parts.push({ center, size, material, rotation });
  if (!solid) return;
  const [x, y, z] = size.map(span => span / 2) as [number, number, number];
  const { east, north, height } = center;
  colliders.push({ min: [east - x, height - y, -north - z], max: [east + x, height + y, -north + z] });
}

function makeMonument(monument: Point, summit: boolean, parts: Part[], colliders: Box[]) {
  const { east, north, height } = monument;
  const add = (eastOffset: number, northOffset: number, lift: number, size: Part['size'], material: Material,
    solid = false) => addPart(parts, colliders, point(east + eastOffset, north + northOffset, height + lift), size, material, solid);
  add(0, 0, 0.17, [2.9, 0.34, 2.2], 'darkStone', true);
  add(0, 0, 0.43, [2.42, 0.3, 1.72], 'stone', true);
  const slabHeight = summit ? 2.5 : 1.75;
  add(0, 0.09, 0.58 + slabHeight / 2, [summit ? 1.78 : 1.44, slabHeight, 0.63], 'carvedStone', true);
  add(0, 0.09, 0.65 + slabHeight, [summit ? 1.94 : 1.58, 0.15, 0.81], 'stone');
  add(0, -0.25, 0.61 + slabHeight / 2, [summit ? 1.43 : 1.13, slabHeight - 0.34, 0.06], 'stone');
  for (const offset of [-0.35, 0, 0.35]) {
    add(offset, -0.286, slabHeight * 0.62, [0.04, slabHeight * 0.38, 0.03], 'darkStone');
  }
  add(0, -0.3, slabHeight * 0.88, [summit ? 0.9 : 0.8, 0.075, 0.05], 'carvedStone');
}

function makeHut(parts: Part[], colliders: Box[]) {
  const add = (east: number, north: number, lift: number, size: Part['size'], material: Material,
    solid = false, rotation?: number) => addPart(parts, colliders, point(east, north, summitHeight + lift), size,
    material, solid, rotation);
  const centerEast = 62.5;
  const front = 1007;
  const middle = 1013;
  const back = 1019;
  const wall = 0.38;
  const soffit = 4.15;

  add(centerEast, middle, -0.17, [13, 0.34, 12], 'stone');
  for (const east of [57.5, 67.5]) {
    add(east, front + 0.07, 1.56, [3.25, 3.12, wall], 'stone', true);
    const nextEast = (east + centerEast) / 2;
    add(nextEast, front + 0.07, 1.56, [2.08, 3.12, wall], 'timber', true);
  }
  add(centerEast, front + 0.07, 3.69, [13, 1.16, wall], 'timber', true);
  for (const east of [61.02, 63.98]) {
    add(east, front - 0.12, 1.61, [0.2, 3.22, 0.52], 'darkTimber', true);
  }
  add(centerEast, front - 0.14, 3.16, [3.16, 0.22, 0.55], 'darkTimber', true);
  add(centerEast, front - 0.144, 3.72, [2.15, 0.56, 0.17], 'warmTimber');

  for (const east of [56.19, 68.81]) {
    add(east, middle, 0.51, [wall, 1.02, 12], 'stone', true);
    add(east, middle, 3.46, [wall, 1.43, 12], 'timber', true);
    for (const north of [1008.05, 1013.18, 1017.95]) {
      add(east, north, 1.89, [wall, 1.8, 2.05], 'timber', true);
    }
    add(east, middle, 1.81, [0.18, 0.12, 12], 'darkTimber');
  }
  add(centerEast, back - wall / 2, 0.76, [13, 1.52, wall], 'stone', true);
  add(centerEast, back - wall / 2, 2.84, [13, 2.65, wall], 'timber', true);
  for (const north of [front, back - wall / 2]) {
    for (let row = 0; row < 6; row++) {
      add(centerEast, north, soffit + row * 0.29 + 0.11, [11.2 - row * 1.62, 0.29, 0.28], 'timber');
    }
  }
  const halfRoofRun = 7.05;
  const roofRise = 1.98;
  const rotation = Math.atan2(roofRise, halfRoofRun);
  for (const side of [-1, 1]) {
    add(centerEast + side * halfRoofRun / 2, middle, soffit + roofRise / 2,
      [Math.hypot(halfRoofRun, roofRise), 0.25, 13.15], 'roofStone', false, -side * rotation);
    add(centerEast + side * halfRoofRun, middle, soffit, [0.2, 0.34, 13.2], 'darkTimber');
  }
  add(centerEast, middle, soffit + roofRise + 0.08, [0.36, 0.25, 13.27], 'darkStone');

  // Furniture leaves a straight walk from the door to the register stand.
  add(centerEast, 1016.14, 0.48, [3.38, 0.96, 0.87], 'darkTimber', true);
  add(centerEast, 1016.14, 1, [3.59, 0.125, 1.04], 'warmTimber', true);
  add(61.89, 1016.02, 1.1, [0.43, 0.075, 0.3], 'carvedStone');
  add(63.38, 1015.95, 1.19, [0.17, 0.25, 0.17], 'darkStone');
  add(57.32, 1012.6, 0.24, [0.79, 0.48, 3.25], 'warmTimber', true);
  add(67.65, 1013, 0.33, [0.72, 0.65, 1.14], 'darkTimber', true);
  add(57.53, 1017.14, 0.53, [1.14, 1.05, 1.38], 'darkStone', true);
  add(57.68, 1017.38, 2.92, [0.43, 4.11, 0.43], 'darkStone', true);
}

export function createMainSummitRegistrationLandmarks(cloudDeckHeight = 347) {
  if (!Number.isFinite(cloudDeckHeight) || cloudDeckHeight < 347 || cloudDeckHeight > 350) {
    throw new RangeError('Cloud-deck registration requires its surveyed 347–350 m floor.');
  }
  const summitParts: Part[] = [];
  const summitColliders: Box[] = [];
  const summitMonument = point(50, 1000);
  const summitStamp = point(50, 998);
  const entry = point(62.5, 1004.8);
  const interior = point(62.5, 1011);
  const registry = point(62.5, 1014);
  makeHut(summitParts, summitColliders);
  makeMonument(summitMonument, true, summitParts, summitColliders);

  const cloudParts: Part[] = [];
  const cloudColliders: Box[] = [];
  // This anchor uses the existing North Ridge terrace coordinate frame.
  const cloudMonument = point(306, 661, cloudDeckHeight);
  const cloudStamp = point(306, 659, cloudDeckHeight);
  makeMonument(cloudMonument, false, cloudParts, cloudColliders);
  const common = [summitStamp, point(54, 998), entry, interior, registry];
  return {
    summit: {
      entry, interior, hut: { west: 56, east: 69, south: 1007, north: 1019, height: summitHeight },
      monument: summitMonument, stampPoint: summitStamp, registry,
      colliders: summitColliders, parts: summitParts,
      routes: {
        fromTrail: [point(30, 982), point(50, 986), ...common],
        fromCable: [point(27, 999), point(27, 987.5), point(50, 987.5), ...common],
      },
    },
    cloudDeck: { monument: cloudMonument, stampPoint: cloudStamp, colliders: cloudColliders, parts: cloudParts },
  };
}

type Landmarks = ReturnType<typeof createMainSummitRegistrationLandmarks>;

export function mountMainSummitRegistration(owner: Group, landmarks = createMainSummitRegistrationLandmarks(),
  area: Area = 'summit') {
  const { colliders, parts } = area === 'summit' ? landmarks.summit : landmarks.cloudDeck;
  const group = new Group();
  group.name = area === 'summit' ? 'main-summit-hut-and-registration' : 'cloud-deck-registration-monument';
  const geometry = new BoxGeometry();
  const materials: MeshLambertMaterial[] = [];
  const transform = new Object3D();
  for (const [name, color] of Object.entries(palette)) {
    const instances = parts.filter(({ material }) => material === name);
    if (!instances.length) continue;
    const material = new MeshLambertMaterial({ color });
    materials.push(material);
    const mesh = new InstancedMesh(geometry, material, instances.length);
    for (const [index, { center, size, rotation }] of instances.entries()) {
      transform.position.set(center.east, center.height, -center.north);
      transform.scale.set(...size);
      transform.rotation.set(0, 0, rotation ?? 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  owner.add(group);
  return {
    group, colliders,
    dispose() {
      group.removeFromParent();
      for (const child of group.children) (child as InstancedMesh).dispose();
      group.clear();
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

export function createMainSummitRegistration(landmarks: Landmarks = createMainSummitRegistrationLandmarks(),
  saved?: Partial<Profile>) {
  const state: Profile = {
    cloudStamped: saved?.cloudStamped === true,
    summitStamped: saved?.summitStamped === true,
    summitRegistered: saved?.summitRegistered === true,
  };
  const summitActions = [
    { anchor: landmarks.summit.registry, action: 'register-summit', flag: 'summitRegistered' },
    { anchor: landmarks.summit.stampPoint, action: 'summit-stamp', flag: 'summitStamped' },
  ] as const;
  const cloudActions = [{ anchor: landmarks.cloudDeck.stampPoint, action: 'cloud-stamp', flag: 'cloudStamped' }] as const;

  function snapshot() {
    return { ...state, snowWingEligible: state.summitRegistered };
  }

  function interact(area: Area, position: Point): {
    action: StampAction | 'out-of-range'; changed: boolean; profile: ReturnType<typeof snapshot>;
  } {
    const actions = area === 'summit' ? summitActions : cloudActions;
    const target = actions.find(({ anchor }) => withinMainSummitRegistrationReach(position, anchor));
    if (!target) return { action: 'out-of-range', changed: false, profile: snapshot() };
    const changed = !state[target.flag];
    state[target.flag] = true;
    return { action: target.action, changed, profile: snapshot() };
  }

  return { snapshot, interact };
}
