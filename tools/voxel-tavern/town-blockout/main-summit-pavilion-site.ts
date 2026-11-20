import { BoxGeometry, Mesh, MeshLambertMaterial } from 'three';
import { cloudPavilionDimensions, createCloudPavilion } from './main-summit-pavilions';

const upperAzimuth = 196.25 * Math.PI / 180;

// P-3 survey at 1192 m and 2160 m, respectively, in the P-1 local E/N/Y frame.
// The centers of the decks sit outside the existing three-metre trail.
export const cloudPavilionSites = [
  {
    id: 'lower-cloud', east: 773.257, north: 739.208, height: 440.647,
    viewEast: 1, viewNorth: 0, approachEast: 769.757, approachNorth: 739.208,
    approachEdgeHeights: [440.647, 440.647], visibilityMetres: 320,
  },
  {
    id: 'upper-cloud', east: -44.471, north: 380.150, height: 520.026,
    viewEast: Math.sin(upperAzimuth), viewNorth: Math.cos(upperAzimuth),
    approachEast: -43.212, approachNorth: 384.470,
    approachEdgeHeights: [520.075, 519.977], visibilityMetres: 400,
  },
] as const;

type CloudPavilionSite = typeof cloudPavilionSites[number];
type GroundAt = (east: number, north: number) => number | undefined;

export function createPlacedCloudPavilion(site: CloudPavilionSite, groundAt: GroundAt) {
  const group = createCloudPavilion(site.id);
  const { width, depth } = cloudPavilionDimensions[site.id];
  const yaw = Math.atan2(site.viewEast, -site.viewNorth);
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = yaw;

  const bridgeWidth = 1.2;
  const span = Math.hypot(site.approachEast - site.east, site.approachNorth - site.north) - depth / 2 + .15;
  const bridgeGeometry = new BoxGeometry(bridgeWidth, .16, span);
  const vertices = bridgeGeometry.getAttribute('position');
  const [left, right] = site.approachEdgeHeights;
  for (let i = 0; i < vertices.count; i++) {
    if (vertices.getZ(i) >= 0) continue;
    const t = vertices.getX(i) / bridgeWidth + .5;
    vertices.setY(i, vertices.getY(i) + left + (right - left) * t - site.height);
  }
  bridgeGeometry.computeVertexNormals();
  const bridge = new Mesh(bridgeGeometry, new MeshLambertMaterial({ color: '#885e49' }));
  bridge.name = 'trail-approach';
  bridge.position.set(0, -.08, -(depth + span) / 2);
  group.add(bridge);

  const stone = new MeshLambertMaterial({ color: '#78828b' });
  const pierWidth = .78;
  const footingEdge = [-pierWidth / 2, pierWidth / 2];
  for (const x of [-width * .33, width * .33]) {
    for (const z of [-depth * .32, depth * .32]) {
      const terrain = footingEdge.flatMap(dx => footingEdge.map(dz => groundAt(
        site.east + (x + dx) * Math.cos(yaw) + (z + dz) * Math.sin(yaw),
        site.north + (x + dx) * Math.sin(yaw) - (z + dz) * Math.cos(yaw),
      )));
      if (!terrain.every((height): height is number => height !== undefined && Number.isFinite(height))) {
        throw new RangeError('Pavilion footing is outside the local survey.');
      }
      const length = site.height - Math.min(...terrain) + .15;
      if (length <= 0) throw new RangeError('Pavilion footing is above the viewing deck.');
      const pier = new Mesh(new BoxGeometry(pierWidth, length, pierWidth), stone);
      pier.name = 'pavilion-pier';
      pier.position.set(x, -length / 2, z);
      group.add(pier);
    }
  }
  return group;
}
