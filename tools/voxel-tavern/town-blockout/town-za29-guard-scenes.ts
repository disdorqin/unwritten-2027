import {
  BoxGeometry, BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, Group,
  InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, Object3D, PointLight,
} from 'three';
import { voxelPersonParts, type VoxelPersonPart } from './town-voxel-person';

type PlanPoint = readonly [east: number, north: number];
type Point = Readonly<{ east: number; north: number; height: number }>;
type GroundAt = (east: number, north: number) => number | undefined;
export type Za29GuardPostKind = 'crater' | 'mountain';
export type Za29GuardDuty = Readonly<{ guardPresent: boolean; showNightSigns: boolean }>;

const palette = {
  lime: '#8a8378', ochre: '#a98a56', wood: '#5d4630', moss: '#44503c', blue: '#2c3648',
  snow: '#e8ecf0', fire: '#e08a3c', crystal: '#7fd4c8', rust: '#8a4a34',
} as const;

export const za29GuardSurvey = {
  crater: {
    name: '石九斤', role: '矿工头', guard: [-68.4, 161.1], approach: [-68.4, 159], emptyPost: [-68.5, 161.9],
    // The B-01 spiral peels southwest immediately beyond the surveyed lip.
    trail: [
      [-67.9, 159.2], [-68.8, 159.07], [-69.7, 159], [-70.6, 159], [-71.45, 158.99],
      [-71.96, 158.27], [-72.42, 157.51], [-72.88, 156.78], [-73.35, 156.06],
      [-73.85, 155.32], [-74.34, 154.59], [-74.85, 153.89], [-75.36, 153.21],
    ],
  },
  mountain: {
    name: '赵满仓', role: '樵夫', guard: [302.35, 665.1], approach: [300, 664.95], emptyPost: [303.2, 664.85],
    // Start on the apron where the player can see the post, then lead through the N666 aperture.
    trail: [
      [300.67, 664.55], [300.71, 665.7], [300.75, 666.85], [300.79, 668],
      [300.83, 669.15], [300.87, 670.3], [300.91, 671.45], [300.95, 672.6],
      [300.99, 673.75], [301.03, 674.9], [301.09, 676.05], [301.39, 677.2], [301.65, 678.35],
    ],
  },
} as const;

const costumes = {
  crater: {
    colors: [palette.ochre, palette.wood, palette.blue, palette.lime, palette.blue, palette.rust, palette.fire, palette.rust],
    extra: [
      [[0, 1.9, .005], [.54, .15, .49], 5],
      [[0, 1.87, .276], [.15, .125, .1], 6],
      [[-.16, 1.15, .189], [.09, .51, .027], 3],
      [[.16, 1.15, .189], [.09, .51, .027], 3],
      [[0, 1.18, .19], [.25, .18, .034], 3],
    ],
  },
  mountain: {
    colors: [palette.ochre, palette.wood, palette.moss, palette.rust, palette.wood, palette.ochre, palette.lime, palette.rust],
    extra: [
      [[0, 1.91, 0], [.47, .1, .42], 2],
      [[-.2, 1.76, -.19], [.12, .21, .11], 2],
      [[0, 1.47, .21], [.45, .11, .085], 3],
      [[-.06, 1.31, .224], [.11, .25, .07], 3],
      [[.31, 1.13, -.22], [.24, .49, .22], 7],
    ],
  },
} as const satisfies Record<Za29GuardPostKind, { colors: readonly string[]; extra: readonly VoxelPersonPart[] }>;

type Box = Readonly<{ at: readonly [number, number, number]; size: readonly [number, number, number]; color: string }>;

function voxelGrain() {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const grain = 234 + (i * 31 + Math.floor(i / size) * 17) % 22;
    data.set([grain, grain, grain, 255], i * 4);
  }
  const texture = new DataTexture(data, size, size);
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeBoxBatch(name: string, geometry: BoxGeometry, material: MeshStandardMaterial, boxes: readonly Box[]) {
  const mesh = new InstancedMesh(geometry, material, boxes.length);
  mesh.name = name;
  const pose = new Object3D();
  const color = new Color();
  for (const [i, { at, size, color: tint }] of boxes.entries()) {
    pose.position.set(...at);
    pose.scale.set(...size);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, color.set(tint));
  }
  return mesh;
}

function stageBoxes(kind: Za29GuardPostKind): Box[] {
  const { wood, lime, ochre, blue, rust } = palette;
  const [body, lid] = kind === 'crater' ? [blue, lime] : [wood, ochre];
  return [
    { at: [0, .16, 0], size: [.58, .32, .48], color: body },
    { at: [0, .34, 0], size: [.62, .08, .51], color: lid },
    { at: [-.19, .2, .243], size: [.06, .25, .018], color: wood },
    { at: [.19, .2, .243], size: [.06, .25, .018], color: wood },
    { at: [0, .26, .254], size: [.11, .085, .025], color: rust },
    { at: [0, .1, -.48], size: [.38, .2, .4], color: lime },
    { at: [0, .245, -.48], size: [.42, .09, .44], color: rust },
    { at: [0, .294, -.48], size: [.29, .012, .3], color: blue },
  ];
}

function footprintPoints(trail: readonly PlanPoint[], ground: (east: number, north: number) => Point) {
  return trail.map(([east, north], i) => {
    const from = trail[Math.max(0, i - 1)]!;
    const to = trail[Math.min(trail.length - 1, i + 1)]!;
    const heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
    const side = i % 2 ? .12 : -.12;
    return { ...ground(east + Math.cos(heading) * side, north - Math.sin(heading) * side), heading };
  });
}

function footprintMesh(
  name: string, points: readonly (Point & { heading: number })[], surface: (east: number, north: number) => number,
  material: MeshStandardMaterial, tone: string, detail: string,
) {
  const vertices: number[] = [];
  const colors: number[] = [];
  // Pixel-edged heel and forefoot. Each corner samples the official walk surface.
  const sole = [
    [-.064, -.18, .064, -.035], [-.058, -.035, .058, .035], [-.083, .035, .083, .14], [-.058, .14, .058, .184],
  ] as const;
  const color = new Color();
  for (const { east, north, heading } of points) {
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    for (const [i, [left, back, right, front]] of sole.entries()) {
      for (const [x, z] of [[left, back], [left, front], [right, back], [right, back], [left, front], [right, front]] as const) {
        const e = east + x * c + z * s;
        const n = north - x * s + z * c;
        vertices.push(e, surface(e, n) + .024, -n);
        colors.push(...color.set(i === 1 || i === 3 ? detail : tone).toArray());
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

/** Mount under an untransformed ZA-22 world owner and feed duty from the NPC host. */
export function mountZa29GuardPost(owner: Object3D, kind: Za29GuardPostKind, surfaceAt: GroundAt) {
  const survey = za29GuardSurvey[kind];
  function ground(east: number, north: number) {
    const height = surfaceAt(east, north);
    if (height === undefined || !Number.isFinite(height)) {
      throw new RangeError(`ZA-29 ${kind} has no surface at E${east}/N${north}`);
    }
    return { east, north, height };
  }

  const guard = ground(survey.guard[0], survey.guard[1]);
  const approach = ground(survey.approach[0], survey.approach[1]);
  const emptyPost = ground(survey.emptyPost[0], survey.emptyPost[1]);
  const footprints = footprintPoints(survey.trail, ground);
  const heading = Math.atan2(approach.east - guard.east, guard.north - approach.north);
  const anchors = { guard: { ...guard, heading }, approach, emptyPost, footprints };
  const group = new Group();
  const prefix = `za29-${kind}`;
  group.name = `${prefix}-guard-post`;

  const geometry = new BoxGeometry();
  const grain = voxelGrain();
  const material = new MeshStandardMaterial({ map: grain, roughness: 1 });
  const ghostMaterial = new MeshStandardMaterial({
    vertexColors: true, roughness: 1, side: DoubleSide, emissive: palette.crystal, emissiveIntensity: .11,
  });
  const tracksMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide });
  const { colors, extra } = costumes[kind];
  const actor = makeBoxBatch(survey.name, geometry, material, [...voxelPersonParts, ...extra].map(
    ([at, size, tint]) => ({ at, size, color: colors[tint]! }),
  ));
  actor.position.set(guard.east, guard.height, -guard.north);
  actor.rotation.y = heading;
  group.add(actor);

  const stage = makeBoxBatch(`${prefix}-staging`, geometry, material, stageBoxes(kind));
  stage.position.set(emptyPost.east, emptyPost.height, -emptyPost.north);
  group.add(stage);

  const ember = makeBoxBatch(`${prefix}-ember`, geometry, material, [
    { at: [-.075, .302, -.46], size: [.084, .033, .105], color: palette.fire },
    { at: [.064, .303, -.53], size: [.082, .038, .065], color: palette.fire },
  ]);
  ember.position.copy(stage.position);
  const light = new PointLight(palette.fire, 6, 3.5, 2);
  light.position.set(0, .54, -.48);
  ember.add(light);
  group.add(ember);

  const emptyTraces = footprintMesh(`${prefix}-empty-post-scuffs`, [-.14, .14].map(east => ({
    ...ground(guard.east + east, guard.north), heading: Math.PI - heading,
  })), (east, north) => ground(east, north).height, tracksMaterial, palette.lime, palette.blue);
  const soulTraces = footprintMesh(`${prefix}-soul-footprints`, footprints,
    (east, north) => ground(east, north).height, ghostMaterial, palette.crystal, palette.blue);
  group.add(emptyTraces, soulTraces);

  function setDuty({ guardPresent, showNightSigns }: Za29GuardDuty) {
    actor.visible = ember.visible = guardPresent;
    emptyTraces.visible = soulTraces.visible = showNightSigns;
  }

  setDuty({ guardPresent: false, showNightSigns: false });
  owner.add(group);

  return {
    group, anchors, setDuty,
    dispose() {
      group.removeFromParent();
      for (const mesh of [actor, stage, ember]) mesh.dispose();
      for (const mesh of [emptyTraces, soulTraces]) mesh.geometry.dispose();
      for (const resource of [geometry, grain, material, tracksMaterial, ghostMaterial]) resource.dispose();
    },
  };
}
