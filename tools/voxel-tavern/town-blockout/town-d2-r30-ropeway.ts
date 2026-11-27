import { Group } from 'three';
import { createMainSummitCable, summitCableSpec } from './main-summit-cable';
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
  /** False only when the canonical dense tower package is mounted. */
  controlPointSupports?:boolean;
}>;

const DEFAULTS = Object.freeze({ arrivalHeight: 347, epochMs: 0, terminalDwellMs: 10_000 });

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
  const cableView = mountMainSummitCable(group, cable, heightAt,{controlPointSupports:options.controlPointSupports});

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
    epochMs,
    terminalDwellMs,
    stations,
    decks:cableView.decks,
    supportAt:cableView.supportAt,
    blocked(e:number,n:number,h:number,r=.27){return stations.blocked(e,n,h,r)||cableView.deckBlocked(e,n,h,r);},
    stats: () => stats,
    /** Advances the two cabins along the rope. */
    update(nowMs: number) {
      if (disposed) return [];
      if (!Number.isFinite(nowMs)) throw new RangeError('D2-R09 needs a finite timestamp.');
      return cableView.update(nowMs);
    },
    /** Same actual cabin transforms for the staged, pre-repair journey. */
    updateStates(states: Parameters<typeof cableView.updateStates>[0]) {
      if(disposed)return [];
      return cableView.updateStates(states);
    },
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R09 ropeway is disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      if (night === value) return;
      night = value;
      applyTownD2R30NightTint(group, value);
      group.userData.night = night;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stations.dispose();
      disposeGate();
      cableView.dispose();
      group.removeFromParent();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
