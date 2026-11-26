import { Group, Vector3 } from 'three';
import { resolveUndergroundShaftRegistration } from '../../../src/presence/underground-shaft-registration.js';
import { undergroundCampPickaxe } from '../../../src/shared/underground-camp-pickaxe.js';
import { createUndergroundMineLayout, type UndergroundMineSpec } from './underground-mine-layout';
import { mountUndergroundMineDomain } from './underground-domain-scene';
import { createUndergroundCampRemains } from './underground-camp-remains';
import {
  createUndergroundCampOfferings, undergroundCampOfferingLighting,
} from './underground-camp-offerings';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import type { AcceptedUndergroundWaterSnapshot } from '../../../src/shared/town-c-water-snapshot-port.js';
import type { UndergroundWater90OreVisual } from './town-c2-underground-water-minus90.js';
import { resolveR30ShaftContract } from './town-c-r30-shaft-contract.js';
import {r30DeepFrames,r30DeepLocalFeet,r30DeepWorldFeet,r30DepthLinks,r30DeepRoomProposals} from './town-c-r30-deep-layer-contract.js';
import {createR30DeepHost} from './town-c-r30-deep-host.js';
import {mountR30InterlayerLift,type R30InterlayerRide} from './town-c-r30-interlayer-lift.js';
import {createR30CrystalHost,type R30CrystalBridge} from './town-c-r30-crystal-host.js';
import {makeR30CrystalFrame} from './town-c-r30-crystal-support.js';

type Road = ReturnType<typeof mountWestCraterRoad>;
type Mine = ReturnType<typeof createUndergroundMineLayout>;
type Point = Readonly<{ east: number; north: number; height: number }>;

/** The B-01 certified first-mine spec (worked fixture of the domain-scene suite). */
export const undergroundMineSpec: UndergroundMineSpec = {
  pool: { length: 4, width: 6, depth: 1.2, shaftAperture: { width: 2, length: 2 } },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5, openBackForExpansion: true, crystalGate: true },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};

/** Certified B-01 registration values: the crater lives in the town's west domain,
 * the mine landing is its own domain, and the depth line sits between them. */
export const undergroundCraterDomainId = 'west';
export const undergroundMineLanding: Point & Readonly<{ domainId: string }> =
  { domainId: 'underground/mine', east: -119, north: 189, height: -90 };
const shaftDepthLine = -73;
const winchHorizontalReach = .7;
const winchVerticalReach = .3;
const craterDepth = 35;

/**
 * Build the shaft survey from the mounted west route: the road's live rim anchor,
 * its surveyed winch operation foot, and the certified mine landing. Returns
 * undefined when the mounted winch survey cannot be taken (nothing to register).
 */
export function buildUndergroundShaftSurvey(road: Road) {
  const winch = surveyZa31CraterWinch(road);
  if (!winch) return undefined;
  const { anchor } = road;
  return {
    crater: {
      domainId: undergroundCraterDomainId,
      fixtureRim: { east: 0, north: 0, height: 0, yaw: 0 },
      liveRim: { east: anchor.east, north: anchor.north, rimHeight: anchor.rimHeight, yaw: anchor.yaw },
    },
    fixtureShaftFoot: { east: 0, north: 0, height: -craterDepth, yaw: 0 },
    liveWinchFoot: {
      domainId: undergroundCraterDomainId, ...winch.useFoot,
      horizontalReach: winchHorizontalReach, verticalReach: winchVerticalReach,
    },
    mineLanding: undergroundMineLanding,
    depthLine: shaftDepthLine,
  } as const;
}

/**
 * Registration port backed by the mounted geometry itself: the shaft foot must
 * sit on the crater floor the surface reports, the winch foot must be the one
 * the mounted route surveyed, and the mine pool must be the certified landing
 * at the layout's own pool level. Anything else stays unregistered.
 */
export function createUndergroundRegistrationPort(road: Road, mine: Mine) {
  const winch = surveyZa31CraterWinch(road);
  return {
    supportsFoot(role: 'shaft' | 'winch' | 'mine-pool', foot: Point & Readonly<{ domainId: string }>) {
      if (role === 'shaft') {
        if (foot.domainId !== undergroundCraterDomainId) return false;
        const height = road.heightAt(foot.east, foot.north);
        return height !== undefined && Math.abs(height - foot.height) < .01;
      }
      if (role === 'winch') {
        if (!winch || foot.domainId !== undergroundCraterDomainId) return false;
        return Math.abs(foot.east - winch.useFoot.east) < 1e-6 &&
          Math.abs(foot.north - winch.useFoot.north) < 1e-6 &&
          Math.abs(foot.height - winch.useFoot.height) < 1e-6;
      }
      return foot.domainId === undergroundMineLanding.domainId &&
        foot.east === undergroundMineLanding.east &&
        foot.north === undergroundMineLanding.north &&
        foot.height === undergroundMineLanding.height &&
        mine.anchors.poolLanding[1] === undergroundMineLanding.height;
    },
    acceptsShaftHandoff(connection: Readonly<{
      shaftFoot: Point; firstFallLanding: Point; depthLine: number;
    }>) {
      const { anchor } = road;
      return connection.depthLine === shaftDepthLine &&
        Math.abs(connection.shaftFoot.east - anchor.east) < 1e-6 &&
        Math.abs(connection.shaftFoot.north - anchor.north) < 1e-6 &&
        Math.abs(connection.shaftFoot.height - (anchor.rimHeight - craterDepth)) < 1e-6 &&
        connection.firstFallLanding.east === undergroundMineLanding.east &&
        connection.firstFallLanding.north === undergroundMineLanding.north &&
        connection.firstFallLanding.height === undergroundMineLanding.height;
    },
  };
}

/**
 * Viewer-side bridge for the interactive camp (batch 3). The domain host
 * owns camp state (offerings, relic catalogue, pickaxe grant); the viewer
 * owns the body: footing, sitting, aim and announcements.
 */
export type UndergroundCampBridge = Readonly<{
  now(): number;
  readWorldFoot(): Point | undefined;
  sit(roomId: string): boolean;
  stand(roomId: string): boolean;
  onSeatedChange(active: boolean): void;
  isAimingAt(world: Point): boolean;
  showPickupNotice(): void;
  onRested(roomId: string): void;
  /**
   * Lamp authority seam (ruling 2026-11-22): the single lamp ledger lives
   * with the shaft-head lamp room on the presence side; the camp holds no
   * inventory. The viewer supplies the read from its presence state; while
   * it is unsupplied the offering honestly resolves as 'no-lamp'.
   */
  readLampHeld?: () => boolean;
  /** Called after a successful offering so presence can record placement. */
  onLampPlaced?: () => void;
}>;

/**
 * The underground domain host (branch window C, round 1): resolves the shaft
 * registration against the mounted west route and mounts the certified mine
 * domain scene. It owns no movement, E handling or teleport authority — entry
 * crossings stay with the descent driver and the presence handoff. When the
 * registration is not ready the mine stays unmounted and the result says why;
 * nothing is force-mounted. Light is never granted from render state: the
 * light reader reports the camp offerings state (batch 3) — niches light
 * only through an accepted offering, and without a camp bridge it reports
 * no lit niches and no budget, so camp lamps stay dark.
 */
export function mountUndergroundDomainHost(options: Readonly<{
  parent: Group; road: Road; campBridge?: UndergroundCampBridge;
  /** Accepted movement/Presence foot only, never inferred from camera height. */
  readAcceptedDomainFoot?:()=> (Point&Readonly<{domainId:string}>)|undefined;
  crystalBridge?:R30CrystalBridge;
  /** C2 certifies its actual roof opening; C certifies the upper mesh cut.
   * The existing transport authority supplies the accepted trip and clock. */
  interlayerRide?:Readonly<{read:()=>R30InterlayerRide|undefined;now:()=>number;lowerOpeningCertified:()=>boolean}>;
  /** Production water loop (batch 103, interface aligned to C2's fix
   * round): the mine presence room relays the single presence-side
   * tonight() snapshot; the host forwards the raw snapshot reader
   * plus the scene's display parameters into the scene adapter,
   * which validates the snapshot via the certified port (single
   * validation point). Absent bridge (or no snapshot yet) leaves
   * the scene's baseline untouched. */
  waterBridge?: Readonly<{
    readWaterSnapshot?: () => AcceptedUndergroundWaterSnapshot | undefined;
    highWaterOffsetM?: number;
    oreVisuals?: readonly UndergroundWater90OreVisual[];
  }>;
}>) {
  const { parent, road } = options;
  const campBridge = options.campBridge;
  const survey = buildUndergroundShaftSurvey(road);
  if (!survey) return { kind: 'unregistered', reason: 'winch-survey' } as const;
  const mine = createUndergroundMineLayout(undergroundMineSpec);
  const registration = resolveUndergroundShaftRegistration(
    survey, createUndergroundRegistrationPort(road, mine));
  if (registration.kind !== 'ready') return { kind: 'unregistered', reason: registration.kind } as const;

  // Batch 3 camp state, owned here: offerings drive the light reader, so a
  // lamp offered at a niche lights that niche through the scene's own sync.
  // The lamp itself answers to the single lamp ledger (lamp room, presence
  // side — ruling 2026-11-22): the bridge reads whether this session holds
  // a lamp, and while that read is unsupplied the offering honestly
  // resolves as 'no-lamp'. The camp never keeps a lamp inventory.
  let toLocal: ((world: Point) => readonly [number, number, number] | undefined) | undefined;
  let toWorldPoint: ((local: readonly [number, number, number]) => Point | undefined) | undefined;
  let offerings: ReturnType<typeof createUndergroundCampOfferings> | undefined;
  let nicheEmpties = new Set<string>();
  if (campBridge) {
    const data = createUndergroundCampRemains({
      mine, camp: undergroundMineSpec.camp, walker: undergroundMineSpec.walker,
    });
    const niches = data.memorial.niches.map(({ id, hasSpentLamp }) => ({ id, hasSpentLamp }));
    data.dispose();
    nicheEmpties = new Set(niches.filter((niche) => !niche.hasSpentLamp).map((niche) => niche.id));
    offerings = createUndergroundCampOfferings(niches);
  }
  const recordedRelics = new Set<string>();
  let pickaxeTaken = false;

  const readLights = () => {
    if (!offerings) {
      return { litNicheIds: new Set<string>(), extraCampLightCount: 0, remainingBudget: 0 };
    }
    const snap = offerings.snapshot();
    const used = snap.litNicheIds.length + snap.extraCampLightCount;
    return {
      litNicheIds: new Set(snap.litNicheIds),
      extraCampLightCount: snap.extraCampLightCount,
      remainingBudget: Math.max(0, undergroundCampOfferingLighting.visibleLightLimit - used),
    };
  };

  const campRuntime = campBridge && offerings ? {    actions: {
      promptRange: 1.15,
      restAfterMs: 2500,
      now: campBridge.now,
      readFooting: () => {
        // Default town startup mounts the mine while viewer.ts's player x/n/
        // ground lexical bindings are still in their initialization phase.
        // A camp has no authorized footing before the rigid transform exists;
        // an early synchronous sync() must not kill the entire town entry.
        if (!toLocal) return undefined;
        let foot: Point | undefined;
        try { foot = campBridge.readWorldFoot(); }
        catch (error) {
          // This is strictly an initialization-time signal, NOT a general
          // exception swallowing policy. All other host/camp bugs propagate.
          if (error instanceof ReferenceError &&
              /^Cannot access '(?:x|n|ground)' before initialization$/.test(error.message)) {
            return undefined;
          }
          throw error;
        }
        return foot ? toLocal(foot) : undefined;
      },
      sit: (room: { id: string }) => campBridge.sit(room.id),
      stand: (room: { id: string }) => campBridge.stand(room.id),
      setSeatedAmbience: (active: boolean) => campBridge.onSeatedChange(active),
      onRested: (room: { id: string }) => campBridge.onRested(room.id),
      lookAtBowl: (bowl: { position: readonly [number, number, number] }) => {
        const world = toWorldPoint?.(bowl.position);
        return world !== undefined && campBridge.isAimingAt(world);
      },
      recordRelic: (entry: { id: string }) => {
        if (recordedRelics.has(entry.id)) return 'already-recorded' as const;
        recordedRelics.add(entry.id);
        return 'recorded' as const;
      },
      canOfferLamp: (nicheId: string) =>
        nicheEmpties.has(nicheId) && !(offerings?.snapshot().litNicheIds.includes(nicheId) ?? false),
      offerLamp: (nicheId: string) => {
        const offered = offerings?.offerLamp(
          nicheId, () => campBridge.readLampHeld?.() === true).kind === 'offered';
        if (offered) campBridge.onLampPlaced?.();
        return offered;
      },
    },
    pickaxe: {
      available: () => !pickaxeTaken,
      aimedAt: (point: readonly [number, number, number]) => {
        const world = toWorldPoint?.(point);
        return world !== undefined && campBridge.isAimingAt(world);
      },
      claim: async (siteId: string) => {
        if (siteId !== undergroundCampPickaxe.siteId) return 'rejected' as const;
        if (pickaxeTaken) return 'already-granted' as const;
        pickaxeTaken = true;
        return 'granted' as const;
      },
      showPickupNotice: () => campBridge.showPickupNotice(),
    },
  } : undefined;

  // Batch 4: crystal gate + recovery fire. The gate stage reader is
  // supplied so the gate geometry mounts; it reports 'closed' until the
  // encounter-gated gate authority (mine encounter + crystal domain) is
  // wired — that authority, not this reader, owns advancement. The one
  // recovery fire is the layout's certified campfire anchor; contact
  // confirmation belongs to the server vitals, so the ring never claims
  // contact from the client. Ore points are NOT supplied: the certified
  // distribution itself reports its production points missing, and this
  // host does not invent them.
  const yawAxis = new Vector3(0, 1, 0);
  const rotateLocal = (local: readonly [number, number, number]) =>
    new Vector3(local[0], local[1], local[2]).applyAxisAngle(yawAxis, road.anchor.yaw);
  const poolRotated = rotateLocal(mine.anchors.poolLanding);
  const rootPosition = new Vector3(
    undergroundMineLanding.east - poolRotated.x,
    undergroundMineLanding.height - poolRotated.y,
    -undergroundMineLanding.north - poolRotated.z);
  const worldOf = (local: readonly [number, number, number]): Point => {
    const world = rotateLocal(local).add(rootPosition);
    return { east: world.x, north: -world.z, height: world.y };
  };
  const campFireWorld = worldOf(mine.anchors.campRecovery.position);
  const recoveryRuntime = {
    sites: [{
      fire: {
        id: 'fire/camp-recovery',
        point: { layer: undergroundMineLanding.domainId, ...campFireWorld },
        healPerSecond: 6, recovery: true,
      },
      radius: 2.5, tone: 'warm' as const,
    }],
    supportsFire: () => true,
    readConfirmedContact: () => undefined,
  };
  let crystalHost:ReturnType<typeof createR30CrystalHost>|undefined;
  const readGateStage = () => crystalHost?.stage()??'closed';

  // Water loop consumption (interface aligned to C2's fix round): the
  // host forwards the bridge's raw snapshot reader as the adapter's
  // AcceptedWaterReader, plus the scene's display parameters; the
  // adapter validates the snapshot via the certified port (single
  // validation point — the host does not pre-validate). The high-water
  // rise defaults to C2's fixture value (1 m) until the scene
  // difference verification certifies a layout datum.
  const waterRuntime = options.waterBridge ? {
    highWaterOffsetM: options.waterBridge.highWaterOffsetM ?? 1,
    readAcceptedWater: () => options.waterBridge?.readWaterSnapshot?.(),
    oreVisuals: options.waterBridge.oreVisuals,
  } : undefined;

  const mounted = mountUndergroundMineDomain({
    parent, registration, mine,
    camp: undergroundMineSpec.camp, walker: undergroundMineSpec.walker,
    // The mine's local frame rides the crater fixture frame (the road anchor yaw);
    // no separate certified mine yaw exists in the registry yet.
    mineYaw: road.anchor.yaw,
    acceptsMineGeometry: placement =>
      placement.domainId === undergroundMineLanding.domainId &&
      placement.landing.height === undergroundMineLanding.height &&
      placement.localPool[1] === undergroundMineLanding.height,
    readLights,
    campRuntime,
    recoveryRuntime,
    readGateStage,
    ...(waterRuntime ? { waterRuntime } : {}),
  });
  if (mounted.kind !== 'ready') return { kind: 'unregistered', reason: mounted.kind } as const;
  // World -> mine-local passage query, for the movement host: the layout's own
  // queryPassage decides floor, clearance and crouch, never a guessed height.
  const originW = mounted.toWorld([0, 0, 0]);
  const basisXW = mounted.toWorld([1, 0, 0]);
  const basisZW = mounted.toWorld([0, 0, 1]);
  let interlayerLift:ReturnType<typeof mountR30InterlayerLift>|undefined;
  function passageAt(east: number, north: number, posture:'standing'|'crouching'='standing') {
    if(posture!=='standing'&&posture!=='crouching')return undefined;
    const bodyHeight=posture==='crouching'?undergroundMineSpec.walker.crouchingHeight:undergroundMineSpec.walker.standingHeight;
    if (!originW || !basisXW || !basisZW) return undefined;
    const dx = east - originW.east, dn = north - originW.north;
    const bxE = basisXW.east - originW.east, bxN = basisXW.north - originW.north;
    const bzE = basisZW.east - originW.east, bzN = basisZW.north - originW.north;
    const localX = dx * bxE + dn * bxN;
    const localZ = dx * bzE + dn * bzN;
    if(mounted.wreck?.blocks(localX,localZ,undergroundMineSpec.walker.radius))return;
    const passage=mine.queryPassage(localX, localZ, undergroundMineSpec.walker.radius,
      bodyHeight,readGateStage());
    // The camp's real furnishings (including R30 hearth) own their collision
    // locally. Keep the original passage metadata when the standing capsule fits.
    if(passage?.zone==='camp'&&!mounted.camp?.queryPassage(localX,localZ,
      undergroundMineSpec.walker.radius,bodyHeight))return;
    if(passage&&interlayerLift?.blocks(undergroundMineLanding.domainId,{east,north,height:passage.floor}))return;
    return passage;
  }
  if (originW && basisXW && basisZW) {
    const bxE = basisXW.east - originW.east, bxN = basisXW.north - originW.north;
    const bzE = basisZW.east - originW.east, bzN = basisZW.north - originW.north;
    toLocal = (world: Point) => [
      (world.east - originW.east) * bxE + (world.north - originW.north) * bxN,
      world.height - originW.height,
      (world.east - originW.east) * bzE + (world.north - originW.north) * bzN,
    ] as const;
    toWorldPoint = (local) => mounted.toWorld(local);
  }
  // R30: publish the actual mounted shaft/room seam to B, C2 and A. This
  // report does not open the well, grant movement, or replace entry authority.
  const winch = surveyZa31CraterWinch(road);
  const shaftContract = winch ? resolveR30ShaftContract({
    registration, winch, mineYaw: road.anchor.yaw,
    toWorld: local => mounted.toWorld(local),
    supportsMineFoot: local => {
      const p = mine.queryPassage(local[0],local[2],undergroundMineSpec.walker.radius,
        undergroundMineSpec.walker.standingHeight,'closed');
      return !!p && Math.abs(p.floor-local[1]) <= .01;
    },
    supportAt: (east,north) => road.heightAt(east,north),
    lampRoom: road.lampRoom?.footprint,
  }) : { kind: 'unregistered-shaft' as const };
  const registeredSeam=shaftContract.kind==='ready'&&shaftContract.deep.kind==='registered';
  interlayerLift=registeredSeam?mountR30InterlayerLift(mounted.group):undefined;
  const crystalFrame=registeredSeam?makeR30CrystalFrame(mounted.toWorld,road.anchor.yaw):undefined;
  const mineThreshold=mounted.toWorld([0,-91,139.5])!,mineWinch=mounted.toWorld([-2.28,-91,138.02])!;
  crystalHost=createR30CrystalHost({parent,frame:crystalFrame,mineThreshold,mineWinch,
    supportsMineThreshold:()=>!!mine.queryPassage(0,139.5,.27,1.8,'open'),
    installMouth:mounted.installCrystalMouth,bridge:options.crystalBridge,readAcceptedFoot:options.readAcceptedDomainFoot});
  const deepHost=createR30DeepHost({parent,seamRegistered:registeredSeam,
    readAcceptedWater:()=>options.waterBridge?.readWaterSnapshot?.(),
    readAcceptedFoot:options.readAcceptedDomainFoot,
    blocks:(domain,point,radius)=>interlayerLift?.blocks(domain,point,radius)===true});
  // Existing viewer already invokes mounted.sync()/dispose(). Preserve its
  // entry point and lifecycle, even before A supplies accepted domain feet.
  /** Swept local move for the single public movement owner. This returns a
   * legal proposal only; no player pose or authority is changed here. */
  function resolveMineStep(from:Point,to:Readonly<{east:number;north:number}>,posture:'standing'|'crouching'){
    if(![from.east,from.north,from.height,to.east,to.north].every(Number.isFinite))return;
    const distance=Math.hypot(to.east-from.east,to.north-from.north);
    if(distance>3)return; // a frame step, never a teleport across a wall
    const initial=passageAt(from.east,from.north,posture);
    if(!initial||Math.abs(initial.floor-from.height)>.25)return;
    const count=Math.max(1,Math.ceil(distance/.08));let previous=initial;
    for(let i=1;i<=count;i++){
      const p=passageAt(from.east+(to.east-from.east)*i/count,from.north+(to.north-from.north)*i/count,posture);
      if(!p||Math.abs(p.floor-previous.floor)>.22)return;
      previous=p;
    }
    return {foot:{...to,height:previous.floor},posture,clearance:previous.clearance,
      eyeHeight:posture==='crouching'?1.0:1.67,requiresCrouch:previous.requiresCrouch};
  }
  const composed={...mounted,sync(){crystalHost?.sync();mounted.sync();deepHost.sync();
    interlayerLift?.showDomain(deepHost.status()==='ready'?'underground/mine-2':undefined);
    if(options.interlayerRide&&interlayerLift){
      const lower=options.interlayerRide.lowerOpeningCertified();
      const opened=lower&&mounted.installUpperLiftAperture();
      interlayerLift.present(options.interlayerRide.read(),options.interlayerRide.now(),opened);
    }
  },dispose(){crystalHost?.dispose();interlayerLift?.dispose();deepHost.dispose();mounted.dispose()}};
  return {
    kind: 'ready', registration, mounted:composed, passageAt, shaftContract,deepHost,interlayerLift,crystalHost,
    // Layout contract only. The actual city/palace receiving shells and
    // movement/presence host must approve before mounting or allowing travel.
    deepLayerContract:shaftContract.kind==='ready'&&shaftContract.deep.kind==='registered'
      ?{frames:r30DeepFrames,localFeet:r30DeepLocalFeet,worldFeet:r30DeepWorldFeet,
        links:r30DepthLinks,roomProposals:r30DeepRoomProposals,productionReady:false as const}:undefined,
    resolveMineStep,
    canStandUp:(east:number,north:number)=>passageAt(east,north,'standing')!==undefined,
    floorAt: (east: number, north: number,posture:'standing'|'crouching'='standing') => passageAt(east, north,posture)?.floor,
    toLocal: (world: Point) => toLocal?.(world),
    offeringsSnapshot: () => offerings?.snapshot(),
    campFireWorld,
  } as const;
}
