import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial } from 'three';

type Point = readonly [east: number, north: number, elevation: number];
type Section = readonly [right: Point, left: Point];
type Triangle = readonly [Point, Point, Point];
const thickness = .08;

// A-03 surveyed transverse sections, ordered from the station to the ice.
const stationSections = [
  [[22.5, 176.1, 16.34], [22.5, 178.1, 16.34]],
  [[26.085786437626908, 176.1, 16.34], [26.914213562373092, 178.1, 16.34]],
  [[27.447956226657542, 174.73783021096938, 15.978838649500485], [28.15204377334246, 176.86216978903065, 15.978838649500485]],
  [[30.511080110095925, 175.18609224269204, 15.764355714028587], [29.188919889904078, 177.01390775730795, 15.764355714028587]],
  [[31.563877959151707, 177.29168794080366, 15.69613739668808], [29.33612204084829, 177.30831205919637, 15.69613739668808]],
  [[30.535138414758062, 179.42830084069814, 15.561301258210886], [29.06486158524194, 177.87169915930187, 15.561301258210886]],
  [[27.79168255382282, 180.56146739195398, 15.09976140193768], [27.20831744617718, 178.638532608046, 15.09976140193768]],
  [[26.842584619293678, 180.75128697885984, 14.877365665137273], [26.157415380706322, 178.84871302114018, 14.877365665137273]],
  [[25.88310446398647, 181.26793013940986, 14.6285481824503], [24.51689553601353, 179.73206986059014, 14.6285481824503]],
  [[25.5, 181.8152222308191, 14.478489799377659], [23.5, 181.1847777691809, 14.478489799377659]],
  [[25.5, 182, 14.43780517578125], [23.5, 182, 14.43780517578125]],
] as const satisfies readonly Section[];

const iceSections = [
  [[24.21539501058485, 181.5889039041781, 14.43780517578125], [24.78460498941515, 182.4110960958219, 14.43780517578125]],
  [[24.969246412413305, 181.06700677983534, 14.43780517578125], [25.330753587586692, 182.03299322016468, 14.43780517578125]],
  [[26.47230743093129, 180.9, 14.43780517578125], [26.52769256906871, 181.9, 14.43780517578125]],
  [[28.691381871453093, 180.9, 14.43780517578125], [28.708618128546906, 181.9, 14.43780517578125]],
  [[31.37700625091995, 180.80739226277703, 13.672958449491206], [31.82299374908005, 181.792607737223, 13.672958449491206]],
  [[32.71394814854582, 179.3868914965495, 13.15948713273937], [33.68605185145419, 179.81310850345048, 13.15948713273937]],
  [[32.9, 176.78216557619092, 12.459147247922065], [33.9, 176.8178344238091, 12.459147247922065]],
  [[32.9, 172.9586187348509, 11.387782408217447], [33.9, 173.0413812651491, 11.387782408217447]],
  [[33.448661041677425, 169.66665248478634, 10.691359563856524], [34.35133895832257, 170.33334751521366, 10.691359563856524]],
  [[36.07639320225002, 168.35278640450005, 10], [36.52360679774998, 169.24721359549997, 10]],
] as const satisfies readonly Section[];

function deckTriangles(sections: readonly Section[]): Triangle[] {
  return sections.slice(1).flatMap(([rightFront, leftFront], index) => {
    const [rightBack, leftBack] = sections[index];
    return [[rightBack, rightFront, leftBack], [leftBack, rightFront, leftFront]] as const;
  });
}

function sampleTriangle([a, b, c]: Triangle, east: number, north: number) {
  const ax = a[0] - c[0], an = a[1] - c[1], bx = b[0] - c[0], bn = b[1] - c[1];
  const ex = east - c[0], en = north - c[1], area = ax * bn - an * bx;
  const u = (ex * bn - en * bx) / area, v = (en * ax - ex * an) / area;
  if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) return;
  return c[2] + (a[2] - c[2]) * u + (b[2] - c[2]) * v;
}

// The old approach retains the exact strip checked by the original geometry.
// Its paint is raised 0.045 m solely for rendering.
export function createMirrorLakeLegacyShoreSampler(geometry: BufferGeometry) {
  const index = geometry.getIndex()!;
  const points = geometry.getAttribute('position');
  function point(vertex: number): Point {
    return [points.getX(vertex), -points.getZ(vertex), points.getY(vertex) - .045];
  }
  const triangles: Triangle[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const triangle = [point(index.getX(i)), point(index.getX(i + 1)), point(index.getX(i + 2))] as const;
    if (triangle.some(([east, north]) => east <= 43 && north >= 166)) triangles.push(triangle);
  }
  return function sampleShore(east: number, north: number) {
    if (east > 44 || east < 22 || north < 165 || north > 183.1) return;
    let height = -Infinity;
    for (const triangle of triangles) height = Math.max(height, sampleTriangle(triangle, east, north) ?? -Infinity);
    return height === -Infinity ? undefined : height;
  };
}

export function createMirrorLakeWestAccess() {
  const group = new Group();
  group.name = 'mirror-lake-west-station-access';
  const sections = [stationSections, iceSections] as const;
  const triangles = sections.flatMap(deckTriangles);
  const material = new MeshLambertMaterial({ color: '#becbd4' });
  function point(point: Point, delta = 0) {
    return [point[0], point[2] + delta, -point[1]];
  }
  const vertices = triangles.flatMap(([a, b, c]) => [
    ...point(a), ...point(b), ...point(c), ...point(c, -thickness), ...point(b, -thickness), ...point(a, -thickness),
  ]);
  function edge(a: Point, b: Point) {
    vertices.push(...point(a), ...point(a, -thickness), ...point(b),
      ...point(b), ...point(a, -thickness), ...point(b, -thickness));
  }
  for (const section of sections) {
    const [startRight, startLeft] = section[0];
    const [endRight, endLeft] = section.at(-1)!;
    edge(startLeft, startRight);
    edge(endRight, endLeft);
    section.slice(1).forEach(([right, left], index) => {
      edge(section[index][0], right);
      edge(left, section[index][1]);
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  group.add(new Mesh(geometry, material));
  let disposed = false;

  function surfacesAt(east: number, north: number) {
    // Every measured section is inside this window.
    if (disposed || !Number.isFinite(east) || !Number.isFinite(north) ||
        east < 22.49 || east > 36.53 || north < 168.35 || north > 182.42) return [];
    return triangles.flatMap(triangle => {
      const height = sampleTriangle(triangle, east, north);
      return height === undefined ? [] : [height];
    });
  }

  return {
    group, surfacesAt,
    supportAt(east: number, north: number, limit: number) {
      return Math.max(-Infinity, ...surfacesAt(east, north).filter(y => y <= limit + 1e-7));
    },
    ceilingAt(east: number, north: number, above: number) {
      return Math.min(Infinity, ...surfacesAt(east, north).map(y => y - thickness).filter(y => y >= above));
    },
    blocks(east: number, north: number, feet: number, bodyHeight: number, epsilon: number) {
      return surfacesAt(east, north).some(y => feet + epsilon < y && feet + bodyHeight - epsilon > y - thickness);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
