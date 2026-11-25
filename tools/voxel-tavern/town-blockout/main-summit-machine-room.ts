import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial, Object3D, TorusGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CableFaultPoint = {
  id: 'rust-gate' | 'derail' | 'counterweight';
  east: number; north: number; height: number;
};

/**
 * Line-2 lower-station machine room (§3.14): the repair game's three fault
 * points as readable models — a rusted gate wheel, a pulley slipped off its
 * track, and a counterweight stack with one block fallen. The repair
 * interactions themselves land in the gameplay round; positions are
 * registered here for that round to consume.
 */
export function createMainSummitMachineRoom(floor = 347) {
  const group = new Group();
  group.name = 'main-summit-machine-room';
  const disposers: (() => void)[] = [];
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const timber = new MeshLambertMaterial({ color: '#6d4c33' });
  const iron = new MeshLambertMaterial({ color: '#3c4147' });
  const rust = new MeshLambertMaterial({ color: '#8a4f26' });
  const brass = new MeshLambertMaterial({ color: '#b08d4f' });
  disposers.push(() => { stone.dispose(); timber.dispose(); iron.dispose(); rust.dispose(); brass.dispose(); });
  const centre = { east: -15.5, north: 6 };

  // Bake static solids per material while retaining named transform anchors.
  // The gate wheel, tilted pulley and fallen weight stay independent because
  // the repair round uses them as fault interaction surfaces.
  const unitBox = new BoxGeometry(1, 1, 1);
  const sourceGeometries = new Set<BufferGeometry>([unitBox]);
  const batches = new Map<MeshLambertMaterial, { object: Object3D; geometry: BufferGeometry }[]>();
  function staticPart(name: string, material: MeshLambertMaterial, geometry: BufferGeometry) {
    const anchor = new Object3D();
    anchor.name = name;
    group.add(anchor);
    sourceGeometries.add(geometry);
    const parts = batches.get(material) ?? [];
    parts.push({ object: anchor, geometry });
    batches.set(material, parts);
    return anchor;
  }

  function box(name: string, material: MeshLambertMaterial, size: [number, number, number],
    east: number, base: number, north: number) {
    const anchor = staticPart(name, material, unitBox);
    anchor.position.set(east, base + size[1] / 2, -north);
    anchor.scale.set(...size);
    return anchor;
  }

  function flushStaticBatches() {
    try {
      for (const [material, parts] of batches) {
        const copies = parts.map(({ object, geometry }) => {
          object.updateMatrix();
          return geometry.clone().applyMatrix4(object.matrix);
        });
        try {
          const geometry = mergeGeometries(copies, false);
          if (!geometry) throw new Error(`Could not batch machine-room material ${material.color.getHexString()}.`);
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          const mesh = new Mesh(geometry, material);
          mesh.name = `machine-room-static-${material.color.getHexString()}`;
          mesh.matrixAutoUpdate = false;
          mesh.userData.partNames = parts.map(part => part.object.name);
          group.add(mesh);
          for (const part of parts) part.object.userData.renderBatch = mesh.name;
          disposers.push(() => geometry.dispose());
        } finally {
          for (const copy of copies) copy.dispose();
        }
      }
    } finally {
      for (const geometry of sourceGeometries) geometry.dispose();
      sourceGeometries.clear();
      batches.clear();
    }
  }

  // Shell: back and side walls, flat roof, open face toward the station.
  box('machine-room-back', stone, [.35, 2.9, 6.4], centre.east - 2.2, floor, centre.north);
  box('machine-room-side', stone, [4.4, 2.9, .35], centre.east, floor, centre.north - 3.1);
  box('machine-room-side', stone, [4.4, 2.9, .35], centre.east, floor, centre.north + 3.1);
  box('machine-room-roof', timber, [4.9, .16, 6.9], centre.east, floor + 2.9, centre.north);
  box('machine-room-floor', stone, [4.9, .12, 6.9], centre.east, floor - .12, centre.north);

  // Winch drum with the rusted gate wheel on its axle.
  const drum = staticPart('machine-winch-drum', iron, new CylinderGeometry(.55, .55, 1.5, 12));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(centre.east - 1.2, floor + .75, -centre.north);
  const gateWheel = new Mesh(new TorusGeometry(.62, .06, 6, 16), rust);
  gateWheel.position.set(centre.east - .35, floor + .78, -centre.north);
  gateWheel.rotation.y = Math.PI / 2;
  gateWheel.name = 'fault-rust-gate-wheel';
  group.add(gateWheel);
  disposers.push(() => gateWheel.geometry.dispose());
  box('fault-rust-patch', rust, [.2, .3, .7], centre.east - 1.2, floor + 1.05, centre.north + .2);
  box('fault-rust-streak', rust, [.1, .8, .3], centre.east - .35, floor, centre.north + .45);

  // Derailed pulley: wheel tilted off the track beam, rope slack on the floor.
  box('machine-track-beam', timber, [3.4, .18, .24], centre.east + .6, floor + 2.2, centre.north - 1.6);
  const pulley = new Mesh(new CylinderGeometry(.42, .42, .14, 14), iron);
  pulley.position.set(centre.east + .75, floor + 1.55, -(centre.north - 1.15));
  pulley.rotation.set(.5, 0, .35);
  pulley.name = 'fault-derailed-pulley';
  group.add(pulley);
  disposers.push(() => pulley.geometry.dispose());
  box('fault-slack-rope', timber, [1.6, .05, .09], centre.east + .9, floor + .02, centre.north - .8)
    .rotation.y = .4;

  // Counterweight stack: three blocks hung, one fallen on the floor.
  for (let i = 0; i < 3; i++) {
    box('fault-counterweight-block', stone, [.7, .4, .7],
      centre.east + 1.3, floor + .5 + i * .42, centre.north + 1.9);
  }
  box('machine-weight-frame', iron, [.08, 2.4, .08], centre.east + 1.3, floor, centre.north + 1.9);
  const fallen = new Mesh(new BoxGeometry(.7, .4, .7), stone);
  fallen.name = 'fault-counterweight-fallen';
  fallen.position.set(centre.east + .45, floor + .2, -(centre.north + 2.5));
  fallen.rotation.z = .18;
  group.add(fallen);
  disposers.push(() => fallen.geometry.dispose());

  flushStaticBatches();
  const faultPoints: CableFaultPoint[] = [
    { id: 'rust-gate', east: centre.east - .35, north: centre.north, height: floor + .78 },
    { id: 'derail', east: centre.east + .75, north: centre.north - 1.15, height: floor + 1.55 },
    { id: 'counterweight', east: centre.east + 1.3, north: centre.north + 1.9, height: floor + .9 },
  ];
  let disposed = false;
  return {
    group, faultPoints,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (feet + bodyHeight <= floor || feet >= floor + 2.9) return false;
      const within = (e: number, n: number, r: number) => Math.hypot(east - e, north - n) < r + radius;
      return within(centre.east - 1.2, centre.north, .8) || within(centre.east + 1.3, centre.north + 1.9, .6);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}
