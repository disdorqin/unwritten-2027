import type { Group, MeshLambertMaterial } from 'three';
import { addOpaqueMuseumLabels } from './museum-label-atlas';
import { createMuseumLabelCanvas, type MuseumLabelStyle } from './museum-label-canvas';

export function addLandmarkNameplate(
  parent: Group, text: string, x: number, y: number, z: number,
  width: number, height: number, yaw: number, style: MuseumLabelStyle,
) {
  if (typeof document === 'undefined') return;
  const source = createMuseumLabelCanvas(text, width, height, style);
  addOpaqueMuseumLabels([{ source, parent, x, y, z, width, height, yaw }], []);
}

// Keep the original lamp intensity while combining nearby opaque and emissive pieces.
export function useLandmarkEmissionMask(material: MeshLambertMaterial, unlit = false) {
  const varying = 'varying float vLandmarkEmission;';
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float landmarkEmission;\n' + varying + '\n'
      + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvLandmarkEmission = landmarkEmission;');
    const chunk = unlit ? '#include <envmap_fragment>' : '#include <emissivemap_fragment>';
    const treatment = unlit
      ? 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, vLandmarkEmission);\n' + chunk
      : chunk + '\ntotalEmissiveRadiance *= vLandmarkEmission;';
    shader.fragmentShader = varying + '\n' + shader.fragmentShader.replace(chunk, treatment);
  };
  material.customProgramCacheKey = () => unlit ? 'landmark-unlit-mask' : 'landmark-emission-mask';
}
