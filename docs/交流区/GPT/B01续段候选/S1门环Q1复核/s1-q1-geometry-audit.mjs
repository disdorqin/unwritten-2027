import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = resolve(process.argv[2]);
const requireSource = createRequire(resolve(source, 'package.json'));
const { FrontSide, PerspectiveCamera, Raycaster, Vector3 } = requireSource('three');
const town = 'tools/voxel-tavern/town-blockout';
const getModule = path => import(pathToFileURL(resolve(source, path)).href);
const { createOrbitalEarlyRooms } = await getModule(`${town}/orbital-early-rooms.ts`);
const { createOrbitalReview } = await getModule(`${town}/town-expansion-review-orbital.ts`);
const { resolveOrbitalGateTravel } = await getModule('src/presence/orbital-gates.ts');
const { readOrbitalDualKeyStatus } = await getModule('src/presence/orbital-anchor-registry.ts');

const rounded = value => Number(value.toFixed(6));
const degrees = value => rounded(value * 180 / Math.PI);
const xyz = point => point.toArray().map(rounded);
const nearCameraFoV = 58;
const results = [];

function inspectRing(name, root, ring, surface, look) {
  root.updateWorldMatrix(true, true);
  assert.equal(surface.visible, true);
  assert.equal(surface.material.transparent, false);
  assert.equal(surface.material.opacity, 1);
  assert.equal(ring.material.side, FrontSide);
  assert.equal(ring.material.color.getHex(), 0x68867e);
  assert.equal(ring.material.roughness, .96);
  assert.equal(ring.material.emissive.getHex(), 0);
  const { innerRadius, outerRadius, thetaSegments, thetaStart, thetaLength } = ring.geometry.parameters;
  assert.equal(degrees(thetaStart), 65);
  assert.equal(degrees(thetaLength), 320);
  const middle = (innerRadius + outerRadius) / 2;
  const center = ring.localToWorld(new Vector3());
  const normal = new Vector3(0, 0, 1).transformDirection(ring.matrixWorld);
  const pointAt = (angle, radius = middle) => ring.localToWorld(new Vector3(
    Math.cos(angle * Math.PI / 180) * radius, Math.sin(angle * Math.PI / 180) * radius, 0,
  ));
  const atRing = (angle, sign) => {
    const start = pointAt(angle).addScaledVector(normal, sign * 1.15);
    return new Raycaster(start, normal.clone().multiplyScalar(-sign)).intersectObject(ring);
  };
  const frontMissing = [];
  for (let angle = .5; angle < 360; angle++) {
    if (atRing(angle, 1).length === 0) frontMissing.push(angle);
    assert.equal(atRing(angle, -1).length, 0, `${name} rear through-mark at ${angle}`);
  }
  assert.deepEqual(frontMissing, Array.from({ length: 40 }, (_, offset) => 25.5 + offset));

  const camera = new PerspectiveCamera(nearCameraFoV, 16 / 9, .05, 30);
  camera.position.copy(look);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const centerNdc = center.clone().project(camera);
  const gapNdc = pointAt(45).project(camera);
  assert.ok(gapNdc.x > centerNdc.x && gapNdc.y > centerNdc.y, `${name} projected gap placement`);
  const lockedRay = angle => new Raycaster(camera.position, pointAt(angle).sub(camera.position).normalize())
    .intersectObjects([ring, surface])[0]?.object.name;
  assert.equal(lockedRay(45), 'closed-door-surface', `${name} gap cannot be a door aperture`);
  assert.equal(lockedRay(225), 'town-chronicle-ring', `${name} ring not visible at close range`);
  const inFrustum = point => Math.abs(point.x) < 1 && Math.abs(point.y) < 1;
  const getContour = () => Array.from({ length: 360 }, (_, angle) => pointAt(angle, outerRadius).project(camera));
  const contour = getContour();
  const readableAt = camera.position.clone();
  const closeGapHit = lockedRay(45);
  const closeArcHit = lockedRay(225);
  let retreat = 0;
  if (!contour.every(inFrustum)) {
    retreat = .75;
    camera.position.addScaledVector(normal, retreat);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    readableAt.copy(camera.position);
  }
  assert.ok(getContour().every(inFrustum), `${name} framed contour after ${retreat} m retreat`);
  results.push({ name, center: xyz(center), faceNormal: xyz(normal), approachCamera: xyz(look),
    radii: [innerRadius, outerRadius], segments: thetaSegments, sRGB: ring.material.color.getHexString(),
    roughness: ring.material.roughness, metalness: ring.material.metalness, emissive: ring.material.emissive.getHexString(),
    frontMissing: [frontMissing[0], frontMissing.at(-1)], frontMissingCount: frontMissing.length,
    rearVisibleSamples: 0, closeGapNearestHit: closeGapHit, closeArcNearestHit: closeArcHit,
    closeGapNdc: xyz(gapNdc), closeGapOnScreen: inFrustum(gapNdc), closeContourOnScreen: contour.every(inFrustum),
    retreatForFullContour: retreat, fullContourCamera: xyz(readableAt), closeContour: [0, 1].map(component => {
      const axis = component ? 'y' : 'x';
      return [rounded(Math.min(...contour.map(point => point[axis]))), rounded(Math.max(...contour.map(point => point[axis])))];
    }),
  });
}

const rooms = createOrbitalEarlyRooms();
for (const [port, fixture] of [['starport', 'orbital-starport-frame'], ['coreVault', 'orbital-core-vault-frame']]) {
  const frame = rooms.group.getObjectByName(fixture);
  const { x, n } = rooms.ports[port].approach;
  inspectRing(fixture, rooms.group, frame.getObjectByName('town-chronicle-ring'),
    frame.getObjectByName('closed-door-surface'), new Vector3(x, 1.65, -n));
}

let latest;
createOrbitalReview(view => { latest = view; }).show();
const firstGroup = latest.group;
const reviewDenials = [];
for (const gate of ['星港太空门', '地宫核心舱门']) {
  assert.ok(latest.location.startsWith(gate));
  const findAction = label => latest.actions.find(([name]) => name === label)[1];
  const before = latest.location;
  findAction('经当前门进入气闸')();
  assert.equal(latest.location, before);
  assert.equal(latest.status, '试验门仍锁定。');
  assert.equal(latest.group, firstGroup);
  reviewDenials.push({ door: gate, location: before, result: latest.status });
  inspectRing(gate, latest.group, latest.group.getObjectByName('town-chronicle-ring'),
    latest.group.getObjectByName('closed-door-surface'), new Vector3(0, 1.65, 1.38));
  if (gate === '星港太空门') findAction('选取另一外门夹具')();
}

const keyStatus = readOrbitalDualKeyStatus(Array.from({ length: 12 }, (_, index) => index + 1), true);
assert.deepEqual(keyStatus, { collectedPages: 12, fragmentsComplete: true, flyerAssembled: true });
const lockedAuthority = [];
for (const gate of ['starport', 'core']) {
  for (const direction of ['enter', 'return']) {
    const state = { site: direction === 'enter' ? gate : 'airlock', pose: { east: 0, north: 0, height: 0, yaw: 0 } };
    const result = resolveOrbitalGateTravel({ gate, direction, ...keyStatus }, state, {
      isOpen: () => false,
      isAtOpening: () => true,
      landingAt: () => { throw new Error('locked gate queried its landing'); },
      isLegalLanding: () => { throw new Error('locked gate validated a landing'); },
    });
    assert.deepEqual(result, { ok: false, reason: 'locked' });
    lockedAuthority.push({ gate, direction, result });
  }
}

console.log(JSON.stringify({ fixtureOnly: true, nearCameraFoV, outerStopsShareGeometry: true,
  rings: results, reviewDenials, keyStatus, lockedAuthority }, null, 2));
