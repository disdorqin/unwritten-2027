import {
  BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Shape, ShapeGeometry, TorusGeometry,
  type Material,
} from 'three';

type Point = Readonly<{ x: number; n: number; ground: number }>;
type Footprint = Readonly<{ minX: number; maxX: number; minN: number; maxN: number }>;
type Solid = Footprint & Readonly<{ kind: 'wall' | 'window' | 'bench' | 'star-chart-table'; bottom: number; top: number }>;

// Local build dimensions. S-1's existing passage is 3.4 m wide. The S-6
// port is expressed in the same X-east/N-north frame, without a world anchor.
export const orbitalObservationCabinSpec = {
  width: 10.8, depth: 6.8, height: 3.15,
  portWidth: 3.4, portHeight: 2.5, portDepth: 1.4, wallThickness: 0.18,
  windowSill: 0.72, windowHead: 2.69, windowSouth: 0.38, windowNorth: 6.42,
} as const;

export const orbitalObservationCycleSeconds = 24;

export function createOrbitalObservationCabin() {
  const spec = orbitalObservationCabinSpec;
  const halfWidth = spec.width / 2;
  const portHalf = spec.portWidth / 2;
  const room = { minX: -halfWidth, maxX: halfWidth, minN: 0, maxN: spec.depth };
  const entrance = { minX: -portHalf, maxX: portHalf, minN: -spec.portDepth, maxN: 0 };
  const group = new Group();
  group.name = 'orbital-observation-cabin';

  const iron = new MeshStandardMaterial({ color: '#465762', roughness: .86, metalness: .17 });
  const seam = new MeshStandardMaterial({ color: '#293841', roughness: .83 });
  const deck = new MeshStandardMaterial({ color: '#52636b', roughness: .96 });
  const frame = new MeshStandardMaterial({ color: '#84918c', roughness: .83, metalness: .2 });
  const wood = new MeshStandardMaterial({ color: '#827360', roughness: .99 });
  const metal = new MeshStandardMaterial({ color: '#414949', roughness: .68, metalness: .28 });
  const cord = new MeshStandardMaterial({ color: '#92544e', roughness: 1 });
  const light = new MeshBasicMaterial({ color: '#d8cfb0' });
  const lens = new MeshBasicMaterial({ color: '#748382' });
  const glass = new MeshStandardMaterial({
    color: '#9badad', transparent: true, opacity: .08, roughness: .24, depthWrite: false,
  });
  const materials = new Set<Material>([iron, seam, deck, frame, wood, metal, cord, light, lens, glass]);
  const geometries = new Set<BufferGeometry>();
  const unit = new BoxGeometry();
  geometries.add(unit);
  const solids: Solid[] = [];

  function box(parent: Group, name: string, finish: Material, x: number, n: number, y: number,
    width: number, length: number, height: number, solid?: Solid['kind']) {
    const mesh = new Mesh(unit, finish);
    mesh.name = name;
    mesh.position.set(x, y, -n);
    mesh.scale.set(width, height, length);
    parent.add(mesh);
    if (solid) {
      solids.push({
        kind: solid, minX: x - width / 2, maxX: x + width / 2,
        minN: n - length / 2, maxN: n + length / 2, bottom: y - height / 2, top: y + height / 2,
      });
    }
    return mesh;
  }

  const wall = spec.wallThickness;
  const midN = spec.depth / 2;
  const halfWall = wall / 2;
  box(group, 'observation-deck', deck, 0, midN, -.08, spec.width, spec.depth, .16);
  box(group, 'observation-entry-deck', deck, 0, -spec.portDepth / 2, -.08, spec.portWidth, spec.portDepth, .16);
  box(group, 'observation-ceiling', iron, 0, midN, spec.height + .08, spec.width + wall * 2, spec.depth, .16);
  box(group, 'observation-west-wall', iron, -halfWidth - halfWall, midN, spec.height / 2, wall, spec.depth, spec.height, 'wall');
  box(group, 'observation-north-wall', iron, 0, spec.depth + halfWall, spec.height / 2,
    spec.width + wall * 2, wall, spec.height, 'wall');
  for (const side of [-1, 1]) {
    box(group, 'observation-entry-jamb', iron, side * (halfWidth + portHalf) / 2, -halfWall, spec.height / 2,
      halfWidth - portHalf, wall, spec.height, 'wall');
    box(group, 'observation-passage-wall', seam, side * (portHalf + halfWall), -spec.portDepth / 2, spec.portHeight / 2,
      wall, spec.portDepth, spec.portHeight, 'wall');
  }
  box(group, 'observation-entry-lintel', iron, 0, -halfWall, (spec.height + spec.portHeight) / 2,
    spec.portWidth, wall, spec.height - spec.portHeight, 'wall');
  box(group, 'observation-passage-ceiling', seam, 0, -spec.portDepth / 2, spec.portHeight + .07,
    spec.portWidth + wall * 2, spec.portDepth, .14);
  box(group, 'observation-muted-ceiling-lamp', light, -1.8, midN, spec.height - .065, .13, 4.0, .035);

  const windowLength = spec.windowNorth - spec.windowSouth;
  const windowHeight = spec.windowHead - spec.windowSill;
  const windowY = (spec.windowSill + spec.windowHead) / 2;
  const windowX = halfWidth + halfWall;
  box(group, 'observation-window-sill', iron, windowX, midN, spec.windowSill / 2,
    wall, spec.depth, spec.windowSill, 'wall');
  box(group, 'observation-window-bulkhead', iron, windowX, midN, (spec.height + spec.windowHead) / 2,
    wall, spec.depth, spec.height - spec.windowHead, 'wall');
  for (const [south, north] of [[0, spec.windowSouth], [spec.windowNorth, spec.depth]]) {
    box(group, 'observation-window-end-post', frame, windowX, (south + north) / 2, windowY,
      wall, north - south, windowHeight, 'wall');
  }
  for (const y of [spec.windowSill, spec.windowHead]) {
    box(group, 'observation-worn-window-edge', frame, halfWidth - .065, midN, y, .15, windowLength + .06, .13);
  }
  const pane = box(group, 'observation-single-side-window', glass, windowX, midN, windowY,
    wall, windowLength, windowHeight, 'window');
  pane.renderOrder = 2;

  const scratches: number[] = [];
  for (let i = 0; i < 31; i++) {
    const n = spec.windowSouth + .26 + (i * .847) % 5.48;
    const y = spec.windowSill + .14 + (i * .127) % 1.67;
    scratches.push(halfWidth - .007, y, -n, halfWidth - .007, y + .019 + i % 3 * .009, -n - .10);
  }
  const scratchGeometry = new BufferGeometry();
  scratchGeometry.setAttribute('position', new Float32BufferAttribute(scratches, 3));
  geometries.add(scratchGeometry);
  const scratchMaterial = new LineBasicMaterial({ color: '#c5cecd', transparent: true, opacity: .42 });
  materials.add(scratchMaterial);
  const scoredGlass = new LineSegments(scratchGeometry, scratchMaterial);
  scoredGlass.name = 'observation-old-glass-scratches';
  scoredGlass.renderOrder = 3;
  group.add(scoredGlass);

  const bench = box(group, 'observation-single-long-bench', wood, 4.49, midN, .425, .65, 4.55, .15, 'bench');
  for (const n of [1.48, 3.4, 5.32]) {
    box(group, 'observation-bench-foot', metal, 4.49, n, .175, .40, .21, .35, 'bench');
  }
  const binoculars = new Group();
  binoculars.name = 'observation-red-cord-binoculars';
  binoculars.position.set(4.49, .58, -5.24);
  group.add(binoculars);
  const barrelShape = new CylinderGeometry(.064, .083, .27, 12);
  const loopShape = new TorusGeometry(.075, .008, 6, 16);
  geometries.add(barrelShape);
  geometries.add(loopShape);
  for (const x of [-.078, .078]) {
    const barrel = new Mesh(barrelShape, metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.x = x;
    binoculars.add(barrel);
    box(binoculars, 'observation-binocular-lens', lens, x, .13, 0, .10, .014, .10);
  }
  for (const z of [-.023, -.006, .011]) {
    const loop = new Mesh(loopShape, cord);
    loop.name = 'observation-faded-red-cord';
    loop.position.set(.078, 0, z);
    binoculars.add(loop);
  }

  const chartEast = -3.55;
  const chartNorth = midN;
  box(group, 'observation-star-chart-table', wood, chartEast, chartNorth, .86,
    1.72, 1.16, .16, 'star-chart-table');
  for (const east of [-.65, .65]) {
    for (const north of [-.4, .4]) {
      box(group, 'observation-star-chart-support', metal, chartEast + east, chartNorth + north, .39,
        .14, .14, .78, 'star-chart-table');
    }
  }
  box(group, 'observation-star-chart-face', seam, chartEast, chartNorth, .956, 1.48, .93, .038);
  const chartStars = [[-.59, .22], [-.34, .06], [-.12, .15], [.13, -.12],
    [.43, -.28], [.56, -.07], [-.4, -.27], [.38, .29]] as const;
  const chartLines: number[] = [];
  for (const [from, to] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [3, 7], [1, 6]] as const) {
    for (const [east, north] of [chartStars[from], chartStars[to]]) {
      chartLines.push(chartEast + east, .979, -(chartNorth + north));
    }
  }
  const chartGeometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(chartLines, 3));
  geometries.add(chartGeometry);
  const chartInk = new LineBasicMaterial({ color: '#aab4a7' });
  materials.add(chartInk);
  const chart = new LineSegments(chartGeometry, chartInk);
  chart.name = 'observation-star-chart-lines';
  group.add(chart);
  for (const [east, north] of chartStars) {
    box(group, 'observation-star-chart-dot', light, chartEast + east, chartNorth + north, .982, .035, .035, .009);
  }

  const heightMarks = [1.76, 1.59, 1.42, 1.26, 1.11, .96] as const;
  for (const [i, y] of heightMarks.entries()) {
    box(group, 'observation-height-notch', seam, -4.03 + i * .25, spec.depth - .008, y, .19, .014, .019);
  }

  // S-6's window artwork remains in the cabin. The seated S-3 view moves these existing layers.
  const view = new Group();
  view.name = 'observation-town-view-card';
  view.position.set(halfWidth + .56, windowY, -midN);
  view.rotation.y = -Math.PI / 2;
  group.add(view);
  function card(geometry: BufferGeometry, color: string, name: string, x: number, y: number, z: number) {
    const finish = new MeshBasicMaterial({ color });
    const mesh = new Mesh(geometry, finish);
    mesh.name = name;
    mesh.position.set(x, y, z);
    geometries.add(geometry);
    materials.add(finish);
    view.add(mesh);
    return mesh;
  }
  card(new PlaneGeometry(windowLength + 1.4, windowHeight + .85), '#142437', 'observation-window-night', 0, 0, 0);
  const atmosphere = card(new CircleGeometry(3.3, 54), '#6890a3', 'observation-planet-limb', .20, -2.52, .012);
  atmosphere.scale.x = 1.65;
  const snow = card(new CircleGeometry(3.28, 54), '#a5b5be', 'observation-snow-earth', .20, -2.61, .020);
  snow.scale.x = 1.65;
  function mountains(points: readonly (readonly [number, number])[], name: string, color: string, z: number) {
    const shape = new Shape();
    const [x, y] = points[0]!;
    shape.moveTo(x, y);
    for (const [east, height] of points.slice(1)) shape.lineTo(east, height);
    shape.closePath();
    return card(new ShapeGeometry(shape), color, name, 0, 0, z);
  }
  const peaks = mountains([[-3.8,-.38],[-2.5,-.12],[-1.45,.34],[-.70,.08],[.05,.51],[.81,.22],[1.60,-.1],[3.8,-.58],[3.8,-1.35],[-3.8,-1.35]],
    'observation-double-ridge-silhouette', '#5b717d', .035);
  const lake = card(new CircleGeometry(.67, 31), '#a7c4cf', 'observation-mirror-lake', 1.2, -.56, .047);
  lake.scale.y = .24;
  const lights = new BufferGeometry();
  const specks: number[] = [];
  for (let i = 0; i < 34; i++) {
    const e = -.45 + Math.sin(i * 8.7) * .47;
    const y = -.67 + Math.cos(i * 12.1) * .13;
    specks.push(e - .020, y, 0, e + .020, y, 0);
  }
  lights.setAttribute('position', new Float32BufferAttribute(specks, 3));
  const warmSpecks = new LineBasicMaterial({ color: '#ffcf84', transparent: true, depthWrite: false });
  geometries.add(lights);
  materials.add(warmSpecks);
  const town = new LineSegments(lights, warmSpecks);
  town.name = 'observation-distant-town-lights';
  town.position.z = .06;
  view.add(town);

  const point = (x: number, n: number): Point => ({ x, n, ground: 0 });
  const seat = { x: bench.position.x, n: -bench.position.z, ground: bench.position.y + bench.scale.y / 2 };
  const seatApproach = point(seat.x - bench.scale.x / 2 - .385, seat.n);

  function readWindowCycle() {
    return { limbEast: atmosphere.position.x, peaksEast: peaks.position.x,
      lakeGlint: lake.scale.y, townGlow: warmSpecks.opacity };
  }

  function setWindowCycle(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    const phase = Math.max(0, Math.min(seconds / orbitalObservationCycleSeconds, 1));
    const arc = phase === 1 ? 0 : phase * Math.PI * 2;
    const sway = Math.sin(arc);
    const glint = (1 - Math.cos(arc)) / 2;
    atmosphere.position.x = snow.position.x = .20 + sway * .30;
    peaks.position.x = sway * .12;
    lake.position.x = 1.2 + sway * .18;
    lake.scale.y = .24 + glint * .13;
    town.position.x = sway * .17;
    warmSpecks.opacity = 1 - glint * .25;
  }
  function contains(x: number, n: number, box: Footprint) {
    return x >= box.minX && x <= box.maxX && n >= box.minN && n <= box.maxN;
  }
  function floorHeightAt(x: number, n: number): number | undefined {
    return contains(x, n, room) || contains(x, n, entrance) ? 0 : undefined;
  }
  function isWalkable(x: number, n: number, radius = .27, bodyHeight = 1.8) {
    if (![x, n, radius, bodyHeight].every(Number.isFinite) || radius < 0 || bodyHeight <= 0 ||
        floorHeightAt(x, n) === undefined) return false;
    if (n < entrance.minN + radius || bodyHeight > (n < 0 ? spec.portHeight : spec.height)) return false;
    return !solids.some(solid => {
      if (solid.top <= 0 || solid.bottom >= bodyHeight) return false;
      const dx = Math.max(solid.minX - x, x - solid.maxX, 0);
      const dn = Math.max(solid.minN - n, n - solid.maxN, 0);
      return Math.hypot(dx, dn) <= radius;
    });
  }

  let disposed = false;
  return {
    group, room, entrance,
    port: { frame: point(0, 0), approach: point(0, -.85), arrival: { ...point(0, .75), yaw: 0 } },
    viewPoint: point(2.9, midN), bench: { footprint: solids.find(solid => solid.kind === 'bench')!, height: seat.ground },
    seat, seatApproach, setWindowCycle, readWindowCycle,
    heightMarks, collisions: solids, floorHeightAt, isWalkable,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
