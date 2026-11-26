import { summitPassportSites } from '../../../src/presence/summit-passport-authority';
import { createMainSummitBlock, mainSummitLayout } from './main-summit-block';
import { createMainSummitTrail } from './main-summit-trail';
import { createSummitSledRun } from './town-summit-sled-line';
import { surveyTownD2R30SledGates } from './town-d2-r30-sled-gate-support';
import type { TownD2R30SledGateReport } from './town-d2-r30-sled-gate-support';
import { sampleTownD2R30Height, townD2R30Anchors } from './town-d2-r30-domain';
import { createTownD2R30Ropeway } from './town-d2-r30-ropeway';

/**
 * D2-R6: a self-contained summit-expedition progression module.
 *
 * It does NOT touch the public viewer, presence protocol, passport authority
 * or any scoring rule. It consumes only canonical anchors (the audited
 * passport sites, canonical cable stations, summit layout and R30 terrain
 * sampler) and feeds the already-reviewed 12-gate sled rules with the surveyed
 * R30 gate positions. Every waypoint is verified against its authoritative
 * standing surface (terrain or the canonical station deck) so a "visit" can
 * never be logged on an invisible / floating platform — this is the D2
 * quality gate that turns the collected R01-R05 models into a walkable,
 * auditable exploration chain.
 */

export type TownD2R30ExpeditionNodeId =
  | 'cloud-stamp' | 'gate' | 'transfer'
  | 'survey-m6' | 'sky-watch' | 'summit-stamp'
  | 'register-summit' | 'glide-launch';

export type TownD2R30ExpeditionNode = Readonly<{
  id: TownD2R30ExpeditionNodeId;
  label: string;
  /** Summit-local east/north/height. The cloud stamp is in cloud-deck frame. */
  east: number;
  north: number;
  height: number;
  /** Horizontal tolerance for a valid visit (metres). */
  radius: number;
  /** The 'cloud-stamp' site is in the front-ridge domain and is audited by D. */
  domain: 'cloud-deck' | 'summit';
  /** Authoritative standing surface: the station deck for transfer, terrain otherwise. */
  ground: number | undefined;
  /** Vertical mismatch with the authoritative standing surface; undefined for cloud-deck. */
  delta: number | undefined;
  status: 'grounded' | 'floating' | 'buried' | 'outside-terrain' | 'external-domain';
}>;

export type TownD2R30ExpeditionEvent = Readonly<{
  type: 'visit' | 'repeat' | 'out-of-reach' | 'sled' | 'complete';
  node: TownD2R30ExpeditionNodeId | 'summit-sled-line';
  at: number;
  detail?: string;
}>;

export type TownD2R30ExpeditionSnapshot = Readonly<{
  visited: readonly TownD2R30ExpeditionNodeId[];
  complete: boolean;
  progress: number;
  events: readonly TownD2R30ExpeditionEvent[];
  sled: Readonly<{ gatesPassed: number; running: boolean; finished: boolean }>;
}>;

export type TownD2R30Position = Readonly<{
  area: 'summit' | 'cloud-deck';
  east: number;
  north: number;
  height: number;
}>;

/** The canonical upper-station arrival state consumed by the transfer waypoint. */
export type TownD2R30TransferStationReport = Readonly<{
  station: 'summit';
  phase: 'station';
  direction: 'down';
  domain: 'summit';
  approach: Readonly<{ east: number; north: number; height: number }>;
}>;

const HEIGHT_TOLERANCE = 1.5;

function surveyedTransferStation(arrivalHeight: number): TownD2R30TransferStationReport {
  const ropeway = createTownD2R30Ropeway({ arrivalHeight });
  try {
    const approach = ropeway.stations.stations.summit.routes[0]?.approach;
    const domain = summitPassportSites(arrivalHeight)['summit-stamp'].area;
    // Cabin A is at the upper terminal immediately after its first leg. Read
    // the station/phase/domain from the canonical cable and station modules;
    // do not mirror their schedule or invent a second transfer anchor.
    const cabin = ropeway.cable.cabinsAt(ropeway.cable.legMs)[0];
    if (domain !== 'summit' || !approach || !cabin || cabin.station !== 'summit' || cabin.phase !== 'station' ||
        cabin.direction !== 'down' || !cabin.canBoardOrExit ||
        ![approach.east, approach.north, approach.height].every(Number.isFinite) ||
        ropeway.stations.blocked(approach.east, approach.north, approach.height)) {
      throw new RangeError('The canonical summit station has no standable arrival approach.');
    }
    return Object.freeze({
      station: cabin.station, phase: cabin.phase, direction: cabin.direction, domain,
      approach: Object.freeze({ ...approach }),
    });
  } finally {
    ropeway.dispose();
  }
}

function checkedTransferStation(report: TownD2R30TransferStationReport): TownD2R30TransferStationReport {
  if (!report || report.station !== 'summit' || report.phase !== 'station' ||
      report.direction !== 'down' || report.domain !== 'summit' || !report.approach ||
      ![report.approach.east, report.approach.north, report.approach.height].every(Number.isFinite) ||
      report.approach.height <= 0) {
    throw new RangeError('Transfer requires the canonical summit station arrival approach.');
  }
  return Object.freeze({
    station: report.station, phase: report.phase, direction: report.direction, domain: report.domain,
    approach: Object.freeze({ ...report.approach }),
  });
}

/** Derives the sky-watch relic site exactly as main-summit-extras.ts mounts it:
 * the canonical trail point nearest 640 m, pushed 80 m radially from the summit. */
function surveySkyWatch(arrivalHeight: number) {
  const block = createMainSummitBlock(mainSummitLayout, arrivalHeight, 100);
  try {
    const trail = createMainSummitTrail(block.heightAt, arrivalHeight);
    const anchor = trail.points.reduce((best, point) =>
      Math.abs(point.height - 640) < Math.abs(best.height - 640) ? point : best, trail.points[0]!);
    const away = Math.hypot(anchor.east - 50, anchor.north - 1000) || 1;
    return {
      east: anchor.east + ((anchor.east - 50) / away) * 80,
      north: anchor.north + ((anchor.north - 1000) / away) * 80,
    };
  } finally {
    block.dispose();
  }
}

function canonicalNodes(arrivalHeight: number, heightAt: (east: number, north: number) => number | undefined,
  transferStation: TownD2R30TransferStationReport) {
  const sites = summitPassportSites(arrivalHeight);
  const summit = townD2R30Anchors.summit;
  const watch = surveySkyWatch(arrivalHeight);
  const icefallTop = { east: -60, north: 800 }; // main-summit-icefall.ts icefallSpec
  const icefallHeight = heightAt(icefallTop.east, icefallTop.north);
  const watchHeight = heightAt(watch.east, watch.north);
  type Definition = Omit<TownD2R30ExpeditionNode, 'ground' | 'delta' | 'status'>;
  const definitions: Definition[] = [
    { id: 'cloud-stamp', label: '云海台首枚印章', east: sites['cloud-stamp'].east, north: sites['cloud-stamp'].north, height: sites['cloud-stamp'].height, radius: 1.1, domain: sites['cloud-stamp'].area },
    { id: 'gate', label: '主峰山门', east: townD2R30Anchors.gate.east, north: townD2R30Anchors.gate.north, height: townD2R30Anchors.gate.height, radius: 3, domain: 'summit' },
    { id: 'transfer', label: '缆车换乘站台', east: transferStation.approach.east,
      north: transferStation.approach.north, height: transferStation.approach.height,
      radius: 4, domain: transferStation.domain },
    { id: 'survey-m6', label: 'M6 冰瀑顶测绘站', east: icefallTop.east, north: icefallTop.north,
      height: icefallHeight ?? Number.NaN, radius: 2.5, domain: 'summit' },
    { id: 'sky-watch', label: '守天哨遗址', east: watch.east, north: watch.north,
      height: watchHeight ?? Number.NaN, radius: 3, domain: 'summit' },
    { id: 'summit-stamp', label: '绝顶印章', east: sites['summit-stamp'].east, north: sites['summit-stamp'].north,
      height: sites['summit-stamp'].height, radius: 1.1, domain: sites['summit-stamp'].area },
    { id: 'register-summit', label: '绝顶登记台', east: sites['register-summit'].east,
      north: sites['register-summit'].north, height: sites['register-summit'].height,
      radius: 1.1, domain: sites['register-summit'].area },
    { id: 'glide-launch', label: '雪翼起飞点', east: mainSummitLayout.summit.east,
      north: mainSummitLayout.summit.north - 25, height: summit.height, radius: 4, domain: 'summit' },
  ];
  return definitions.map(definition => {
    // The cloud-stamp anchor lives in the front-ridge frame; its ground is
    // audited by window D, not by this summit terrain sampler.
    if (definition.domain === 'cloud-deck') {
      return Object.freeze({ ...definition, ground: undefined, delta: undefined,
        status: 'external-domain' }) as TownD2R30ExpeditionNode;
    }
    // The upper cable station is a real raised deck. Its approach is the
    // canonical player landing surface, not the terrain beneath the station.
    if (definition.id === 'transfer') {
      return Object.freeze({ ...definition, ground: transferStation.approach.height,
        delta: 0, status: 'grounded' }) as TownD2R30ExpeditionNode;
    }
    const ground = heightAt(definition.east, definition.north);
    if (ground === undefined || !Number.isFinite(ground)) {
      return Object.freeze({ ...definition, ground: undefined, delta: undefined,
        status: 'outside-terrain' }) as TownD2R30ExpeditionNode;
    }
    const delta = definition.height - ground;
    const status = delta > HEIGHT_TOLERANCE ? 'floating'
      : delta < -HEIGHT_TOLERANCE ? 'buried' : 'grounded';
    return Object.freeze({ ...definition, ground, delta, status }) as TownD2R30ExpeditionNode;
  });
}

export function createTownD2R30Expedition(options: {
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
  sledGates?: readonly TownD2R30SledGateReport[];
  /** Test seam for an already-surveyed canonical station report; never a local coordinate authority. */
  transferStation?: TownD2R30TransferStationReport;
} = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  if (!Number.isFinite(arrivalHeight) || arrivalHeight < 347 || arrivalHeight > 350) {
    throw new RangeError('D2-R30 expedition needs the surveyed cloud-deck height (347..350).');
  }
  const groundAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  const transferStation = checkedTransferStation(options.transferStation ?? surveyedTransferStation(arrivalHeight));
  const nodes = canonicalNodes(arrivalHeight, groundAt, transferStation);
  const byId = new Map(nodes.map(node => [node.id, node]));

  // The sled run consumes the already-audited 12 R30 gate positions. No gate
  // count, length, timing or finishing rule is reimplemented here. By default
  // derive the same canonical P-1 crosswalk gates the R03 support uses.
  const gateSources: readonly { east: number; north: number }[] = options.sledGates
    ? options.sledGates
    : surveyTownD2R30SledGates(arrivalHeight);
  const sled = createSummitSledRun(gateSources.map(gate => ({
    east: gate.east, north: gate.north, halfWidth: 2,
  })));

  const visited = new Set<TownD2R30ExpeditionNodeId>();
  const events: TownD2R30ExpeditionEvent[] = [];
  let clock = 0;
  let disposed = false;

  function record(event: Omit<TownD2R30ExpeditionEvent, 'at'>) {
    events.push(Object.freeze({ ...event, at: clock }));
    if (events.length > 256) events.shift();
  }
  function snapshot(): TownD2R30ExpeditionSnapshot {
    const sledState = sled.state();
    return Object.freeze({
      visited: Object.freeze([...visited]),
      complete: visited.size === nodes.length,
      progress: visited.size / nodes.length,
      events: Object.freeze([...events]),
      sled: Object.freeze({
        gatesPassed: sledState.nextGate,
        running: sledState.running,
        finished: sledState.result?.status === 'finished',
      }),
    });
  }

  return {
    nodes: () => Object.freeze(nodes.map(node => ({ ...node }))),
    node: (id: TownD2R30ExpeditionNodeId) => byId.get(id),
    snapshot,
    /** Advance the shared clock; positions/times in this module are host-fed. */
    advance(at: number) {
      if (disposed) throw new Error('The D2-R30 expedition is disposed.');
      if (!Number.isFinite(at) || at < clock) throw new RangeError('Expedition clock must be monotonic.');
      clock = at;
    },
    /**
     * Log arrival at a canonical waypoint. A visit is accepted only when the
     * player is in the node's domain, inside its reach AND standing on its
     * authoritative surface at the node height — no invisible platform can
     * satisfy this.
     */
    visit(id: TownD2R30ExpeditionNodeId, position: TownD2R30Position): boolean {
      if (disposed) throw new Error('The D2-R30 expedition is disposed.');
      const node = byId.get(id);
      if (!node) return false;
      if (position.area !== node.domain ||
          ![position.east, position.north, position.height].every(Number.isFinite)) return false;
      const horizontal = Math.hypot(position.east - node.east, position.north - node.north);
      if (horizontal > node.radius || Math.abs(position.height - node.height) > HEIGHT_TOLERANCE) {
        record({ type: 'out-of-reach', node: id });
        return false;
      }
      if (visited.has(id)) {
        record({ type: 'repeat', node: id });
        return true;
      }
      visited.add(id);
      record({ type: 'visit', node: id });
      if (visited.size === nodes.length) record({ type: 'complete', node: id });
      return true;
    },
    /** Feed a sled movement step using the audited rules and R30 gates. */
    sledStep(point: { east: number; north: number }) {
      if (disposed) throw new Error('The D2-R30 expedition is disposed.');
      const result = sled.step(point, clock);
      if (result) record({ type: 'sled', node: 'summit-sled-line', detail: result.status });
      else record({ type: 'sled', node: 'summit-sled-line' });
      return result;
    },
    armSled() { sled.arm(); },
    reset() {
      visited.clear();
      events.length = 0;
      sled.arm();
      clock = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      visited.clear();
      events.length = 0;
    },
  };
}
