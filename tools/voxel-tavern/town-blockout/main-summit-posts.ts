import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';

type PlanPoint = { east: number; north: number };
type Point = PlanPoint & { height: number };
type Walk = readonly Point[];
type Station = {
  entrance: Point;
  hall: Point;
  routes: readonly { mark: string; approach: Point; path: Walk }[];
};
type PostSources = {
  approach: { gateRoute: readonly PlanPoint[]; stampRoute: readonly PlanPoint[] };
  gate: { to: Point; guardroom: Walk; stationWalk: Walk };
  stations: { 'cloud-deck': Station; summit: Station };
  upperPavilion: { model: Group; approach: PlanPoint };
  summit: { entry: Point; registry: Point; routes: { fromTrail: Walk; fromCable: Walk } };
};
type Solid = { centre: Point; width: number; depth: number; rise: number; yaw: number };
type Part = { centre: Point; width: number; depth: number; rise: number };

function offset(p: Point, east: number, north: number, height = 0): Point {
  return { east: p.east + east, north: p.north + north, height: p.height + height };
}

function localToSummit(frame: Group, p: Point): Point {
  const yaw = frame.rotation.y;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    east: frame.position.x + p.east * c - p.north * s,
    north: -frame.position.z + p.east * s + p.north * c,
    height: frame.position.y + p.height,
  };
}

function part(east: number, north: number, height: number, width: number, depth: number, rise: number): Part {
  return { centre: { east, north, height }, width, depth, rise };
}

/** C-10 placements, all expressed in the existing P-1 local E/N/Y frame. */
export function mountMainSummitPosts(owner: Group, sources: PostSources) {
  const { approach, gate, stations, upperPavilion, summit } = sources;
  const ground = gate.to.height;
  const cloudStation = stations['cloud-deck'];
  const lastGateStop = gate.guardroom.at(-1)!;
  const dispatcherOrigin = cloudStation.hall;
  const pavilionModel = upperPavilion.model;
  const pavilionPoint = (east: number, north: number, height = 0) =>
    localToSummit(pavilionModel, { east, north, height });

  const gateVisitor = offset(lastGateStop, 1.65, -1.05);
  const gateStand = offset(gateVisitor, 2.27, 0);
  const dispatchVisitor = offset(dispatcherOrigin, 1.25, 3);
  const dispatchStand = offset(dispatcherOrigin, 2.72, 3);
  const pavilionVisitor = pavilionPoint(-1.86, 1.50);
  const pavilionStand = pavilionPoint(-3.82, 1.50);

  const posts = [
    { id: 'gatekeeper', title: '门房', site: 'P-7 山门门房', stand: gateStand, visitor: gateVisitor },
    { id: 'dispatcher', title: '调度员', site: 'P-7 云海台站', stand: dispatchStand, visitor: dispatchVisitor },
    { id: 'pavilion-keeper', title: '守亭人', site: 'P-9 大观云亭', stand: pavilionStand, visitor: pavilionVisitor },
  ] as const;

  const terraceWalk = (points: readonly PlanPoint[]): Walk => points.map(p => ({ ...p, height: ground }));
  const terminal = terraceWalk(approach.gateRoute);
  const stampSpur = terraceWalk(approach.stampRoute);
  const cloudHall = [...gate.stationWalk, cloudStation.hall];
  const cableConnector = [
    stations.summit.entrance,
    { ...stations.summit.entrance, north: summit.routes.fromCable[2]!.north },
    ...summit.routes.fromCable.slice(2),
  ];
  const pavilionBridge = { ...upperPavilion.approach, height: pavilionModel.position.y };
  const routes = {
    gatekeeper: [...terminal, ...gate.guardroom.slice(1), gateVisitor],
    dispatcher: [...terminal, ...cloudHall.slice(1), offset(dispatcherOrigin, 0, 3), dispatchVisitor],
    pavilionKeeper: [pavilionPoint(0, 5.95), pavilionBridge, pavilionPoint(0, 1.50), pavilionVisitor],
    frontStamp: [...terminal.slice(0, -1), ...stampSpur.slice(1)],
    cloudBoarding: cloudStation.routes.map(lane => ({
      mark: lane.mark, path: [...gate.stationWalk, ...lane.path.slice(1)],
    })),
    summitFromCable: stations.summit.routes.map(lane => ({
      mark: lane.mark, path: [...[...lane.path].reverse(), ...cableConnector.slice(1)],
    })),
    summitFromTrail: summit.routes.fromTrail,
  };
  const staffRoutes = {
    gatekeeper: [gateVisitor, offset(lastGateStop, 1.3, 1.14), offset(gateStand, 0, 2.19), gateStand],
    dispatcher: [dispatchVisitor, offset(dispatchVisitor, 0, 1.16), offset(dispatchStand, 0, 1.16), dispatchStand],
    pavilionKeeper: [pavilionVisitor, pavilionPoint(-1.86, 2.51), pavilionPoint(-3.82, 2.51), pavilionStand],
  };

  const group = new Group();
  group.name = 'main-summit-three-posts';
  const geometry = new BoxGeometry();
  const oak = new MeshLambertMaterial({ color: '#9b7251' });
  const timber = new MeshLambertMaterial({ color: '#614a3a' });
  const bronze = new MeshLambertMaterial({ color: '#bb9861' });
  const slate = new MeshLambertMaterial({ color: '#4b606d' });
  const solids: Solid[] = [];

  function marker(frame: Group, p: Point) {
    // Only the flush inlay identifies the standing position. No NPC or interaction is created.
    add(frame, part(p.east, p.north, p.height + .007, .42, .42, .014), bronze);
  }

  function add(frame: Group, item: Part, finish: MeshLambertMaterial, solid = false, name?: string) {
    const { centre, width, depth, rise } = item;
    const mesh = new Mesh(geometry, finish);
    if (name) mesh.name = name;
    mesh.position.set(centre.east, centre.height, -centre.north);
    mesh.scale.set(width, rise, depth);
    frame.add(mesh);
    if (solid) solids.push({ ...item, centre: localToSummit(frame, centre), yaw: frame.rotation.y });
  }

  function stationFrame(post: (typeof posts)[number]) {
    const frame = new Group();
    frame.name = post.id;
    group.add(frame);
    return frame;
  }

  const gateFrame = stationFrame(posts[0]);
  gateFrame.position.set(lastGateStop.east, ground, -lastGateStop.north);
  // Keep the P-7 registration counter. Add a ledger and a small work-side shelf along the wall.
  add(gateFrame, part(2.91, -1.06, 1.03, .32, .41, .06), slate, true, 'gate-ledger');
  add(gateFrame, part(4.37, -.82, 1.14, .12, .88, .10), oak, true, 'gate-wall-shelf');
  marker(gateFrame, { east: 3.92, north: -1.05, height: 0 });

  const dispatchFrame = stationFrame(posts[1]);
  dispatchFrame.position.set(dispatcherOrigin.east, dispatcherOrigin.height, -dispatcherOrigin.north);
  add(dispatchFrame, part(2, 3, .44, .50, 1.15, .88), timber, true, 'dispatch-counter-base');
  add(dispatchFrame, part(2, 3, .93, .62, 1.36, .10), oak, true, 'dispatch-counter-top');
  add(dispatchFrame, part(1.98, 3, 1.015, .33, .43, .07), slate, true, 'dispatch-ledger');
  marker(dispatchFrame, { east: 2.72, north: 3, height: 0 });

  const keeperFrame = stationFrame(posts[2]);
  keeperFrame.position.copy(pavilionModel.position);
  keeperFrame.rotation.y = pavilionModel.rotation.y;
  add(keeperFrame, part(-2.86, 1.50, .41, .46, 1.02, .82), timber, true, 'pavilion-service-counter');
  add(keeperFrame, part(-2.86, 1.50, .87, .56, 1.19, .10), oak, true, 'pavilion-service-top');
  add(keeperFrame, part(-2.86, 1.50, .955, .32, .32, .07), slate, true, 'pavilion-route-board');
  marker(keeperFrame, { east: -3.82, north: 1.50, height: 0 });

  // The P-4 summit registry is an unstaffed route endpoint under C-10. The inlay sits on its original approach.
  const connectors = new Group();
  connectors.name = 'main-summit-reception-connectors';
  const { east, north, height } = summit.entry;
  add(connectors, part(east, north, height + .006, 1.64, .30, .012), slate, false, 'summit-cabin-entry-inlay');
  for (const e of [east - .63, east + .63]) {
    add(connectors, part(e, north, height + .013, .055, .27, .006), bronze);
  }
  group.add(connectors);
  owner.add(group);
  let disposed = false;
  function clearance(p: Point, radius: number, standingHeight: number) {
    if (disposed) return Infinity;
    let nearest = Infinity;
    for (const item of solids) {
      const { centre, width, depth, rise, yaw } = item;
      if (p.height >= centre.height + rise / 2 || p.height + standingHeight <= centre.height - rise / 2) continue;
      const east = p.east - centre.east, north = p.north - centre.north;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const dx = Math.max(Math.abs(east * c + north * s) - width / 2, 0);
      const dn = Math.max(Math.abs(-east * s + north * c) - depth / 2, 0);
      nearest = Math.min(nearest, Math.hypot(dx, dn) - radius);
    }
    return nearest;
  }

  return {
    group, connectors, posts, routes, staffRoutes, summitRegistry: summit.registry, clearance,
    blocked(east: number, north: number, height: number, radius: number, standingHeight: number) {
      return clearance({ east, north, height }, radius, standingHeight) < 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      for (const material of [oak, timber, bronze, slate]) material.dispose();
    },
  };
}
