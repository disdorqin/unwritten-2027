import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4,
  Mesh, MeshLambertMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import {
  sampleTownD2R30Height, townD2R30Anchors, townD2R30Spec,
} from './town-d2-r30-domain';

/**
 * D2 central-sector (war zone) round-2 BODY: a real, grounded north-wall
 * via-ferrata climb plus the four summit landmarks the four-sector order
 * asks for (monument, great flag, north-wall lookout, climb anchors).
 *
 * Every contact point is sampled from the same 8 m canonical height field
 * the walkable massif uses; nothing hangs in the air and no second height
 * authority is created. Canonical facilities (hut/icefall/glide/bells) are
 * deliberately NOT duplicated here — they already live in
 * `town-d2-r30-summit-facilities.ts` and are consumed as-is.
 */
export type TownD2R30NorthWallAnchor = Readonly<{
  id: string;
  east: number;
  north: number;
  ground: number;
  top: number;
}>;

export type TownD2R30NorthWallStats = Readonly<{
  climbAnchors: number;
  climbRungs: number;
  climbLedges: number;
  climbLength: number;
  maxRungGap: number;
  maxGrade: number;
  groundedContacts: number;
  floatingContacts: number;
  landmarks: number;
  collisionBoxes: number;
  meshes: number;
  draws: number;
  triangles: number;
}>;

/** Solid obstacle in the D2 local frame: x=east, y=height, z=-north. */
export type TownD2R30NorthWallBox = Readonly<{
  min: [number, number, number];
  max: [number, number, number];
}>;

export const townD2R30NorthWallSpec = Object.freeze({
  climbEast: 50,
  climbNorthFrom: 1_480,
  climbNorthTo: 1_005,
  rungSpacing: 12,
  rungHalfWidth: 2.4,
  railHeight: 1.15,
  anchorRadius: .22,
  arrivalHeight: townD2R30Anchors.summit.height,
  // The canonical summit monument already stands at E50/N1000 and the cable
  // arrival lanes run through E21-27/N1000-1005. This climb memorial is placed
  // on the open west shoulder so it never duplicates or blocks either.
  monument: Object.freeze({ east: -20, north: 1_000, height: 6.4 }),
  flag: Object.freeze({ east: 92, north: 1_006, poleHeight: 13, flagWidth: 9, flagHeight: 5 }),
  lookout: Object.freeze({ east: -46, north: 1_038, width: 11, depth: 9, railHeight: 1.1 }),
});

function groundedHeight(
  east: number, north: number, heightAt: (e: number, n: number) => number | undefined,
): number {
  const ground = heightAt(east, north);
  if (ground === undefined || !Number.isFinite(ground)) {
    throw new RangeError(`D2 north-wall point E${east}/N${north} has no R30 ground.`);
  }
  return ground;
}

export function createTownD2R30NorthWall(options: {
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
} = {}) {
  const arrivalHeight = options.arrivalHeight ?? townD2R30NorthWallSpec.arrivalHeight;
  const heightAt = options.heightAt ??
    ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  if (!Number.isFinite(arrivalHeight)) throw new RangeError('Invalid D2 north-wall arrival height.');

  const group = new Group();
  group.name = 'town-d2-r30-north-wall';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const baseColors = new Map<MeshLambertMaterial, { r: number; g: number; b: number }>();
  const makeMaterial = (color: string) => {
    const material = new MeshLambertMaterial({ color });
    baseColors.set(material, { r: material.color.r, g: material.color.g, b: material.color.b });
    materials.add(material);
    return material;
  };
  const iron = makeMaterial('#4d5358');
  const cable = makeMaterial('#9aa7ad');
  const stone = makeMaterial('#8b8175');
  const stoneTrim = makeMaterial('#a49783');
  const cloth = makeMaterial('#b5463e');
  const timber = makeMaterial('#6f5540');
  const brass = makeMaterial('#c9a45b');
  const ground = (east: number, north: number) => groundedHeight(east, north, heightAt);
  // Solid landmark bodies are exported as AABBs so the production host can
  // block the player before they walk through the obelisk, flag mast or the
  // lookout rails. Hand-lines and rungs are intentionally NOT solid: they are
  // the climb surface itself and blocking them would freeze the ascent.
  const collisionBoxes: TownD2R30NorthWallBox[] = [];
  const solidBox = (
    east: number, north: number, y: number, width: number, height: number, depth: number,
  ) => collisionBoxes.push(Object.freeze({
    min: [east - width / 2, y - height / 2, -north - depth / 2] as [number, number, number],
    max: [east + width / 2, y + height / 2, -north + depth / 2] as [number, number, number],
  }));

  const addBox = (
    material: MeshLambertMaterial, east: number, north: number, y: number,
    width: number, height: number, depth: number, name: string, solid = false,
  ) => {
    const geometry = new BoxGeometry(width, height, depth);
    geometry.translate(east, y, -north);
    geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    if (solid) solidBox(east, north, y, width, height, depth);
    return mesh;
  };
  const addCylinder = (
    material: MeshLambertMaterial, east: number, north: number, fromY: number, toY: number,
    radius: number, name: string, solid = false,
  ) => {
    const height = toY - fromY;
    const geometry = new CylinderGeometry(radius, radius, height, 8);
    geometry.translate(east, (fromY + toY) / 2, -north);
    geometries.add(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    if (solid) solidBox(east, north, (fromY + toY) / 2, radius * 2, height, radius * 2);
    return mesh;
  };

  // ---------------------------------------------------------------- climb
  const spec = townD2R30NorthWallSpec;
  const steps = Math.max(1, Math.ceil((spec.climbNorthFrom - spec.climbNorthTo) / spec.rungSpacing));
  const climbAnchors: TownD2R30NorthWallAnchor[] = [];
  const rungMatrix = new Matrix4();
  const postMatrix = new Matrix4();
  const rungDummy = new Object3D();
  const rungs = new InstancedMesh(new BoxGeometry(spec.rungHalfWidth * 2, .18, .36), iron, steps);
  const posts = new InstancedMesh(new BoxGeometry(.22, 1, .22), iron, steps * 2);
  // R5: vertical guide cables and rung end brackets at every post line, so
  // the climb reads as a real via-ferrata armature instead of bare bars.
  const guides = new InstancedMesh(new BoxGeometry(.1, 1, .1), cable, steps * 2);
  const brackets = new InstancedMesh(new BoxGeometry(.34, .24, .55), iron, steps * 2);
  rungs.name = 'town-d2-r30-climb-rungs';
  posts.name = 'town-d2-r30-climb-posts';
  guides.name = 'town-d2-r30-climb-guides';
  brackets.name = 'town-d2-r30-climb-rung-brackets';
  geometries.add(rungs.geometry);
  geometries.add(posts.geometry);
  geometries.add(guides.geometry);
  geometries.add(brackets.geometry);
  let maxRungGap = 0, maxGrade = 0, groundedContacts = 0, floatingContacts = 0;
  const handlines: { from: Vector3; to: Vector3 }[] = [];
  let previous: TownD2R30NorthWallAnchor | undefined;
  for (let index = 0; index < steps; index++) {
    const north = spec.climbNorthFrom - (spec.climbNorthFrom - spec.climbNorthTo) * index / (steps - 1 || 1);
    const east = spec.climbEast + Math.sin((north - spec.climbNorthTo) / 90) * 6;
    const floor = ground(east, north);
    const anchor: TownD2R30NorthWallAnchor = Object.freeze({
      id: `climb-${index}`, east, north, ground: floor, top: floor + spec.railHeight,
    });
    climbAnchors.push(anchor);
    groundedContacts++;
    if (previous) {
      const run = Math.hypot(east - previous.east, north - previous.north);
      maxRungGap = Math.max(maxRungGap, run);
      maxGrade = Math.max(maxGrade, Math.abs(anchor.ground - previous.ground) / run);
    }
    const rungY = floor + .58;
    rungDummy.position.set(east, rungY, -north);
    rungDummy.rotation.set(0, 0, 0);
    rungDummy.updateMatrix();
    rungMatrix.copy(rungDummy.matrix);
    rungs.setMatrixAt(index, rungMatrix);
    for (const side of [-1, 1] as const) {
      const postY = floor + spec.railHeight / 2;
      rungDummy.position.set(east + side * spec.rungHalfWidth, postY, -north);
      rungDummy.scale.set(1, spec.railHeight, 1);
      rungDummy.updateMatrix();
      postMatrix.copy(rungDummy.matrix);
      posts.setMatrixAt(index * 2 + (side === -1 ? 0 : 1), postMatrix);
      // R5: guide cable runs the full rail height on the post line, and a
      // heavier end bracket caps the rung where it meets the post.
      rungDummy.position.set(east + side * spec.rungHalfWidth, floor + spec.railHeight / 2, -north);
      rungDummy.scale.set(1, spec.railHeight, 1);
      rungDummy.updateMatrix();
      guides.setMatrixAt(index * 2 + (side === -1 ? 0 : 1), rungDummy.matrix);
      rungDummy.position.set(east + side * spec.rungHalfWidth, rungY, -north);
      rungDummy.scale.set(1, 1, 1);
      rungDummy.updateMatrix();
      brackets.setMatrixAt(index * 2 + (side === -1 ? 0 : 1), rungDummy.matrix);
      rungDummy.scale.set(1, 1, 1);
    }
    if (previous) {
      // The hand-line is a real sloping member between the two anchor tops,
      // not a vertical stub floating at the midpoint. Batched below.
      handlines.push({
        from: new Vector3(previous.east, previous.top, -previous.north),
        to: new Vector3(anchor.east, anchor.top, -anchor.north),
      });
    }
    previous = anchor;
  }
  rungs.instanceMatrix.needsUpdate = true;
  posts.instanceMatrix.needsUpdate = true;
  guides.instanceMatrix.needsUpdate = true;
  brackets.instanceMatrix.needsUpdate = true;
  group.add(rungs, posts, guides, brackets);
  // R5 rock ledges: the reference asks for rest ledges every 15–20 m of
  // vertical rise, so a slip lands back on the ledge below. A single steep
  // step that already reaches the band is its own ledge; otherwise ledges
  // are placed at the first anchor whose accumulated rise enters the band,
  // backing up one anchor when the next step would overshoot 20 m. The
  // summit anchor always gets a final ledge. Ledges are visual rock only —
  // the climb surface stays non-solid so the ascent never freezes.
  const ledgeMin = 15, ledgeMax = 20;
  const ledgeAnchors: TownD2R30NorthWallAnchor[] = [climbAnchors[0]!];
  let ledgeRise = 0;
  for (let index = 1; index < climbAnchors.length; index++) {
    const anchor = climbAnchors[index]!;
    const rise = anchor.ground - climbAnchors[index - 1]!.ground;
    const projected = ledgeRise + rise;
    if (rise >= ledgeMin || projected >= ledgeMin) {
      if (projected > ledgeMax && ledgeRise >= ledgeMin * .8) {
        ledgeAnchors.push(climbAnchors[index - 1]!);
        ledgeRise = rise;
      } else {
        ledgeAnchors.push(anchor);
        ledgeRise = 0;
      }
    } else {
      ledgeRise = projected;
    }
  }
  const summitAnchor = climbAnchors[climbAnchors.length - 1]!;
  if (ledgeAnchors[ledgeAnchors.length - 1] !== summitAnchor) ledgeAnchors.push(summitAnchor);
  const ledgeSlabs = new InstancedMesh(
    new BoxGeometry(spec.rungHalfWidth * 2 + 2.4, .6, 3.4), stone, ledgeAnchors.length);
  ledgeSlabs.name = 'town-d2-r30-climb-ledges';
  const ledgePads = new InstancedMesh(
    new BoxGeometry(.9, .3, .9), stoneTrim, ledgeAnchors.length * 2);
  ledgePads.name = 'town-d2-r30-climb-ledge-pads';
  const ledgeRock = new InstancedMesh(
    new BoxGeometry(1.1, .7, 1.1), stone, ledgeAnchors.length * 2);
  ledgeRock.name = 'town-d2-r30-climb-ledge-rock';
  geometries.add(ledgeSlabs.geometry);
  geometries.add(ledgePads.geometry);
  geometries.add(ledgeRock.geometry);
  ledgeAnchors.forEach((anchor, index) => {
    rungDummy.position.set(anchor.east, anchor.ground + .1, -anchor.north);
    rungDummy.rotation.set(0, 0, 0);
    rungDummy.scale.set(1, 1, 1);
    rungDummy.updateMatrix();
    ledgeSlabs.setMatrixAt(index, rungDummy.matrix);
    for (const side of [-1, 1] as const) {
      rungDummy.position.set(anchor.east + side * spec.rungHalfWidth, anchor.ground + .55, -anchor.north);
      rungDummy.updateMatrix();
      ledgePads.setMatrixAt(index * 2 + (side === -1 ? 0 : 1), rungDummy.matrix);
      rungDummy.position.set(
        anchor.east + side * (spec.rungHalfWidth + 1.4), anchor.ground + .25, -anchor.north);
      rungDummy.updateMatrix();
      ledgeRock.setMatrixAt(index * 2 + (side === -1 ? 0 : 1), rungDummy.matrix);
    }
  });
  ledgeSlabs.instanceMatrix.needsUpdate = true;
  ledgePads.instanceMatrix.needsUpdate = true;
  ledgeRock.instanceMatrix.needsUpdate = true;
  group.add(ledgeSlabs, ledgePads, ledgeRock);
  if (handlines.length) {
    const handMesh = new InstancedMesh(new BoxGeometry(.14, 1, .14), cable, handlines.length);
    handMesh.name = 'town-d2-r30-climb-handlines';
    const up = new Vector3(0, 1, 0);
    handlines.forEach((line, index) => {
      const span = line.to.clone().sub(line.from);
      rungDummy.position.copy(line.from).addScaledVector(span, .5);
      rungDummy.quaternion.setFromUnitVectors(up, span.clone().normalize());
      rungDummy.scale.set(1, span.length(), 1);
      rungDummy.updateMatrix();
      handMesh.setMatrixAt(index, rungDummy.matrix);
    });
    handMesh.instanceMatrix.needsUpdate = true;
    rungDummy.scale.set(1, 1, 1);
    geometries.add(handMesh.geometry);
    group.add(handMesh);
  }
  // Base and top landings tie the ladder into the real walkable surface.
  for (const anchor of [climbAnchors[0]!, climbAnchors[climbAnchors.length - 1]!]) {
    addBox(stone, anchor.east, anchor.north, anchor.ground + .12,
      spec.rungHalfWidth * 2 + 1.2, .24, 1.6, `town-d2-r30-climb-landing-${anchor.id}`);
  }

  // ------------------------------------------------------------- monument
  const monument = spec.monument;
  const monumentGround = ground(monument.east, monument.north);
  addBox(stone, monument.east, monument.north, monumentGround + .3, 7, .6, 7, 'town-d2-r30-monument-base', true);
  addBox(stoneTrim, monument.east, monument.north, monumentGround + 1, 5, 1.4, 5, 'town-d2-r30-monument-plinth', true);
  addBox(stone, monument.east, monument.north, monumentGround + 1 + monument.height / 2,
    2.4, monument.height, 2.4, 'town-d2-r30-monument-obelisk', true);
  addBox(brass, monument.east, monument.north, monumentGround + monument.height + 1.4,
    1.4, .6, 1.4, 'town-d2-r30-monument-cap', true);
  // The plaque is a face decoration at shin height; it shares the base box
  // and must not create a second overlapping collision body.
  addBox(timber, monument.east, monument.north - 4.4, monumentGround + 1.1,
    2.6, 1.6, .3, 'town-d2-r30-monument-plaque');
  // R5: a stone apron course, a step ring and a brass band turn the bare
  // obelisk stack into a real carved monument on the massif rock.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    addBox(stone, monument.east + Math.cos(angle) * 4.6, monument.north + Math.sin(angle) * 4.6,
      monumentGround + .3, 1.4, .5, 1.4, `town-d2-r30-monument-apron-${i}`);
  }
  addBox(stone, monument.east, monument.north, monumentGround + .45, 6.6, .3, 6.6,
    'town-d2-r30-monument-step');
  addBox(brass, monument.east, monument.north, monumentGround + 1 + monument.height / 2,
    2.8, .45, 2.8, 'town-d2-r30-monument-band');

  // ------------------------------------------------------------------ flag
  const flag = spec.flag;
  const flagGround = ground(flag.east, flag.north);
  addCylinder(iron, flag.east, flag.north, flagGround, flagGround + flag.poleHeight,
    .28, 'town-d2-r30-great-flag-pole', true);
  // Finial and banner are above head height and are visual-only: blocking
  // them would be a phantom wall under the cloth.
  addBox(brass, flag.east, flag.north, flagGround + flag.poleHeight + .3,
    .9, .6, .9, 'town-d2-r30-great-flag-finial');
  addBox(cloth, flag.east + flag.flagWidth / 2, flag.north,
    flagGround + flag.poleHeight - flag.flagHeight / 2 - .6,
    flag.flagWidth, flag.flagHeight, .18, 'town-d2-r30-great-flag-cloth');
  addBox(stone, flag.east, flag.north, flagGround + .35, 2.6, .7, 2.6, 'town-d2-r30-great-flag-footing', true);
  // R5: an iron ridge bar keeps the cloth extended, and two rigging cables
  // tie the mast top to the summit rock so the pole reads as real structure.
  addBox(iron, flag.east + flag.flagWidth / 2, flag.north,
    flagGround + flag.poleHeight - .6, flag.flagWidth, .14, .14, 'town-d2-r30-great-flag-rod');
  const flagUp = new Vector3(0, 1, 0);
  const riggingMesh = new InstancedMesh(new BoxGeometry(.1, 1, .1), cable, 2);
  riggingMesh.name = 'town-d2-r30-great-flag-rigging';
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const anchorEast = flag.east + side * 5, anchorNorth = flag.north + 4;
    const from = new Vector3(flag.east, flagGround + flag.poleHeight + .3, -flag.north);
    const to = new Vector3(anchorEast, ground(anchorEast, anchorNorth) + .4, -anchorNorth);
    const span = to.clone().sub(from);
    rungDummy.position.copy(from).addScaledVector(span, .5);
    rungDummy.quaternion.setFromUnitVectors(flagUp, span.clone().normalize());
    rungDummy.scale.set(1, span.length(), 1);
    rungDummy.updateMatrix();
    riggingMesh.setMatrixAt(i, rungDummy.matrix);
  }
  riggingMesh.instanceMatrix.needsUpdate = true;
  rungDummy.scale.set(1, 1, 1);
  geometries.add(riggingMesh.geometry);
  group.add(riggingMesh);

  // --------------------------------------------------------------- lookout
  const lookout = spec.lookout;
  const lookoutGround = ground(lookout.east, lookout.north);
  const deckY = lookoutGround + 2.6;
  addBox(stone, lookout.east, lookout.north, deckY, lookout.width, .4, lookout.depth,
    'town-d2-r30-lookout-deck');
  for (const side of [-1, 1] as const) {
    for (const along of [-1, 1] as const) {
      const px = lookout.east + side * (lookout.width / 2 - .8);
      const pn = lookout.north + along * (lookout.depth / 2 - .8);
      const pierGround = ground(px, pn);
      addCylinder(stone, px, pn, pierGround, deckY, .42, `town-d2-r30-lookout-pier-${side}-${along}`, true);
    }
    addBox(timber, lookout.east + side * (lookout.width / 2), lookout.north,
      deckY + lookout.railHeight / 2, .25, lookout.railHeight, lookout.depth,
      `town-d2-r30-lookout-rail-side-${side}`, true);
  }
  addBox(timber, lookout.east, lookout.north - lookout.depth / 2,
    deckY + lookout.railHeight / 2, lookout.width, lookout.railHeight, .25,
    'town-d2-r30-lookout-rail-north', true);
  addBox(timber, lookout.east, lookout.north + lookout.depth / 2,
    deckY + lookout.railHeight / 2, lookout.width, lookout.railHeight, .25,
    'town-d2-r30-lookout-rail-south', true);
  // R5: a stone kerb, four corner posts and deck planks give the lookout a
  // real balustrade structure instead of a bare slab with rails.
  for (const side of [-1, 1] as const) {
    addBox(stone, lookout.east + side * (lookout.width / 2), lookout.north,
      deckY + .35, .4, .35, lookout.depth, `town-d2-r30-lookout-kerb-side-${side}`, true);
  }
  for (const along of [-1, 1] as const) {
    addBox(stone, lookout.east, lookout.north + along * (lookout.depth / 2),
      deckY + .35, lookout.width, .35, .4, `town-d2-r30-lookout-kerb-end-${along}`, true);
  }
  for (const side of [-1, 1] as const) {
    for (const along of [-1, 1] as const) {
      addBox(timber, lookout.east + side * (lookout.width / 2 - .4),
        lookout.north + along * (lookout.depth / 2 - .4), deckY + .95,
        .28, 1.15, .28, `town-d2-r30-lookout-post-${side}-${along}`, true);
    }
  }
  for (const plank of [-3, -1, 1, 3]) {
    addBox(timber, lookout.east, lookout.north + plank, deckY + .26,
      lookout.width - 1.2, .12, 1.2, `town-d2-r30-lookout-plank-${plank}`);
  }

  let triangles = 0;
  for (const geometry of geometries) {
    triangles += (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  }
  const stats: TownD2R30NorthWallStats = Object.freeze({
    climbAnchors: climbAnchors.length,
    climbRungs: steps,
    climbLedges: ledgeAnchors.length,
    climbLength: climbAnchors.reduce((sum, anchor, index) =>
      index ? sum + Math.hypot(anchor.east - climbAnchors[index - 1]!.east,
        anchor.north - climbAnchors[index - 1]!.north) : 0, 0),
    maxRungGap,
    maxGrade,
    groundedContacts,
    floatingContacts,
    landmarks: 4 + 1 + 1 + 1, // climb pair + monument + flag + lookout
    collisionBoxes: collisionBoxes.length,
    meshes: group.children.length,
    draws: group.children.length,
    triangles,
  });

  let disposed = false;
  const MAX_FOOT_SLOPE = 55 * Math.PI / 180;
  const blocked = (east: number, north: number, feet: number, radius: number, bodyHeight: number) => {
    if (disposed) throw new Error('D2 north-wall module is disposed.');
    if (![east, north, feet, radius, bodyHeight].every(Number.isFinite) || radius < 0 || bodyHeight < 0) {
      throw new RangeError('D2 north-wall collision inputs must be finite.');
    }
    for (const box of collisionBoxes) {
      if (feet + bodyHeight - .025 <= box.min[1] || feet + .025 >= box.max[1]) continue;
      const dx = Math.max(box.min[0] - east, east - box.max[0], 0);
      const dz = Math.max(box.min[2] + north, -north - box.max[2], 0);
      if (Math.hypot(dx, dz) < radius) return true;
    }
    return false;
  };

  return {
    group,
    climbAnchors: climbAnchors as readonly TownD2R30NorthWallAnchor[],
    collisionBoxes: collisionBoxes as readonly TownD2R30NorthWallBox[],
    blocked,
    maxFootSlope: MAX_FOOT_SLOPE,
    stats: () => stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('D2 north-wall module is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      // Same cool night tint the rest of the R30 summit uses, so these
      // landmarks do not stay artificially bright after dusk.
      const factor = value ? { r: .50, g: .56, b: .68 } : { r: 1, g: 1, b: 1 };
      for (const material of materials) {
        const base = baseColors.get(material)!;
        material.color.setRGB(base.r * factor.r, base.g * factor.g, base.b * factor.b);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}

export type TownD2R30NorthWall = ReturnType<typeof createTownD2R30NorthWall>;
