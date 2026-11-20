import {
  BoxGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, Shape, TorusGeometry,
  type BufferGeometry, type Intersection, type Object3D, type Raycaster,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { createMainSummitTrail, MainSummitTrailPoint } from './main-summit-trail';

type Trail = Pick<ReturnType<typeof createMainSummitTrail>, 'points' | 'sampleSurface'>;
type Part = readonly [geometry: BufferGeometry, tint: number, x: number, y: number, z: number];

function hitHasVisibleMaterial(hit: Intersection) {
  const { material } = hit.object as Mesh;
  const surface = Array.isArray(material) ? material[hit.face?.materialIndex ?? -1] : material;
  return surface?.visible === true;
}

const shoulderOffset = 1.15;
// Match the drawn tread of createTrailRibbon, above the logical walking surface.
const treadLift = .07;

function nozzle(): Part[] {
  const axis = -Math.PI / 2;
  return [
    [new CylinderGeometry(.124, .147, .34, 10, 1, true).rotateZ(axis), 0x65757b, 0, .15, 0],
    [new TorusGeometry(.123, .024, 5, 10).rotateY(Math.PI / 2), 0xa5bcc1, .17, .15, 0],
    [new TorusGeometry(.128, .023, 5, 10).rotateY(Math.PI / 2), 0x936d50, -.065, .15, 0],
    [new CylinderGeometry(.15, .13, .055, 10).rotateZ(axis), 0x3f4b51, -.18, .15, 0],
    [new BoxGeometry(.10, .026, .06).rotateY(.28), 0x9a7960, .01, .289, .025],
    [new BoxGeometry(.16, .035, .028).rotateY(-.29), 0x5f837e, -.04, .205, .126],
  ];
}

function skin(): Part[] {
  const edge = new Shape();
  edge.moveTo(-.26, -.09);
  edge.lineTo(.18, -.11);
  edge.lineTo(.24, .02);
  edge.lineTo(.105, .13);
  edge.lineTo(.03, .109);
  edge.lineTo(-.075, .175);
  edge.lineTo(-.227, .108);
  edge.closePath();
  return [
    [new ExtrudeGeometry(edge, { depth: .036, bevelEnabled: false }).rotateX(-.79), 0x819b9e, 0, .081, 0],
    [new BoxGeometry(.35, .025, .036).rotateZ(.07), 0x465e64, -.02, .061, .087],
    [new BoxGeometry(.28, .027, .049).rotateY(.13), 0xb19366, -.035, .15, -.057],
    ...[-.139, -.035, .069].map((x): Part => [new BoxGeometry(.025, .022, .027), 0xd1c5aa, x, .171, -.055]),
    [new BoxGeometry(.07, .038, .066).rotateY(-.25), 0x536565, .174, .045, .079],
  ];
}

function collar(): Part[] {
  const tilt = -.88;
  return [
    [new TorusGeometry(.152, .039, 5, 12, Math.PI * 1.44).rotateX(tilt), 0x9c8867, .005, .142, 0],
    [new TorusGeometry(.109, .017, 4, 10, Math.PI * 1.44).rotateX(tilt), 0x4f676a, .005, .14, -.005],
    [new BoxGeometry(.40, .050, .103).rotateY(.19), 0x545c5b, -.02, .023, .068],
    [new BoxGeometry(.094, .147, .076).rotateZ(.23), 0x755b48, -.184, .082, -.019],
    [new BoxGeometry(.074, .114, .073).rotateZ(-.19), 0xb4abad, .145, .062, .058],
    [new BoxGeometry(.051, .036, .051), 0x617d78, -.02, .049, .111],
  ];
}

const surveyedSites = [
  { id: 'summit-wreckage-nozzle', label: '卷边喷口', trailPoint: 550, angle: -.22, parts: nozzle },
  { id: 'summit-wreckage-skin', label: '弯折蒙皮', trailPoint: 3197, angle: .38, parts: skin },
  { id: 'summit-wreckage-collar', label: '断裂座圈', trailPoint: 4660, angle: -.56, parts: collar },
] as const;

function buildFragment(parts: readonly Part[]) {
  const meshes = parts.map(([source, tint, x, y, z]) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.translate(x, y, z);
    const count = geometry.getAttribute('position').count;
    const color = new Color(tint);
    const values = new Float32Array(count * 3);
    for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
    geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
    return geometry;
  });
  const fragment = mergeGeometries(meshes);
  meshes.forEach(mesh => mesh.dispose());
  if (!fragment) throw new Error('Could not batch a mountain wreckage fragment.');
  fragment.computeBoundingBox();
  fragment.computeBoundingSphere();
  return fragment;
}

function placeSite(trail: Trail, trailPoint: number): { model: MainSummitTrailPoint; stand: MainSummitTrailPoint; bearing: number } {
  const center = trail.points[trailPoint];
  const before = trail.points[trailPoint - 1];
  const after = trail.points[trailPoint + 1];
  if (!center || !before || !after) throw new RangeError('The P-3 trail lacks a surveyed wreckage site.');
  const de = after.east - before.east;
  const dn = after.north - before.north;
  const scale = shoulderOffset / Math.hypot(de, dn);
  const east = center.east + dn * scale;
  const north = center.north - de * scale;
  const modelY = trail.sampleSurface(east, north);
  const standY = trail.sampleSurface(center.east, center.north);
  if (modelY === undefined || standY === undefined) throw new RangeError('The wreckage site requires a supported P-3 tread.');
  return {
    model: { east, north, height: modelY + treadLift },
    stand: { east: center.east, north: center.north, height: standY },
    bearing: Math.atan2(dn, de),
  };
}

/** Mountain-local scenery and measured standing points. Pickup authority belongs to the inventory host. */
export function mountMainSummitWreckage(owner: Group, trail: Trail) {
  // Survey first so a bad trail cannot leave partially mounted objects.
  const registered = surveyedSites.map(site => ({ ...site, ...placeSite(trail, site.trailPoint) }));
  const group = new Group();
  group.name = 'main-summit-wreckage';
  const material = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const fragments: BufferGeometry[] = [];
  const sites = registered.map(({ id, label, model, stand, bearing, angle, parts }) => {
    const fragment = buildFragment(parts());
    fragments.push(fragment);
    const mesh = new Mesh(fragment, material);
    mesh.name = id;
    mesh.position.set(model.east, model.height, -model.north);
    mesh.rotation.y = bearing + angle;
    group.add(mesh);
    return { id, label, model, stand };
  });
  owner.add(group);

  // The host sets the camera ray and its reach. Only a first visible assembly surface can be aimed at.
  function aim(ray: Raycaster) {
    if (!group.parent || !Number.isFinite(ray.far) || ray.far <= ray.near) return null;
    for (let object: Object3D | null = group; object; object = object.parent) {
      if (!object.visible) return null;
    }
    group.updateWorldMatrix(true, true);
    const hit = ray.intersectObjects(group.children.filter(mesh => mesh.visible), false).find(hitHasVisibleMaterial);
    if (!hit) return null;

    owner.updateWorldMatrix(true, true);
    const blockers: Object3D[] = [];
    owner.traverseVisible(object => {
      if ((object as Mesh).isMesh && object.parent !== group) blockers.push(object);
    });
    if (ray.intersectObjects(blockers, false).some(blocker =>
      blocker.distance <= hit.distance && hitHasVisibleMaterial(blocker))) return null;
    return sites.find(site => site.id === hit.object.name) ?? null;
  }

  return {
    group,
    sites,
    aim,
    dispose() {
      if (!fragments.length) return;
      group.removeFromParent();
      group.clear();
      fragments.splice(0).forEach(fragment => fragment.dispose());
      material.dispose();
    },
  };
}
