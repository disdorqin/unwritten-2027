import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CanvasTexture, DataTexture, DoubleSide, Group, Mesh, NearestFilter, PlaneGeometry, RepeatWrapping, Vector3,
  type BufferGeometry, type Material, type Object3D,
} from 'three';
import {
  createTownD2FrontRidgeRestStops, hideLegacyD5Supplement, TOWN_D2_REST_STOP_TEXTS,
} from '../tools/voxel-tavern/town-blockout/town-d2-front-ridge-rest-stops';
import {
  buildSwitchbackCenterline, createFrontRidgeSwitchbackRoad, type SwitchbackPoint,
} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import { sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

function trueDistance(line: readonly SwitchbackPoint[]) {
  const cumulative = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height));
  }
  return cumulative;
}

function distanceToSegment(point: { east: number; north: number; height: number }, line: readonly SwitchbackPoint[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = new Vector3(line[i - 1]!.east, line[i - 1]!.height, -line[i - 1]!.north);
    const b = new Vector3(line[i]!.east, line[i]!.height, -line[i]!.north);
    const p = new Vector3(point.east, point.height, -point.north);
    const segment = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(segment) / segment.lengthSq()));
    best = Math.min(best, p.distanceTo(a.addScaledVector(segment, t)));
  }
  return best;
}

function collectCopy(root: Group) {
  const copy: string[] = [];
  root.traverse(object => {
    const lines = object.userData.authoredCopy;
    if (Array.isArray(lines)) copy.push(...lines);
  });
  return copy;
}

function expectedCopy(stops: ReturnType<typeof createTownD2FrontRidgeRestStops>) {
  return [
    ...stops.mileposts.flatMap(post => [post.faceLabel, post.topLabel]),
    ...stops.shelters.map(shelter => shelter.text),
    ...stops.warnings.map(warning => warning.text),
    stops.viewpoint.text, stops.viewpoint.text,
  ];
}

function materialTexture(material: Material) {
  return 'map' in material && material.map instanceof CanvasTexture ? material.map : null;
}

function withCanvasDocument<T>(run: (
  paintedText: string[], canvases: Array<{ width: number; height: number }>,
) => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const paintedText: string[] = [];
  const canvases: Array<{ width: number; height: number }> = [];
  const context = {
    save() {}, restore() {}, translate() {}, beginPath() {}, rect() {}, clip() {},
    fillRect() {}, strokeRect() {},
    fillText(text: string) { paintedText.push(text); },
  };
  const documentStub = {
    createElement(tag: string) {
      assert.equal(tag, 'canvas');
      const canvas = {
        width: 0, height: 0,
        getContext(kind: string) {
          assert.equal(kind, '2d');
          return context;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentStub });
  try { return run(paintedText, canvases); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

test('D-5: exact 250 m 3D arc interpolation, metre copy and complete road sequence', () => {
  const line = buildSwitchbackCenterline();
  const cumulative = trueDistance(line);
  const length = cumulative.at(-1)!;
  const stops = createTownD2FrontRidgeRestStops({ centreline: line });
  try {
    assert.equal(typeof document, 'undefined', 'this gate must exercise the Node/no-document path');
    const expected = Array.from({ length: Math.floor(length / 250) }, (_, i) => (i + 1) * 250);
    assert.deepEqual(stops.mileposts.map(post => post.meters), expected);
    assert.deepEqual(stops.mileposts.map(post => post.distance), expected,
      'stations must sit on the exact 3D arc, not the first vertex after each threshold');
    for (const post of stops.mileposts) {
      assert.equal(post.faceLabel, `${post.meters} 米`);
      assert.equal(post.topLabel, '盘山道');
      assert.ok(!/公里|km/i.test(post.text), 'mileage faces are metres, never kilometres');
      assert.ok(distanceToSegment({ east: post.centreEast, north: post.centreNorth, height: post.centreHeight }, line) < 1e-8,
        `${post.meters} m station must interpolate on the road`);
    }
    const copy = collectCopy(stops.group);
    for (const post of stops.mileposts) {
      assert.ok(copy.includes(post.faceLabel));
      assert.ok(copy.includes(TOWN_D2_REST_STOP_TEXTS.milepostTop));
    }
    assert.ok(stops.mileposts.length >= 11, `full surveyed road has ${stops.mileposts.length} metre posts`);
    assert.equal(stops.benches.length, 21, 'the full surveyed road keeps all 21 hairpin benches');
  } finally { stops.dispose(); }
});

test('D-5: authored copy, measured lower/middle shelters and exact sampled lookout', () => {
  const line = buildSwitchbackCenterline();
  const cumulative = trueDistance(line);
  const length = cumulative.at(-1)!;
  const stops = createTownD2FrontRidgeRestStops({ centreline: line });
  try {
    assert.equal(stops.shelters.length, 2);
    assert.deepEqual(stops.shelters.map(shelter => shelter.section), ['lower-end', 'middle-cliff']);
    assert.ok(stops.shelters[0]!.distance < length / 2);
    assert.ok(stops.shelters[1]!.distance > stops.shelters[0]!.distance);
    // Lower end snaps to the measured line near the design card's 1050 m.
    assert.ok(Math.abs(stops.shelters[0]!.distance - 1050) <= 3.1);
    // Middle cliff uses the measured mid-terrace centreline, not the late gate.
    const nearestMiddle = line.reduce((best, point, i) =>
      Math.hypot(point.east - 440, point.north - 520) < Math.hypot(best.point.east - 440, best.point.north - 520)
        ? { point, i } : best, { point: line[0]!, i: 0 });
    assert.ok(Math.abs(stops.shelters[1]!.distance - cumulative[nearestMiddle.i]!) < 1e-8);
    assert.ok(stops.shelters[1]!.distance < length * 0.65);

    assert.equal(stops.viewpoint.east, 300);
    assert.equal(stops.viewpoint.north, 400);
    const lookout = stops.group.getObjectByName('town-d2-viewpoint-300-400')!;
    const lookoutFoundation = lookout.userData.foundation;
    assert.equal(lookoutFoundation.radius, 3.85);
    assert.equal(stops.viewpoint.height, lookoutFoundation.maxGround + 0.03);
    assert.equal(lookout.position.y, stops.viewpoint.height);
    assert.equal(stops.viewpoint.deckHeight, stops.viewpoint.height + 0.42);
    assert.equal(lookout.userData.deckHeight, stops.viewpoint.deckHeight);
    assert.ok(stops.viewpoint.height > sampleNorthRidge350(300, 400));
    assert.equal(stops.group.userData.roadMoved, false);

    const copy = collectCopy(stops.group);
    const expected = expectedCopy(stops);
    assert.deepEqual([...copy].sort(), [...expected].sort(),
      'Node/no-document must retain every authored line, including both lookout faces');
    for (const text of Object.values(TOWN_D2_REST_STOP_TEXTS)) assert.ok(copy.includes(text), text);
    for (const shelter of stops.shelters) assert.equal(shelter.text, TOWN_D2_REST_STOP_TEXTS.rest);
    assert.equal(stops.viewpoint.text, TOWN_D2_REST_STOP_TEXTS.viewpoint);
    assert.equal(stops.warnings.length, 1);
    assert.equal(stops.warnings[0]!.text, TOWN_D2_REST_STOP_TEXTS.warning);
    assert.ok(stops.warnings[0]!.distance > stops.shelters[1]!.distance);
    assert.ok(stops.warnings[0]!.distance < length * 0.65);

    const insets: Mesh[] = [];
    stops.group.traverse(object => {
      if (object instanceof Mesh && Array.isArray(object.userData.authoredCopy) &&
          !materialTexture(object.material as Material)) insets.push(object);
    });
    assert.equal(insets.length, expected.length,
      'Node/no-document keeps the original per-face physical inset meshes');
    for (const inset of insets) {
      const insetMaterial = inset.material;
      assert.ok(!Array.isArray(insetMaterial));
      assert.equal(insetMaterial.side, DoubleSide);
      assert.equal(inset.geometry.getAttribute('position').count, 4);
      assert.equal(inset.userData.authoredCopy.length, 1);
    }
  } finally { stops.dispose(); }
});

test('D-5: hairpin benches exceed 120 degrees, stay >=120 m apart and sit on the uphill side', () => {
  const line = buildSwitchbackCenterline();
  const stops = createTownD2FrontRidgeRestStops({ centreline: line });
  try {
    assert.ok(stops.benches.length >= 4, `expected a real hairpin bench grid, got ${stops.benches.length}`);
    for (let i = 0; i < stops.benches.length; i++) {
      const bench = stops.benches[i]!;
      assert.ok(bench.turnDegrees > 120, `${bench.id}: ${bench.turnDegrees.toFixed(2)} degrees`);
      // Independently recover the nearest centreline vertex and its turn.
      const vertexIndex = line.reduce((best, point, index) =>
        Math.abs(cumulativeDistance(line, index) - bench.distance) < Math.abs(cumulativeDistance(line, best) - bench.distance)
          ? index : best, 0);
      const previous = line[Math.max(0, vertexIndex - 1)]!, point = line[vertexIndex]!, next = line[Math.min(line.length - 1, vertexIndex + 1)]!;
      const incoming = new Vector3(point.east - previous.east, 0, -(point.north - previous.north)).normalize();
      const outgoing = new Vector3(next.east - point.east, 0, -(next.north - point.north)).normalize();
      const turn = Math.acos(Math.max(-1, Math.min(1, incoming.dot(outgoing)))) * 180 / Math.PI;
      assert.ok(Math.abs(turn - bench.turnDegrees) < 1e-7);
      const inside = outgoing.clone().sub(incoming).normalize();
      if (inside.lengthSq() > 0) {
        const local = new Vector3(bench.east - point.east, 0, -(bench.north - point.north));
        assert.ok(local.dot(inside) > 0, `${bench.id} must be on the turn's inside`);
      }
      if (i > 0) assert.ok(bench.distance - stops.benches[i - 1]!.distance >= 120,
        `${bench.id} violates minimum 120 m spacing`);
    }
  } finally { stops.dispose(); }
});

function cumulativeDistance(line: readonly SwitchbackPoint[], index: number) {
  let result = 0;
  for (let i = 1; i <= index; i++) {
    const a = line[i - 1]!, b = line[i]!;
    result += Math.hypot(b.east - a.east, b.north - a.north, b.height - a.height);
  }
  return result;
}

test('D-5: three material families, finite transforms/vertices and idempotent complete disposal', () => {
  const parent = new Group();
  const stops = createTownD2FrontRidgeRestStops();
  parent.add(stops.group);
  try {
    assert.ok(stops.materials.timber && stops.materials.stone && stops.materials.snow);
    assert.ok(stops.benches.length > 0);
    for (const surface of [stops.materials.timber, stops.materials.timberLight,
      stops.materials.timberDark, stops.materials.stone, stops.materials.stoneDark,
      stops.materials.stoneLight]) {
      const texture = surface.map;
      assert.ok(texture instanceof DataTexture, `${surface.uuid} needs a procedural material grain`);
      assert.equal(texture.image.width, 32);
      assert.equal(texture.image.height, 32);
      assert.equal(texture.wrapS, RepeatWrapping);
      assert.equal(texture.wrapT, RepeatWrapping);
      assert.equal(texture.magFilter, NearestFilter);
      assert.equal(texture.minFilter, NearestFilter);
      assert.equal(texture.generateMipmaps, false);
      assert.ok(texture.image.data.some((value: number, index: number) => index % 4 !== 3 && value !== 255),
        'grain must contain visible tonal variation');
    }
    assert.notEqual(stops.materials.timber.map, stops.materials.stone.map,
      'wood and stone need distinct grain rasters');
    let meshes = 0;
    stops.group.updateMatrixWorld(true);
    stops.group.traverse(object => {
      assert.ok([object.position.x, object.position.y, object.position.z,
        object.rotation.x, object.rotation.y, object.rotation.z,
        object.scale.x, object.scale.y, object.scale.z].every(Number.isFinite), object.name);
      assert.ok([...object.matrixWorld.elements].every(Number.isFinite), object.name);
      if (!(object instanceof Mesh)) return;
      meshes++;
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) &&
          Number.isFinite(positions.getZ(i)), `${object.name} vertex ${i}`);
      }
    });
    assert.ok(meshes < 80, `static detail must be material-batched, got ${meshes} meshes`);
    assert.ok(stops.group.children.some(child => child.name.startsWith('town-d2-static-')));
    const resources = new Set<BufferGeometry | Material | DataTexture>();
    stops.group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      resources.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach(item => {
        resources.add(item);
        if (item.map instanceof DataTexture) resources.add(item.map);
      });
    });
    let disposed = 0;
    for (const resource of resources) resource.addEventListener('dispose', () => { disposed++; });
    stops.dispose();
    stops.dispose();
    assert.equal(disposed, resources.size, 'every unique geometry/material released exactly once');
    assert.equal(parent.children.length, 0);
    assert.equal(stops.group.children.length, 0);
    assert.equal(stops.group.userData.disposed, true);
  } finally { stops.dispose(); }
});

test('D-5: 3D interpolation differs from legacy planar cumulative and never drifts', () => {
  const custom: SwitchbackPoint[] = [
    { east: 0, north: 0, height: 0, cum: 999 },
    { east: 100, north: 0, height: 30, cum: 1 },
    { east: 100, north: 100, height: 30, cum: 2 },
    { east: 100, north: 200, height: 50, cum: 3 },
  ];
  const stops = createTownD2FrontRidgeRestStops({ centreline: custom, terrainAt: () => 20, gridAt: () => 20 });
  try {
    assert.equal(stops.mileposts.length, 1);
    const post = stops.mileposts[0]!;
    assert.equal(post.distance, 250);
    assert.equal(post.faceLabel, '250 米');
    assert.ok(distanceToSegment({ east: post.centreEast, north: post.centreNorth, height: post.centreHeight }, custom) < 1e-8);
    assert.ok(post.centreNorth > 140 && post.centreNorth < 150, `3D target interpolates at N${post.centreNorth.toFixed(3)}`);
    assert.ok(Math.abs(custom[2]!.cum - 2) < 1e-8, 'input is deliberately not mutated');
  } finally { stops.dispose(); }
});

function heightAtDistance(line: readonly SwitchbackPoint[], distance: number) {
  const cumulative = trueDistance(line);
  for (let i = 1; i < line.length; i++) {
    if (distance <= cumulative[i]! + 1e-9) {
      const span = cumulative[i]! - cumulative[i - 1]!;
      const t = span > 0 ? (distance - cumulative[i - 1]!) / span : 0;
      return line[i - 1]!.height + (line[i]!.height - line[i - 1]!.height) * t;
    }
  }
  return line.at(-1)!.height;
}

test('D-5: production mileposts, benches and warning use the road centre-height hint', () => {
  const line = buildSwitchbackCenterline();
  const road = createFrontRidgeSwitchbackRoad();
  const stops = createTownD2FrontRidgeRestStops();
  try {
    const checked = [
      ...stops.mileposts.map(post => ({ placement: post, centreHeight: post.centreHeight })),
      ...stops.benches.map(post => ({ placement: post, centreHeight: heightAtDistance(line, post.distance) })),
      ...stops.warnings.map(post => ({ placement: post, centreHeight: heightAtDistance(line, post.distance) })),
    ];
    assert.equal(checked.length, stops.mileposts.length + 21 + 1);
    for (const { placement, centreHeight } of checked) {
      const surface = road.heightAt(placement.east, placement.north, centreHeight);
      assert.notEqual(surface, undefined, `${placement.id} must resolve on the production road`);
      assert.ok(Math.abs(placement.height - (surface! + 0.03)) < 1e-8,
        `${placement.id} must use road.heightAt(e, n, centreHeight) + 0.03`);
    }
  } finally {
    stops.dispose();
    road.dispose();
  }
});

test('D-5: legacy supplement, one crisp text atlas and complete canvas copy/disposal', () => {
  withCanvasDocument((paintedText, canvases) => {
    const line = buildSwitchbackCenterline();
    const road = createFrontRidgeSwitchbackRoad();
    const copyStart = paintedText.length;
    const canvasStart = canvases.length;
    const stops = createTownD2FrontRidgeRestStops({ centreline: line });
    try {
      const oldPosts: Object3D[] = [];
      const oldFaces: Mesh[] = [];
      road.group.traverse(object => {
        if (object.name.startsWith('switchback-mileage-')) oldPosts.push(object);
      });
      for (const post of oldPosts) {
        const face = post.parent!.children.find((object): object is Mesh =>
          object instanceof Mesh && !object.name && object.geometry instanceof PlaneGeometry &&
          object.position.distanceTo(post.position) <= 0.30);
        assert.ok(face, `${post.name} needs its directly adjacent legacy text face`);
        oldFaces.push(face!);
      }
      assert.ok(oldPosts.length >= 11 && oldFaces.length === oldPosts.length);
      const oldProps: Object3D[] = [];
      road.group.traverse(object => {
        if (object.name.startsWith('switchback-mileage-') ||
            /(?:^|-)(?:bench|shelter|lookout)-/.test(object.name)) oldProps.push(object);
      });
      assert.ok(oldProps.length > oldPosts.length);
      for (const name of ['switchback-start-sign', 'switchback-top-sign',
        'station-board-S-12', 'station-board-S-16', 'station-board-S-19']) {
        assert.ok(road.group.getObjectByName(name), `missing preserved sign ${name}`);
      }

      hideLegacyD5Supplement(road.group);
      for (const object of [...oldProps, ...oldFaces]) assert.equal(object.visible, false, object.name || 'mileage copy');
      for (const name of ['switchback-start-sign', 'switchback-top-sign',
        'station-board-S-12', 'station-board-S-16', 'station-board-S-19']) {
        assert.equal(road.group.getObjectByName(name)!.visible, true, `${name} must remain visible`);
      }

      assert.deepEqual([...new Set(paintedText.slice(copyStart))].sort(),
        [...new Set(collectCopy(stops.group))].sort(),
        'every authored line must reach the real CanvasRenderingContext2D.fillText path');
      const expected = expectedCopy(stops);
      assert.deepEqual([...new Set(paintedText.slice(copyStart))].sort(),
        [...new Set(expected)].sort(), 'canvas copy must match the complete authored text set');
      assert.equal(canvases.length - canvasStart, 1,
        'all D-5 browser text faces must share one atlas canvas');

      const atlasMeshes: Mesh[] = [];
      const textures = new Set<CanvasTexture>();
      let textMeshes = 0, totalMeshes = 0;
      stops.group.updateMatrixWorld(true);
      stops.group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        totalMeshes++;
        if (Array.isArray(object.userData.authoredCopy)) textMeshes++;
        if (Array.isArray(object.material)) return;
        const texture = materialTexture(object.material);
        if (!texture) return;
        atlasMeshes.push(object); textures.add(texture);
        const material = object.material;
        assert.equal(material.side, DoubleSide, 'atlas text remains visible from both sides');
        assert.equal(texture.magFilter, NearestFilter);
        assert.equal(texture.minFilter, NearestFilter);
        assert.equal(texture.generateMipmaps, false, 'nearest atlas texels stay crisp');
        const uv = object.geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i), v = uv.getY(i);
          assert.ok([u, v].every(Number.isFinite), `atlas UV ${i} must be finite`);
          assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `atlas UV ${i} must stay in range`);
        }
        const positions = object.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          assert.ok([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite));
        }
      });
      assert.equal(atlasMeshes.length, 1, 'one atlas replaces every CanvasTexture text plane');
      assert.equal(textures.size, 1);
      assert.equal(atlasMeshes[0]!.geometry.getAttribute('position').count, expected.length * 4,
        'the atlas geometry must retain every original text quad');
      assert.ok(textMeshes <= 2, `atlas plus physical inset should need two text meshes, got ${textMeshes}`);
      assert.ok(textMeshes * 4 < expected.length, 'text mesh count must drop significantly');
      assert.ok(totalMeshes < 80, `browser path must remain material-batched, got ${totalMeshes} meshes`);

      const resources = new Set<BufferGeometry | Material | CanvasTexture | DataTexture>();
      stops.group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        resources.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(item => {
          resources.add(item);
          if (item.map instanceof DataTexture) resources.add(item.map);
        });
      });
      textures.forEach(texture => resources.add(texture));
      let disposed = 0;
      for (const resource of resources) resource.addEventListener('dispose', () => { disposed++; });
      stops.dispose(); stops.dispose();
      assert.equal(disposed, resources.size, 'atlas geometry/material/texture release exactly once');
    } finally {
      stops.dispose();
      road.dispose();
    }
  });
});

test('D-5: shelter and lookout foundations span true footprint ground without floating', () => {
  const line: SwitchbackPoint[] = [
    { east: 0, north: 0, height: 0, cum: 0 },
    { east: 1100, north: 0, height: 0, cum: 1100 },
  ];
  const groundAt = (east: number, north: number) => 100 + east * 0.2 - north * 0.1;
  const stops = createTownD2FrontRidgeRestStops({ centreline: line, terrainAt: groundAt });
  try {
    assert.equal(stops.shelters.length, 2);
    for (const shelter of stops.shelters) {
      const built = stops.group.getObjectByName(shelter.id)!;
      const data = built.userData.foundation;
      const minGround = groundAt(shelter.east - data.halfWidth, shelter.north + data.halfDepth);
      const maxGround = groundAt(shelter.east + data.halfWidth, shelter.north - data.halfDepth);
      assert.ok(Math.abs(data.minGround - minGround) < 1e-8, shelter.id);
      assert.ok(Math.abs(data.maxGround - maxGround) < 1e-8, shelter.id);
      assert.ok(Math.abs(data.base - (maxGround + 0.03)) < 1e-8, shelter.id);
      assert.equal(built.position.y, data.base);
      const foundation = built.getObjectByName('shelter-stone-foundation') as Mesh;
      foundation.geometry.computeBoundingBox();
      const bounds = foundation.geometry.boundingBox!;
      assert.ok(Math.abs(built.position.y + foundation.position.y + bounds.min.y - minGround) < 1e-6,
        `${shelter.id} foundation bottom must meet the lowest ground`);
      assert.ok(Math.abs(built.position.y + foundation.position.y + bounds.max.y - data.base) < 1e-6,
        `${shelter.id} foundation top must meet the group base`);
    }

    const lookout = stops.group.getObjectByName('town-d2-viewpoint-300-400')!;
    const data = lookout.userData.foundation;
    const centreGround = groundAt(300, 400);
    const amplitude = data.radius * Math.hypot(0.2, 0.1);
    assert.ok(Math.abs(data.minGround - (centreGround - amplitude)) < 1e-8);
    assert.ok(Math.abs(data.maxGround - (centreGround + amplitude)) < 1e-8);
    assert.equal(lookout.position.y, data.maxGround + 0.03);
    const foundation = lookout.getObjectByName('lookout-foundation') as Mesh;
    foundation.geometry.computeBoundingBox();
    assert.ok(Math.abs(lookout.position.y + foundation.position.y + foundation.geometry.boundingBox!.min.y -
      data.minGround) < 1e-6, 'lookout foundation bottom must meet the lowest ground');
    const deck = lookout.getObjectByName('lookout-deck') as Mesh;
    deck.geometry.computeBoundingBox();
    const deckTop = lookout.position.y + deck.position.y + deck.geometry.boundingBox!.max.y;
    assert.ok(Math.abs(deckTop - stops.viewpoint.deckHeight) < 1e-6);
    assert.ok(Math.abs(deckTop - (data.base + 0.42)) < 1e-6);
  } finally { stops.dispose(); }
});
