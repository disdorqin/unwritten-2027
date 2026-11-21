import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, Fog, Group, Line, LineBasicMaterial,
  Mesh, MeshLambertMaterial, Scene, Vector3,
} from 'three';
import { isMountainPresenceFoot } from '../../../src/shared/za22-mountain-domain';
import {
  mountMainSummitAssembly, summitAssemblyAnchor, supportsCloudTerrace,
} from './main-summit-assembly';
import { createNorthRidgeCableClock } from './north-ridge-cable-clock';
import { createNorthRidge350Block, northRidgeCableAnchors, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { mountZa22MountainGate, za22GateSeamNorth } from './town-za22-mountain-gate';
import { mountStarportAssemblySite } from './starport-assembly-site';

type Point = Readonly<{ east: number; north: number; height: number }>;
type Terminal = 'base' | 'summit';
type Action = { label: string; run(): void };
type Host = {
  now(): number;
  enterOrExit(terminal: Terminal, at: Point): void;
  view(title: string, message: string): void;
  cloudStamp?: { available(): boolean; request(): void };
};

export const za22StationApproach = { east: 536.8, north: 317.15, height: 26.14 };
export const za22CloudRunway = { start: 310.5, end: 351.5, north: 662, width: 4.4 };
const cloudApron = { west: 286.5, east: 352, south: 654, north: 664.65 };
const terminalDwell = 8_000;
const roofClearance = 3.5;
const cloudTerminal: Point = { east: 336, north: 640, height: 347 };
const assemblyBench = { east: 324, north: 657, width: 3.9, depth: 1.8, top: .87 };
const benchVisitor = { east: 324, north: 655, height: 347 };
const fullEpoch = Date.UTC(2026, 0, 1);
const distance = (a: Point, b: Point) => Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height);
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
const near = (a: Point, b: Point, metres: number) =>
  Math.abs(a.height - b.height) <= .55 && Math.hypot(a.east - b.east, a.north - b.north) <= metres;

export function createZa22NorthRidgeLine(baseHeight: number) {
  const [[baseEast, baseNorth], [midEast, midNorth]] = northRidgeCableAnchors;
  const station = [
    { east: baseEast, north: baseNorth, height: baseHeight },
    { east: midEast, north: midNorth, height: 140 },
    cloudTerminal,
  ] as const;
  const points: Point[] = [station[0]];
  const measure: number[] = [0];
  let length = 0;
  let lowerMetres = 0;
  for (let part = 0; part < station.length - 1; part++) {
    const a = station[part]!, b = station[part + 1]!;
    const steps = Math.ceil(distance(a, b) / 2);
    for (let step = 1; step <= steps; step++) {
      const f = step / steps;
      const east = mix(a.east, b.east, f), north = mix(a.north, b.north, f);
      const linear = mix(a.height, b.height, f);
      const point = f === 1 ? b : { east, north, height: Math.max(linear,
        sampleNorthRidge350(east, north) + roofClearance * Math.sin(Math.PI * f)) };
      length += distance(points.at(-1)!, point);
      points.push(point);
      measure.push(length);
    }
    if (!part) lowerMetres = length;
  }
  const clock = createNorthRidgeCableClock(lowerMetres, length - lowerMetres, 0);
  const legMs = terminalDwell + clock.oneWayMs;
  const cycleMs = 2 * legMs;

  function pointAt(along: number) {
    const index = measure.findIndex(mark => mark >= along);
    if (index <= 0) return index === 0 ? points[0]! : points.at(-1)!;
    const a = points[index - 1]!, b = points[index]!;
    const f = (along - measure[index - 1]!) / (measure[index]! - measure[index - 1]!);
    return { east: mix(a.east, b.east, f), north: mix(a.north, b.north, f), height: mix(a.height, b.height, f) };
  }

  function timeline(now: number, index: 0 | 1) {
    const phase = ((now - fullEpoch + index * legMs) % cycleMs + cycleMs) % cycleMs;
    const descending = phase >= legMs;
    const legPhase = descending ? phase - legMs : phase;
    const transit = descending ? clock.oneWayMs : 0;
    const state = clock.cabinsAt(transit + Math.max(0, legPhase - terminalDwell))[0];
    const at = pointAt(state.distanceMetres);
    // The opposing cars occupy parallel rope lanes, converging only at separate end stations.
    const side = index === 0 ? -1.55 : 1.55;
    return {
      at: { ...at, east: at.east + side }, direction: descending ? 'down' as const : 'up' as const,
      station: legPhase < terminalDwell ? descending ? 'summit' as const : 'base' as const : state.station,
      boarding: legPhase < terminalDwell ? descending ? 'summit' as const : 'base' as const : undefined,
      arrivalAt: now + legMs - legPhase,
    };
  }
  return { points, pointAt, timeline, length, lowerMetres, legMs, cycleMs };
}

export function za22CloudSurfaceAt(east: number, north: number, radius = .27) {
  const localEast = east - summitAssemblyAnchor.east;
  const localNorth = north - summitAssemblyAnchor.north;
  const landing = Math.abs(east - cloudTerminal.east) <= 4 - radius &&
    Math.abs(north - cloudTerminal.north) <= 4 - radius;
  // Player-accessible snow already exists on the ridge mesh; include the two
  // surveyed spurs without granting a floor across the steep central monument.
  const southSpur = east >= 316 + radius && east <= 320 - radius &&
    north >= 632 + radius && north <= 656 - radius;
  const southLaunch = east >= 316 + radius && east <= 322 - radius &&
    north >= 632 + radius && north <= 636 - radius;
  const eastApproach = east >= 330 + radius && east <= 352 - radius &&
    north >= 652.5 + radius && north <= 655 - radius;
  const eastLookout = east >= 348 + radius && east <= 352 - radius &&
    north >= 649 + radius && north <= 655 - radius;
  const apron = east >= cloudApron.west + radius && east <= cloudApron.east - radius &&
    north >= cloudApron.south + radius && north <= cloudApron.north - radius;
  if (north < za22GateSeamNorth && (landing || southSpur || southLaunch || eastApproach || eastLookout || apron || supportsCloudTerrace(localEast, localNorth, radius))) {
    return sampleNorthRidge350(east, north);
  }
}

export function createZa22CloudRoute(host: Host) {
  const line = createZa22NorthRidgeLine(26);
  const scene = new Scene();
  scene.background = new Color('#aebfd2');
  scene.fog = new Fog('#aebfd2', 170, 1400);
  scene.add(new AmbientLight('#d6e3f2', 1.25));
  const sunlight = new DirectionalLight('#fff4df', 1.7);
  sunlight.position.set(-80, 120, 50);
  scene.add(sunlight);
  let world: ReturnType<typeof mountMountain> | undefined;
  let mode: 'town' | 'riding' | 'summit' = 'town';
  let pending: Terminal | undefined;
  let ride: { index: 0 | 1; arrivalAt: number; to: Terminal } | undefined;

  function mountMountain() {
    const owner = new Group();
    scene.add(owner);
    const front = new Group();
    front.name = 'za22-front-ridge-detail';
    owner.add(front);
    const terrain = createNorthRidge350Block(sampleNorthRidge350, 4);
    front.add(terrain.mesh);
    const assembly = mountMainSummitAssembly(owner, fullEpoch);
    const gate = mountZa22MountainGate(assembly, { open: host.view });
    const iron = new MeshLambertMaterial({ color: '#4c606b' });
    const brass = new MeshLambertMaterial({ color: '#b59669' });
    const wood = new MeshLambertMaterial({ color: '#59483e' });
    const boxGeometry = new BoxGeometry();
    function box(group: Group, material: MeshLambertMaterial, east: number, north: number, height: number,
      width: number, depth: number, tall: number) {
      const mesh = new Mesh(boxGeometry, material);
      mesh.position.set(east, height, -north);
      mesh.scale.set(width, tall, depth);
      group.add(mesh);
      return mesh;
    }
    for (const index of [0, 1] as const) {
      const shift = index === 0 ? -1.55 : 1.55;
      const geometry = new BufferGeometry().setFromPoints(line.points.map(p => new Vector3(p.east + shift, p.height + 2.7, -p.north)));
      front.add(new Line(geometry, new LineBasicMaterial({ color: '#445560' })));
    }
    const cabins = [0, 1].map(() => {
      const cabin = new Group();
      // The viewing bay is open between corner posts rather than covered by opaque panes.
      for (const x of [-1, 1]) for (const n of [-1.35, 1.35]) box(cabin, iron, x, n, 1.12, .10, .10, 2.24);
      box(cabin, wood, 0, 0, -.08, 2.2, 2.9, .16);
      box(cabin, iron, 0, 0, 2.22, 2.2, 2.9, .16);
      box(cabin, brass, 0, 0, 2.5, .13, .13, .42);
      for (const side of [-1, 1]) box(cabin, wood, side, 0, .29, .10, 2.9, .58);
      front.add(cabin);
      return cabin;
    });
    for (const east of [cloudTerminal.east - 4, cloudTerminal.east + 4]) {
      box(front, iron, east, 639, cloudTerminal.height + 1.65, .18, .20, 3.3);
    }
    box(front, wood, cloudTerminal.east, 639, cloudTerminal.height + 3.31, 8.45, 1.6, .16);
    const run = za22CloudRunway;
    for (let x = run.start + 2; x < run.end - 1; x += 4) {
      box(front, brass, x, run.north, za22CloudSurfaceAt(x, run.north) ?? 347, 1.6, .16, .045);
    }
    const arrowEast = run.start + 4;
    for (const side of [-1, 1]) {
      const north = run.north + side * .4;
      box(front, brass, arrowEast, north, za22CloudSurfaceAt(arrowEast, north) ?? 347, 1.2, .16, .045)
        .rotateY(-side * Math.PI / 4);
    }
    for (const x of [run.start, run.end]) {
      box(front, brass, x, run.north, za22CloudSurfaceAt(x, run.north) ?? 347, .20, run.width, .045);
    }
    const starport = mountStarportAssemblySite(front, { east: assemblyBench.east, north: assemblyBench.north, height: 347 });
    for (let north = 641; north <= 663; north += 2) {
      box(front, iron, 336, north, sampleNorthRidge350(336, north), .64, .36, .043);
    }
    for (let east = 302; east < 336; east += 2) {
      box(front, iron, east, 663.25, sampleNorthRidge350(east, 663.25), .36, .64, .043);
    }
    return { owner, terrain, assembly, gate, cabins, front, starport, boxGeometry, materials: [iron, brass, wood] };
  }

  function disposeMountain() {
    if (!world) return;
    world.gate.dispose();
    world.assembly.dispose();
    world.starport.dispose();
    world.terrain.dispose();
    world.boxGeometry.dispose();
    world.materials.forEach(material => material.dispose());
    for (const child of world.front.children) if (child instanceof Line) {
      child.geometry.dispose();
      child.material.dispose();
    }
    world.owner.removeFromParent();
    world = undefined;
  }

  function action(position: Point): Action | undefined {
    if (mode === 'riding') return;
    if (mode === 'town') {
      if (!near(position, za22StationApproach, 1.55)) return;
      return pending
        ? { label: '等候前山缆车 · 取消候车', run() { pending = undefined; } }
        : { label: '乘缆车一线前往云海台', run() { pending = 'base'; } };
    }
    if (near(position, cloudTerminal, 1.8)) return pending
      ? { label: '等候返程缆车 · 取消候车', run() { pending = undefined; } }
      : { label: '乘缆车一线返回山脚站', run() { pending = 'summit'; } };
    if (near(position, benchVisitor, 1.45)) return {
      label: '查看星港坪装配和起飞线',
      run() { host.view('星港坪', '雪翼、助推器、导航芯在这里装配。沿铜标向东滑跑出坪。'); },
    };
    const cloudStamp = host.cloudStamp;
    if (cloudStamp?.available() && world?.assembly.atCloudStamp(position)) return {
      label: '在前山碑盖章',
      run() { if (mode === 'summit' && cloudStamp.available()) cloudStamp.request(); },
    };
    return world?.gate.action(position);
  }

  function updateView(position: Point) {
    const inside = mode === 'summit' && position.north >= za22GateSeamNorth;
    if (world) {
      world.front.visible = !inside;
      world.assembly.setFrontDetail(!inside);
      world.gate.update(position);
    }
    return inside ? '山门' : '云海台';
  }

  function update(position: Point, canBoard = true) {
    const now = host.now();
    if (pending && (!canBoard || !near(position, pending === 'base' ? za22StationApproach : cloudTerminal, 1.8))) pending = undefined;
    if (pending && !ride) {
      const from = pending;
      const index = ([0, 1] as const).find(candidate => line.timeline(now, candidate).boarding === from);
      if (index !== undefined) {
        world ??= mountMountain();
        pending = undefined;
        const trip = line.timeline(now, index);
        ride = { index, arrivalAt: trip.arrivalAt, to: from === 'base' ? 'summit' : 'base' };
        mode = 'riding';
      }
    }
    if (ride && now >= ride.arrivalAt) {
      const to = ride.to;
      ride = undefined;
      mode = to === 'summit' ? 'summit' : 'town';
      host.enterOrExit(to, to === 'summit' ? cloudTerminal : za22StationApproach);
      if (to === 'base') disposeMountain();
    }
    world?.assembly.update(now);
    world?.cabins.forEach((cabin, index) => {
      const at = line.timeline(now, index === 0 ? 0 : 1).at;
      cabin.position.set(at.east, at.height, -at.north);
    });
  }

  function surfaceAt(east: number, north: number, radius: number) {
    return za22CloudSurfaceAt(east, north, radius) ?? world?.gate.surfaceAt(east, north, radius);
  }

  function walkingSurfaceAt(east: number, north: number, radius: number) {
    const existing = surfaceAt(east, north, radius);
    if (existing !== undefined || mode !== 'summit' || !world) return existing;
    const height = world.assembly.trailSurfaceAt(
      east - summitAssemblyAnchor.east, north - summitAssemblyAnchor.north, radius,
    );
    return height !== undefined && isMountainPresenceFoot(east, north, height) ? height : undefined;
  }

  return {
    scene, action, update, updateView,
    active: () => mode !== 'town',
    riding: () => ride !== undefined,
    ridePoint: () => ride && line.timeline(host.now(), ride.index).at,
    surfaceAt, walkingSurfaceAt,
    acceptsStep(fromEast: number, fromNorth: number, toEast: number, toNorth: number, radius: number) {
      return world?.gate.acceptsStep(fromEast, fromNorth, toEast, toNorth, radius) ?? true;
    },
    assembly: () => world?.assembly,
    front: () => world?.front,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (world?.starport.blocked({ east, north, height: feet }, radius, bodyHeight)) return true;
      return world?.assembly.blocked(east - summitAssemblyAnchor.east, north - summitAssemblyAnchor.north, feet, radius, bodyHeight) ?? false;
    },
  };
}
