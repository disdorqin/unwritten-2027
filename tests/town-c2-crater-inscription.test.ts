import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  BoxGeometry, CanvasTexture, DataTexture, Group, Mesh, MeshStandardMaterial, NearestFilter,
} from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { SHIP_EMBLEM_CELLS } from '../tools/voxel-tavern/town-blockout/ship-emblem';
import {
  buildTownC2CraterInscription, c2CraterInscriptionSpec, mountC2CraterInscription,
  surveyC2CraterInscription, type CraterInscriptionScene,
} from '../tools/voxel-tavern/town-blockout/town-c2-crater-inscription';

const terrain = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, north => terrain.groundHeightAt(0, north));
const scenes: CraterInscriptionScene[] = [];
after(() => {
  for (const scene of scenes) scene.dispose();
});

function build() {
  const scene = buildTownC2CraterInscription(road);
  scenes.push(scene);
  return scene;
}

function close(actual: number, expected: number, epsilon = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('C2-04 samples the real due-east blackstone upper edge at exactly 90 degrees', () => {
  const survey = surveyC2CraterInscription(road);
  close(survey.bearingDeg, 90);
  close(survey.north, road.anchor.north);
  assert.ok(survey.east > road.anchor.east);
  close(Math.atan2(survey.east - road.anchor.east, survey.north - road.anchor.north) * 180 / Math.PI, 90);
  close(survey.height, road.heightAt(survey.east, survey.north)!);
  assert.equal(survey.source, 'za36-blackstone-geometry');
  assert.ok(survey.sampledBlackstoneCount >= 2);
  const oldSnakeStone = road.winch!.survey.snakeStoneReservation;
  assert.ok(Math.hypot(survey.east - oldSnakeStone.east, survey.north - oldSnakeStone.north) > 40,
    'the new east-band inscription must not duplicate the old snake-stone reservation');

  const sector = road.ejecta.placements.filter(piece => piece.kind === 'blackstone').map(piece => {
    const dx = piece.east - road.anchor.east, dn = piece.north - road.anchor.north;
    const bearing = Math.atan2(dx, dn);
    const delta = Math.abs(Math.atan2(Math.sin(bearing - Math.PI / 2), Math.cos(bearing - Math.PI / 2)));
    return { radius: Math.hypot(dx, dn), delta };
  }).filter(piece => piece.delta <= Math.PI / 12);
  close(survey.sampledRadius, Math.max(...sector.map(piece => piece.radius)));

  // The sampled slab envelope does not swallow any old blackstone instance.
  for (const piece of road.ejecta.placements.filter(piece => piece.kind === 'blackstone')) {
    const nearestEast = Math.max(survey.east - .8, Math.min(survey.east + .8, piece.east));
    const nearestNorth = Math.max(survey.north - 1.2, Math.min(survey.north + 1.2, piece.north));
    assert.ok(Math.hypot(piece.east - nearestEast, piece.north - nearestNorth) - piece.footprint >=
      c2CraterInscriptionSpec.blackstoneClearance - 1e-7);
  }
});

test('C2-04 lying stone is 2.4×1.6×0.5 m with its carved front facing west toward the crater', () => {
  const scene = build();
  const stone = scene.group.getObjectByName('town-c2-crater-inscription/stone') as Mesh;
  assert.ok(stone instanceof Mesh);
  assert.ok(stone.geometry instanceof BoxGeometry);
  stone.geometry.computeBoundingBox();
  const size = stone.geometry.boundingBox!.getSize(stone.position.clone().set(0, 0, 0));
  close(size.x, 1.6);
  close(size.y, .5);
  close(size.z, 2.4);
  assert.deepEqual(scene.stats.dimensions, [2.4, 1.6, .5]);
  assert.deepEqual(scene.layout.stone.frontNormal, [-1, 0, 0]);
  assert.equal(scene.stats.frontBearingDeg, 270);
  const toCrater = [road.anchor.east - scene.layout.stone.east, road.anchor.north - scene.layout.stone.north];
  assert.ok(toCrater[0]! < 0 && Math.abs(toCrater[1]!) < 1e-7, 'the front points west, not east');
  close(scene.layout.stone.height, road.heightAt(scene.layout.stone.east, scene.layout.stone.north)!);
});

test('C2-04 reuses one connected canonical crescent/descending-arc engraving, with no detached second arc', () => {
  const scene = build();
  const mark = scene.group.getObjectByName('town-c2-crater-inscription/crescent-descending-arc') as Mesh;
  assert.ok(mark instanceof Mesh);
  assert.equal(mark.parent, scene.group.getObjectByName('town-c2-crater-inscription/stone'));
  assert.equal(mark.userData.cellCount, SHIP_EMBLEM_CELLS.length);
  assert.equal(scene.stats.emblemMeshCount, 1);
  const matchingMarks: Mesh[] = [];
  scene.group.traverse(object => {
    if (object instanceof Mesh && object.name.includes('crescent-descending-arc')) matchingMarks.push(object);
  });
  assert.equal(matchingMarks.length, 1);
  const material = mark.material as MeshStandardMaterial;
  assert.equal(material.color.getHex(), 0x24251f, 'the mark is incised dark, not a gold ship-name plate');
  mark.geometry.computeBoundingBox();
  assert.ok(mark.geometry.boundingBox!.min.y >= -.25 && mark.geometry.boundingBox!.max.y <= .25,
    'all emblem cells stay on the 0.5 m-high west face');
  assert.ok(mark.geometry.boundingBox!.min.x < -.8 && mark.geometry.boundingBox!.max.x > -.8,
    'the engraving straddles the west face as a shallow incised mark');

  const key = (x: number, y: number) => `${Math.round(x / .11)},${Math.round(y / .11)}`;
  const cells = new Map(SHIP_EMBLEM_CELLS.map(cell => [key(cell.x, cell.y), cell]));
  const seen = new Set<string>();
  const queue = [SHIP_EMBLEM_CELLS[0]!];
  while (queue.length) {
    const cell = queue.pop()!;
    const k = key(cell.x, cell.y);
    if (seen.has(k)) continue;
    seen.add(k);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const next = cells.get(`${Math.round(cell.x / .11) + dx},${Math.round(cell.y / .11) + dy}`);
      if (next && !seen.has(key(next.x, next.y))) queue.push(next);
    }
  }
  assert.equal(seen.size, SHIP_EMBLEM_CELLS.length, 'crescent and falling arc are one king-connected mark');
});

test('C2-04 has a blank stele, paper and ink on a table immediately south, and no text-bearing prop', () => {
  const scene = build();
  const { stone, table, blankStele, paper, ink } = scene.layout;
  assert.ok(table.north < stone.north);
  close(table.east, stone.east);
  const gap = (stone.north - 1.2) - (table.north + .4);
  close(gap, .4);
  assert.ok(gap > 0 && gap <= .6, 'the table is adjacent without entering the slab');
  assert.ok(scene.group.getObjectByName('town-c2-crater-inscription/rubbing-table'));
  assert.ok(scene.group.getObjectByName('town-c2-crater-inscription/blank-stone-slab'));
  assert.ok(scene.group.getObjectByName('town-c2-crater-inscription/paper'));
  assert.ok(scene.group.getObjectByName('town-c2-crater-inscription/inkstone-and-stick'));
  close(blankStele.height, table.height + .8);
  assert.ok(paper.height > table.height && ink.height > table.height);
  assert.equal(scene.stats.hasText, false);

  scene.group.traverse(object => {
    assert.doesNotMatch(object.name, /sign|plaque|caption|label|translation|ship-name/i);
    for (const value of Object.values(object.userData)) {
      assert.equal(typeof value === 'string' && /[\u3400-\u9fff]/.test(value), false,
        'no Chinese copy or translation is attached to scene nodes');
    }
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        assert.equal(material.map instanceof CanvasTexture, false, 'no canvas text texture is allowed');
      }
    }
  });
});

test('C2-04 stone/table/paper/ink use nearest-filtered 16px material families', () => {
  const scene = build();
  assert.deepEqual(scene.stats.materialFamilies, ['stone', 'timber', 'paper', 'ink', 'engraving']);
  assert.ok(scene.stats.materialFamilies.length >= 3);
  const textured = new Set<DataTexture>();
  scene.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || !material.map) continue;
      assert.ok(material.map instanceof DataTexture);
      assert.equal(material.map.image.width, 16);
      assert.equal(material.map.image.height, 16);
      assert.equal(material.map.minFilter, NearestFilter);
      assert.equal(material.map.magFilter, NearestFilter);
      assert.equal(material.map.generateMipmaps, false);
      textured.add(material.map);
    }
  });
  assert.ok(textured.size >= 4);
});

test('C2-04 appends one tight slab collider to the existing za22 channel and exports only a rubbing host marker', () => {
  const owner = new Group();
  const oldCollider = { min: [90, 2, -3], max: [91, 3, -2] };
  owner.userData.colliders = [oldCollider];
  const oldGroup = new Group();
  oldGroup.name = 'old-read-only-scenery';
  owner.add(oldGroup);
  const scene = mountC2CraterInscription(owner, road);
  scenes.push(scene);
  assert.equal(owner.userData.colliders.length, 2);
  assert.equal(owner.userData.colliders[0], oldCollider);
  assert.equal(owner.userData.colliders[1], scene.colliders[0]);
  assert.ok(owner.children.includes(oldGroup));
  assert.equal(owner.getObjectsByProperty('name', 'town-c2-crater-inscription').length, 1);

  const collider = scene.colliders[0]!;
  close(collider.max[0]! - collider.min[0]!, 1.6);
  close(collider.max[1]! - collider.min[1]!, .5);
  close(collider.max[2]! - collider.min[2]!, 2.4);
  close(collider.min[1]!, scene.layout.stone.height);
  const snakeStone = road.winch!.survey.snakeStoneReservation;
  assert.ok(Math.hypot((collider.min[0]! + collider.max[0]!) / 2 - snakeStone.east,
    -(collider.min[2]! + collider.max[2]!) / 2 - snakeStone.north) > 40,
  'the new collider does not duplicate the old snake-stone reservation');
  assert.equal(scene.colliders.length, 1, 'the table and host marker do not become invisible walls');
  assert.throws(() => mountC2CraterInscription(owner, road), /already mounted/,
    'a second old/new carved stone cannot be mounted');
  assert.equal(owner.userData.colliders.length, 2);

  const marker = scene.rubbingHostMarker;
  assert.ok(Object.isFrozen(marker));
  assert.equal(marker.kind, 'rubbing');
  assert.equal(marker.targetId, c2CraterInscriptionSpec.id);
  close(marker.east, scene.layout.useFoot.east);
  close(marker.north, scene.layout.useFoot.north);
  close(marker.height, scene.layout.useFoot.height);
  assert.equal(marker.range, 2.4);
  for (const forbidden of ['holdMs', 'duration', 'inventory', 'collected', 'atlas', 'record', 'unlock']) {
    assert.equal(forbidden in marker, false, `${forbidden} belongs to window B`);
  }
  assert.equal('text' in marker, false);
  assert.equal('translation' in marker, false);

  scene.dispose();
  scene.dispose();
  assert.deepEqual(owner.userData.colliders, [oldCollider]);
  assert.deepEqual(owner.children, [oldGroup]);
});
