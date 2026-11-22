import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial,
} from 'three';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan, meteorCraterRimRadius,
} from './meteor-crater';
import { mountCraterInteriorDressing } from './meteor-crater-interior-dressing.js';
import { mountCraterFloorWorklightChain } from './meteor-crater-floor-worklight-chain.js';

export type MeteorCraterWorldAnchor = Readonly<{
  east: number;
  north: number;
  rimHeight: number;
  /** Clockwise radians from the live town's north to the fixture's north. */
  yaw: number;
}>;

const crater = createMeteorCrater(meteorCraterFixturePlan);
const shaftRadius = meteorCraterRimRadius / 30;
const coveredRadius = shaftRadius + .03;

/** Render and walk the same surveyed B-01 triangles on the ground layer. */
export function mountMeteorCraterSurface(anchor: MeteorCraterWorldAnchor) {
  const { east, north, rimHeight, yaw } = anchor;
  if (![east, north, rimHeight, yaw].every(Number.isFinite)) {
    throw new RangeError('A live crater mount requires a finite B-01 anchor.');
  }
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const group = new Group();
  group.name = 'meteor-crater-surface';
  group.position.set(east, rimHeight, -north);
  group.rotation.y = -yaw;

  const surface = crater.buildPreviewSurface(shaftRadius);
  const bowl = new BufferGeometry();
  bowl.setAttribute('position', new BufferAttribute(surface.positions, 3));
  bowl.setIndex(new BufferAttribute(surface.indices, 1));
  const snow = new Color(0xc1cedc);
  const exposedRock = new Color(0x6d6562);
  const tone = new Color();
  const colors = new Float32Array(surface.positions.length);
  const snowRoughnessFeather = new Float32Array(surface.positions.length / 3);
  for (let i = 0; i < surface.positions.length; i += 3) {
    const radial = Math.hypot(surface.positions[i], surface.positions[i + 2]);
    const snowWeight = Math.min(1, Math.max(0, (radial - 47) / 10));
    // A-5: a soft mid-lip roughness change. Both ends return to 1.0 so
    // neither the bowl terrace nor the carrier ground gets a shiny seam.
    const u = Math.min(1, Math.max(0, (radial - 50) / 9));
    const eased = u * u * (3 - 2 * u);
    snowRoughnessFeather[i / 3] = Math.sin(Math.PI * eased);
    const grain = 0.96 + .04 * Math.sin(surface.positions[i] * 4.32 + surface.positions[i + 2] * 1.71);
    tone.copy(exposedRock).lerp(snow, snowWeight).multiplyScalar(grain).toArray(colors, i);
  }
  bowl.setAttribute('color', new BufferAttribute(colors, 3));
  bowl.setAttribute('aCraterSnowFeather', new BufferAttribute(snowRoughnessFeather, 1));
  bowl.computeVertexNormals();
  const groundMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  // Use the original ONE B-01 walk mesh and add a per-vertex transition.
  // Its fragment roughness is 1.0 at both physical edges, gently reaching
  // 0.97 mid-lip. No overlay ring, no extra draw call or collision surface.
  groundMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float aCraterSnowFeather;\nvarying float vCraterSnowFeather;');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvCraterSnowFeather = aCraterSnowFeather;');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying float vCraterSnowFeather;');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.97, vCraterSnowFeather);');
  };
  const ground = new Mesh(bowl, groundMaterial);
  ground.name = 'meteor-crater-walk-mesh';
  group.add(ground);

  // This surface mount keeps the sealed well walkable until the underground
  // authority opens it. Do not make the neutral host grant access to the shaft.
  const cover = new Mesh(
    new CylinderGeometry(coveredRadius, coveredRadius, .12, 96),
    new MeshStandardMaterial({ color: 0x544c4b, roughness: 1 }),
  );
  cover.name = 'meteor-crater-sealed-well';
  cover.position.y = -meteorCraterDepth - .06;
  group.add(cover);

  // C3 is a strictly visual add-on to the original B-01 authoritative mesh.
  // It follows this same approved anchor/yaw and owns no new colliders or E.
  const interiorDressing = mountCraterInteriorDressing(group);
  // C2: physical lamp carriers with six actual warm night sources. The
  // existing road.craterActions.setNight is the sole day/night switch.
  const floorWorklights = mountCraterFloorWorklightChain(group);

  function heightAt(worldEast: number, worldNorth: number) {
    const dx = worldEast - east, dn = worldNorth - north;
    const fixtureEast = dx * c - dn * s, fixtureNorth = dx * s + dn * c;
    const height = surface.heightAt(fixtureEast, fixtureNorth);
    if (height !== undefined) return rimHeight + height;
    if (Math.hypot(fixtureEast, fixtureNorth) <= shaftRadius) return rimHeight - meteorCraterDepth;
  }

  function trailPoint(progress: number) {
    const { east: x, north: n } = crater.mainTrailPoint(progress);
    const worldEast = east + x * c + n * s;
    const worldNorth = north + n * c - x * s;
    return { east: worldEast, north: worldNorth, height: heightAt(worldEast, worldNorth)! };
  }

  return { group, heightAt, trailPoint, shaftRadius, interiorDressing, floorWorklights };
}
