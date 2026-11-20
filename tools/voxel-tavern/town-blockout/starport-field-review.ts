import { Group, Mesh, MeshBasicMaterial, TorusGeometry, type Object3D } from 'three';
import { createCloudDeckCircuit, registerFlightEmergencySites, type FlightEmergencySite } from '../../../src/shared/flight-field';
import { createStarportReviewWorld, starportFlightSite, townFlightRunwayCandidates } from './starport-flight-site';

type BoundWorld = ReturnType<typeof createStarportReviewWorld>;

/** Mark the public F-4 review positions without supplying a production world transform. */
export function mountStarportFieldReview(owner: Object3D, { world, terrain }: BoundWorld, heading: number) {
  const group = new Group();
  group.name = 'flight-field-review';
  owner.add(group);
  const [square, ice] = townFlightRunwayCandidates;
  const deck = starportFlightSite.recovery;
  const dispenser = { ...deck };
  const sites = registerFlightEmergencySites([
    { id: 'cloud-deck', area: 'skyline-review', pad: deck, exit: [{ ...deck, north: deck.north - 3 }] },
    { id: 'square', area: 'skyline-review', pad: square.start, exit: [square.end] },
    { id: 'mirror-lake', area: 'skyline-review', pad: ice.start, exit: [ice.end] },
  ] satisfies readonly FlightEmergencySite[], {
    surfaceAt(_area, point) {
      const surface = world.surfaceAt(point.east, point.north, heading);
      if (!surface || Math.abs(surface.height - point.height) > .43 || surface.slopeDegrees >= 25) return;
      if (point.north >= 540 && surface.kind === 'snow') return 'terrace';
      if (surface.kind === 'ice') return 'ice';
      const grid = Math.round(point.north) * terrain.gridWidth + Math.round(point.east);
      if (terrain.surfaces[grid] === 2 && surface.kind !== 'water') return 'pavement';
    },
    canWalk(_area, from, to) {
      if (world.sweep(from, to, .27)) return false;
      const count = Math.max(1, Math.ceil(Math.hypot(to.east - from.east, to.north - from.north) / .5));
      for (let index = 0; index <= count; index++) {
        const t = index / count;
        const floor = world.surfaceAt(from.east + (to.east - from.east) * t,
          from.north + (to.north - from.north) * t, heading);
        if (!floor || floor.kind === 'water' || Math.abs(floor.height - (from.height + (to.height - from.height) * t)) > .43) {
          return false;
        }
      }
      return true;
    },
  });
  const { start, end } = starportFlightSite.runway;
  const route = createCloudDeckCircuit({ east: (start.east + end.east) / 2, north: (start.north + end.north) / 2,
    height: start.height }, heading);
  const padShape = new TorusGeometry(1.15, .06, 6, 20);
  const gateShape = new TorusGeometry(15, .16, 6, 32);
  const safety = new MeshBasicMaterial({ color: '#5eacaf' });
  const fuel = new MeshBasicMaterial({ color: '#d8b664' });
  const next = new MeshBasicMaterial({ color: '#f7d193' });
  const finish = new MeshBasicMaterial({ color: '#7baeaa' });
  const pads = [...sites.sites().map(site => ({ point: site.pad, material: safety })),
    { point: dispenser, material: fuel }];
  for (const { point, material } of pads) {
    const mesh = new Mesh(padShape, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(point.east, point.height + (material === fuel ? .20 : .075), -point.north);
    group.add(mesh);
  }
  const gates = route.gates.map(gate => {
    const mesh = new Mesh(gateShape, next);
    mesh.position.set(gate.at.east, gate.at.height, -gate.at.north);
    mesh.rotation.y = Math.atan2(gate.forwardEast, -gate.forwardNorth);
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  });

  return {
    route, sites, dispenser,
    syncMarkers() {
      const { stage, nextGate } = route.snapshot();
      for (const [index, mesh] of gates.entries()) {
        mesh.visible = (stage === 'ready' || stage === 'airborne') && index === nextGate;
        mesh.material = index === gates.length - 1 ? finish : next;
      }
    },
    dispose() {
      group.removeFromParent();
      for (const item of [padShape, gateShape, safety, fuel, next, finish]) item.dispose();
    },
  };
}
