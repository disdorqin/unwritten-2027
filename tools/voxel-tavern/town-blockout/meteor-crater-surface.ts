import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial,
} from 'three';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan, meteorCraterRimRadius,
  type MeteorCraterOptions,
} from './meteor-crater';
import { mountCraterInteriorDressing } from './meteor-crater-interior-dressing.js';
import { mountCraterFloorWorklightChain } from './meteor-crater-floor-worklight-chain.js';
import { bR30HaulCrossSection, bR30StrataShade } from './town-b-r30-crater-relief';
import { smoothBR30GroundNormals } from './town-b-r30-ground-normals';
import { bR30WorkfaceMasks } from './town-b-r30-crater-workface-layout';
import { bR30MoundTrailWear } from './town-b-r30-mound-route';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';

export type MeteorCraterWorldAnchor = Readonly<{
  east: number;
  north: number;
  rimHeight: number;
  /** Clockwise radians from the live town's north to the fixture's north. */
  yaw: number;
}>;

const neutralCrater = createMeteorCrater(meteorCraterFixturePlan, { naturalRelief: true });
const shaftRadius = meteorCraterRimRadius / 30;
const coveredRadius = shaftRadius + .03;

/** Render and walk the same surveyed B-01 triangles on the ground layer. */
export function mountMeteorCraterSurface(anchor: MeteorCraterWorldAnchor,
  options: MeteorCraterOptions = {}) {
  const { east, north, rimHeight, yaw } = anchor;
  if (![east, north, rimHeight, yaw].every(Number.isFinite)) {
    throw new RangeError('A live crater mount requires a finite B-01 anchor.');
  }
  const naturalRelief = options.naturalRelief !== false;
  const crater = options.centralMound || !naturalRelief
    ? createMeteorCrater(meteorCraterFixturePlan, { ...options, naturalRelief })
    : neutralCrater;
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
  const strata = new Float32Array(surface.positions.length / 3);
  const geology = new Float32Array(surface.positions.length);
  const workface = new Float32Array(surface.positions.length);
  const moundWear = new Float32Array(surface.positions.length / 3);
  const surveyedWorkface = naturalRelief && options.centralMound ? surveyZa31CraterWinch({anchor,heightAt}) : undefined;
  for (let i = 0; i < surface.positions.length; i += 3) {
    const radial = Math.hypot(surface.positions[i], surface.positions[i + 2]);
    const snowWeight = Math.min(1, Math.max(0, (radial - 47) / 10));
    // A-5: a soft mid-lip roughness change. Both ends return to 1.0 so
    // neither the bowl terrace nor the carrier ground gets a shiny seam.
    const u = Math.min(1, Math.max(0, (radial - 50) / 9));
    const eased = u * u * (3 - 2 * u);
    snowRoughnessFeather[i / 3] = Math.sin(Math.PI * eased);
    strata[i / 3] = naturalRelief ? bR30StrataShade(surface.positions[i],surface.positions[i+1],-surface.positions[i+2]) : 1;
    if(naturalRelief){
      const e=surface.positions[i],n=-surface.positions[i+2];
      const cross=bR30HaulCrossSection(e,n);
      geology[i]=cross.tread;
      geology[i+1]=Math.max(-2,Math.min(2,cross.signed));
      const moundRise=options.centralMound?.surfaceHeightAtLocal(e,n)??0;
      geology[i+2]=Math.min(1,moundRise/2.3);
      moundWear[i/3]=bR30MoundTrailWear({east:east+e*c+n*s,north:north+n*c-e*s},moundRise,cross.tread);
      if(surveyedWorkface){
        const p={east:east+e*c+n*s,north:north+n*c-e*s};
        const mask=bR30WorkfaceMasks(p,surface.positions[i+1],surveyedWorkface.descentApproach,anchor);
        workface.set([mask.worn,mask.apron,mask.pad],i);
      }
    }
    const grain = 0.96 + .04 * Math.sin(surface.positions[i] * 4.32 + surface.positions[i + 2] * 1.71);
    tone.copy(exposedRock).lerp(snow, snowWeight).multiplyScalar(grain).toArray(colors, i);
  }
  bowl.setAttribute('color', new BufferAttribute(colors, 3));
  bowl.setAttribute('aCraterSnowFeather', new BufferAttribute(snowRoughnessFeather, 1));
  bowl.setAttribute('aCraterStrata', new BufferAttribute(strata, 1));
  bowl.setAttribute('aCraterGeology', new BufferAttribute(geology, 3));
  bowl.setAttribute('aCraterWorkface', new BufferAttribute(workface, 3));
  bowl.setAttribute('aCraterMoundWear',new BufferAttribute(moundWear,1));
  if(naturalRelief)smoothBR30GroundNormals(bowl);
  else bowl.computeVertexNormals();
  const groundMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  // Use the original ONE B-01 walk mesh and add a per-vertex transition.
  // Its fragment roughness is 1.0 at both physical edges, gently reaching
  // 0.97 mid-lip. No overlay ring, no extra draw call or collision surface.
  groundMaterial.onBeforeCompile = shader => {
    shader.uniforms.uBR30Relief = { value: naturalRelief ? 1 : 0 };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nattribute float aCraterSnowFeather;\nvarying float vCraterSnowFeather;\nattribute float aCraterStrata;\nvarying float vCraterStrata;\nattribute vec3 aCraterGeology;\nvarying vec3 vCraterGeology;\nattribute vec3 aCraterWorkface;\nvarying vec3 vCraterWorkface;\nattribute float aCraterMoundWear;\nvarying float vCraterMoundWear;\nvarying vec3 vCraterLocal;\nvarying float vBR30Up;');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvCraterSnowFeather = aCraterSnowFeather;\nvCraterStrata = aCraterStrata;\nvCraterGeology = aCraterGeology;\nvCraterWorkface = aCraterWorkface;\nvCraterMoundWear = aCraterMoundWear;\nvCraterLocal = position;\nvBR30Up = clamp(normal.y,0.0,1.0);');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying float vCraterSnowFeather;\nvarying float vCraterStrata;\nvarying vec3 vCraterGeology;\nvarying vec3 vCraterWorkface;\nvarying float vCraterMoundWear;\nvarying vec3 vCraterLocal;\nvarying float vBR30Up;\nuniform float uBR30Relief;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCraterStrata;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.115,0.086,0.064), vCraterGeology.z*0.68);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.215,0.171,0.124), vCraterGeology.x*0.82);\nvec2 bR30Cell = floor(vCraterLocal.xz*9.0);\nfloat bR30Grain = fract(sin(dot(bR30Cell,vec2(12.9898,78.233)))*43758.5453);\nfloat bR30Chunk = fract(sin(dot(floor(vCraterLocal.xz*1.8),vec2(39.346,11.135)))*13758.5453);\nfloat bR30EdgeFade = 1.0-smoothstep(51.0,55.0,length(vCraterLocal.xz));\ndiffuseColor.rgb *= 1.0+uBR30Relief*bR30EdgeFade*(0.10*(bR30Grain-0.5)+0.08*(bR30Chunk-0.5));\n// Exposed rock is governed by actual final mesh slope, not radial color rings.\nfloat bR30Steep = 1.0-smoothstep(0.38,0.82,vBR30Up);\nfloat bR30Wall = smoothstep(20.0,24.0,length(vCraterLocal.xz))*bR30EdgeFade*uBR30Relief*(1.0-vCraterGeology.x);\nfloat bR30Dip = vCraterLocal.y+0.11*vCraterLocal.x+0.075*vCraterLocal.z+0.38*sin(vCraterLocal.x*0.29+vCraterLocal.z*0.17);\nfloat bR30Lamina = smoothstep(0.61,0.84,0.5+0.5*sin(bR30Dip*3.15));\nvec3 bR30Stone = mix(vec3(0.105,0.094,0.084),vec3(0.285,0.227,0.171),bR30Lamina*0.64+bR30Chunk*0.28);\nfloat bR30SnowHold = smoothstep(0.61,0.93,vBR30Up)*(0.25+0.75*smoothstep(0.27,0.74,bR30Chunk));\ndiffuseColor.rgb = mix(diffuseColor.rgb,bR30Stone,bR30Wall*(0.48+0.45*bR30Steep));\ndiffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.52,0.60,0.68)*(0.90+0.10*bR30Grain),bR30Wall*bR30SnowHold*0.46);\nvec3 bR30PackedSoil = mix(vec3(0.15,0.118,0.085),vec3(0.24,0.195,0.135),bR30Chunk);\nbR30PackedSoil *= 0.91+0.16*bR30Grain;\n// The signed cross section is interpolated over the real road triangles.\nfloat bR30Rut = 1.0-smoothstep(0.10,0.24,abs(abs(vCraterGeology.y)-0.54));\nvec3 bR30HaulSoil = mix(vec3(0.16,0.135,0.111),vec3(0.28,0.245,0.204),bR30Chunk);\nbR30HaulSoil *= (0.90+0.16*bR30Grain)*(1.0-0.22*bR30Rut);\ndiffuseColor.rgb = mix(diffuseColor.rgb,bR30HaulSoil,vCraterGeology.x*0.82);\ndiffuseColor.rgb = mix(diffuseColor.rgb,bR30PackedSoil,vCraterWorkface.x*0.73);\ndiffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.12,0.115,0.11)*(0.9+0.2*bR30Grain),vCraterWorkface.z*0.32);\nvec3 bR30FootSoil=mix(vec3(0.17,0.13,0.095),vec3(0.31,0.25,0.18),bR30Chunk)*(0.93+0.14*bR30Grain);\ndiffuseColor.rgb=mix(diffuseColor.rgb,bR30FootSoil,vCraterMoundWear*0.70*uBR30Relief);');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.97, vCraterSnowFeather);');
  };
  const ground = new Mesh(bowl, groundMaterial);
  ground.name = 'meteor-crater-walk-mesh';
  ground.userData.bR30UnifiedRelief = naturalRelief;
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
  const interiorDressing = mountCraterInteriorDressing(group, { slopeDressing: !naturalRelief });
  // C2: physical lamp carriers with six actual warm night sources. The
  // existing road.craterActions.setNight is the sole day/night switch.
  const floorWorklights = mountCraterFloorWorklightChain(group, surface.heightAt);

  function heightAt(worldEast: number, worldNorth: number) {
    const dx = worldEast - east, dn = worldNorth - north;
    const fixtureEast = dx * c - dn * s, fixtureNorth = dx * s + dn * c;
    // Rendered triangles are the authoritative foot surface, including the
    // in-place broken-circle cut installed later by the A-owned road host.
    const height = naturalRelief || !options.centralMound
      ? surface.heightAt(fixtureEast, fixtureNorth)
      : crater.heightOffsetAt(fixtureEast, fixtureNorth);
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
