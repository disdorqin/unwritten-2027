import {
  BoxGeometry, Color, Group, InstancedMesh, IcosahedronGeometry, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D, PointLight, type Material,
} from 'three';

/**
 * D2-R08: the real night lighting for the R30 summit domain.
 *
 * Until now the R30 summit carried no light of its own: every R30 module only
 * tinted its materials, and the canonical facility bodies (hut, machine room,
 * icefall, wind ground, bell posts, survey stations) had no night response at
 * all, so the whole summit stayed noon-bright after dusk. This module gives
 * the domain a small, budgeted set of real lights plus emissive fallbacks,
 * and lets the host darken every lit surface around them.
 *
 * House patterns followed:
 *  - C2 window `town-c2-second-mine-light-sources.ts`: a declared fixture
 *    plan, a visible fixture for every lamp and a real `PointLight` only for
 *    the few fixtures that must actually cast light.
 *  - D window `front-ridge-switchback-road.ts`: instanced lamp posts with a
 *    separate instanced emissive core, and a day/night core colour swap.
 */

export type TownD2R30NightLightRole = 'trail' | 'window' | 'bell' | 'station';

export type TownD2R30NightLightEmitter = Readonly<{
  id: string;
  role: TownD2R30NightLightRole;
  east: number;
  north: number;
  height: number;
  color: number;
  /** True when this fixture owns one of the real point lights. */
  realLight: boolean;
}>;

export type TownD2R30NightLightStats = Readonly<{
  fixtures: number;
  realLights: number;
  maxRealLights: number;
  /** Lamps the canonical modules own; R30 only switches them on at night. */
  borrowedLights: number;
  trailLamps: number;
  borrowedEmitters: number;
  meshes: number;
  triangles: number;
}>;

export type TownD2R30NightLightsOptions = Readonly<{
  /** The canonical walkway centreline; the lamp chain follows it. */
  trailPoints?: ReadonlyArray<{ east: number; north: number; height: number }>;
  /** Metres between trail lamps along the walkway (default 140). */
  trailSpacing?: number;
  /**
   * The host that owns the borrowed emissive bodies. They are found by their
   * canonical names so this package never reaches into another module's
   * private fields.
   */
  hostGroup?: Object3D;
}>;

/** Canonical names of the emissive bodies this package borrows. */
export const townD2R30NightBorrowedNames = Object.freeze({
  window: 'hut-window-landmark-light',
  embers: Object.freeze(['stove-ember-glow', 'shelf-lamp-glow']),
  bellCore: 'bell-post-lamp-core',
  /** Lamps the canonical modules own; they must only burn after dusk. */
  stationLamps: Object.freeze(['summit-wind-ground-real-lantern', 'hut-interior-lamp']),
});

export const townD2R30NightLightBudget = Object.freeze({
  /** Visible fixtures; every one of them reads without a real light. */
  fixtures: 24,
  /** Real point lights, hard capped. */
  maxPointLights: 4,
  intensity: 2.4,
  distance: 24,
});

/** Day colours of the borrowed emissive bodies, and their night colours. */
const BORROWED_NIGHT_COLOURS = Object.freeze({
  window: '#ffb45c',
  windowDay: '#7d8ca0',
  emberNight: '#ff7a26',
  emberDay: '#6d3a18',
  shelfNight: '#ffc46b',
  shelfDay: '#6f5a34',
});

const CORE_DAY = '#3a3230';
const CORE_NIGHT = '#ffb45c';
const POST_COLOUR = '#4a423a';

/**
 * Per-channel night factors for lit surfaces. Red dims hardest and blue
 * least, so the summit reads as moonlight rather than a flat grey wash, and
 * every channel still strictly decreases so a night tint can never brighten
 * a surface.
 */
export const townD2R30NightTintFactor = Object.freeze({ r: 0.50, g: 0.56, b: 0.68 });

const tintCache = new WeakMap<Material, { colour: Color; emissive: Color }>();

/**
 * Darkens every lit (Lambert) surface under `root` for the night, and
 * restores the exact daytime colour on the way back. Emissive bodies are
 * left alone: they carry their own light.
 */
export function applyTownD2R30NightTint(root: Object3D, night: boolean): void {
  const seen = new Set<Material>();
  root.traverse(object => {
    const mesh = object as Object3D & { material?: Material | Material[] };
    const material = mesh.material;
    if (!material) return;
    for (const item of Array.isArray(material) ? material : [material]) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      if (!(item instanceof MeshLambertMaterial)) continue;
      if (item.userData?.noNightTint) continue;
      let base = tintCache.get(item);
      if (!base) {
        base = { colour: item.color.clone(), emissive: item.emissive.clone() };
        tintCache.set(item, base);
      }
      if (night) {
        item.color.setRGB(
          base.colour.r * townD2R30NightTintFactor.r,
          base.colour.g * townD2R30NightTintFactor.g,
          base.colour.b * townD2R30NightTintFactor.b,
        );
        // A lamp must not glow at noon, so the emissive term follows the
        // night state and comes back exactly as it was.
        item.emissive.copy(base.emissive);
      } else {
        item.color.copy(base.colour);
        item.emissive.setRGB(0, 0, 0);
      }
    }
  });
}

export function createTownD2R30NightLights(options: TownD2R30NightLightsOptions = {}) {
  const group = new Group();
  group.name = 'town-d2-r30-night-lights';
  const disposers: (() => void)[] = [];
  const emitters: TownD2R30NightLightEmitter[] = [];
  const trailSpacing = options.trailSpacing ?? 140;
  if (!Number.isFinite(trailSpacing) || trailSpacing <= 0) {
    throw new RangeError('D2-R08 needs a positive trail lamp spacing.');
  }

  // --- the trail lamp chain ------------------------------------------------
  const trailPoints = options.trailPoints ?? [];
  const posts: Array<{ east: number; north: number; height: number }> = [];
  if (trailPoints.length > 1) {
    let travelled = 0;
    let next = trailSpacing;
    for (let index = 1; index < trailPoints.length; index++) {
      const previous = trailPoints[index - 1]!;
      const current = trailPoints[index]!;
      travelled += Math.hypot(current.east - previous.east, current.north - previous.north);
      if (travelled < next) continue;
      next += trailSpacing;
      posts.push({ east: current.east, north: current.north, height: current.height });
    }
  }

  const postShape = new BoxGeometry(.13, 1.55, .13);
  // R4: a rounded icosahedral lamp core reads as a real glowing bulb at night
  // rather than a flat box, while keeping the same .17 m footprint so the
  // fixture footprint and lamp-height contract are unchanged.
  const coreShape = new IcosahedronGeometry(.085, 0);
  disposers.push(() => postShape.dispose());
  disposers.push(() => coreShape.dispose());
  const postMaterial = new MeshLambertMaterial({ color: POST_COLOUR });
  const coreMaterial = new MeshBasicMaterial({ color: CORE_DAY });
  // The lamp hardware must not be dimmed by the night tint: it owns its own
  // day/night colours and the emissive core must stay bright at night.
  postMaterial.userData.noNightTint = true;
  coreMaterial.userData.noNightTint = true;
  disposers.push(() => postMaterial.dispose());
  disposers.push(() => coreMaterial.dispose());

  const postMesh = new InstancedMesh(postShape, postMaterial, Math.max(1, posts.length));
  postMesh.name = 'town-d2-r30-trail-lamp-posts';
  const coreMesh = new InstancedMesh(coreShape, coreMaterial, Math.max(1, posts.length));
  coreMesh.name = 'town-d2-r30-trail-lamp-cores';
  const matrix = new Matrix4();
  posts.forEach((post, index) => {
    matrix.makeTranslation(post.east, post.height + .775, -post.north);
    postMesh.setMatrixAt(index, matrix);
    matrix.makeTranslation(post.east, post.height + 1.56, -post.north);
    coreMesh.setMatrixAt(index, matrix);
  });
  postMesh.count = posts.length;
  coreMesh.count = posts.length;
  postMesh.instanceMatrix.needsUpdate = true;
  coreMesh.instanceMatrix.needsUpdate = true;
  postMesh.computeBoundingSphere();
  coreMesh.computeBoundingSphere();
  group.add(postMesh, coreMesh);

  for (const post of posts) {
    emitters.push({
      id: `trail-lamp-${emitters.length}`, role: 'trail',
      east: post.east, north: post.north, height: post.height + 1.56,
      color: 0xffb45c, realLight: false,
    });
  }

  // --- borrowed emissive bodies --------------------------------------------
  const hostGroup = options.hostGroup;
  const windowPane = hostGroup?.getObjectByName(townD2R30NightBorrowedNames.window) as Mesh | undefined;
  const interiorEmbers = (townD2R30NightBorrowedNames.embers
    .map(name => hostGroup?.getObjectByName(name) as Mesh | undefined)
    .filter((mesh): mesh is Mesh => Boolean(mesh)));
  const bellLampCores: Mesh[] = [];
  const stationLights: PointLight[] = [];
  if (hostGroup) {
    hostGroup.traverse(object => {
      if (object.name === townD2R30NightBorrowedNames.bellCore) bellLampCores.push(object as Mesh);
      if ((townD2R30NightBorrowedNames.stationLamps as readonly string[]).includes(object.name)) {
        stationLights.push(object as PointLight);
      }
    });
  }
  // The canonical bell module owns its lamp cores, so the night switch is
  // delegated to the rules side instead of poking at its meshes.
  const bellLampSwitch = (hostGroup?.userData as { bellLampSwitch?: (on: boolean) => void } | undefined)
    ?.bellLampSwitch;

  if (windowPane) {
    emitters.push({
      id: 'summit-window', role: 'window',
      east: windowPane.position.x, north: -windowPane.position.z, height: windowPane.position.y,
      color: 0xffb45c, realLight: false,
    });
  }
  for (const core of bellLampCores) {
    emitters.push({
      id: `bell-core-${emitters.length}`, role: 'bell',
      east: core.position.x, north: -core.position.z, height: core.position.y,
      color: 0xffc46b, realLight: false,
    });
  }

  // --- the real point lights ------------------------------------------------
  // Only the four fixtures that must actually cast light get a PointLight.
  // Every other fixture reads through its emissive body.
  const lightPlan: Array<{ id: string; role: TownD2R30NightLightRole; east: number; north: number; height: number }> = [];
  if (windowPane) {
    lightPlan.push({
      id: 'summit-window', role: 'window',
      east: windowPane.position.x, north: -windowPane.position.z, height: windowPane.position.y,
    });
  }
  if (posts.length) {
    // The lowest and highest trail lamps frame the climb.
    lightPlan.push({ id: 'trail-lamp-low', role: 'trail', ...posts[0]! });
    lightPlan.push({ id: 'trail-lamp-high', role: 'trail', ...posts[posts.length - 1]! });
  }
  if (bellLampCores.length) {
    const core = bellLampCores[0]!;
    lightPlan.push({
      id: 'bell-core-0', role: 'bell',
      east: core.position.x, north: -core.position.z, height: core.position.y,
    });
  }
  const capped = lightPlan.slice(0, townD2R30NightLightBudget.maxPointLights);
  const pointLights: PointLight[] = [];
  for (const plan of capped) {
    const light = new PointLight(0xffc078, townD2R30NightLightBudget.intensity,
      townD2R30NightLightBudget.distance, 2);
    light.name = `town-d2-r30-night-light-${plan.id}`;
    light.position.set(plan.east, plan.height, -plan.north);
    // A real light never burns in daylight; the night switch turns it on.
    light.visible = false;
    group.add(light);
    pointLights.push(light);
    const emitter = emitters.find(item => item.id === plan.id);
    if (emitter) {
      emitters[emitters.indexOf(emitter)] = Object.freeze({ ...emitter, realLight: true });
    }
  }

  let meshes = 0;
  let triangles = 0;
  group.traverse(object => {
    const mesh = object as Object3D & {
      isMesh?: boolean;
      geometry?: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } };
      count?: number;
    };
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes += 1;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : mesh.geometry.getAttribute('position').count;
    triangles += (count / 3) * (mesh.count ?? 1);
  });

  const stats: TownD2R30NightLightStats = Object.freeze({
    fixtures: emitters.length,
    realLights: pointLights.length,
    maxRealLights: townD2R30NightLightBudget.maxPointLights,
    borrowedLights: stationLights.length,
    trailLamps: posts.length,
    borrowedEmitters: (windowPane ? 1 : 0) + interiorEmbers.length + bellLampCores.length,
    meshes,
    triangles: Math.round(triangles),
  });
  group.userData = {
    owner: 'D2-R08', visualOnly: true, includesWorldCollision: false,
    modifiesHeightAt: false, ownsRealLights: pointLights.length, stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  let night = false;

  /**
   * Applies the day or the night look to every borrowed body. The daytime
   * look is applied at build time so the summit never starts on the warm
   * night palette.
   */
  const applyLook = (value: boolean) => {
    coreMaterial.color.set(value ? CORE_NIGHT : CORE_DAY);
    for (const light of pointLights) light.visible = value;
    // The wind ground's oil lanterns only burn after dusk.
    for (const light of stationLights) light.visible = value;

    if (windowPane) {
      const material = windowPane.material as MeshBasicMaterial;
      material.color.set(value ? BORROWED_NIGHT_COLOURS.window : BORROWED_NIGHT_COLOURS.windowDay);
    }
    interiorEmbers.forEach((ember, index) => {
      const material = ember.material as MeshBasicMaterial;
      const nightColour = index === 0 ? BORROWED_NIGHT_COLOURS.emberNight : BORROWED_NIGHT_COLOURS.shelfNight;
      const dayColour = index === 0 ? BORROWED_NIGHT_COLOURS.emberDay : BORROWED_NIGHT_COLOURS.shelfDay;
      material.color.set(value ? nightColour : dayColour);
    });
    // The bell-post cores belong to the canonical rules module; the night
    // switch only decides whether they are lit.
    if (bellLampSwitch) bellLampSwitch(value);
    else for (const core of bellLampCores) core.visible = value;
  };

  applyLook(false);

  return {
    group,
    emitters: () => Object.freeze(emitters.map(emitter => ({ ...emitter }))),
    stats: () => stats,
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R08 night lights are disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      applyLook(value);
      group.userData.night = night;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const dispose of disposers) dispose();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
