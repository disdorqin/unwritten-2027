import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, ShaderMaterial,
} from 'three';

type Point = readonly [x: number, y: number, z: number];
type PlanPoint = readonly [x: number, z: number];

const sides = 48;
const turn = Math.PI * 2;
const shaftRadius = 5;
const grass = ['#57764b', '#63824e', '#6b8b52', '#749254', '#799650', '#829954'].map(color => new Color(color));
const rock = ['#526567', '#657574', '#758079', '#797c70', '#888676', '#69796e'].map(color => new Color(color));
const paving = ['#aaad98', '#bcc0a6', '#a2a695', '#c3beaa', '#929b8d'].map(color => new Color(color));
const flowers = ['#f5d888', '#dfc8ce', '#e5e7b1', '#e6aebb'].map(color => new Color(color));

function scatter(index: number) {
  const value = Math.sin(index * 71.79 + .62) * 25477.18;
  return value - Math.floor(value);
}

function fieldColor(palette: readonly Color[], index: number) {
  return palette[Math.floor(scatter(index) * palette.length)]!;
}

function outline(angle: number) {
  const southShelf = Math.max(0, (Math.sin(angle) - .79) / .21) * 7.2;
  return 57.5 + 1.25 * Math.cos(angle * 3 + .65) + 1.05 * Math.cos(angle * 5 - .8) + southShelf;
}

function diskPoint(index: number, radius: number, y: number): Point {
  const angle = index * turn / sides;
  return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
}

function facets() {
  const vertices: number[] = [];
  const colors: number[] = [];
  function triangle(a: Point, b: Point, c: Point, color: Color) {
    vertices.push(...a, ...b, ...c);
    for (let vertex = 0; vertex < 3; vertex++) colors.push(color.r, color.g, color.b);
  }
  return {
    triangle,
    panel(a: Point, b: Point, c: Point, d: Point, color: Color) {
      triangle(a, b, c, color);
      triangle(a, c, d, color);
    },
    mesh(name: string, lit = true) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const options = { vertexColors: true, side: DoubleSide };
      const material = lit ? new MeshLambertMaterial(options) : new MeshBasicMaterial(options);
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      return mesh;
    },
  };
}

function paths() {
  const path = facets();
  function strip(route: readonly PlanPoint[], width: number, seed: number) {
    function bank(index: number, side: number, y: number): Point {
      const [x, z] = route[index]!;
      const [west, south] = route[Math.max(0, index - 1)]!;
      const [east, north] = route[Math.min(route.length - 1, index + 1)]!;
      const scale = width * side / (2 * Math.hypot(east - west, north - south));
      return [x + (north - south) * scale, y, z - (east - west) * scale];
    }
    for (let i = 1; i < route.length; i++) {
      const left = bank(i - 1, -1, .018), right = bank(i - 1, 1, .018);
      const nextLeft = bank(i, -1, .018), nextRight = bank(i, 1, .018);
      path.panel(left, right, nextRight, nextLeft, fieldColor(paving, seed + i));
      const [ax, az] = route[i - 1]!, [bx, bz] = route[i]!;
      const count = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.4);
      for (let j = 0; j < count; j++) {
        const t = (j + .5) / count;
        for (const side of [-1, 1]) {
          const p = side < 0 ? left : right, q = side < 0 ? nextLeft : nextRight;
          const x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
          const shift = scatter(seed + i * 23 + j * 13 + side) * .24;
          const length = .35 + shift;
          path.panel([x - length, .036, z - .11], [x + length, .036, z - .1],
            [x + length, .036, z + .11], [x - length, .036, z + .10], fieldColor(paving, seed + j + side));
        }
      }
    }
  }
  // Inlaid borders are flush with the walking datum. The south runway stays unobstructed.
  strip([[-14, 57], [-14, 45], [-14, 32], [-14, 19], [-13, 12], [-12, 3]], 5.3, 80);
  const plaza = Array.from({ length: 33 }, (_, index) => {
    const angle = index * turn / 32;
    return [Math.cos(angle) * 10.8, Math.sin(angle) * 10.8] as const;
  });
  strip(plaza, 2.8, 161);
  strip([[10.8, 0], [16, -1], [21, -5], [26, -11], [32, -16]], 3.4, 272);
  strip([[-11, -1], [-16, -5], [-23, -10], [-31, -18]], 3.6, 307);
  strip([[0, -10.8], [0, -17], [1, -25], [1, -33]], 3.7, 420);
  return path.mesh('spring-road-and-landing-lane');
}

function meadow() {
  const model = facets();
  const tuft = new Color('#7e9e51');
  for (let patch = 0; patch < 74; patch++) {
    const angle = scatter(patch * 31) * turn;
    const radius = 26 + scatter(patch * 31 + 1) * 25;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if ((z > 12 && Math.abs(x + 14) < 7) || (Math.abs(x) < 4 && z < 0)) continue;
    const color = fieldColor(flowers, patch);
    for (let stalk = 0; stalk < 6; stalk++) {
      const index = patch * 41 + stalk * 5;
      const dx = x + (scatter(index) - .5) * 2.1;
      const dz = z + (scatter(index + 1) - .5) * 2.1;
      const h = .16 + scatter(index + 2) * .26;
      model.triangle([dx - .055, .03, dz], [dx + .055, .03, dz], [dx + .035, h, dz], tuft);
      if (stalk % 2) continue;
      model.panel([dx - .12, h - .028, dz], [dx, h + .082, dz], [dx + .12, h, dz],
        [dx, h - .052, dz], color);
      model.panel([dx, h - .028, dz - .12], [dx, h + .082, dz], [dx, h, dz + .12],
        [dx, h - .052, dz], color);
    }
  }
  return model.mesh('spring-meadow-grass-and-flowers');
}

function waterfall() {
  const position: number[] = [], uv: number[] = [];
  const springs = facets();
  const mist = facets();
  const waterColor = new Color('#5eaea7');
  const vapor = new Color('#d4f2e8');
  for (const [index, breadth, depth] of [[4, 4.6, 37], [22, 6.3, 43], [36, 5.1, 39], [43, 2.8, 32]] as const) {
    const angle = index * turn / sides;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const radius = outline(angle);
    const sourcePoint = (setback: number, side: number): Point => {
      const bearing = angle + side * breadth / radius;
      const distance = outline(bearing) - setback;
      return [Math.cos(bearing) * distance, .013, Math.sin(bearing) * distance];
    };
    springs.panel(sourcePoint(7, -.20), sourcePoint(5.5, .26), sourcePoint(.35, .48), sourcePoint(.35, -.48), waterColor);
    const ribbonPoint = (u: number, t: number): Point => {
      const out = radius + .22 + 6.1 * t + Math.sin(t * 4) * .80;
      const side = u * breadth * (1 + .2 * Math.sin(t * 7) - .40 * t);
      return [cos * out - sin * side, -.20 - t * depth, sin * out + cos * side];
    };
    const columns = 9, rows = 21;
    for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
      const u = column / columns, v = row / rows, du = 1 / columns, dv = 1 / rows;
      for (const [x, y] of [[u, v], [u + du, v], [u + du, v + dv], [u, v], [u + du, v + dv], [u, v + dv]]) {
        position.push(...ribbonPoint(x! - .5, y!));
        uv.push(x!, y!);
      }
    }
    // Irregular fringes where the falling water breaks into the cloud band.
    for (let plume = 0; plume < 8; plume++) {
      const offset = (scatter(index * 17 + plume) - .5) * .85;
      const [x, y, z] = ribbonPoint(offset, .83 + .15 * scatter(index + plume * 7));
      const w = .7 + plume * .13;
      const h = .68 + scatter(plume + index) * .63;
      const points = (side: number, rise: number): Point => [x + side * sin, y + rise, z - side * cos];
      mist.panel(points(-w, -.17), points(0, h), points(w, 0), points(.13, -.7 * h), vapor);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const water = new ShaderMaterial({
    side: DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 ribbon;
      void main() {
        ribbon = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform float time;
      varying vec2 ribbon;
      void main() {
        float u = ribbon.x;
        float v = ribbon.y;
        float vein = sin(u * 95.0 + sin(v * 7.0 + u * 9.0)) * .5 + .5;
        float ripple = sin(v * 46.0 - time * 8.0 + u * 13.0) * .5 + .5;
        float edge = smoothstep(0.0, 0.11, min(u, 1.0 - u));
        float breakUp = 1.0 - smoothstep(.66, 1.0, v);
        vec3 color = mix(vec3(.22,.60,.63), vec3(.85,.99,.95), .28 + .48 * vein + .20 * ripple);
        gl_FragColor = vec4(color, edge * breakUp * (.47 + .39 * vein + .10 * ripple));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const curtains = new Mesh(geometry, water);
  curtains.name = 'four-water-curtains';
  const spray = mist.mesh('waterfall-cloud-fringe', false);
  spray.material.transparent = true;
  spray.material.opacity = .22;
  spray.material.depthWrite = false;
  spray.material.forceSinglePass = true;
  return {
    curtains, spray, springs: springs.mesh('shallow-spring-channels', false),
    update(seconds: number) {
      water.uniforms.time!.value = seconds;
      spray.position.set(Math.sin(seconds * .43) * .46, Math.sin(seconds * .75) * .50, 0);
    },
  };
}

export function buildSkyCityIsland() {
  const group = new Group();
  group.name = 'inverted-spring-island';
  const turf = facets(), stone = facets();
  const lip = Array.from({ length: sides + 1 }, (_, i) => diskPoint(i, outline(i * turn / sides), 0));
  const shaft = (i: number, y: number) => diskPoint(i, shaftRadius, y);
  const rings = [shaftRadius, 13, 21, 31, 42, 50];
  const cliff = [[1, -1.4], [.96, -5.5], [.87, -12], [.73, -17], [.60, -24.5], [.41, -32], [.26, -38], [.13, -43]];
  const cliffPoint = (ring: number, i: number) => {
    const [scale, y] = cliff[ring]!;
    const angle = i * turn / sides;
    const variation = ring && Math.sin(angle * (5 + ring) + ring * .65) * 1.5;
    return diskPoint(i, outline(angle) * scale! + variation, y! + (ring > 2 ? Math.sin(angle * 8) * 1.5 : 0));
  };

  const shaftWall = new Color('#394f51');
  const roofPoint = (level: number, index: number) => {
    const radius = rings[level];
    return radius === undefined ? lip[index]! : diskPoint(index,
      radius + (level ? Math.sin(index * turn / sides * 6 + level) * 1.55 : 0), 0);
  };
  for (let i = 0; i < sides; i++) {
    for (let ring = 0; ring < rings.length; ring++) {
      const a = roofPoint(ring, i), b = roofPoint(ring, i + 1);
      const c = roofPoint(ring + 1, i + 1), d = roofPoint(ring + 1, i);
      turf.triangle(a, b, c, fieldColor(grass, i * 19 + ring * 13));
      turf.triangle(a, c, d, fieldColor(grass, i * 19 + ring * 13 + 3));
    }
    stone.panel(lip[i]!, lip[i + 1]!, cliffPoint(0, i + 1), cliffPoint(0, i), fieldColor(grass, i + 38));
    const aperture = i >= 10 && i < 14;
    for (let ring = 0; ring + 1 < cliff.length; ring++) {
      if (aperture && ring < 2) continue;
      const a = cliffPoint(ring, i), b = cliffPoint(ring, i + 1);
      const c = cliffPoint(ring + 1, i + 1), d = cliffPoint(ring + 1, i);
      stone.triangle(a, b, c, fieldColor(rock, 617 + i * 17 + ring * 11));
      stone.triangle(a, c, d, fieldColor(rock, 617 + i * 17 + ring * 11 + 2));
    }
    if (aperture) {
      stone.panel(cliffPoint(0, i), cliffPoint(0, i + 1), shaft(i + 1, -.85), shaft(i, -.85), shaftWall);
      stone.panel(cliffPoint(2, i), cliffPoint(2, i + 1), shaft(i + 1, -7.7), shaft(i, -7.7), shaftWall);
      stone.panel(shaft(i, 0), shaft(i + 1, 0), shaft(i + 1, -.85), shaft(i, -.85), shaftWall);
    } else stone.panel(shaft(i, 0), shaft(i + 1, 0), shaft(i + 1, -7.7), shaft(i, -7.7), shaftWall);
    stone.triangle(cliffPoint(cliff.length - 1, i), cliffPoint(cliff.length - 1, i + 1), [-1.3, -47.6, .85],
      fieldColor(rock, i + 97));
  }
  for (const edge of [10, 14]) {
    stone.panel(cliffPoint(0, edge), cliffPoint(2, edge), shaft(edge, -7.7), shaft(edge, -.85), new Color('#43585b'));
  }

  const falls = waterfall();
  group.add(stone.mesh('layered-inverted-rock-and-core-aperture'), turf.mesh('annular-spring-turf'),
    paths(), meadow(), falls.springs, falls.curtains, falls.spray);

  const edges = lip.slice(0, -1).map(([x, , z], index) => {
    const [endX, , endZ] = lip[index + 1]!;
    const dx = endX - x, dz = endZ - z;
    return { x, z, endZ, dx, dz, lengthSquared: dx * dx + dz * dz };
  });

  return {
    group,
    update(seconds: number) { if (Number.isFinite(seconds)) falls.update(seconds); },
    supports(x: number, z: number, radius = .27) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0 ||
          Math.hypot(x, z) < shaftRadius + radius) return false;
      let inside = false;
      const margin = radius * radius;
      for (const edge of edges) {
        if ((edge.z > z) !== (edge.endZ > z) && x < edge.x + (z - edge.z) * edge.dx / edge.dz) inside = !inside;
        const dx = x - edge.x, dz = z - edge.z;
        const t = Math.max(0, Math.min(1, (dx * edge.dx + dz * edge.dz) / edge.lengthSquared));
        const east = dx - t * edge.dx, north = dz - t * edge.dz;
        if (east * east + north * north < margin) return false;
      }
      return inside;
    },
  };
}
