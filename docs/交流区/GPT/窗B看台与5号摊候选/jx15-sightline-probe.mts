import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Raycaster, Vector3 } from 'three';

const sourceDir = resolve(process.argv[2]);
const sourcePath = (path: string) => resolve(sourceDir, 'tools/voxel-tavern/town-blockout', path);
const importSource = (path: string) => import(pathToFileURL(sourcePath(path)).href);
const { buildVillageLandmark } = await importSource('landmark-village.ts');
const { theaterPhotoPositions } = await importSource('community-theater.ts');
const { avatarRootOffset, writeAvatarPart } = await importSource('town-presence-pose.ts');
const { voxelPersonParts } = await importSource('town-voxel-person.ts');
const { createTheaterPhotoCamera } = await importSource('theater-photo-camera.ts');
const { plazaPhotoLineup } = await import(pathToFileURL(resolve(sourceDir, 'src/presence/plaza-photo.ts')).href);
const { plots } = JSON.parse(readFileSync(sourcePath('layout.json'), 'utf8'));
const plot = plots.find(({ id }: { id: string }) => id === 'stage');
const stage = buildVillageLandmark(plot);
stage.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
stage.updateMatrixWorld(true);
const participants = theaterPhotoPositions.slice(0, 36);
const seat = theaterPhotoPositions.find((part: { east: number; north: number }) =>
  part.east === 224.64 && part.north === 165.0625);
if (!seat || participants.length !== 36) throw new Error('Historic eye / seat identities changed');

const avatars = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), participants.length * voxelPersonParts.length);
const matrix = new Matrix4();
const buffer = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
participants.forEach((part: { east: number; north: number; height: number }, person: number) => {
  voxelPersonParts.forEach((voxelPart: unknown, index: number) => {
    writeAvatarPart(buffer, 0, voxelPart, 1, part.east, part.height + avatarRootOffset(1), -part.north, 1, 0, 0, 0);
    avatars.setMatrixAt(person * voxelPersonParts.length + index, matrix.fromArray(buffer));
  });
});
avatars.updateMatrixWorld(true);

const ray = new Raycaster();
const origin = new Vector3(seat.east, seat.height + 1.03, -seat.north);
const targetNorth = 146.711;
const targetY = 12.121;
const targetEast = Array.from({ length: 35 }, (_, index) => 229.5 + index * .5)
  .filter(east => Math.abs(east - 238) > 3.5);
const publishedTrimTargets = [242, 233.5, 242.5, 233, 232.5, 232, 231.5];

function sample(east: number, eyeY: number) {
  origin.y = eyeY;
  const aim = new Vector3(east, targetY, -targetNorth).sub(origin);
  const distance = aim.length();
  ray.set(origin, aim.normalize());
  ray.far = distance + .075;
  const geometryHits = ray.intersectObject(stage, true);
  const peopleHits = ray.intersectObject(avatars);
  const stageDistance = geometryHits[0]?.distance;
  const personDistance = peopleHits[0]?.distance;
  const blocker = peopleHits[0]?.instanceId;
  return {
    east, north: targetNorth, y: targetY, distance,
    stageDistance, personDistance,
    person: blocker === undefined ? undefined : Math.floor(blocker / voxelPersonParts.length) + 1,
    reachesTrim: stageDistance !== undefined && Math.abs(stageDistance - distance) < .01,
    blockedBySpectator: personDistance !== undefined && personDistance < distance - .01,
    historicVisible: stageDistance !== undefined && Math.abs(stageDistance - distance) < .12
      && (personDistance === undefined || personDistance > stageDistance),
  };
}

const mode = process.argv[3];
if (mode === 'sweep') {
  for (let index = 0; index <= 40; index++) {
    const eyeY = Number((seat.height + 1.03 + index / 100).toFixed(4));
    const results = targetEast.map(east => sample(east, eyeY));
    console.log(eyeY, results.map(point =>
      !point.reachesTrim ? 'S' : point.blockedBySpectator ? 'P' : '.').join(''));
  }
} else {
  const eyeY = seat.height + 1.03;
  const samples = targetEast.map(east => sample(east, eyeY));
  // Check the full 1 cm face grid. Centre stairs and decorative geometry are retained
  // and counted separately wherever they stand in front of the lower trim face.
  const face = Array.from({ length: 1787 }, (_, index) => Number((229.07 + index / 100).toFixed(2)))
    .map(east => sample(east, eyeY));
  const exposed = face.filter(point => point.reachesTrim);
  const stageInstances = [];
  for (const child of stage.children) {
    if (!child.isInstancedMesh) continue;
    for (let index = 0; index < child.count; index++) {
      child.getMatrixAt(index, matrix);
      const north = plot.origin[1] - matrix.elements[14];
      if (north >= 152) continue;
      stageInstances.push([...matrix.elements, ...child.instanceColor.array.slice(index * 3, index * 3 + 3)]);
    }
  }
  const lineup = plazaPhotoLineup(theaterPhotoPositions.map((part: { east: number; north: number; height: number }, index: number) =>
    ({ ...part, id: index + 1, name: `观众${index + 1}` })));
  const views = Object.fromEntries(['stage', 'clocktower'].map(view => {
    const camera = createTheaterPhotoCamera(view, lineup, () => 12);
    const clipped = lineup.filter((part: { east: number; north: number; height: number }) =>
      [part.height, part.height + 1.9235].some(y => {
        const point = new Vector3(part.east, y, -part.north).project(camera);
        return Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) > 1;
      }));
    return [view, { clipped: clipped.length }];
  }));
  console.log(JSON.stringify({
    source: sourceDir,
    eye: { east: seat.east, north: seat.north, y: eyeY },
    visible: samples.filter(point => point.historicVisible).length,
    blockers: {
      stage: samples.filter(point => !point.reachesTrim).length,
      spectators: samples.filter(point => point.blockedBySpectator).length,
    },
    uniformFaceGrid: {
      total: face.length,
      geometricallyExposed: exposed.length,
      visible: exposed.filter(point => !point.blockedBySpectator).length,
      physicallyCovered: face.length - exposed.length,
      spectatorBlockedEast: exposed.filter(point => point.blockedBySpectator).map(point => point.east),
    },
    historicPassingTargets: publishedTrimTargets.map(east => sample(east, eyeY)),
    frozenStage: { instances: stageInstances.length,
      sha256: createHash('sha256').update(JSON.stringify(stageInstances)).digest('hex') },
    roster: { count: lineup.length,
      horizontalSha256: createHash('sha256')
        .update(JSON.stringify(lineup.map(({ id, east, north }: { id: number; east: number; north: number }) => [id, east, north])))
        .digest('hex'),
      seatRows: theaterPhotoPositions.filter((_, index) => index % 12 === 0).map(({ height }) => height), views },
    samples,
  }, null, 2));
}
