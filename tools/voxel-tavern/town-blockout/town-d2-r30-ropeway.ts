import {
  BoxGeometry, CatmullRomCurve3, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  TubeGeometry, Vector3, type BufferGeometry,
} from 'three';
import { createMainSummitCable, summitCableSpec, type SummitCablePoint } from './main-summit-cable';
import { mountMainSummitCable } from './main-summit-cable-scene';
import { mountMainSummitCableStations } from './main-summit-cable-stations';
import { buildMainSummitGate, mainSummitLayout } from './main-summit-block';
import { sampleTownD2R30Height } from './town-d2-r30-domain';
import { applyTownD2R30NightTint } from './town-d2-r30-night-lights';

/**
 * D2-R09: the canonical line-two ropeway and its stations, rebuilt on the
 * R30 solid massif.
 *
 * The R30 assembly carried the ropeway's *towers* (D2-R02) but never the
 * rope itself or the station buildings, so the line had no deck to land on
 * and the summit had no mid-station. That left two of the fourteen visual
 * album items - M06 "道路与缆车" and M07 "中山换乘" - unsatisfied, and it is
 * explicitly inside D2's own mandate: "缆车二线及各站台".
 *
 * This module mounts the canonical rope, cabins, dock decks and station
 * facilities against the **R30** height field, so:
 *  - the rope's ground clearance is measured against the real massif and not
 *    against the old smoothed cone;
 *  - the station forecourts and the arrival gate stand on the R30 arrival
 *    datum (347 m), which the canonical station module verifies to the
 *    millimetre before it builds anything.
 *
 * The rope survey, the cabin physics, the boarding rules and the station
 * layout are untouched: they come from the canonical modules as they are.
 *
 * D2-R4/R5 refinement: on top of that canonical mount this package layers the
 * physical structure the reference album (docs/参考图/mountain-r30-night/
 * 02-B-west.svg, B区缆车) asks for, without moving a single canonical anchor:
 *  - the haul rope is rendered as a real catenary-sagged tube whose dip is
 *    capped by the live R30 clearance, so it suspends between the supports
 *    and never cuts the massif (the canonical straight survey polyline is a
 *    design-only artifact and is hidden so each line reads as one rope);
 *  - every cabin gains a rope grip, a capped roof with a gold ridge and a
 *    night lamp, riding the same rope point the canonical update drives;
 *  - every dock gains a boarding canopy, a rope guide rail and a lamp post;
 *  - all refined lit surfaces answer the night tint, and the lamp cores swap
 *    their day/night colours through the same setNight hook.
 */

export type TownD2R30RopewayStats = Readonly<{
  /** Rope length in metres, from the canonical survey. */
  ropeMetres: number;
  /** Number of rope lines (the canonical line-two pair). */
  ropes: number;
  /** Height of the lower dock board, in the summit-local frame. */
  arrivalFloor: number;
  /** Length of the arrival gate opening. */
  gateClearWidth: number;
  meshes: number;
  triangles: number;
}>;

export type TownD2R30RopewayOptions = Readonly<{
  /** The arrival deck height; the R30 arrival datum is 347 m. */
  arrivalHeight?: number;
  heightAt?: (east: number, north: number) => number | undefined;
  /** The world epoch the canonical cable schedules its rides from. */
  epochMs?: number;
  /** How long a cabin waits at a terminal. */
  terminalDwellMs?: number;
}>;

const DEFAULTS = Object.freeze({ arrivalHeight: 347, epochMs: 0, terminalDwellMs: 10_000 });

type SummitCable = ReturnType<typeof createMainSummitCable>;

/** Catenary sag of the physical haul rope between the surveyed supports. */
const RopeSag = Object.freeze({
  /** Sag as a fraction of the horizontal span between supports. */
  spanFactor: 0.04,
  /** Hard cap so a long span cannot droop unrealistically. */
  max: 18,
  /** Never droop past half the live R30 clearance, so the rope never cuts the massif. */
  clearanceFraction: 0.5,
  /** Samples per support-to-support span. */
  samples: 10,
  /** Tube radius of the physical rope. */
  radius: 0.06,
});

const LAMP_DAY_COLOUR = '#39322e';
const LAMP_NIGHT_COLOUR = '#ffb45c';

type RopewayRefinement = {
  group: Group;
  cabinDetails: readonly Group[];
  lampCore: MeshBasicMaterial;
  dispose(): void;
};

/**
 * The canonical mount renders the surveyed line as a 1 px straight polyline.
 * The physical haul rope is the sagged tube the refinement mounts, so the
 * design line is hidden to keep one readable rope per line; the survey data
 * and every canonical API are untouched.
 */
function supersedeCanonicalRopeLines(root: Group) {
  const cableGroup = root.getObjectByName('main-summit-cable');
  cableGroup?.traverse(object => {
    if ((object as { isLine?: boolean }).isLine) object.visible = false;
  });
}

/**
 * D2-R4/R5: the physical rope, cabin hardware and dock equipment, layered on
 * the canonical cable mount. Everything here is additive geometry; the
 * canonical survey, cabin physics, boarding rules and station layout stay
 * exactly as the consumers expect.
 */
function buildR30RopewayRefinement(
  owner: Group,
  cable: SummitCable,
  heightAt: (east: number, north: number) => number | undefined,
): RopewayRefinement {
  const group = new Group();
  group.name = 'r30-ropeway-refinement';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial | MeshBasicMaterial>();

  const lampCore = new MeshBasicMaterial({ color: LAMP_DAY_COLOUR });
  // The lamp hardware owns its day/night colour; the night tint must not
  // dim the glow, exactly like the D2-R08 trail lamps.
  lampCore.userData.noNightTint = true;
  materials.add(lampCore);

  const ropeMaterial = new MeshLambertMaterial({ color: '#3b424b' });
  const ironMaterial = new MeshLambertMaterial({ color: '#343a47' });
  const capMaterial = new MeshLambertMaterial({ color: '#55606a' });
  const goldMaterial = new MeshLambertMaterial({ color: '#e7be75' });
  const postMaterial = new MeshLambertMaterial({ color: '#55606a' });
  const roofMaterial = new MeshLambertMaterial({ color: '#3f4a52' });
  const railMaterial = new MeshLambertMaterial({ color: '#4a525a' });
  for (const material of [ropeMaterial, ironMaterial, capMaterial, goldMaterial, postMaterial, roofMaterial, railMaterial]) {
    materials.add(material);
  }

  function box(
    parent: Group,
    material: MeshLambertMaterial | MeshBasicMaterial,
    size: [number, number, number],
    at: [number, number, number],
  ) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    geometries.add(mesh.geometry);
    mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  }

  const asVector = ({ east, north, height }: SummitCablePoint) => new Vector3(east, height, -north);

  // --- the physical haul rope: a catenary-sagged tube per canonical line ----
  cable.ropes.forEach((rope, index) => {
    const samples: Vector3[] = [];
    for (let support = 0; support < rope.points.length - 1; support++) {
      const from = rope.points[support]!;
      const to = rope.points[support + 1]!;
      const east = to.east - from.east;
      const north = to.north - from.north;
      const rise = to.height - from.height;
      const horizontal = Math.hypot(east, north);
      let sag = Math.min(RopeSag.spanFactor * horizontal, RopeSag.max);
      // Cap the dip by the live R30 clearance so the suspended rope never
      // cuts the massif between the towers.
      let clearance = Number.POSITIVE_INFINITY;
      for (let t = 0.05; t < 1; t += 0.1) {
        const ground = heightAt(from.east + east * t, from.north + north * t);
        if (ground === undefined) continue;
        clearance = Math.min(clearance, from.height + rise * t - ground);
      }
      if (Number.isFinite(clearance)) sag = Math.min(sag, Math.max(0, clearance * RopeSag.clearanceFraction));
      const last = support === rope.points.length - 2;
      for (let step = 0; step <= RopeSag.samples; step++) {
        if (!last && step === RopeSag.samples) continue;
        const t = step / RopeSag.samples;
        const dip = 4 * sag * t * (1 - t);
        samples.push(new Vector3(from.east + east * t, from.height + rise * t - dip, -(from.north + north * t)));
      }
    }
    const curve = new CatmullRomCurve3(samples, false, 'centripetal');
    const geometry = new TubeGeometry(curve, Math.max(2, samples.length), RopeSag.radius, 5, false);
    geometries.add(geometry);
    const mesh = new Mesh(geometry, ropeMaterial);
    mesh.name = `r30-haul-rope-${index}`;
    group.add(mesh);
  });

  // --- cabin hardware riding the canonical cars -----------------------------
  // The canonical car group is positioned at the rope point with rotation
  // -heading, so these parts sit in that same local frame: the grip wraps the
  // rope, the cap sits on the canonical roof, the ridge runs along the cap and
  // the lamp glows on the front cap edge at night.
  const cabinDetails: Group[] = [];
  cable.ropes.forEach((rope, index) => {
    const detail = new Group();
    detail.name = `r30-cabin-detail-${index}`;
    box(detail, ironMaterial, [0.7, 0.14, 0.44], [0, -0.02, 0]);
    box(detail, capMaterial, [2.52, 0.09, 3.12], [0, -0.355, 0]);
    box(detail, goldMaterial, [0.12, 0.05, 3.14], [0, -0.29, 0]);
    box(detail, lampCore, [0.17, 0.17, 0.17], [0, -0.24, 1.45]);
    group.add(detail);
    cabinDetails.push(detail);
  });

  // --- dock equipment at every canonical dock -------------------------------
  // The deck centre sits half the canonical stand-back off the rope, so the
  // guide rail and the canopy are placed against that same surveyed offset.
  for (const [index, rope] of cable.ropes.entries()) {
    for (const station of ['cloud-deck', 'summit'] as const) {
      const { board, approach } = rope.dock(station);
      const deck = new Group();
      deck.name = `r30-dock-equipment-${station}-${index}`;
      deck.position.copy(asVector(board).lerp(asVector(approach), 0.5));
      deck.rotation.y = -rope.sample(station === 'cloud-deck' ? 0 : rope.totalMetres).heading;
      const floor = board.height;
      const ropeX = (index === 0 ? -1 : 1) * summitCableSpec.standBackFromRope / 2;
      for (const [px, pz] of [[-2.35, -1.55], [-2.35, 1.55], [2.35, -1.55], [2.35, 1.55]] as const) {
        box(deck, postMaterial, [0.10, 2.7, 0.10], [px, floor + 1.35, pz]);
      }
      box(deck, roofMaterial, [5.2, 0.10, 3.6], [0, floor + 2.75, 0]);
      box(deck, railMaterial, [0.08, 0.05, 2.6], [ropeX, floor + 2.15, 0]);
      const lampX = -2.35 * Math.sign(ropeX);
      box(deck, postMaterial, [0.09, 1.7, 0.09], [lampX, floor + 0.85, 0.9]);
      box(deck, lampCore, [0.16, 0.16, 0.16], [lampX, floor + 1.78, 0.9]);
      group.add(deck);
    }
  }

  owner.add(group);

  let disposed = false;
  return {
    group,
    cabinDetails,
    lampCore,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

export function createTownD2R30Ropeway(options: TownD2R30RopewayOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? DEFAULTS.arrivalHeight;
  const epochMs = options.epochMs ?? DEFAULTS.epochMs;
  const terminalDwellMs = options.terminalDwellMs ?? DEFAULTS.terminalDwellMs;
  if (!Number.isFinite(arrivalHeight)) {
    throw new RangeError('D2-R09 needs a finite arrival height.');
  }
  if (!Number.isSafeInteger(epochMs) || !Number.isSafeInteger(terminalDwellMs) || terminalDwellMs <= 0) {
    throw new RangeError('D2-R09 needs an integer epoch and a positive terminal dwell.');
  }
  const heightAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));

  const group = new Group();
  group.name = 'town-d2-r30-ropeway';
  const cable = createMainSummitCable(epochMs, terminalDwellMs, arrivalHeight);

  // The rope, the two cabins and the dock decks. The ground sampler is the
  // R30 massif, so the line's clearance is real.
  const cableView = mountMainSummitCable(group, cable, heightAt);
  supersedeCanonicalRopeLines(group);
  const refinement = buildR30RopewayRefinement(group, cable, heightAt);

  // The arrival gate is the surveyed P-1 gate rebuilt on the R30 arrival
  // datum. The canonical station module owns it through the summit contract,
  // so it disposes it with itself.
  const gate = buildMainSummitGate(mainSummitLayout.gate, arrivalHeight);
  let gateDisposed = false;
  const disposeGate = () => {
    if (gateDisposed) return;
    gateDisposed = true;
    gate.dispose();
  };

  const summit = {
    heightAt,
    enter(owner: Group) {
      if (gate.group.parent !== owner) owner.add(gate.group);
      return { group: gate.group, colliders: gate.colliders };
    },
    leave() { disposeGate(); },
  };

  let stations: ReturnType<typeof mountMainSummitCableStations>;
  try {
    stations = mountMainSummitCableStations(group, cable, summit);
  } catch (error) {
    disposeGate();
    refinement.dispose();
    cableView.dispose();
    group.clear();
    throw error;
  }

  let meshes = 0;
  let triangles = 0;
  group.traverse(object => {
    const mesh = object as {
      isMesh?: boolean;
      isLine?: boolean;
      geometry?: { getIndex(): { count: number } | null; getAttribute(name: string): { count: number } };
      count?: number;
    };
    if ((!mesh.isMesh && !mesh.isLine) || !mesh.geometry) return;
    meshes += 1;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : mesh.geometry.getAttribute('position').count;
    triangles += (count / 3) * (mesh.count ?? 1);
  });

  const stats: TownD2R30RopewayStats = Object.freeze({
    ropeMetres: Math.round(cable.ropes[0].totalMetres),
    ropes: cable.ropes.length,
    arrivalFloor: cable.ropes[0].dock('cloud-deck').board.height,
    gateClearWidth: mainSummitLayout.gate.clearWidth,
    meshes,
    triangles: Math.round(triangles),
  });
  group.userData = {
    owner: 'D2-R09', visualOnly: true, includesWorldCollision: false,
    modifiesHeightAt: false, modifiesCable: false, modifiesStationRules: false,
    speedMetresPerSecond: summitCableSpec.speedMetresPerSecond, stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  let night = false;
  return {
    group,
    /** The canonical cable and stations, so the legacy host can keep its rules. */
    cable,
    stations,
    stats: () => stats,
    /** Advances the two cabins along the rope. */
    update(nowMs: number) {
      if (disposed) return [];
      if (!Number.isFinite(nowMs)) throw new RangeError('D2-R09 needs a finite timestamp.');
      const states = cableView.update(nowMs);
      // The refined cabin hardware rides the same rope point the canonical
      // cars use, so the grip, cap and lamp stay glued to the cabin.
      refinement.cabinDetails.forEach((detail, index) => {
        const state = states[index];
        if (!state) return;
        detail.position.set(state.ropePoint.east, state.ropePoint.height, -state.ropePoint.north);
        detail.rotation.y = -state.ropePoint.heading;
      });
      return states;
    },
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R09 ropeway is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      applyTownD2R30NightTint(group, value);
      refinement.lampCore.color.set(value ? LAMP_NIGHT_COLOUR : LAMP_DAY_COLOUR);
      group.userData.night = night;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stations.dispose();
      disposeGate();
      cableView.dispose();
      refinement.dispose();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
