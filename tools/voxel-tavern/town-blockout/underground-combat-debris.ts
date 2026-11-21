import {
  BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, type Vector3Like,
} from 'three';

const maximumBursts = 4;
const iceColors = [new Color('#eafdff'), new Color('#7cc5e6')];
const metalColors = [new Color('#fff5a6'), new Color('#ff9b39')];
type Family = 'ice' | 'metal';
type Burst = Readonly<{ family: Family; at: Vector3Like; started: number }>;

export function createUndergroundCombatDebris() {
  const object = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), maximumBursts * 6);
  object.name = 'underground-combat-debris';
  object.count = 0;
  object.visible = false;
  object.frustumCulled = false;
  object.instanceMatrix.setUsage(DynamicDrawUsage);
  const pose = new Object3D();
  const bursts: Burst[] = [];

  function clear() {
    bursts.length = 0;
    object.count = 0;
    object.visible = false;
  }

  return {
    object,
    burst(family: Family, at: Vector3Like, nowMs: number) {
      if (![at.x, at.y, at.z, nowMs].every(Number.isFinite)) return;
      if (bursts.length === maximumBursts) bursts.shift();
      bursts.push({ family, at: { x: at.x, y: at.y, z: at.z }, started: nowMs });
    },
    sample(nowMs: number) {
      let count = 0;
      let retained = 0;
      for (const burst of bursts) {
        const ice = burst.family === 'ice';
        const age = Math.max(0, nowMs - burst.started);
        const progress = age / (ice ? 240 : 170);
        if (!(progress < 1)) continue;
        bursts[retained++] = burst;
        const amount = ice ? 6 : 5;
        const colors = ice ? iceColors : metalColors;
        const size = (1 - progress) * (ice ? .075 : .046);
        for (let index = 0; index < amount; index++) {
          const angle = (index / amount) * Math.PI * 2;
          const radius = (ice ? .14 : .10) + progress * (ice ? .49 : .42);
          pose.position.set(
            burst.at.x + Math.cos(angle) * radius,
            burst.at.y + .10 + progress * (.47 + index * .024 - progress * .55),
            burst.at.z + Math.sin(angle) * radius,
          );
          pose.rotation.set(angle + progress * 3, angle, progress * 4);
          pose.scale.set(size, size * (ice ? .85 : 2.2), size * .75);
          pose.updateMatrix();
          object.setMatrixAt(count, pose.matrix);
          object.setColorAt(count++, colors[index % colors.length]);
        }
      }
      bursts.length = retained;
      object.count = count;
      object.visible = count > 0;
      if (count === 0) return;
      object.instanceMatrix.needsUpdate = true;
      if (object.instanceColor) object.instanceColor.needsUpdate = true;
    },
    clear,
    dispose() {
      clear();
      object.removeFromParent();
      object.dispose();
      object.geometry.dispose();
      object.material.dispose();
    },
  };
}
