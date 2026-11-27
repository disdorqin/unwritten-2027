import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Matrix4 } from 'three';
import { mountTownC2R30Tavern } from '../tools/voxel-tavern/town-blockout/town-c2-r30-tavern.js';
import { mountTownC2R30Domestic } from '../tools/voxel-tavern/town-blockout/town-c2-r30-warrior-domestic.js';
import { mountTownC2R30VaultApproach } from '../tools/voxel-tavern/town-blockout/town-c2-r30-vault-approach.js';
import { mountTownC2R30RoosterStarStone } from '../tools/voxel-tavern/town-blockout/town-c2-r30-rooster-star-stone.js';
import { mountTownC2R30CityVault } from '../tools/voxel-tavern/town-blockout/town-c2-r30-city-vault.js';
import { mountTownC2R30RiverTerrace } from '../tools/voxel-tavern/town-blockout/town-c2-r30-river-terrace.js';

/**
 * Every C2 package authors `y` as the *bottom* of a piece and derives its
 * collider from that same bottom, so the visible box has to be centred half a
 * height above `y`. This lane-wide guard keeps the drawn geometry and the
 * collision geometry from drifting apart, which used to sink every prop half
 * its own height into the floor.
 */
type Package = Readonly<{
  name: string;
  mount: (options: Readonly<{
    parent?: unknown;
    site?: { domainId: string; east: number; north: number; height: number; yaw: number };
    supportsSite?: (site: unknown) => boolean;
  }>) => {
    group: { traverse: (fn: (object: unknown) => void) => void };
    pieces: readonly { family: string; y: number; h: number; solid: boolean }[];
    colliders: readonly { min: readonly number[]; max: readonly number[] }[];
    dispose(): void;
  };
}>;

const packages: readonly Package[] = [
  { name: 'C2-R02a tavern', mount: mountTownC2R30Tavern as Package['mount'] },
  { name: 'C2-R02b domestic', mount: mountTownC2R30Domestic as Package['mount'] },
  { name: 'C2-R03 vault-approach', mount: mountTownC2R30VaultApproach as Package['mount'] },
  { name: 'C2-R05 rooster', mount: mountTownC2R30RoosterStarStone as Package['mount'] },
  { name: 'C2-R06 city-vault', mount: mountTownC2R30CityVault as Package['mount'] },
  { name: 'C2-R07 river-terrace', mount: mountTownC2R30RiverTerrace as Package['mount'] },
];

for (const entry of packages) {
  test(`C2 height convention: ${entry.name} draws boxes from the authored bottom`, () => {
    const scene = entry.mount({
      site: { domainId: `review:c2:height:${entry.name}`, east: 0, north: 0, height: 0, yaw: 0 },
      supportsSite: () => true,
    });
    try {
      const meshes: InstancedMesh[] = [];
      scene.group.traverse(object => { if (object instanceof InstancedMesh) meshes.push(object); });
      const families = new Set(scene.pieces.map(piece => piece.family));
      const matrix = new Matrix4();
      let checked = 0;
      for (const family of families) {
        const members = scene.pieces.filter(piece => piece.family === family);
        const mesh = meshes.find(candidate => candidate.name.endsWith(`/${family}`) &&
          candidate.count === members.length);
        assert.ok(mesh, `${entry.name}: no mesh for family ${family}`);
        for (let index = 0; index < members.length; index++) {
          const piece = members[index]!;
          mesh.getMatrixAt(index, matrix);
          const centre = matrix.elements[13]!;
          assert.ok(Math.abs(centre - (piece.y + piece.h / 2)) < 1e-4,
            `${entry.name}/${family}#${index}: box centre ${centre} does not sit ` +
            `${piece.h / 2} above the authored bottom ${piece.y}`);
          checked++;
        }
      }
      assert.ok(checked > 0, `${entry.name}: nothing checked`);
      // The collider must cover the same vertical span as the drawn box.
      for (const piece of scene.pieces.filter(entryPiece => entryPiece.solid)) {
        const collider = scene.colliders.find(box =>
          Math.abs(box.min[1]! - piece.y) < 1e-6 &&
          Math.abs(box.max[1]! - (piece.y + piece.h)) < 1e-6);
        assert.ok(collider, `${entry.name}: a solid piece has no collider over its authored span`);
      }
    } finally {
      scene.dispose();
    }
  });
}
