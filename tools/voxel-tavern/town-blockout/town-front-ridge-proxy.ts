import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshLambertMaterial } from 'three';
import { ConeGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Front-ridge (350) town-side proxy — ZA-30 takeover step 2 (zone-1,
// 2026-11-21). The real front mountain lives in the cable domain scene;
// the town scene's heightfield is flat (8-10 m) all the way north, so
// from town the ridge simply does not exist. This proxy is a VISUAL
// shell on the skyline method: a serrated front wall + crown standing
// on the B3 reserve band (toe at N692, north of every fill cluster),
// foot skirted below ground. Ground truth is untouched — the town
// heightfield and every fill package keep sampling grid.heightAt.
// 登记口径（总控 2026-11-21 批准）：视觉壳·冠位北移约 90 m·非真地形
// ——地表真值仍以 grid.heightAt 为准，禁止拿本壳当真剖面对账。
// Coordination note (reported to 总控 2026-11-21): the crown sits
// ~90 m north of the surveyed peak plan (320,650) so the shell
// occludes zero landed fill; its height is the true 350.

export const FRONT_RIDGE_PROXY = {
  toeNorth: 692, peakEast: 320, peakNorth: 758, peakHeight: 350,
  west: 20, east: 620,
} as const;

// Crest profile by north row: a steep front face, crown, short back fall.
const ROWS: readonly (readonly [north: number, base: number])[] = [
  [692, 150], [706, 215], [722, 285], [740, 338], [758, 350], [776, 330], [800, 215],
];
const EAST_STEP = 20;

function teethAt(east: number): number {
  return Math.sin(east * 0.11) * 26 + Math.sin(east * 0.031 + 1.7) * 16 + Math.sin(east * 0.23 + 0.6) * 9;
}

function crestHeight(east: number, base: number): number {
  const d = Math.abs(east - FRONT_RIDGE_PROXY.peakEast);
  const falloff = d <= 140 ? 1 : Math.max(0.42, 1 - (d - 140) / 260 * 0.58);
  // Serration is measured against the peak meridian so the crown stays
  // the highest point: notches cut down, teeth may rise at most +6.
  const teethDelta = teethAt(east) - teethAt(FRONT_RIDGE_PROXY.peakEast);
  const teethWeight = Math.max(0, Math.min(1, (base - 180) / 170));
  const serrated = base * falloff + Math.min(10, teethDelta) * teethWeight + Math.min(0, teethDelta) * teethWeight;
  // One readable notch east of the peak meridian, so the crest reads as
  // a serrated wall rather than a smooth dome from the plaza.
  const notch = 34 * Math.exp(-((east - 395) ** 2) / (2 * 38 ** 2)) * teethWeight;
  return serrated - notch;
}

const ROCK = [0.36, 0.36, 0.37];      // cool grey stone
const EARTH = [0.55, 0.44, 0.30];     // soil band tint
const DARK_ROCK = [0.24, 0.22, 0.21]; // summit dark rock
const SNOW = [0.91, 0.93, 0.94];

export function buildFrontRidgeProxy(): Group {
  const group = new Group();
  group.name = 'front-ridge-350-proxy';
  const positions: number[] = [];
  const indices: number[] = [];
  const cols = Math.floor((FRONT_RIDGE_PROXY.east - FRONT_RIDGE_PROXY.west) / EAST_STEP) + 1;
  const rows = ROWS.length;
  for (let r = 0; r < rows; r++) {
    const [north, base] = ROWS[r]!;
    for (let c = 0; c < cols; c++) {
      const east = FRONT_RIDGE_PROXY.west + c * EAST_STEP;
      positions.push(east, crestHeight(east, base), -north);
    }
  }
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  // Skirts: south rim (toe) and both side rims drop below ground so the
  // shell never shows a floating edge.
  function skirt(edge: number[]) {
    const start = positions.length / 3;
    for (const vertex of edge) {
      positions.push(positions[vertex * 3]!, -60, positions[vertex * 3 + 2]!);
    }
    for (let i = 0; i + 1 < edge.length; i++) {
      const a = edge[i]!, b = edge[i + 1]!, a2 = start + i, b2 = start + i + 1;
      indices.push(a, b, a2, b, b2, a2);
    }
  }
  skirt(Array.from({ length: cols }, (_, c) => c));
  skirt(Array.from({ length: rows }, (_, r) => r * cols));
  skirt(Array.from({ length: rows }, (_, r) => r * cols + cols - 1));

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.length);
  for (let v = 0; v < normals.count; v++) {
    const y = positions[v * 3 + 1]!;
    const steep = 1 - Math.max(0, normals.getY(v));
    let rgb: number[];
    if (y < 0) rgb = ROCK;
    else if (y < 170) rgb = steep > 0.45 ? ROCK : EARTH.map((c, i) => c * (1 - y / 340) + SNOW[i]! * (y / 340));
    else if (y < 200) rgb = ROCK;
    else if (y < 300) rgb = steep > 0.38 ? ROCK : SNOW;
    else rgb = steep > 0.3 ? DARK_ROCK : SNOW;
    colors.set(rgb, v * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  // Discrete crest teeth (总控 2026-11-21 裁定): a heightfield alone
  // smooths into a dome at plaza distance, so the crown carries sharp
  // dark-rock teeth — irregular heights 20–45 m, irregular spacing,
  // gaps left open, snow only on the ledges between teeth. The teeth
  // are baked INTO the same merged geometry (vertex-colored dark
  // rock): the proxy stays a single draw, ledger unchanged.
  const parts: BufferGeometry[] = [geometry.toNonIndexed()];
  let seed = 29;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let east = 44 + rand() * 10;
  let index = 0;
  while (east <= 596) {
    const inNotch = east > 362 && east < 428;
    if (!inNotch && index % 5 !== 4) {
      const toothHeight = 20 + rand() * 25;
      const tooth = new ConeGeometry(8 + rand() * 5, toothHeight, 4).toNonIndexed();
      tooth.deleteAttribute('uv');
      const crest = crestHeight(east, 350);
      tooth.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 4 + (rand() - .5) * .4)
        .setPosition(east, crest + toothHeight / 2 - 7, -FRONT_RIDGE_PROXY.peakNorth));
      const count = tooth.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { colors[i * 3] = .21; colors[i * 3 + 1] = .20; colors[i * 3 + 2] = .18; }
      tooth.setAttribute('color', new BufferAttribute(colors, 3));
      parts.push(tooth);
    }
    east += 17 + rand() * 17;
    index++;
  }
  const merged = mergeGeometries(parts)!;
  const material = new MeshLambertMaterial({ vertexColors: true, fog: false, side: 2 });
  // Pale-slope fix, route 甲 (总控 ruling 2026-11-21, crater-mouth case):
  // the scene fog (360–1300 m) would swallow the peak at ~1470 m, so the
  // material keeps fog:false — but unfogged it was the only fully bright
  // distant surface at night and read as a flat pale sheet. The material
  // now applies its own long-range fog in-shader: the same linear family
  // as the scene fog at town distances (factor ≈0.18 at the crater
  // mouth's ~540 m), far stretched to 2600 m so the crown still reads
  // (≈0.55 at 1470 m). The fog color tracks scene.fog every frame via
  // onBeforeRender below, so day and night both haze correctly.
  const PROXY_FOG_NEAR = 100, PROXY_FOG_FAR = 2600;
  material.onBeforeCompile = shader => {
    shader.uniforms.proxyFogColor = { value: new Color('#adc2dd') };
    shader.uniforms.proxyFogNear = { value: PROXY_FOG_NEAR };
    shader.uniforms.proxyFogFar = { value: PROXY_FOG_FAR };
    material.userData.shader = shader;
    shader.vertexShader = 'varying float vProxyFogDepth;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n\tvProxyFogDepth = - mvPosition.z;');
    shader.fragmentShader = ('uniform vec3 proxyFogColor;\nuniform float proxyFogNear;\n'
      + 'uniform float proxyFogFar;\nvarying float vProxyFogDepth;\n'
      + shader.fragmentShader).replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
\tfloat proxyFogFactor = clamp((vProxyFogDepth - proxyFogNear) / (proxyFogFar - proxyFogNear), 0.0, 1.0);
\tgl_FragColor.rgb = mix(gl_FragColor.rgb, proxyFogColor, proxyFogFactor);`);
  };
  material.customProgramCacheKey = () => 'front-ridge-proxy-long-fog';
  const mesh = new Mesh(merged, material);
  mesh.name = 'front-ridge-350-proxy-mesh';
  mesh.onBeforeRender = (_renderer, scene) => {
    const shader = material.userData.shader as
      { uniforms: { proxyFogColor: { value: Color } } } | undefined;
    if (shader && scene.fog && 'color' in scene.fog) {
      shader.uniforms.proxyFogColor.value.copy(scene.fog.color);
    }
  };
  group.add(mesh);
  return group;
}

export function mountFrontRidgeProxy(parent: import('three').Object3D) {
  const group = buildFrontRidgeProxy();
  parent.add(group);
  return { group, dispose() { parent.remove(group); } };
}
