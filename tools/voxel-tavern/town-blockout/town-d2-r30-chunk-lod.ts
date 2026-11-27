import { BufferGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import {
  townD2R30Anchors, townD2R30ChunkList, townD2R30LodSpacing, townD2R30Spec,
} from './town-d2-r30-domain';
import type { TownD2R30Chunk } from './town-d2-r30-domain';
import { buildTownD2R30ChunkGeometry } from './town-d2-r30-massif';

export type TownD2R30ChunkLodOptions = {
  arrivalHeight?: number;
  buildGeometry?: typeof buildTownD2R30ChunkGeometry;
};

export type TownD2R30ChunkLodStats = {
  visibleChunks: number;
  cachedChunks: number;
  simulatedChunks: number;
  draws: number;
  triangles: number;
  rebuilds: number;
};

type ChunkEntry = {
  mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  spacing: number;
};

const unloadRadius = townD2R30Spec.residentRadius + townD2R30Spec.unloadHysteresis;

function distanceToChunk(chunk: TownD2R30Chunk, east: number, north: number) {
  const dx = Math.max(chunk.west - east, east - chunk.east, 0);
  const dn = Math.max(chunk.south - north, north - chunk.north, 0);
  return Math.hypot(dx, dn);
}

function triangleCount(geometry: BufferGeometry) {
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  return Math.floor(count / 3);
}

/**
 * Streaming owner for the main massif's 256 m render chunks. Coordinates are
 * local to the massif; the caller owns placement of `group` in the world.
 */
export function createTownD2R30ChunkLod(options: TownD2R30ChunkLodOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? townD2R30Anchors.gate.height;
  const buildGeometry = options.buildGeometry ?? buildTownD2R30ChunkGeometry;
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid D2-R30 arrival height.');

  const group = new Group();
  group.name = 'town-d2-r30-chunk-lod';
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.name = 'town-d2-r30-chunk-lod-shared';
  const entries = new Map<string, ChunkEntry>();
  let disposed = false;
  let observerEast: number | undefined;
  let observerNorth: number | undefined;
  let simulatedChunks = 0;
  let rebuilds = 0;

  function removeChunk(key: string, entry: ChunkEntry) {
    group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entries.delete(key);
  }

  function replaceChunk(chunk: TownD2R30Chunk, spacing: number, previous?: ChunkEntry) {
    const geometry = buildGeometry(chunk, spacing, arrivalHeight);
    // A single ungrouped geometry keeps the one-mesh/one-draw-call contract.
    geometry.clearGroups();
    const mesh = new Mesh(geometry, material);
    mesh.name = `town-d2-r30-chunk-${chunk.key}-spacing-${spacing}`;
    mesh.userData = { chunkKey: chunk.key, spacing };
    if (previous) {
      group.remove(previous.mesh);
      previous.mesh.geometry.dispose();
    }
    entries.set(chunk.key, { mesh, spacing });
    group.add(mesh);
    rebuilds++;
  }

  function update(east: number, north: number) {
    if (disposed) throw new Error('Cannot update a disposed D2-R30 chunk LOD.');
    if (!Number.isFinite(east) || !Number.isFinite(north)) {
      throw new RangeError('Invalid D2-R30 local observer point.');
    }
    if (east === observerEast && north === observerNorth) return;
    observerEast = east;
    observerNorth = north;
    simulatedChunks = 0;

    for (const chunk of townD2R30ChunkList) {
      const distance = distanceToChunk(chunk, east, north);
      if (distance <= townD2R30Spec.simulationRadius) simulatedChunks++;

      const entry = entries.get(chunk.key);
      if (entry && distance > unloadRadius) {
        removeChunk(chunk.key, entry);
        continue;
      }
      if (!entry && distance > unloadRadius) continue;

      const spacing = townD2R30LodSpacing(distance);
      if (!entry || entry.spacing !== spacing) replaceChunk(chunk, spacing, entry);

      // The frozen unload ring lies inside visibleRadius. Only resident meshes
      // can be drawn, so visibility and draw statistics cannot diverge.
      const mesh = entries.get(chunk.key)!.mesh;
      mesh.visible = distance <= townD2R30Spec.visibleRadius && distance <= unloadRadius;
    }
  }

  function stats(): TownD2R30ChunkLodStats {
    if (disposed) {
      return { visibleChunks: 0, cachedChunks: 0, simulatedChunks: 0, draws: 0, triangles: 0, rebuilds };
    }
    let visibleChunks = 0, triangles = 0;
    for (const { mesh } of entries.values()) {
      if (!mesh.visible) continue;
      visibleChunks++;
      triangles += triangleCount(mesh.geometry);
    }
    return {
      visibleChunks,
      cachedChunks: entries.size,
      simulatedChunks,
      draws: visibleChunks,
      triangles,
      rebuilds,
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [key, entry] of entries) removeChunk(key, entry);
    material.dispose();
    group.clear();
    observerEast = undefined;
    observerNorth = undefined;
    simulatedChunks = 0;
  }

  return { group, update, stats, dispose };
}
