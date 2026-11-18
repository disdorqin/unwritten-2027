import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, PointsMaterial, type Scene } from 'three';

const particleCount = 12;
const lifespan = .35;

export function createLandingSnow(scene: Scene) {
  const coordinates = new Float32Array(particleCount * 3);
  const positions = new BufferAttribute(coordinates, 3).setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', positions);
  const material = new PointsMaterial({ color: 0xe7f5ff, size: .065, transparent: true, depthWrite: false });
  const snow = new Points(geometry, material);
  snow.name = 'Landing snow';
  snow.visible = false;
  snow.frustumCulled = false;
  scene.add(snow);

  let age = lifespan;
  let east = 0, feet = 0, z = 0;
  function placeFlakes() {
    for (let i = 0; i < particleCount; i++) {
      const angle = i / particleCount * 2 * Math.PI;
      const spread = .13 + age * (1.8 + (i % 3) * .32);
      positions.setXYZ(i, east + Math.cos(angle) * spread,
        feet + Math.max(0, age * (2.0 + (i % 4) * .24) - 5 * age * age),
        z + Math.sin(angle) * spread);
    }
    positions.needsUpdate = true;
    material.opacity = 1 - age / lifespan;
  }

  return {
    burst(x: number, y: number, depth: number) {
      east = x;
      feet = y;
      z = depth;
      age = 0;
      placeFlakes();
      snow.visible = true;
    },
    update(seconds: number) {
      if (!snow.visible) return;
      age += seconds;
      snow.visible = age < lifespan;
      if (snow.visible) placeFlakes();
    },
  };
}
