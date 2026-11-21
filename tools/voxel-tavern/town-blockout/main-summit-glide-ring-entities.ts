import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial,
} from 'three';
import type { SummitGlideRing } from './main-summit-glide-rings';

type GroundAt = (east: number, north: number) => number | undefined;

/**
 * Glide-ring entities (§4 / ref m12): the surveyed crossing rings gain
 * their physical dressing — long prayer-cloth streamers and small brass
 * bells at the rim, and a timber pole wherever the ring hangs low enough
 * over the slope to stand on one. The state-coloured rail itself stays
 * with the survey visuals; this module is pure placement dressing, and
 * the high/low dual-line registry lives in the extras host.
 */
export function createGlideRingEntities(rings: readonly SummitGlideRing[], groundAt: GroundAt) {
  const group = new Group();
  group.name = 'main-summit-glide-ring-entities';
  const disposers: (() => void)[] = [];
  const timber = new MeshLambertMaterial({ color: '#5d4630' });
  const brass = new MeshLambertMaterial({ color: '#b08d4f' });
  const clothRed = new MeshLambertMaterial({ color: '#c33f31' });
  const clothPale = new MeshLambertMaterial({ color: '#e8e2cf' });
  disposers.push(() => { timber.dispose(); brass.dispose(); clothRed.dispose(); clothPale.dispose(); });

  const streamers: Mesh[] = [];
  let poles = 0;
  for (const [index, ring] of rings.entries()) {
    const ringGroup = new Group();
    ringGroup.name = `glide-ring-entity-${ring.id}`;
    ringGroup.position.set(ring.east, ring.height, -ring.north);
    ringGroup.rotation.y = Math.PI - ring.heading;
    // Streamers trail from both sides of the rim, in the wind.
    for (const side of [-1, 1]) {
      const streamer = new Mesh(new BoxGeometry(2.3, .3, .03), index % 2 ? clothPale : clothRed);
      streamer.name = 'glide-ring-streamer';
      streamer.position.set(side * (ring.radius + 1.05), .4, 0);
      streamer.rotation.z = side * .1;
      ringGroup.add(streamer);
      streamers.push(streamer);
      disposers.push(() => streamer.geometry.dispose());
      const bell = new Mesh(new ConeGeometry(.17, .3, 8), brass);
      bell.name = 'glide-ring-bell';
      bell.position.set(side * ring.radius * .72, -ring.radius * .72, 0);
      ringGroup.add(bell);
      disposers.push(() => bell.geometry.dispose());
    }
    group.add(ringGroup);
    // A pole only where the ring hangs within reach of the slope (m12).
    const ground = groundAt(ring.east, ring.north);
    const gap = ground === undefined ? Infinity : (ring.height - ring.radius) - ground;
    if (gap >= 0 && gap < 8) {
      const pole = new Mesh(new CylinderGeometry(.09, .13, gap + 1, 6), timber);
      pole.name = 'glide-ring-pole';
      pole.position.set(ring.east, ground! + (gap + 1) / 2, -ring.north);
      group.add(pole);
      poles++;
      disposers.push(() => pole.geometry.dispose());
    }
  }

  let disposed = false;
  return {
    group, poles,
    update(seconds: number) {
      streamers.forEach((streamer, i) => {
        streamer.rotation.y = Math.sin(seconds * 1.8 + i * 1.3) * .35;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}
