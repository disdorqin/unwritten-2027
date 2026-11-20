import {
  Color, DoubleSide, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector2, Vector3,
} from 'three';

type Point = { east: number; north: number };
type Shoulder = Point & { height: number };
type Wind = Point;
type CloudEye = Point & { diameter: number };
type Terrain = {
  bounds: { west: number; east: number; south: number; north: number };
  summit: Point;
  shoulders: readonly [Shoulder, Shoulder];
  heightAt(east: number, north: number): number | undefined;
};

export const mainSummitCloudSpec = {
  bottom: 380, top: 560,
  layers: [402, 474, 542] as const,
  minimumVisibility: 300, maximumVisibility: 500,
  streamerWindThreshold: 5,
  streamerTerrainClearance: 3,
  streamerMaxLift: 32,
} as const;

const eyeOffsets = [[-565, -222, 112], [403, -350, 132], [168, 409, 96]] as const;
const plumeDistances = [9, 24, 44, 69, 99, 134] as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (from: number, to: number, value: number) => {
  const fraction = clamp((value - from) / (to - from), 0, 1);
  return fraction * fraction * (3 - 2 * fraction);
};

const vertex = /* glsl */`
  uniform vec2 bankShift;
  varying vec2 p;
  varying vec2 localPlan;
  void main() {
    p = uv * 2.0 - 1.0;
    vec4 point = instanceMatrix * vec4(position, 1.0);
    point.xz += bankShift;
    localPlan = point.xz;
    gl_Position = projectionMatrix * modelViewMatrix * point;
  }
`;

const fragment = /* glsl */`
  uniform vec3 cloudTint;
  uniform float cloudCover;
  uniform vec3 holes[3];
  varying vec2 p;
  varying vec2 localPlan;
  void main() {
    // Overlapping lobes feather the edges without a sprite atlas.
    float distanceToPuff = min(length((p - vec2(-0.26, -0.03)) * vec2(1.14, 1.31)),
      min(length((p - vec2(0.22, -0.17)) * vec2(1.32, 1.48)),
          length((p - vec2(0.03, 0.25)) * vec2(1.62, 1.55))));
    float opacity = (1.0 - smoothstep(0.27, 0.82, distanceToPuff)) * cloudCover * 0.44;
    opacity *= 1.0 - smoothstep(0.66, 1.0, max(abs(p.x), abs(p.y)));
    for (int i = 0; i < 3; i++) {
      opacity *= smoothstep(holes[i].z * 0.5, holes[i].z * 0.76, distance(localPlan, holes[i].xy));
    }
    if (opacity < 0.006) discard;
    gl_FragColor = vec4(cloudTint, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createBanks(terrain: Terrain) {
  const { bounds } = terrain;
  const eastSpan = bounds.east - bounds.west;
  const northSpan = bounds.north - bounds.south;
  const positions: Array<{ east: number; north: number; height: number; width: number; depth: number; turn: number }> = [];
  for (const [layer, height] of mainSummitCloudSpec.layers.entries()) {
    for (let row = 0; row < 6; row++) for (let column = 0; column < 7; column++) {
      const salt = column * 13 + row * 7 + layer * 11;
      const east = bounds.west + eastSpan * (column + .5 + Math.sin(salt) * .18) / 7;
      const north = bounds.south + northSpan * (row + .5 + Math.cos(salt) * .18) / 6;
      const ground = terrain.heightAt(east, north);
      if (ground === undefined || ground > height + 50) continue;
      positions.push({ east, north, height, width: eastSpan * (1.42 + salt % 4 * .10) / 7,
        depth: northSpan * (1.42 + salt % 5 * .08) / 6, turn: Math.sin(salt * 2) * .27 });
    }
  }
  return positions;
}

function eyeFactor(eyes: readonly CloudEye[], east: number, north: number) {
  return eyes.reduce((factor, eye) => factor * smooth(eye.diameter / 2, eye.diameter * .76,
    Math.hypot(east - eye.east, north - eye.north)), 1);
}

function streamer(terrain: Terrain, shoulder: Shoulder, direction: Wind, speed: number, seconds: number) {
  if (speed < mainSummitCloudSpec.streamerWindThreshold) return [];
  const lobes = [];
  for (const [index, distance] of plumeDistances.entries()) {
    const sway = Math.sin(seconds * .19 + index * .47) * Math.min(4, distance * .03);
    const east = shoulder.east + direction.east * distance - direction.north * sway;
    const north = shoulder.north + direction.north * distance + direction.east * sway;
    const length = 13 + index * 2;
    const width = 9 - index * .78;
    const radiusY = 3.8 - index * .44;
    const probes = [-1, 0, 1].flatMap(along => [-1, 0, 1].map(across => terrain.heightAt(
      east + direction.east * length * along - direction.north * width * across,
      north + direction.north * length * along + direction.east * width * across,
    )));
    if (probes.some(height => height === undefined || !Number.isFinite(height))) break;
    const ceiling = Math.max(...probes as number[]);
    const height = Math.max(shoulder.height + 9 + Math.sin(distance * .024) * 2, ceiling + radiusY + 3);
    if (height - shoulder.height > mainSummitCloudSpec.streamerMaxLift) break;
    lobes.push({ east, north, height, distance, length, width, radiusY,
      terrainTop: ceiling, clearance: height - radiusY - ceiling });
  }
  return lobes;
}

/** Builds the isolated P-8 visual layer from the frozen P-1 terrain sampling interface. */
export function createMainSummitCloudLayer(terrain: Terrain) {
  const { bounds, summit, shoulders } = terrain;
  if (![...Object.values(bounds), summit.east, summit.north, ...shoulders.flatMap(shoulder => [shoulder.east, shoulder.north, shoulder.height])]
    .every(Number.isFinite) || bounds.east <= bounds.west || bounds.north <= bounds.south ||
    shoulders.some(shoulder => terrain.heightAt(shoulder.east, shoulder.north) !== shoulder.height)) {
    throw new RangeError('P-8 cloud mounts require the surveyed P-1 shoulder elevation and a valid terrain domain.');
  }

  const group = new Group();
  group.name = 'main-summit-cloud-layer';
  const bankGeometry = new PlaneGeometry(1, 1);
  const bankUniforms = {
    bankShift: { value: new Vector2() }, cloudTint: { value: new Color('#cbdbe9') }, cloudCover: { value: .9 },
    holes: { value: eyeOffsets.map(() => new Vector3()) },
  };
  const bankMaterial = new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: bankUniforms,
    transparent: true, side: DoubleSide, depthWrite: false });
  const positions = createBanks(terrain);
  const banks = new InstancedMesh(bankGeometry, bankMaterial, positions.length);
  banks.name = 'main-summit-cloud-banks';
  banks.frustumCulled = false;
  const pose = new Object3D();
  for (const [index, bank] of positions.entries()) {
    pose.position.set(bank.east, bank.height, -bank.north);
    pose.rotation.set(-Math.PI / 2, 0, bank.turn);
    pose.scale.set(bank.width, bank.depth, 1);
    pose.updateMatrix();
    banks.setMatrixAt(index, pose.matrix);
  }
  group.add(banks);

  const plumeGeometry = new SphereGeometry(1, 10, 7);
  const plumeMaterial = new MeshBasicMaterial({ color: '#dae7ef', transparent: true, opacity: .24, depthWrite: false });
  const plumes = new InstancedMesh(plumeGeometry, plumeMaterial, shoulders.length * plumeDistances.length);
  plumes.name = 'main-summit-shoulder-banner-clouds';
  plumes.frustumCulled = false;
  group.add(plumes);
  const modelDirection = new Vector3(1, 0, 0);
  const airflow = new Vector3();
  let eyes: CloudEye[] = [];
  let coverage = 0;
  let disposed = false;

  function update(epochMs: number, wind: Wind, cloudCover = .9) {
    if (disposed) throw new Error('The summit cloud layer is disposed.');
    if (![epochMs, wind.east, wind.north, cloudCover].every(Number.isFinite) || cloudCover < 0 || cloudCover > 1) {
      throw new RangeError('Cloud time, airflow and coverage must be finite, with coverage from zero to one.');
    }
    coverage = cloudCover;
    const speed = Math.hypot(wind.east, wind.north);
    const direction = speed > 0 ? { east: wind.east / speed, north: wind.north / speed } : { east: 0, north: 0 };
    const seconds = epochMs / 1000;
    const phase = seconds * .018;
    const shift = Math.sin(phase) * Math.min(speed * 2, 26);
    bankUniforms.bankShift.value.set(direction.east * shift, -direction.north * shift);
    bankUniforms.cloudCover.value = cloudCover;
    banks.visible = cloudCover > 0;
    eyes = eyeOffsets.map(([east, north, diameter], index) => ({
      east: summit.east + east + direction.east * shift + Math.cos(phase + index * 2.1) * 17,
      north: summit.north + north + direction.north * shift + Math.sin(phase + index * 2.1) * 16,
      diameter,
    }));
    for (const [index, eye] of eyes.entries()) bankUniforms.holes.value[index]!.set(eye.east, -eye.north, eye.diameter);

    const flags = shoulders.map(shoulder => ({
      mount: { ...shoulder }, lobes: cloudCover > 0 ? streamer(terrain, shoulder, direction, speed, seconds) : [],
    }));
    const lobes = flags.flatMap(flag => flag.lobes);
    plumes.count = lobes.length;
    plumes.visible = lobes.length > 0;
    plumeMaterial.opacity = (.14 + .19 * smooth(mainSummitCloudSpec.streamerWindThreshold, 10, speed)) * cloudCover;
    if (lobes.length) {
      airflow.set(direction.east, 0, -direction.north);
      pose.quaternion.setFromUnitVectors(modelDirection, airflow);
      for (const [index, lobe] of lobes.entries()) {
        pose.position.set(lobe.east, lobe.height, -lobe.north);
        pose.scale.set(lobe.length, lobe.radiusY, lobe.width);
        pose.updateMatrix();
        plumes.setMatrixAt(index, pose.matrix);
      }
      plumes.instanceMatrix.needsUpdate = true;
    }
    return { eyes, flags, speed, cloudCover, lobes: lobes.length, banks: positions.length };
  }

  function sample(east: number, north: number, height: number) {
    const { bottom, top, minimumVisibility, maximumVisibility } = mainSummitCloudSpec;
    const band = height >= bottom && height <= top;
    const vertical = smooth(bottom, 415, height) * (1 - smooth(530, top, height));
    const ground = terrain.heightAt(east, north);
    const density = ground === undefined || height < ground ? 0 : coverage * vertical * eyeFactor(eyes, east, north);
    const visibility = density > 0 ? maximumVisibility - (maximumVisibility - minimumVisibility) * density : undefined;
    return { band, density, visibility };
  }

  update(0, { east: 0, north: 0 });
  return {
    group, update, sample,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      banks.dispose(); plumes.dispose();
      bankGeometry.dispose(); plumeGeometry.dispose();
      bankMaterial.dispose(); plumeMaterial.dispose();
    },
  };
}
