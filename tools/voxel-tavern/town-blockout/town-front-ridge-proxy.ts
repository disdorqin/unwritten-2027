import { BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshLambertMaterial } from 'three';
import {
  frontRidgeSurfaceColorAt, frontRidgeWorldUv, makeFrontRidgePixelTexture,
} from './town-front-ridge-surface';
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
// R1/R2: old toe started at Y150 on N692, creating an exposed vertical
// 140m pale wall at eye height. Retain the SAME survey toe/crest and 350m
// silhouette but add multiple rock shoulder levels from Y9 to Y350.
// This is visual geometry only. The old terrain grid / collision is unchanged.
const ROWS: readonly (readonly [north: number, base: number])[] = [
  [692,9], [697,18], [703,33], [710,58], [716,88], [723,130],
  [730,174], [737,221], [740,223], [745,276], [749,278],
  [752,322], [758,350], [764,349], [770,341], [776,330],
  [785,290], [800,215],
];
// More rock facets across the near-facing wall. Texture provides the
// 16px/m readability, geometry provides the larger chamfered silhouette.
const EAST_STEP = 8;

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
  // Feather the east/west sides into the dark earth instead of exposing a
  // 200m-high squared-off end wall. At centre the old peak remains Y350.
  const westMargin = Math.max(0, Math.min(1,(east-FRONT_RIDGE_PROXY.west)/56));
  const eastMargin = Math.max(0, Math.min(1,(FRONT_RIDGE_PROXY.east-east)/56));
  const feather = .14+.86*Math.min(westMargin*westMargin*(3-2*westMargin),
    eastMargin*eastMargin*(3-2*eastMargin));
  const serrated = base * falloff * feather +
    (Math.min(10, teethDelta) + Math.min(0, teethDelta))*teethWeight*feather;
  // One readable notch east of the peak meridian, so the crest reads as
  // a serrated wall rather than a smooth dome from the plaza.
  const notch = 34 * Math.exp(-((east - 395) ** 2) / (2 * 38 ** 2)) * teethWeight;
  return serrated - notch;
}

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
      // R4: the old (a,d,b) order faced *down*. That invalidated the
      // snow/rock slope mask and made front faces unnaturally dark.
      indices.push(a, b, d, b, e, d);
    }
  }
  // Skirts: south rim (toe) and both side rims drop below ground so the
  // shell never shows a floating edge.
  function skirt(edge: number[], steps: readonly number[] = [1]) {
    // steps are absolute fractions of the full drop to -60. The west
    // rim (branch window D west-end special, 2026-11-22) gets a mid
    // ring at 0.42 so its sealed face has two facet rows whose vertex
    // colours pick up the strata/foot streaks instead of one flat quad.
    let upper = edge;
    for (const step of steps) {
      const start = positions.length / 3;
      for (const vertex of edge) {
        const y = positions[vertex * 3 + 1]!;
        positions.push(positions[vertex * 3]!, y + (-60 - y) * step, positions[vertex * 3 + 2]!);
      }
      for (let i = 0; i + 1 < edge.length; i++) {
        const a = upper[i]!, b = upper[i + 1]!, a2 = start + i, b2 = start + i + 1;
        indices.push(a, b, a2, b, b2, a2);
      }
      upper = edge.map((_, i) => start + i);
    }
  }
  skirt(Array.from({ length: cols }, (_, c) => c));
  skirt(Array.from({ length: rows }, (_, r) => r * cols), [0.42, 1]);
  skirt(Array.from({ length: rows }, (_, r) => r * cols + cols - 1));

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array(positions.length / 3 * 2);
  for (let v = 0; v < normals.count; v++) {
    const x = positions[v * 3]!, y = positions[v * 3 + 1]!, north = -positions[v * 3 + 2]!;
    const steep = 1 - Math.max(0,normals.getY(v));
    const tint = frontRidgeSurfaceColorAt(x,north,y,steep);
    colors.set([tint.r,tint.g,tint.b], v * 3);
    const uv = frontRidgeWorldUv(x,north,y);
    uvs.set([uv.u,uv.v],v*2);
  }
  geometry.setAttribute('color', new BufferAttribute(colors,3));
  geometry.setAttribute('uv',new BufferAttribute(uvs,2));
  // Discrete crest teeth (总控 2026-11-21 裁定): a heightfield alone
  // smooths into a dome at plaza distance, so the crown carries sharp
  // dark-rock teeth — irregular heights 20–45 m, irregular spacing,
  // gaps left open, snow only on the ledges between teeth. The teeth
  // are baked INTO the same merged geometry (vertex-colored dark
  // rock): the proxy stays a single draw, ledger unchanged.
  const flattened = geometry.toNonIndexed();
  geometry.dispose();
  const parts: BufferGeometry[] = [flattened];
  let seed = 29;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let east = 44 + rand() * 10;
  let index = 0;
  while (east <= 596) {
    const inNotch = east > 362 && east < 428;
    if (!inNotch && index % 5 !== 4) {
      const toothHeight = 20 + rand() * 25;
      const tooth = new ConeGeometry(8 + rand() * 5, toothHeight, 4).toNonIndexed();
      // Preserve UV on tooth facets for the SAME 32px pixel-grain texture.
      // Every merged sub-geometry must provide position/normal/color/uv.
      const toothUv = tooth.getAttribute('uv');
      for(let u=0;u<toothUv.count;u++){
        toothUv.setXY(u,toothUv.getX(u)*12,toothUv.getY(u)*9);
      }
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
  // R4/R5: the m15 photograph is a STACK of overhanging bare-rock
  // ledges, ochre scree, local snow shelves and a dark conifer foot.
  // Pixel pigment on one smooth wall is not enough at first-person eye
  // height. Build distinct, embedded low-poly profiles (3-7 per cluster)
  // and bake all of them into the SAME merged one-draw mountain shell.
  const faceBaseAt=(north:number)=>{
    for(let row=1;row<ROWS.length;row++){
      const a=ROWS[row-1]!,b=ROWS[row]!;
      if(north>b[0])continue;
      const f=(north-a[0])/(b[0]-a[0]);
      return a[1]+(b[1]-a[1])*f;
    }
    return ROWS.at(-1)![1];
  };
  let snowShelves=0, exposedRocks=0, conifers=0;
  function attachFeature(kind:'snow'|'rock'|'ochre'|'pine',
    e:number,n:number,length:number,height:number,depth:number,spin=0){
    const base=crestHeight(e,faceBaseAt(n));
    const snow=kind==='snow';
    const pine=kind==='pine';
    const box=pine
      ?new ConeGeometry(length*.42,height,5).toNonIndexed()
      :new BoxGeometry(length,height,depth).toNonIndexed();
    const count=box.getAttribute('position').count;
    const faceNormals=box.getAttribute('normal');
    const color=new Float32Array(count*3);
    const uv=box.getAttribute('uv');
    const upper=new Color(snow?'#e8ecf0':
      kind==='ochre'?'#a98a56':pine?'#44503c':'#8a8378');
    const shadow=new Color(snow?'#8a8378':
      kind==='ochre'?'#5d4630':pine?'#2c3648':'#5d4630');
    const mixed=new Color();
    for(let i=0;i<count;i++){
      const top=faceNormals.getY(i)>.25;
      const townFacing=faceNormals.getZ(i)>.25;
      // Native first-person QA caught an invisible snow band: the viewer
      // is BELOW the ledges, so only their front face is visible, while
      // the previous snow tint lived exclusively on the top face.
      // Paint the short exposed snow LIP on the vertical town side as well.
      mixed.copy(top||townFacing ? upper : shadow);
      if(snow && townFacing) mixed.lerp(shadow,.16);
      if((hashPixel(i,snowShelves+exposedRocks+conifers)%11)===1) mixed.lerp(shadow,.23);
      color.set([mixed.r,mixed.g,mixed.b],i*3);
      uv.setXY(i,uv.getX(i)*Math.max(1,length*.5),
        uv.getY(i)*Math.max(1,height*.5));
    }
    box.setAttribute('color',new BufferAttribute(color,3));
    const extent=kind==='pine'?height/2:(height*.42);
    box.applyMatrix4(new Matrix4().makeRotationY(spin).setPosition(
      e,base+extent-.22,-n+(pine?2.8:1.35)));
    parts.push(box);
    if(snow)snowShelves++;
    else if(pine)conifers++;
    else exposedRocks++;
  }
  const hashPixel=(a:number,b:number)=>{
    let h=Math.imul(a+103,16381)^Math.imul(b+211,7919);
    h ^= h>>>13;return h>>>0;
  };
  for(let e=48;e<598;e+=9.8+rand()*8.6){
    // Three offset ledge bands. Local missing sections preserve the
    // m15 reference's gaps rather than painting three unbroken white rings.
    if(rand()>.24){
      const n=749+(rand()-.5)*1.7;
      attachFeature('snow',e,n,7.4+rand()*8.3,.65+rand()*.82,1.6+rand()*.85,
        (rand()-.5)*.16);
    }
    if(rand()>.48){
      const n=762+(rand()-.5)*1.3;
      attachFeature('snow',e,n,5.5+rand()*7.8,.67+rand()*.75,1.8,
        (rand()-.5)*.12);
    }
    if(rand()>.24){
      const n=739+(rand()-.5)*1.0;
      attachFeature('rock',e,n,5.4+rand()*6.8,1.1+rand()*1.7,1.2+rand()*1.3,
        (rand()-.5)*.24);
    }
    if(rand()>.31){
      const n=728+(rand()-.5)*2.4;
      attachFeature('ochre',e,n,4.2+rand()*7.2,.77+rand()*1.5,1.05+rand()*1.2,
        (rand()-.5)*.18);
    }
  }
  // R2 footer: small alpine conifer clusters in only the low visible
  // band. D2's future official forest host still owns true tree physics;
  // these trees are backdrop geometry only and never collide with players.
  for(let cluster=0;cluster<24;cluster++){
    const centre=52+cluster*22.7+rand()*8;
    for(let tree=0;tree<3+(cluster%5);tree++){
      const e=centre+(rand()-.5)*13;
      const n=701+(rand()-.5)*9;
      attachFeature('pine',e,n,2.0+rand()*2.0,6.2+rand()*7.1,2.0);
    }
  }
  // West-end special (branch window D, 2026-11-22): from the crater
  // mouth the feathered west wall and its sealed skirt were one smooth
  // giant face (A window bisect evidence, day pale-brown / night near
  // black). Set mid-ground rock and scree clusters, snow lips and a
  // conifer foot onto the WEST slope itself (crater palette families),
  // so the wall breaks into layered masses at crater distances.
  let westRocks=0,westPines=0;
  for(let e=27;e<92;e+=6.4+rand()*5.2){
    if(rand()>.22){
      attachFeature('rock',e,716+rand()*44,4.6+rand()*6.4,1.6+rand()*2.6,1.6+rand()*1.6,(rand()-.5)*.5);
      westRocks++;
    }
    if(rand()>.42){
      attachFeature('ochre',e+2.5,733+rand()*30,3.8+rand()*5.6,1.1+rand()*1.9,1.5+rand()*1.2,(rand()-.5)*.4);
      westRocks++;
    }
    if(rand()>.55){
      attachFeature('snow',e+1.2,746+rand()*17,4.4+rand()*6.2,.6+rand()*.7,1.5,(rand()-.5)*.2);
    }
  }
  for(let cluster=0;cluster<7;cluster++){
    const centre=34+cluster*8.6+rand()*4;
    for(let tree=0;tree<3;tree++){
      attachFeature('pine',centre+(rand()-.5)*7,700+(rand()-.5)*8,2.0+rand()*1.8,5.6+rand()*6.4,2.0);
      westPines++;
    }
  }
  group.userData.surfaceSurvey={
    snowShelves,exposedRocks,conifers,westRocks,westPines,
    includesWorldCollision:false,
    palette:'D11 m15 / 粘土工厂 32px Nearest',
  };
  const merged = mergeGeometries(parts)!;
  const pixelMap = makeFrontRidgePixelTexture();
  const material = new MeshLambertMaterial({
    vertexColors: true, fog: false, side: DoubleSide, map: pixelMap,
    // M15: daylight crater views saw one black facet despite varied actual
    // pigments. A low warm soil bounce keeps ore/ochre strata legible with
    // the mountain face in partial shadow; the 32px texture is unchanged.
    // This is material response, not another distance-fog patch or light rig.
    emissive: '#a98a56', emissiveIntensity: .38,
  });
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
  material.customProgramCacheKey = () => 'front-ridge-proxy-long-fog-pixel-surface-v2';
  const mesh = new Mesh(merged, material);
  mesh.name = 'front-ridge-350-proxy-mesh';
  mesh.onBeforeRender = (_renderer, scene) => {
    // Use the same sky-day state as the existing town's lighting switch.
    // The previous constant terrain bounce made a yellow NIGHT cliff; the
    // night value deliberately returns the mountain to a dark silhouette.
    // No changes to fog distances, no new lights or scene-level UI switches.
    if (scene.background instanceof Color) {
      const skyLuminance=(scene.background.r+scene.background.g+scene.background.b)/3;
      material.emissiveIntensity=skyLuminance>.25 ? .38 : .025;
    }
    const shader = material.userData.shader as
      { uniforms: { proxyFogColor: { value: Color } } } | undefined;
    if (shader && scene.fog && 'color' in scene.fog) {
      shader.uniforms.proxyFogColor.value.copy(scene.fog.color);
    }
  };
  group.add(mesh);
  // The merge allocates one final geometry; the intermediate surfaces are
  // transient data and have no GPU owner after this point.
  for (const part of parts) part.dispose();
  return group;
}

export function mountFrontRidgeProxy(parent: import('three').Object3D) {
  const group = buildFrontRidgeProxy();
  parent.add(group);
  let disposed = false;
  return { group, dispose() {
    if(disposed)return;
    disposed=true;
    parent.remove(group);
    group.traverse(object=>{
      if(!(object instanceof Mesh))return;
      object.geometry.dispose();
      const mats=Array.isArray(object.material)?object.material:[object.material];
      mats.forEach(m=>{
        if(m instanceof MeshLambertMaterial)m.map?.dispose();
        m.dispose();
      });
    });
  } };
}

