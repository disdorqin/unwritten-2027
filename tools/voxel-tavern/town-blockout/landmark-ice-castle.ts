import {
  BoxGeometry, BufferAttribute, Color, CylinderGeometry, Group, Mesh, MeshLambertMaterial,
  OctahedronGeometry, PlaneGeometry, type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box, Ramp } from './landmark-kit';
import { addLandmarkNameplate, useLandmarkEmissionMask } from './landmark-label';
import {
  addIceCastleCarvings, addIceCastleChandelier, addIceCastleDeer, createIceCastleRefinementRuntime, iceCastleExhibits,
} from './ice-castle-refinement';
import { addOpaqueMuseumLabels } from './museum-label-atlas';
import { createMuseumLabelCanvas } from './museum-label-canvas';
import { createIcePalaceRace, icePalaceBalconyRace } from './ice-palace-race';

const palette = {
  foundation: '#31546f',
  deepIce: '#345876',
  blueIce: '#5695be',
  ice: '#77b4d2',
  paleIce: '#a9d8e9',
  snow: '#e1edf5',
  recess: '#193450',
  pane: '#2887a7',
  glint: '#77def0',
  brass: '#998575',
  lantern: '#ffd29e',
} as const;
type Finish = keyof typeof palette;
type IceDetail = 'frame' | 'crown' | 'core';

export const iceThrone = {
  stand: [17.98, .57, -4.92],
  seat: [18.96, 1.07 + .98, -4.92],
  photo: [17.46, .35, -6.15],
  hallDoor: [7.2, 2.15, 0],
} as const;

function useCastleEmissionColor(material: MeshLambertMaterial, crownGlow: { value: number }, masked = false) {
  if (masked) useLandmarkEmissionMask(material);
  const applyMask = masked ? material.onBeforeCompile : undefined;
  const varying = 'varying float vCastleCrown;';
  material.onBeforeCompile = (shader, renderer) => {
    applyMask?.call(material, shader, renderer);
    shader.uniforms.castleCrownGlow = crownGlow;
    shader.vertexShader = 'attribute float castleCrown;\n' + varying + '\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCastleCrown = castleCrown;');
    shader.fragmentShader = 'uniform float castleCrownGlow;\n' + varying + '\n'
      + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        totalEmissiveRadiance *= vColor.rgb * mix(1.0, castleCrownGlow, vCastleCrown);
      `);
  };
  material.customProgramCacheKey = () => masked ? 'castle-crown-emission-mask' : 'castle-crown-emission';
}

function useCastleIceFresnel(material: MeshLambertMaterial, variant: 'masonry' | 'emission' | 'emission-mask') {
  const compile = material.onBeforeCompile;
  const pale = new Color(palette.paleIce).toArray().map(value => value.toFixed(6)).join(', ');
  const varying = 'varying float vCastleIce;';
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = 'attribute float castleIce;\n' + varying + '\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCastleIce = castleIce;');
    shader.fragmentShader = varying + '\n' + shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      float iceEdge = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      float iceEdgeSquared = iceEdge * iceEdge;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${pale}), 0.65 * vCastleIce * iceEdgeSquared * iceEdgeSquared);
    `);
  };
  material.customProgramCacheKey = () => 'castle-ice-fresnel-' + variant;
}

// Detail is opaque and split into opaque masonry and luminous inlays per wing.
// Only the walkable surfaces and walls carry collision.
function castleModel() {
  const group = new Group();
  const colliders: Box[] = [];
  const floors: Box[] = [];
  const ramps: Ramp[] = [];
  const opaque: BufferGeometry[] = [];
  const luminous: BufferGeometry[] = [];
  const cores: BufferGeometry[] = [];
  const crownGlow = { value: 1 };
  const coreMaterial = new MeshLambertMaterial({
    vertexColors: true, transparent: true, opacity: .78, depthWrite: false,
    emissive: '#a9d8e9', emissiveIntensity: .07,
  });
  const colors = new Map(Object.entries(palette).map(([key, rgb]) => [key, new Color(rgb)]));
  const mason = new MeshLambertMaterial({ vertexColors: true });
  useCastleIceFresnel(mason, 'masonry');
  const lanterns = new MeshLambertMaterial({
    vertexColors: true, emissive: '#ffffff', emissiveIntensity: .4,
  });
  useCastleEmissionColor(lanterns, crownGlow);
  useCastleIceFresnel(lanterns, 'emission');

  function add(shape: BufferGeometry, x: number, y: number, z: number, finish: Finish, yaw: number, detail?: IceDetail) {
    const geometry = shape.index ? shape.toNonIndexed() : shape;
    if (geometry !== shape) shape.dispose();
    geometry.rotateY(yaw);
    geometry.translate(x, y, z);

    const rgb = colors.get(finish)!;
    const values = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < values.length; i += 3) rgb.toArray(values, i);
    geometry.setAttribute('color', new BufferAttribute(values, 3));
    const isIce = finish === 'deepIce' || finish === 'blueIce' || finish === 'ice' || finish === 'paleIce';
    const iceMask = new Uint8Array(geometry.getAttribute('position').count).fill(isIce ? 1 : 0);
    geometry.setAttribute('castleIce', new BufferAttribute(iceMask, 1));
    if (detail === 'core') {
      cores.push(geometry);
      return;
    }
    const crownMask = new Uint8Array(geometry.getAttribute('position').count).fill(detail === 'crown' ? 1 : 0);
    geometry.setAttribute('castleCrown', new BufferAttribute(crownMask, 1));
    (finish === 'lantern' || finish === 'glint' || detail === 'frame' || detail === 'crown' ? luminous : opaque).push(geometry);
  }

  function block(x: number, y: number, z: number, w: number, h: number, d: number, finish: Finish, yaw = 0) {
    add(new BoxGeometry(w, h, d), x, y, z, finish, yaw);
  }

  function crystal(x: number, y: number, z: number, w: number, h: number, d: number, finish: Finish,
    yaw = 0, detail?: IceDetail) {
    const shape = new OctahedronGeometry(1);
    shape.scale(w / 2, h / 2, d / 2);
    add(shape, x, y, z, finish, yaw, detail);
  }

  function bounds(x: number, bottom: number, z: number, w: number, h: number, d: number): Box {
    return { min: [x - w / 2, bottom, z - d / 2], max: [x + w / 2, bottom + h, z + d / 2] };
  }

  function solid(x: number, bottom: number, z: number, w: number, h: number, d: number, finish: Finish) {
    block(x, bottom + h / 2, z, w, h, d, finish);
    colliders.push(bounds(x, bottom, z, w, h, d));
  }

  function floor(x: number, top: number, z: number, w: number, d: number, depth: number, finish: Finish) {
    block(x, top - depth / 2, z, w, depth, d, finish);
    floors.push(bounds(x, top - depth, z, w, depth, d));
  }

  function flush(wing: string, combineEmission = false) {
    if (combineEmission) {
      const pieces = [...opaque, ...luminous];
      for (const [index, piece] of pieces.entries()) {
        const value = index < opaque.length ? 0 : 1;
        piece.setAttribute('landmarkEmission',
          new BufferAttribute(new Float32Array(piece.getAttribute('position').count).fill(value), 1));
      }
      const geometry = mergeGeometries(pieces)!;
      const material = lanterns.clone();
      useCastleEmissionColor(material, crownGlow, true);
      useCastleIceFresnel(material, 'emission-mask');
      const mesh = new Mesh(geometry, material);
      mesh.name = wing;
      group.add(mesh);
      for (const item of pieces) item.dispose();
      opaque.length = luminous.length = 0;
      return;
    }
    for (const [pieces, material] of [[opaque, mason], [luminous, lanterns]] as const) {
      if (!pieces.length) continue;
      const geometry = mergeGeometries(pieces)!;
      for (const piece of pieces) piece.dispose();
      pieces.length = 0;
      const mesh = new Mesh(geometry, material);
      mesh.name = wing;
      group.add(mesh);
    }
  }

  function finish() {
    group.name = 'I01 · 冰雪城堡';
    const coresMesh = new Mesh(mergeGeometries(cores)!, coreMaterial);
    coresMesh.name = '庭院与王座晶簇内芯';
    group.add(coresMesh);
    for (const piece of cores) piece.dispose();
    group.userData = { colliders, floors, ramps, iceRefinement: createIceCastleRefinementRuntime(crownGlow) };
    return group;
  }

  return { block, crystal, solid, floor, flush, finish, add, bounds, colliders };
}

export function buildIceCastle() {
  const parts = castleModel();
  const { block, crystal, solid, floor, flush, finish, add, bounds, colliders } = parts;

  function raceArrow(x: number, feet: number, z: number, yaw: number, scale = 1) {
    const segment = (dx: number, dz: number, width: number, angle: number) => {
      const px = x + scale * (Math.cos(yaw) * dx + Math.sin(yaw) * dz);
      const pz = z + scale * (-Math.sin(yaw) * dx + Math.cos(yaw) * dz);
      block(px, feet + .029, pz, width * scale, .014, .15 * scale, 'glint', yaw + angle);
    };
    segment(-.11, 0, .83, 0);
    for (const side of [-1, 1]) segment(.24, side * .125, .42, side * Math.PI / 4);
  }

  // Wall-local coordinates simplify the same leaded glass pattern on all four faces.
  function lancet(x: number, base: number, z: number, width: number, height: number, yaw: number) {
    function pane(offset: number, y: number, projection: number, w: number, h: number, finish: Finish, detail?: IceDetail) {
      const depth = projection + .04;
      const px = x + Math.cos(yaw) * offset + Math.sin(yaw) * depth;
      const pz = z - Math.sin(yaw) * offset + Math.cos(yaw) * depth;
      add(new PlaneGeometry(w, h), px, base + y, pz, finish, yaw, detail);
    }
    pane(0, height * .37, .01, width + .26, height * .74 + .24, 'paleIce', 'frame');
    pane(0, height * .38, .06, width, height * .76, 'recess');
    pane(0, height * .43, .11, width * .79, height * .64, 'pane');
    pane(0, height * .74, .06, width * .8, height * .14, 'paleIce');
    pane(0, height * .84, .01, width * .45, height * .14, 'snow');
    pane(0, height * .83, .11, width * .24, height * .18, 'glint');
    pane(-width * .23, height * .43, .16, width * .13, height * .57, 'glint');
    pane(0, height * .45, .19, .09, height * .58, 'paleIce');
    pane(0, height * .43, .19, width * .8, .09, 'paleIce');
    pane(0, .03, .17, width + .42, .18, 'snow');
  }

  function lamp(x: number, base: number, z: number, wallMounted = false) {
    if (wallMounted) {
      block(x + .17, base, z, .70, .16, .72, 'blueIce');
      block(x, base + .185, z, .64, .37, .64, 'foundation');
      block(x, base + .92, z, .18, 1.1, .18, 'deepIce');
    } else {
      solid(x, base, z, .64, .37, .64, 'foundation');
      solid(x, base + .37, z, .18, 1.1, .18, 'deepIce');
    }
    block(x, base + 1.5, z, .56, .18, .56, 'brass');
    block(x, base + 1.72, z, .34, .3, .34, 'lantern');
    block(x, base + 1.9, z, .48, .15, .48, 'snow');
  }

  function icicleRow(x0: number, z0: number, x1: number, z1: number, eave: number, phase: number) {
    const lengths = [.36, .77, .48, .9, .53, .67, .41];
    const count = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / .64));
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count;
      const index = (i + phase) % lengths.length;
      const height = lengths[index];
      const width = .12 + height * .18;
      crystal(x0 + (x1 - x0) * t, eave - height / 2, z0 + (z1 - z0) * t,
        width, height, width, index % 3 === 2 ? 'ice' : 'paleIce', index * .29);
    }
  }

  function turret(x: number, z: number, size: number, shoulder: number, crown: number) {
    solid(x, .12, z, size + .45, .63, size + .45, 'foundation');
    solid(x, .73, z, size, shoulder - .73, size, 'blueIce');

    for (const sign of [-1, 1]) {
      for (const side of [-1, 1]) {
        block(x + sign * (size / 2 - .13), shoulder * .47, z + side * (size / 2 - .13),
          .54, shoulder * .84, .54, 'paleIce');
        block(x + sign * (size / 2 - .32), shoulder * .57, z + side * (size / 2 - .32),
          .8, shoulder * .52, .25, 'ice');
      }
      const yaw = sign * Math.PI / 2;
      lancet(x + sign * (size / 2 + .02), shoulder * .48, z, .85, shoulder * .34, yaw);
      const outward = sign < 0 ? Math.PI : 0;
      lancet(x, shoulder * .44, z + sign * (size / 2 + .02), 1.03, shoulder * .37, outward);
    }

    for (const [fraction, finish] of [[.23, 'paleIce'], [.3, 'ice'], [.46, 'ice'], [.57, 'paleIce'],
      [.71, 'ice'], [.81, 'paleIce'], [.94, 'ice']] as const) {
      block(x, shoulder * fraction, z, size + .28, .18, size + .28, finish);
    }
    block(x, shoulder, z, size + .68, .41, size + .68, 'snow');
    const facade = size / 2 + .22;
    const span = size / 2 - .23;
    for (const side of [-1, 1]) {
      const phase = side < 0 ? 1 : 3;
      icicleRow(x - span, z + side * facade, x + span, z + side * facade, shoulder - .15, phase);
      icicleRow(x + side * facade, z - span, x + side * facade, z + span, shoulder - .15, phase + 1);
    }
    const roof = new CylinderGeometry(0, size * Math.SQRT1_2 + .28, crown, 4, 1);
    add(roof, x, shoulder + crown / 2, z, 'deepIce', Math.PI / 4);
    for (const level of [.17, .4, .66]) {
      const width = (size + .4) * (1 - level);
      block(x, shoulder + level * crown, z, width + .12, .15, width + .12, 'ice');
    }
    const tip = shoulder + crown;
    const spikeCount = size > 6 ? 5 : 4;
    const ringRadius = size > 6 ? .57 : .44;
    block(x, tip + .05, z, ringRadius * 2.1, .14, ringRadius * 2.1, 'blueIce', Math.PI / 4);
    for (let spike = 0; spike < spikeCount; spike++) {
      const angle = 2 * Math.PI * spike / spikeCount;
      const height = (size > 6 ? .53 : .40) + .071 * (spike % 3);
      crystal(x + ringRadius * Math.cos(angle), tip + height / 2, z + ringRadius * Math.sin(angle),
        .31, height, .31, spike % 2 ? 'ice' : 'paleIce', angle);
    }
    crystal(x, tip + .41, z, .61, 1.05, .61, 'glint', 0, 'crown');
  }

  // The public entrance matches the existing path at the exact west edge of the pad.
  floor(-19.3, .12, 0, 9.4, 4.8, .22, 'ice');
  for (const side of [-1, 1]) {
    const z = side * 4.3;
    floor(-19.25, .12, z, 9.3, 3.8, .22, 'foundation');
    for (const x of [-22.8, -17.5, -11.2]) lamp(x, .12, side * 2.9);
    floor(-21, .12, side * 8.02, 5.5, 3.64, .2, 'foundation');
    solid(-20.7, .12, side * 7.6, 2.9, 10.1, 8.8, 'blueIce');
    solid(-20.7, .12, side * 3.07, 3.2, 4.65, .94, 'ice');
    for (const [height, offset, width] of [[3.84, 2.72, 1.3], [4.26, 2.28, 1.4], [4.68, 1.81, 1.5]]) {
      block(-20.7, height, side * offset, 3.18, .54, width, 'paleIce');
    }
    for (const zOffset of [4.18, 6.85, 9.5]) lancet(-22.17, 3.06, side * zOffset, .95, 3.12, -Math.PI / 2);
    turret(-17.9, side * 13.0, 7.25, 14.2, 6.4);
  }
  solid(-20.7, 4.87, 0, 3, 5.48, 7.1, 'blueIce');
  block(-20.7, 5.02, 0, 3.28, .31, 3.72, 'snow');
  icicleRow(-22.24, -1.72, -22.24, 1.72, 4.93, 2);
  block(-20.7, 10.39, 0, 3.49, .46, 22.7, 'snow');
  for (const z of [-9.8, -7.1, -4.4, -1.7, 1.7, 4.4, 7.1, 9.8]) {
    block(-22.08, 10.98, z, .86, .88, 1.23, 'ice');
    block(-22.08, 11.43, z, 1, .18, 1.36, 'snow');
  }
  crystal(-22.28, 8.72, 0, .56, 2.32, 2.5, 'paleIce');
  crystal(-22.61, 8.72, 0, .47, 1.48, 1.56, 'pane');
  crystal(-22.88, 8.72, 0, .21, .78, .78, 'glint', 0, 'crown');
  block(-22.28, 7.15, 0, .19, 1.53, 1.97, 'deepIce');
  const snowflake = [
    '.....#.....', '.#..###..#.', '..#..#..#..', '...#.#.#...', '....#+#....',
    '...#.#.#...', '..#..#..#..', '.#..###..#.', '.....#.....',
  ];
  snowflake.forEach((row, v) => [...row].forEach((pixel, u) => {
    if (pixel === '.') return;
    block(-22.407, 7.15 + (4 - v) * .158, (u - 5) * .170, .125, .164, .18,
      pixel === '+' ? 'glint' : 'paleIce');
  }));
  block(-22.28, 5.91, 0, .26, .87, 3.24, 'deepIce');
  const [startX, startY, startZ] = icePalaceBalconyRace.start;
  block(startX, startY + .011, startZ, 1.6, .021, 1.6, 'paleIce');
  block(startX, startY + .023, startZ, 1.42, .008, 1.42, 'deepIce');
  raceArrow(startX, startY, startZ, 0);
  flush('西门与双塔', true);

  floor(3.3, .12, 0, 35.8, 33.8, .22, 'foundation');
  for (let x = -13; x <= 5; x += 2.25) {
    block(x, .132, 0, 1.83, .025, 1.83, 'ice', Math.PI / 4);
  }
  for (const side of [-1, 1]) {
    block(-3.4, .13, side * 2.37, 23.8, .024, .15, 'paleIce');
    const z = side * 17.35;
    solid(.2, .12, z, 36.5, 4.9, .87, 'blueIce');
    block(.25, .72, z, 36.55, .35, 1.12, 'deepIce');
    block(.25, 4.97, z, 36.8, .29, 1.24, 'snow');
    const phase = side < 0 ? 0 : 2;
    icicleRow(-13.7, z + side * .51, 15.6, z + side * .51, 4.86, phase);
    icicleRow(-13.2, z - side * .51, 7.8, z - side * .51, 4.86, phase + 2);
    for (let x = -13.5; x < 18; x += 2.4) {
      block(x, 5.36, z, 1.37, .63, .95, 'ice');
      block(x, 5.72, z, 1.53, .18, 1.1, 'snow');
      block(x - .36, 2.63, z - side * .48, .54, 4.84, .32, 'paleIce');
      if (x < 7) lancet(x + .63, 1.14, z - side * .47, .65, 2.83, side > 0 ? Math.PI : 0);
    }
    block(4.8, .132, side * 15.65, 30.8, .025, .18, 'paleIce');
    for (const x of [-11, -.4, 9.5]) lamp(x, .12, side * 14.2);

    // Crystal beds flank the straight route through the courtyard.
    const courtZ = side * 7.65;
    solid(-5.8, .12, courtZ, 4.65, .37, 3.02, 'deepIce');
    solid(-5.8, .49, courtZ, 4.22, .24, 2.58, 'snow');
    const shards = [[-.94, -.19, 1.35], [-.2, .3, 2.24], [.64, -.37, 1.62], [1.14, .32, .92]];
    for (const [dx, dz, height] of shards) {
      crystal(-5.8 + dx, .68 + height / 2, courtZ + dz, .77, height, .65, 'ice', dx);
      crystal(-6.03 + dx, .82 + height / 2, courtZ + dz - side * .10,
        .41, height * .71, .47, 'paleIce', dx, 'core');
    }
    colliders.push(bounds(-5.8, .73, courtZ, 3.1, 1.7, 1.65));
  }
  flush('庭院与围墙');

  // A clear central portal continues into the hall below its stepped roof.
  floor(13.75, .15, 0, 14.9, 19.4, .04, 'ice');
  floor(6.65, .17, 0, 2.3, 5.5, .06, 'paleIce');
  solid(20.78, .12, 0, 1, 11.48, 19.5, 'blueIce');
  for (const side of [-1, 1]) {
    solid(13.95, .12, side * 9.3, 14.65, 11.48, .88, 'blueIce');
    block(13.95, 11.11, side * 9.75, 14.75, .20, .43, 'paleIce');
    block(13.95, 10.85, side * 9.75, 14.75, .13, .31, 'ice');
    block(13.95, 9.62, side * 9.73, 14.70, .16, .15, 'paleIce');
    block(13.95, 3.96, side * 9.73, 14.70, .14, .14, 'ice');
    for (const x of [9.92, 15.12, 20.05]) {
      // The two east braces flatten into pilasters along the passage beside the corner tower.
      const projection = x > 14.9 ? .34 : 1;
      solid(x, .12, side * (9.64 + .35 * projection), .96, .58, .89 * projection, 'deepIce');
      for (const [level, width, depth, color] of [[.7, .70, 1.01, 'blueIce'], [2.18, .62, .86, 'blueIce'],
        [3.66, .51, .71, 'ice'], [5.14, .40, .58, 'ice']] as const) {
        block(x, level + .76, side * (9.62 + depth * .21 * projection), width * projection,
          1.55, depth * projection, color, Math.PI / 4);
      }
      block(x, 6.67, side * (9.64 + .10 * projection), .60, .18, .57 * projection, 'snow');
      block(x, .73, side * (9.64 + .40 * projection), .96, .13, .81 * projection, 'ice');
    }
    solid(7.2, .12, side * 6.1, .86, 11.48, 6.82, 'blueIce');
    block(7.2, 2, side * 2.52, 1.27, 3.92, .56, 'paleIce');
    lancet(6.74, 4.8, side * 5.95, 1.8, 4.95, -Math.PI / 2);
    for (const x of [8.9, 12.4, 15.9, 19.4]) {
      block(x - 1.46, 5.9, side * 9.7, .38, 11.55, .27, 'paleIce');
      lancet(x, 4.83, side * 9.78, 1.74, 4.22, side * Math.PI / 2 - Math.PI / 2);
      block(x, 8.76, side * 9.92, 2.21, .19, .56, 'snow');
      icicleRow(x - 1.02, side * 10.09, x + 1.02, side * 10.09, 8.7, side < 0 ? 4 : 2);
      lancet(x, 4.83, side * 8.83, 1.32, 3.46, -side * Math.PI / 2 - Math.PI / 2);
    }
    for (const z of [side * 3.6, side * 7.15]) lancet(20.25, 5.05, z, 1.37, 4.46, -Math.PI / 2);
    const turretZ = side * 13.55;
    turret(18.3, turretZ, 5.48, 11.4, 5.05);
    solid(22.07, .12, side * 12.7, .86, 4.32, 7.9, 'blueIce');
    block(22.07, 4.4, side * 12.7, 1.1, .24, 8.06, 'snow');
  }
  solid(7.2, 4.18, 0, .86, 7.42, 5.4, 'blueIce');
  block(7.2, 4.21, 0, 1.25, .28, 5.67, 'snow');
  icicleRow(6.65, -2.65, 6.65, 2.65, 4.12, 1);
  crystal(6.37, 7.42, 0, .56, 2.54, 2.54, 'paleIce');
  crystal(6.07, 7.42, 0, .28, 1.51, 1.51, 'pane');
  for (let tier = 0; tier < 13; tier++) {
    const width = 19.8 - tier * 1.43;
    const y = 11.58 + tier * .43;
    block(14, y, 0, 15.7 - tier * .22, .44, width, tier % 4 === 0 ? 'snow' : 'deepIce');
    for (const x of [6.13 + tier * .11, 21.87 - tier * .11]) {
      block(x, y + .17, 0, .28, .16, width + .16, 'paleIce');
    }
  }
  block(14, 17, 0, 12.58, .38, 1.72, 'snow');
  for (const x of [8.3, 14, 19.7]) crystal(x, 17.65, 0, .9, 1.45, .9, 'ice');
  flush('大殿与东塔');

  // The balcony is reached by ordinary walking instead of a jump or teleport.
  const treadCount = 11;
  const firstTread = 10.7;
  const treadLength = .58;
  const rise = .27;
  const balconyHeight = .12 + treadCount * rise;
  for (let step = 1; step <= treadCount; step++) {
    const x = firstTread + (step - .5) * treadLength;
    const top = .12 + step * rise;
    floor(x, top, 6.2, treadLength, 2.45, step * rise, 'paleIce');
    block(x - .24, top + .012, 6.2, .07, .022, 2.45, 'snow');
    for (const z of [4.92, 7.48]) {
      solid(x, top, z, .59, .81, .13, 'ice');
      block(x, top + .81, z, .59, .14, .22, 'snow');
    }
  }
  const balconyStart = firstTread + treadCount * treadLength;
  const balconyWidth = 20.31 - balconyStart;
  const balconyX = balconyStart + balconyWidth / 2;
  floor(balconyX, balconyHeight, 3.17, balconyWidth, 8.47, .31, 'paleIce');
  solid(balconyX, balconyHeight, -1.03, balconyWidth, 1.02, .17, 'ice');
  solid(balconyStart, balconyHeight, 1.93, .17, 1.02, 5.94, 'ice');
  solid(balconyX, balconyHeight, 7.4, balconyWidth, 1.02, .17, 'ice');
  block(balconyStart, balconyHeight + 1.01, 1.93, .26, .13, 5.98, 'snow');
  block(balconyX, balconyHeight + 1.01, -1.03, balconyWidth, .13, .26, 'snow');
  icicleRow(balconyStart - .14, -.94, balconyStart - .14, 4.79, balconyHeight + .99, 3);
  icicleRow(balconyStart + .16, -1.16, 20.17, -1.16, balconyHeight + .99, 5);
  for (const z of [0, 1.5, 3, 4.5, 6]) {
    block(balconyStart - .14, balconyHeight + .53, z, .27, 1.24, .22, 'paleIce');
  }
  for (const x of [10, 14.45, 19.35]) lamp(x, .12, -7.55);
  // The inlaid path turns from the hall door towards the seat while staying flush to the floor.
  for (let tile = 0; tile <= 16; tile++) {
    const t = tile / 16;
    const x = 8 + 8.4 * t;
    const z = -4.92 * t * t * (3 - 2 * t);
    block(x, .159, z, .85, .018, .85, 'deepIce', Math.PI / 4);
    block(x, .169, z, .63, .012, .63, tile % 4 === 0 ? 'paleIce' : 'ice', Math.PI / 4);
  }
  for (const [x, y, width] of [[17.15, .357, 1.16], [18.08, .577, .57]]) {
    block(x, y, -4.92, width, .012, 1.08, 'paleIce');
  }
  floor(18.25, .35, -4.92, 3.36, 4.4, .24, 'deepIce');
  floor(18.85, .57, -4.92, 2.15, 3.25, .24, 'paleIce');
  const [seatX, eyeHeight, seatZ] = iceThrone.seat;
  const seatTop = eyeHeight - .98;
  for (const side of [-1, 1]) {
    block(seatX - .22, .80, seatZ + side * .51, .36, .46, .25, 'ice');
    block(seatX + .24, .80, seatZ + side * .51, .36, .46, .25, 'ice');
    block(seatX, 1.32, seatZ + side * .64, 1.12, .18, .22, 'paleIce');
  }
  block(seatX, seatTop - .10, seatZ, 1.08, .20, 1.23, 'ice');
  block(seatX - .025, seatTop - .016, seatZ, 1.08, .032, 1.12, 'snow');
  block(seatX + .45, 1.95, seatZ, .24, 2.14, 1.27, 'paleIce');
  block(seatX + .445, 3.05, seatZ, .34, .18, 1.37, 'ice');
  colliders.push(bounds(seatX + .05, .57, seatZ, 1.25, 1.75, 1.52));
  solid(seatX + .82, .57, seatZ, .61, 2.66, 2.28, 'blueIce');
  for (const [height, span] of [[3.2, 1.98], [3.38, 1.62], [3.56, 1.18], [3.74, .80]]) {
    block(seatX + .77, height, seatZ, .45, .20, span, height > 3.5 ? 'ice' : 'paleIce');
  }
  for (const side of [-1, 1]) {
    block(seatX + .61, 2.04, seatZ + side * .94, .28, 2.45, .27, 'paleIce');
    crystal(seatX + .53, 3.38, seatZ + side * .95, .32, .66, .35, 'ice', .35);
  }
  crystal(seatX + .67, 4.00, seatZ, .48, .86, .65, 'paleIce');
  crystal(seatX + .47, 3.64, seatZ, .27, 1.19, .77, 'glint', 0, 'core');
  for (const [x, z] of [[18.75, -2.15], [18.05, -7.61]]) {
    addIceCastleDeer(parts, x, .15, z);
    colliders.push(bounds(x - .12, .15, z, 1.77, 1.62, .76));
  }
  lamp(20.02, 2.17, -2.17, true);
  lamp(20.02, 2.17, -7.67, true);
  addIceCastleCarvings(parts);
  addIceCastleChandelier(parts);
  // These inlays guide racers to the south stair while preserving the existing floor supports.
  raceArrow(9.74, .15, 1.45, -Math.PI / 2, .73);
  raceArrow(9.74, .15, 4.10, -Math.PI / 2, .73);
  raceArrow(10.11, .15, 6.2, 0, .65);
  const [finishX, finishY, finishZ] = icePalaceBalconyRace.finish;
  block(finishX, finishY + .011, finishZ, 1.6, .021, 1.6, 'paleIce');
  for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
    block(finishX + u * .465, finishY + .024, finishZ + v * .465, .451, .008, .451,
      (u + v) % 2 === 0 ? 'deepIce' : 'snow');
  }
  flush('大殿内装与观景层');
  const group = finish();
  group.userData.throne = iceThrone;
  group.userData.palaceRace = createIcePalaceRace();
  const plaqueStyle = { background: '#18394b', color: '#d7f3ff', accent: '#79b9cc' };
  addLandmarkNameplate(group, '冰雪城堡', -22.42, 5.91, 0, 3.06, .72, -Math.PI / 2, plaqueStyle);
  if (typeof document !== 'undefined') {
    const width = 1.66;
    const height = .44;
    const labels = iceCastleExhibits.map(({ title, subtitle, anchor: [x, y, z], yaw, id }) => {
      const source = createMuseumLabelCanvas(title + '\n' + subtitle, width, height, plaqueStyle);
      return { source, parent: group, width, height, x, y: id === 'sailboat' ? y - .24 : y - .44,
        z: Math.sign(z) * 8.82, yaw };
    });
    addOpaqueMuseumLabels(labels, [], { mergeSizes: true });
  }
  return group;
}
