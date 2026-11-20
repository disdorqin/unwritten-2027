import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, Mesh,
  MeshLambertMaterial, Vector3 } from 'three';
import { summitCableSpec, type createMainSummitCable, type SummitCablePoint } from './main-summit-cable';

type Cable = ReturnType<typeof createMainSummitCable>;
const asVector = ({ east, north, height }: SummitCablePoint) => new Vector3(east, height, -north);

/** Geometry for the separately mounted main-summit domain. */
export function mountMainSummitCable(owner: Group, cable: Cable, groundAt: (east: number, north: number) => number | undefined) {
  const group = new Group();
  group.name = 'main-summit-cable';
  const geometry = new Set<BufferGeometry>();
  const red = new MeshLambertMaterial({ color: '#a22328' });
  const window = new MeshLambertMaterial({ color: '#bed9e6', opacity: 0.64, transparent: true });
  const frame = new MeshLambertMaterial({ color: '#343a47' });
  const gold = new MeshLambertMaterial({ color: '#e7be75' });
  const platform = new MeshLambertMaterial({ color: '#7b7771' });
  const cableMaterial = new LineBasicMaterial({ color: '#454b55' });

  function box(parent: Group, material: MeshLambertMaterial, size: [number, number, number], at: [number, number, number]) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    geometry.add(mesh.geometry);
    mesh.position.set(...at);
    parent.add(mesh);
  }

  const cars = cable.ropes.map((rope, index) => {
    const line = new BufferGeometry().setFromPoints(rope.points.map(asVector));
    geometry.add(line);
    group.add(new Line(line, cableMaterial));
    for (const station of ['cloud-deck', 'summit'] as const) {
      const { board, approach } = rope.dock(station);
      const deck = new Group();
      deck.position.copy(asVector(board).lerp(asVector(approach), 0.5));
      deck.rotation.y = -rope.sample(station === 'cloud-deck' ? 0 : rope.totalMetres).heading;
      box(deck, platform, [4.8, 0.14, 5], [0, -0.10, 0]);
      box(deck, gold, [0.075, 0.04, 4.5], [index === 0 ? -0.55 : 0.55, -0.015, 0]);
      group.add(deck);
    }

    const car = new Group();
    const width = summitCableSpec.cabinHalfWidth * 2;
    const depth = summitCableSpec.cabinHalfLength * 2;
    const floor = -summitCableSpec.cabinFloorBelowRope;
    box(car, red, [width, 0.16, depth], [0, floor + 0.08, 0]);
    box(car, red, [width, 0.16, depth], [0, -0.48, 0]);
    box(car, frame, [0.26, 0.44, 0.26], [0, -0.2, 0]);
    const boardingSide = index === 0 ? 1 : -1;
    const door = new Group();
    for (const x of [-1, 1]) {
      const sideX = x * (width / 2 - 0.035);
      if (x === boardingSide) {
        for (const z of [-0.98, 0.98]) box(car, window, [0.035, 1.75, 0.90], [sideX, -1.22, z]);
        box(door, window, [0.04, 1.75, 1.06], [sideX, -1.22, 0]);
        car.add(door);
      } else {
        box(car, window, [0.035, 1.75, depth - 0.1], [sideX, -1.22, 0]);
      }
      box(car, gold, [0.04, 0.08, depth], [x * width / 2, floor + 0.39, 0]);
      for (const z of [-1, 1]) box(car, frame, [0.11, 1.40, 0.11], [x * (width / 2 - 0.08), -1.21, z * (depth / 2 - 0.08)]);
    }
    for (const z of [-1, 1]) box(car, window, [width - 0.1, 1.36, 0.035], [0, -1.21, z * (depth / 2 - 0.035)]);
    group.add(car);
    return { car, door };
  });

  const [first, second] = cable.ropes;
  for (let index = 1; index < first.points.length - 1; index++) {
    const point = asVector(first.points[index]!).lerp(asVector(second.points[index]!), 0.5);
    const ground = groundAt(point.x, -point.z);
    if (ground === undefined) continue;
    const height = point.y + 0.25 - ground;
    if (height <= 0) continue;
    const pole = new Mesh(new CylinderGeometry(0.16, 0.36, height, 6), frame);
    geometry.add(pole.geometry);
    pole.position.copy(point);
    pole.position.y = ground + height / 2;
    group.add(pole);
    const crossbar = new Group();
    crossbar.position.copy(point);
    crossbar.rotation.y = -Math.atan2(first.points[index]!.north - second.points[index]!.north,
      second.points[index]!.east - first.points[index]!.east);
    box(crossbar, frame, [7.5, 0.22, 0.25], [0, 0.25, 0]);
    group.add(crossbar);
  }
  owner.add(group);

  return {
    update(nowMs: number) {
      const states = cable.cabinsAt(nowMs);
      for (const state of states) {
        const { car, door } = cars[state.index]!;
        car.position.copy(asVector(state.ropePoint));
        car.rotation.y = -state.ropePoint.heading;
        door.position.z = state.canBoardOrExit ? 1.05 : 0;
      }
      return states;
    },
    dispose() {
      group.removeFromParent();
      group.clear();
      for (const item of geometry) item.dispose();
      for (const material of [red, window, frame, gold, platform, cableMaterial]) material.dispose();
    },
  };
}
