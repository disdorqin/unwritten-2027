import {
  BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D,
} from 'three';

export const stoneSinkReturnLine = '笼子慢点放——底下黑，慌什么。';
export const stoneSinkFadeMs = 2_000;
export const stoneSinkLampAfterglowMs = 10_000;

type Site = Readonly<{
  domainId: string;
  /** B-01 registered world ENY foot from the ZA-31 workface, never a review-only coordinate. */
  east: number; north: number; height: number; yaw: number;
}>;
type AcceptedReturn = Readonly<{
  playerId: string; domainId: string; tripId: number; arrivedAtMs: number;
}>;
type Frame = Readonly<{
  nowMs: number; viewerId: string; activeDomain: string;
  soulSightGranted: boolean; nightWindow: boolean; dreamActive: boolean;
  /** From the single lift movement authority, not the client or interpolated presence. */
  acceptedReturn?: AcceptedReturn;
}>;
type Host = Readonly<{
  parent: Object3D;
  site?: Site;
  /** World collision/scene owner verifies the spirit's unobstructed one-step-behind-winch station. */
  supportsStation(site: Site): boolean;
  /** Single authoritative receipt claim persisted per player/trip, including across a reconnect. */
  claimAcceptedReturnOnce(playerId: string, tripId: number): boolean;
  /** Only the viewer's soul-sound bus emits the one canon line; no dialogue tree. */
  speak(line: typeof stoneSinkReturnLine): void;
}>;

type Part = Readonly<{ position: readonly [number, number, number]; size: readonly [number, number, number]; color: string }>;
const parts: readonly Part[] = [
  { position: [-.105, .09, .03], size: [.17, .18, .29], color: '#302d2c' },
  { position: [.105, .09, .03], size: [.17, .18, .29], color: '#302d2c' },
  { position: [-.112, .46, 0], size: [.18, .72, .23], color: '#48443f' },
  { position: [.112, .46, 0], size: [.18, .72, .23], color: '#48443f' },
  { position: [0, .92, 0], size: [.51, .66, .30], color: '#5c5546' },
  { position: [0, 1.29, -.015], size: [.53, .16, .31], color: '#83755e' },
  { position: [-.31, 1.075, -.025], size: [.14, .50, .17], color: '#5c5546' },
  // The right hand rests toward the winch frame, not across the player's path.
  { position: [.32, 1.02, -.16], size: [.15, .51, .17], color: '#5c5546' },
  { position: [.35, .82, -.23], size: [.14, .13, .14], color: '#8b7762' },
  { position: [-.31, .81, -.025], size: [.13, .13, .14], color: '#8b7762' },
  { position: [0, 1.49, -.02], size: [.25, .27, .23], color: '#8b7762' },
  { position: [0, 1.67, -.025], size: [.32, .15, .28], color: '#494640' },
  { position: [0, 1.73, -.16], size: [.42, .07, .32], color: '#494640' },
  { position: [0, .92, -.158], size: [.24, .04, .025], color: '#b89d69' },
];

/**
 * G-03 Stone Sink: an uncollidable, viewer-only visual and story cue.
 * A owns the physical winch, lamp and station survey. B owns co-op winding;
 * this module never edits well authority, world lighting or lift travel.
 */
export function mountStoneSinkWinchSpirit(host: Host) {
  const site = host.site;
  if (!site) return { kind: 'unregistered' } as const;
  if (!site.domainId.trim() || site.domainId.trim() !== site.domainId ||
      ![site.east, site.north, site.height, site.yaw].every(Number.isFinite)) {
    return { kind: 'invalid-site' } as const;
  }
  if (host.supportsStation(site) !== true) return { kind: 'unsupported-site' } as const;
  const confirmedSite = site;

  const group = new Group();
  group.name = 'g03-stone-sink-winch-spirit';
  group.position.set(site.east, site.height, -site.north);
  group.rotation.y = site.yaw;
  group.visible = false;
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ vertexColors: false, transparent: true, opacity: .56,
    depthWrite: false, color: '#ffffff', emissive: '#363e43', emissiveIntensity: .26 });
  const mesh = new InstancedMesh(geometry, material, parts.length);
  mesh.name = 'g03-stone-sink-coat-and-hand';
  mesh.raycast = () => {}; // Never compete with winch E or block the shaft.
  const pose = new Object3D();
  const color = new Color();
  parts.forEach(({ position, size, color: tint }, index) => {
    pose.position.fromArray(position);
    pose.scale.fromArray(size);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    mesh.setColorAt(index, color.set(tint));
  });
  mesh.computeBoundingSphere();
  group.add(mesh);
  host.parent.add(group);

  let disposed = false;
  let lastFadeAt: number | undefined;
  let lastSpokenTrip: number | undefined;
  let lastAudience: string | undefined;

  function eligible(frame: Frame): boolean {
    return !!frame.viewerId && frame.activeDomain === confirmedSite.domainId &&
      frame.soulSightGranted === true && frame.nightWindow === true && frame.dreamActive === true &&
      Number.isFinite(frame.nowMs);
  }
  return {
    kind: 'ready',
    group,
    /** Render and story cues are gated by this viewer's authorized soul-sight context. */
    sync(frame: Frame) {
      if (disposed) return { visible: false, lampAfterglow: false, spoke: false } as const;
      const authorized = eligible(frame);
      if (!authorized) {
        group.visible = false;
        material.opacity = .56;
        return { visible: false, lampAfterglow: false, spoke: false } as const;
      }
      // A new viewer or an unrelated domain must not inherit someone else's fading encounter.
      if (lastAudience && frame.viewerId !== lastAudience) {
        lastFadeAt = undefined;
        lastSpokenTrip = undefined;
      }
      lastAudience = frame.viewerId;
      const receipt = frame.acceptedReturn;
      let spoke = false;
      if (receipt && receipt.playerId === frame.viewerId && receipt.domainId === site.domainId &&
          Number.isSafeInteger(receipt.tripId) && receipt.tripId > 0 &&
          Number.isFinite(receipt.arrivedAtMs) && frame.nowMs >= receipt.arrivedAtMs &&
          frame.nowMs - receipt.arrivedAtMs <= 3_000 && receipt.tripId !== lastSpokenTrip &&
          host.claimAcceptedReturnOnce(frame.viewerId, receipt.tripId) === true) {
        lastSpokenTrip = receipt.tripId;
        lastFadeAt = frame.nowMs;
        host.speak(stoneSinkReturnLine);
        spoke = true;
      }
      const elapsed = lastFadeAt === undefined ? undefined : Math.max(0, frame.nowMs - lastFadeAt);
      const fading = elapsed !== undefined && elapsed < stoneSinkFadeMs;
      const visible = elapsed === undefined || fading;
      group.visible = visible;
      material.opacity = elapsed === undefined ? .56 : Math.max(0, .56 * (1 - elapsed / stoneSinkFadeMs));
      group.rotation.y = site.yaw + (elapsed === undefined ? 0 : Math.min(1, elapsed / stoneSinkFadeMs) * .85);
      // The A-owned oil lamp receives this boolean; no duplicate light is created here.
      const lampAfterglow = elapsed !== undefined && elapsed >= stoneSinkFadeMs &&
        elapsed < stoneSinkFadeMs + stoneSinkLampAfterglowMs;
      return { visible, lampAfterglow, spoke };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.visible = false;
      group.removeFromParent();
      group.clear();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  } as const;
}
