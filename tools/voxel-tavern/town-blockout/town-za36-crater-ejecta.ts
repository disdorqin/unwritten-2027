import {
  BoxGeometry, DataTexture, DodecahedronGeometry, Group, InstancedMesh,
  MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace,
} from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type CraterGround = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
export type Za36EjectaPiece = Readonly<{
  kind: 'ejecta' | 'blackstone' | 'char';
  ray: number;
  east: number;
  north: number;
  ground: number;
  footprint: number;
  height: number;
}>;

const tau = Math.PI * 2;
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const stone = new DodecahedronGeometry(1, 0);
const patch = new BoxGeometry();

function rockTexture(base: number, streak: number, fleck: number) {
  const bytes = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const hashed = (x * 11 + y * 17 + x * y * 3) % 29;
    const pigment = hashed < 5 ? streak : hashed > 25 ? fleck : base;
    bytes.set([pigment >> 16, pigment >> 8 & 255, pigment & 255, 255], (y * 16 + x) * 4);
  }
  const tex = new DataTexture(bytes, 16, 16);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const dark = new MeshStandardMaterial({
  map: rockTexture(0x2c3648, 0x5d4630, 0x8a8378), flatShading: true, roughness: 1,
});
const grey = new MeshStandardMaterial({
  map: rockTexture(0x8a8378, 0x2c3648, 0x8a4a34), flatShading: true, roughness: 1,
});
const charcoal = new MeshStandardMaterial({
  map: rockTexture(0x2c3648, 0x8a4a34, 0x5d4630), flatShading: true, roughness: 1,
});

function distanceToSegment(east: number, north: number,
  startE: number, startN: number, endE: number, endN: number) {
  const de = endE - startE, dn = endN - startN;
  const proportion = Math.max(0, Math.min(1,
    ((east - startE) * de + (north - startN) * dn) / (de * de + dn * dn)));
  return Math.hypot(east - startE - proportion * de, north - startN - proportion * dn);
}

/**
 * Story-board §I.3–4: eight radial impact streaks, with house-size outcrop
 * rocks that read from town, and a staggered blackstone crown inside the rim.
 * This is strictly geometry/dressing: ZA-34 alone owns future terrain relief.
 */
export function buildZa36CraterEjecta(road: CraterGround) {
  const { east: centerE, north: centerN, yaw } = road.anchor;
  const group = new Group();
  group.name = 'za36-crater-ejecta-landmarks';
  const placements: Za36EjectaPiece[] = [];
  const matrices = new Map<string, Object3D[]>();
  const trail = Array.from({ length: 1301 }, (_, index) => {
    const q = fixture.mainTrailPoint(index / 1300);
    return { east: centerE + q.east * Math.cos(yaw) + q.north * Math.sin(yaw),
      north: centerN + q.north * Math.cos(yaw) - q.east * Math.sin(yaw) };
  });
  const put = (kind: Za36EjectaPiece['kind'], ray: number, east: number,
    north: number, width: number, height: number, angle: number) => {
    const ground = road.heightAt(east, north);
    if (!Number.isFinite(ground) || ground === undefined) return;
    if (east < -237 || east > -7 || north < 7 || north > 530) return;
    const radius = width * .5;
    if (Math.hypot(east - road.lip.east, north - road.lip.north) < 10 + radius) return;
    if (distanceToSegment(east, north, road.lip.east, road.lip.north,
      0, 159) < radius + 4.5) return;
    if (trail.some(point => Math.hypot(east - point.east, north - point.north) < radius + 3.2)) return;
    if (placements.some(piece => Math.hypot(east - piece.east, north - piece.north) <
      (radius + piece.footprint) * (kind === 'char' || piece.kind === 'char' ? .3 : .79))) return;
    const piece = new Object3D();
    piece.position.set(east, ground + (kind === 'char' ? .04 : height * .44), -north);
    piece.rotation.set(kind === 'char' ? 0 : .08, angle, kind === 'char' ? 0 : -.12);
    piece.scale.set(width * .5, height * .5, width * .38);
    piece.updateMatrix();
    const key = kind === 'ejecta' ? (ray % 3 === 0 ? 'ejecta-grey' : 'ejecta-dark') : kind;
    const items = matrices.get(key) ?? [];
    items.push(piece);
    matrices.set(key, items);
    placements.push({ kind, ray, east, north, ground, footprint: radius, height });
  };

  // Sixty 2–5 m outcrops on eight visible, irregular impact rays.
  // The starts avoid the inner spiral and existing surface decorations.
  for (let ray = 0; ray < 8; ray++) {
    const bearing = yaw + .18 + ray * tau / 8;
    for (let step = 0; step < (ray < 4 ? 8 : 7); step++) {
      // The 4.8m industrial fence runs at radius 82m: deliberately keep a
      // distinct no-stone band (r77–89) so posts do not pierce house rocks.
      const radial = [64.5,70,75,90,95.5,101,106.5,112][step]! + ray % 2 * 1.6;
      const offset = ray === 1 && step === 7 ? 6 : (step % 3 - 1) * .85;
      // The enclosed 5.5m heritage wall crosses ray-zero here. Its single
      // gate stays fixed: offset one boulder north-west without losing its
      // unique large-scale radial silhouette or shrinking the 60-stone set.
      const deflection = ray === 0 && step === 6;
      const e = centerE + radial * Math.sin(bearing) + offset * Math.cos(bearing)
        - (deflection ? 4.2 : 0);
      const n = centerN + radial * Math.cos(bearing) - offset * Math.sin(bearing)
        + (deflection ? 8.8 : 0);
      const width = 2.6 + (step * 7 + ray * 3) % 6 * .42;
      const height = 2.15 + (step * 3 + ray * 5) % 7 * .43;
      put('ejecta', ray, e, n, width, height, bearing + (step % 4) * .23);
    }
  }

  // Three overlapping faceted stones at each of 24 rim sectors; omitted
  // around the guarded mouth or where the signed-off spiral passes.
  for (let ray = 0; ray < 24; ray++) {
    const bearing = yaw + .37 + ray * tau / 24;
    for (let part = 0; part < 3; part++) {
      const radial = 53.3 + part * 1.8;
      const tilt = (part - 1) * 1.48;
      const e = centerE + radial * Math.sin(bearing) + tilt * Math.cos(bearing);
      const n = centerN + radial * Math.cos(bearing) - tilt * Math.sin(bearing);
      put('blackstone', ray, e, n, 1.6 + (ray + part) % 4 * .43,
        1.15 + (ray + 2 * part) % 5 * .36, bearing + .15 * part);
    }
  }

  // Large scorched impact patches under outcrops, not standalone visual
  // noise; intentionally do not register navigation colliders until the
  // dedicated full-surface/terrain acceptance round.
  const rocks = placements.filter(piece => piece.kind === 'ejecta');
  for (let index = 0; index < rocks.length; index += 3) {
    const rock = rocks[index]!;
    // Replace a failed decal footprint with another nearby ash patch;
    // never quietly drop the twentieth piece for road-clearance reasons.
    const standard = rock.ray === 0 && index === 6 ? -3 : 3;
    const before = placements.length;
    for (const [de,dn] of [[standard,2.2],[-3.5,-2.3],[4.2,-4.2],[-5.5,4.8],[-6.3,-5.6]] as const) {
      put('char',rock.ray,rock.east+de,rock.north+dn,5.1,.11,(rock.ray*1.1)%tau);
      if (placements.length>before) break;
    }
  }

  for (const [name, transforms] of matrices) {
    const geometry = name === 'char' ? patch : stone;
    const material = name === 'char' ? charcoal : name === 'ejecta-grey' ? grey : dark;
    const mesh = new InstancedMesh(geometry, material, transforms.length);
    mesh.name = 'za36-' + name;
    transforms.forEach((item, index) => mesh.setMatrixAt(index, item.matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, placements };
}
