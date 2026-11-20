import { BoxGeometry, Group, LatheGeometry, Mesh, MeshLambertMaterial, Vector2 } from 'three';

type Point = { east: number; north: number; height: number };
type Route = {
  sample(metres: number): Point;
  startMetres: number;
  endMetres: number;
  groundAt?(east: number, north: number): number | undefined;
  treadAt?(east: number, north: number): number | undefined;
};

const spacingMetres = 24;
const shoulderOffset = 2.25;
const bellOffset = .44;
const bellLift = 1.44;

export function mountMainSummitTrailChimes(owner: Group, { sample, startMetres, endMetres, groundAt, treadAt }: Route) {
  if (!Number.isFinite(startMetres) || !Number.isFinite(endMetres) || endMetres < startMetres) {
    throw new RangeError('The summit trail chimes need a finite interval in route order.');
  }

  const sites: (Point & { metres: number })[] = [];
  const posts: (Point & { yaw: number })[] = [];
  for (let metres = startMetres; metres < endMetres; metres += spacingMetres) {
    const centre = sample(metres);
    const after = sample(Math.min(endMetres, metres + 1));
    const de = after.east - centre.east;
    const dn = after.north - centre.north;
    const span = Math.hypot(de, dn);
    if (!(span > 0) || !Number.isFinite(span)) throw new RangeError('A summit trail chime needs a route tangent.');

    // Match the existing sled flags' side of the route. Local +X points away from the tread.
    let sideEast = -dn / span;
    let sideNorth = de / span;
    if (treadAt) {
      // Probe the timber base through the outer edge of the flag, including both tread arms at a hairpin.
      const clear = (sign: number) => [-.105, 0, .25, .50, .73].every(lateral =>
        [-.105, 0, .105].every(tangent => treadAt(
          centre.east + sign * sideEast * (shoulderOffset + lateral) + sideNorth * tangent,
          centre.north + sign * sideNorth * (shoulderOffset + lateral) - sideEast * tangent,
        ) === undefined));
      if (!clear(1)) {
        if (!clear(-1)) throw new RangeError(`Neither surveyed trail shoulder clears the chime at ${metres} m.`);
        sideEast = -sideEast;
        sideNorth = -sideNorth;
      }
    }
    const east = centre.east + sideEast * shoulderOffset;
    const north = centre.north + sideNorth * shoulderOffset;
    const height = groundAt?.(east, north) ?? centre.height;
    posts.push({ east, north, height, yaw: Math.atan2(sideNorth, sideEast) });
    sites.push({ metres, east: east + sideEast * bellOffset, north: north + sideNorth * bellOffset,
      height: height + bellLift });
  }

  const group = new Group();
  group.name = 'main-summit-trail-chimes';
  const box = new BoxGeometry();
  const bellProfile = [
    [0, .106], [.060, .106], [.087, .045], [.108, -.054], [.133, -.138], [.137, -.175], [.163, -.175],
    [.167, -.139], [.145, -.109], [.115, .010], [.095, .107], [.073, .149], [0, .149],
  ];
  const bellShape = new LatheGeometry(bellProfile.map(([radius, height]) => new Vector2(radius, height)), 12);
  const timber = new MeshLambertMaterial({ color: '#674c46' });
  const flag = new MeshLambertMaterial({ color: '#ab262b' });
  const bronze = new MeshLambertMaterial({ color: '#b78546' });
  const iron = new MeshLambertMaterial({ color: '#4d4140' });

  function addBox(parent: Group, name: string, material: MeshLambertMaterial,
    x: number, y: number, width: number, height: number, depth: number) {
    const part = new Mesh(box, material);
    part.name = name;
    part.position.set(x, y, 0);
    part.scale.set(width, height, depth);
    parent.add(part);
  }

  for (const { east, north, height, yaw } of posts) {
    const post = new Group();
    post.name = 'trail-chime-post';
    post.position.set(east, height, -north);
    post.rotation.y = yaw;
    group.add(post);

    addBox(post, 'trail-chime-timber', timber, 0, 1.21, .19, 2.58, .19);
    addBox(post, 'trail-chime-red-flag', flag, .39, 2.07, .65, .60, .055);
    addBox(post, 'trail-chime-crossarm', timber, .245, 1.65, .52, .075, .12);
    addBox(post, 'trail-chime-hanger', iron, bellOffset, 1.599, .058, .04, .058);

    const bell = new Group();
    bell.name = 'trail-chime-bell';
    bell.position.set(bellOffset, bellLift, 0);
    const bowl = new Mesh(bellShape, bronze);
    bowl.name = 'trail-chime-bronze';
    bell.add(bowl);
    addBox(bell, 'trail-chime-clapper', iron, 0, -.129, .048, .11, .048);
    post.add(bell);
  }
  owner.add(group);
  let disposed = false;

  return {
    group, sites,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      box.dispose();
      bellShape.dispose();
      timber.dispose();
      flag.dispose();
      bronze.dispose();
      iron.dispose();
    },
  };
}
