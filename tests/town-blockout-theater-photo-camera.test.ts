import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { theaterPhotoPositions } from '../tools/voxel-tavern/town-blockout/community-theater';
import { createTheaterPhotoCamera } from '../tools/voxel-tavern/town-blockout/theater-photo-camera';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';

test('both approved theater anchors contain 48 standing figures and tighten for a central small group', () => {
  const grid = createTerrainGrid();
  const small = theaterPhotoPositions.slice(3, 9);
  for (const view of ['stage', 'clocktower'] as const) {
    const full = createTheaterPhotoCamera(view, theaterPhotoPositions, grid.heightAt);
    assert.equal(full.position.z, view === 'stage' ? -174 : -146);
    assert.equal(full.position.y, grid.heightAt(224, -full.position.z) + 2.5);
    const reverse = view === 'stage' ? 1 : -1;
    assert.ok(full.getWorldDirection(new Vector3()).z * reverse > 0);
    for (const positions of [theaterPhotoPositions, small]) {
      const camera = createTheaterPhotoCamera(view, positions, grid.heightAt);
      if (positions === small) assert.ok(camera.fov < full.fov);
      for (const { east, north, height } of positions) for (const dx of [-.31, .31]) for (const dy of [0, 2.15]) {
        const clip = new Vector3(east + dx, height + dy, -north).project(camera);
        assert.ok(Math.abs(clip.x) < 1 && Math.abs(clip.y) < 1, `${view}: E${east} N${north} clip ${clip.toArray()}`);
      }
    }
  }
});
