import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group,
  Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight,
  RingGeometry, type Material,
} from 'three';
import { orbitalAnchorIds, type OrbitalAnchorId } from '../../../src/presence/orbital-anchor-registry.js';

const cabin = { minX: -3.5, maxX: 3.5, minN: 0, maxN: 7 };
const doorwayHalfWidth = 1.7;
const ceiling = 3.45;
const wall = .18;
const hubNorth = 4.15;

type Bounds = Readonly<{ minX: number; maxX: number; minN: number; maxN: number }>;

export const orbitalAnchorLabels: Readonly<Record<OrbitalAnchorId, string>> = {
  starport: '星港', 'crater-bottom': '坑底', summit: '绝顶', plaza: '广场',
};

export function createOrbitalTeleportCabin() {
  const group = new Group();
  group.name = 'orbital-teleport-cabin';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const obstacles: Bounds[] = [];
  const sharedBox = new BoxGeometry();
  geometries.add(sharedBox);
  const hull = new MeshStandardMaterial({ color: 0x51626b, metalness: .24, roughness: .77 });
  const deck = new MeshStandardMaterial({ color: 0x56686e, roughness: .82 });
  const frame = new MeshStandardMaterial({ color: 0x8d9b96, metalness: .36, roughness: .68 });
  const dark = new MeshStandardMaterial({ color: 0x293136, roughness: .9 });
  const outline = new MeshBasicMaterial({ color: 0x657b7d });
  const warm = new MeshBasicMaterial({ color: 0xffead0 });
  const unvisited = new MeshStandardMaterial({ color: 0x252c31, roughness: .95 });
  for (const material of [hull, deck, frame, dark, outline, warm, unvisited]) materials.add(material);

  function box(name: string, material: Material, x: number, n: number, y: number,
    width: number, depth: number, height: number, solid = false) {
    const mesh = new Mesh(sharedBox, material);
    mesh.name = name;
    mesh.position.set(x, y, -n);
    mesh.scale.set(width, height, depth);
    group.add(mesh);
    if (solid) obstacles.push({
      minX: x - width / 2, maxX: x + width / 2, minN: n - depth / 2, maxN: n + depth / 2,
    });
    return mesh;
  }

  box('teleport-deck', deck, 0, 3.5, -.08, 7, 7, .16);
  box('teleport-ceiling', hull, 0, 3.5, ceiling + .08, 7 + wall * 2, 7, .16);
  box('teleport-north-wall', hull, 0, 7 + wall / 2, ceiling / 2, 7 + wall * 2, wall, ceiling);
  for (const side of [-1, 1]) {
    box('teleport-side-wall', hull, side * (3.5 + wall / 2), 3.5, ceiling / 2, wall, 7, ceiling);
    box('teleport-door-jamb', hull, side * 2.6, -wall / 2, ceiling / 2, 1.8, wall, ceiling);
    const light = new PointLight(0xffebcd, 18, 5.5, 2);
    light.position.set(side * 2.05, 2.84, -4.6);
    group.add(light);
    box('teleport-ceiling-strip', warm, side * 2.01, 4.35, ceiling - .075, .10, 4.10, .035);
  }
  box('teleport-door-header', frame, 0, -wall / 2, (ceiling + 2.49) / 2, 3.4, wall, ceiling - 2.49);
  box('teleport-console-housing', dark, 0, 2.24, .48, 1.22, .39, .96, true);
  box('teleport-console-desk', frame, 0, 2.24, .99, 1.29, .46, .09);
  box('teleport-console-face', outline, 0, 2.24, 1.044, .97, .25, .012);
  const console = { x: 0, n: 1.6, ground: 0 } as const;

  function horizontalRing(name: string, inner: number, outer: number, material: Material, y: number) {
    const geometry = new RingGeometry(inner, outer, 48);
    geometries.add(geometry);
    const ring = new Mesh(geometry, material);
    ring.name = name;
    ring.position.set(0, y, -hubNorth);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  const platformGeometry = new CylinderGeometry(1.48, 1.48, .045, 48);
  geometries.add(platformGeometry);
  const platform = new Mesh(platformGeometry, frame);
  platform.name = 'teleport-central-platform';
  platform.position.set(0, -.021, -hubNorth);
  group.add(platform);
  horizontalRing('teleport-retaining-ring', 1.19, 1.46, dark, .004);
  horizontalRing('teleport-always-lit-hub', .41, .54, warm, .009);

  const slots = orbitalAnchorIds.map((id, index) => {
    const angle = Math.PI / 4 + Math.PI / 2 * index;
    const x = Math.cos(angle) * 1.93, n = hubNorth + Math.sin(angle) * 1.93;
    box('teleport-anchor-foot-' + id, dark, x, n, .10, .55, .55, .20, true);
    box('teleport-anchor-outline-' + id, outline, x, n, .208, .55, .55, .018);
    const cell = box('teleport-anchor-' + id, unvisited, x, n, .222, .42, .42, .022);
    return { id, cell };
  });

  // This small light-point outline becomes visible only when the host reports all four anchors.
  const constellation = new BufferGeometry();
  constellation.setAttribute('position', new Float32BufferAttribute([
    -.9, .70, -4.2, -.62, .83, -4.24, -.35, 1.02, -4.26, -.15, 1.23, -4.29,
    .28, 1.47, -4.33, .68, 1.43, -4.36, .84, 1.15, -4.34, .70, .91, -4.30,
  ], 3));
  geometries.add(constellation);
  const constellationMaterial = new LineBasicMaterial({ color: 0xffdbad });
  materials.add(constellationMaterial);
  const map = new Line(constellation, constellationMaterial);
  map.name = 'teleport-complete-anchor-map';
  map.visible = false;
  group.add(map);

  let anchors: ReadonlySet<OrbitalAnchorId> = new Set();
  function setVisitedAnchors(ids: Iterable<OrbitalAnchorId>) {
    const next = new Set(ids);
    anchors = new Set(orbitalAnchorIds.filter(id => next.has(id)));
    for (const { id, cell } of slots) cell.material = anchors.has(id) ? warm : unvisited;
    map.visible = anchors.size === orbitalAnchorIds.length;
  }

  function floorHeightAt(x: number, n: number) {
    if ([x, n].every(Number.isFinite) && n >= cabin.minN && n <= cabin.maxN &&
        Math.abs(x) <= (n === cabin.minN ? doorwayHalfWidth : cabin.maxX)) return 0;
  }

  function isWalkable(x: number, n: number, radius = .27) {
    if (!Number.isFinite(radius) || radius < 0 || floorHeightAt(x, n) === undefined ||
        Math.abs(x) + radius > cabin.maxX || n + radius > cabin.maxN ||
        (n < radius && Math.abs(x) + radius > doorwayHalfWidth)) return false;
    return obstacles.every(bounds => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX),
      Math.max(bounds.minN - n, 0, n - bounds.maxN)) > radius);
  }

  return {
    group, console, floorHeightAt, isWalkable, setVisitedAnchors,
    readState: () => ({
      hubLit: true as const,
      anchors: orbitalAnchorIds.map(id => ({ id, lit: anchors.has(id) })),
      mapVisible: map.visible,
    }),
    dispose() {
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
