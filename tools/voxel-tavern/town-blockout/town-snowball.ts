import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, IcosahedronGeometry,
  InstancedMesh, Line, LineBasicMaterial, LineDashedMaterial, LineSegments, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, OctahedronGeometry, Vector3, type Scene,
} from 'three';

export type SnowballState = { ammo: number; hits: number; combo: number };
export type SnowballHitZone = 'head' | 'torso';
export type SnowballContact = {
  at: Vector3;
  kind: 'world' | 'target';
  targetId?: string;
  score?: boolean;
  zone?: SnowballHitZone;
};
type ShotBy = 'player' | 'npc';
type EventBase = {
  id: number; thrower: string; time: number; velocity: Vector3; shotBy: ShotBy; scoreable: boolean;
};
export type SnowballEvent =
  | (EventBase & { type: 'throw'; from: string; origin: Vector3; dir: Vector3; power: number; t: number })
  | (EventBase & SnowballContact & {
    type: 'impact'; combo: number; by: string; target?: string; streak: number; scored: boolean;
  })
  | (EventBase & { type: 'miss'; by: string; at: Vector3 });

type SnowballOptions = {
  scene: Scene;
  /** Return the nearest contact in this sweep. The input vectors are owned by the simulator. */
  sweep(from: Vector3, to: Vector3, radius: number, thrower: string): SnowballContact | undefined;
  canScoreAtLaunch?(origin: Vector3, thrower: string): boolean;
  onEvent?(event: SnowballEvent): void;
  onChange?(state: SnowballState): void;
  now?(): number;
};

const ammoLimit = 10;
const shotLimit = 64;
const sparkLimit = 72;
const aimSamples = 32;
const landingTint = '#d3eaff';
const targetTint = '#ffce89';
const snowballRadius = .115;
const tick = 1 / 60;
const shotLifetime = 2.6;
const throwCooldown = .25;
const comboWindow = 5;
const defaultPower = (19.5 - 12) / 14;
export const snowballGravity = 12;
export const snowballRange = 35;

const clampPower = (power: number) => Math.max(0, Math.min(1, power));
export const snowballSpeed = (power: number) => 12 + 14 * clampPower(power);

export function snowballSegmentBox(
  from: Vector3, to: Vector3, min: readonly number[], max: readonly number[], radius: number,
): number | undefined {
  let entry = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = from.getComponent(axis);
    const delta = to.getComponent(axis) - start;
    const lower = min[axis] - radius;
    const upper = max[axis] + radius;
    if (Math.abs(delta) < 1e-9) {
      if (start < lower || start > upper) return undefined;
      continue;
    }
    const a = (lower - start) / delta;
    const b = (upper - start) / delta;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return undefined;
  }
  return entry;
}

function validAim(origin: Vector3, direction: Vector3, power: number) {
  return Number.isFinite(power) && Number.isFinite(origin.x) && Number.isFinite(origin.y) &&
    Number.isFinite(origin.z) && Number.isFinite(direction.x) && Number.isFinite(direction.y) &&
    Number.isFinite(direction.z) && direction.lengthSq() > 1e-10;
}

function flightTime(velocity: Vector3) {
  const horizontal = Math.hypot(velocity.x, velocity.z);
  // Antiderivative of speed along a ballistic arc (vertical velocity is linear in time).
  const integral = (vertical: number) => horizontal < 1e-6 ? .5 * vertical * Math.abs(vertical) :
    .5 * (vertical * Math.hypot(horizontal, vertical) +
      horizontal * horizontal * Math.asinh(vertical / horizontal));
  const initial = integral(velocity.y);
  const withinRange = (time: number) =>
    initial - integral(velocity.y - snowballGravity * time) <= snowballRange * snowballGravity;
  if (withinRange(shotLifetime)) return shotLifetime;
  let lower = 0;
  let upper = shotLifetime;
  for (let i = 0; i < 14; i++) {
    const mid = (lower + upper) / 2;
    if (withinRange(mid)) lower = mid;
    else upper = mid;
  }
  return lower;
}

function ballisticPosition(result: Vector3, origin: Vector3, velocity: Vector3, seconds: number) {
  result.copy(origin).addScaledVector(velocity, seconds);
  result.y -= .5 * snowballGravity * seconds * seconds;
}

function createAimMarker() {
  const vertices: number[] = [];
  const ringSegments = 24;
  const ringRadius = .42;
  for (let i = 0; i < ringSegments; i++) {
    const start = i * Math.PI * 2 / ringSegments;
    const end = (i + 1) * Math.PI * 2 / ringSegments;
    vertices.push(Math.cos(start) * ringRadius, .025, Math.sin(start) * ringRadius,
      Math.cos(end) * ringRadius, .025, Math.sin(end) * ringRadius);
  }
  // The horizontal ring and above-ground six-armed flake share one line batch.
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const height = .28;
    const radius = .19;
    vertices.push(0, height, 0, x * radius, height + y * radius, 0);
    for (const side of [-1, 1]) {
      const stem = angle + side * 2.30;
      vertices.push(x * radius * .62, height + y * radius * .62, 0,
        x * radius * .62 + Math.cos(stem) * .075, height + y * radius * .62 + Math.sin(stem) * .075, 0);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const marker = new LineSegments(geometry, new LineBasicMaterial({
    color: landingTint, transparent: true, opacity: .95, depthWrite: false,
  }));
  marker.name = 'Town snowball aim marker';
  marker.visible = false;
  return marker;
}

export function createTownSnowballFight({
  scene, sweep, canScoreAtLaunch, onEvent, onChange, now = Date.now,
}: SnowballOptions) {
  const shotMesh = new InstancedMesh(new IcosahedronGeometry(snowballRadius, 0),
    new MeshLambertMaterial({ color: '#eef8ff', emissive: '#394755' }), shotLimit);
  const sparkMesh = new InstancedMesh(new OctahedronGeometry(1, 0),
    new MeshBasicMaterial(), sparkLimit);
  for (const mesh of [shotMesh, sparkMesh]) {
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }
  shotMesh.name = 'Town snowball projectiles';
  sparkMesh.name = 'Town snowball impacts';
  const tints = [new Color('#e8f6ff'), new Color('#bdddf3'), new Color('#fff3cf')];
  for (let i = 0; i < sparkLimit; i++) sparkMesh.setColorAt(i, tints[i % tints.length]);
  const aimGeometry = new BufferGeometry();
  const aimPositions = new BufferAttribute(new Float32Array(aimSamples * 3), 3).setUsage(DynamicDrawUsage);
  const aimDistances = new BufferAttribute(new Float32Array(aimSamples), 1).setUsage(DynamicDrawUsage);
  aimGeometry.setAttribute('position', aimPositions);
  aimGeometry.setAttribute('lineDistance', aimDistances);
  const aim = new Line(aimGeometry, new LineDashedMaterial({
    color: landingTint, dashSize: .18, gapSize: .18, transparent: true, opacity: .78, depthWrite: false,
  }));
  aim.name = 'Town snowball aim';
  aim.visible = false;
  aim.frustumCulled = false;
  const aimMarker = createAimMarker();
  scene.add(shotMesh, sparkMesh, aim, aimMarker);

  const shots = Array.from({ length: shotLimit }, () => ({
    id: 0, thrower: '', shotBy: 'player' as ShotBy, active: false, age: 0, duration: 0, scoreable: false,
    at: new Vector3(), previous: new Vector3(), velocity: new Vector3(),
  }));
  const sparks = Array.from({ length: sparkLimit }, () => ({
    age: 0, lifetime: 0, size: 0, at: new Vector3(), velocity: new Vector3(),
  }));
  const destination = new Vector3();
  const previewVelocity = new Vector3();
  const previewFrom = new Vector3();
  const previewTo = new Vector3();
  const previewLanding = new Vector3();
  const pose = new Object3D();
  const compactEffects = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  let sparkCursor = 0;
  let shotId = 0;
  let ammo = 0;
  let hits = 0;
  let combo = 0;
  let simulationTime = 0;
  let tallyUntil = 0;
  let nextThrow = 0;
  let accumulator = 0;
  let disposed = false;

  function getState(): SnowballState { return { ammo, hits, combo }; }

  function gather(amount = 1) {
    if (disposed || ammo >= ammoLimit || !Number.isFinite(amount) || amount < 1) return false;
    ammo = Math.min(ammoLimit, ammo + Math.floor(amount));
    onChange?.(getState());
    return true;
  }

  function launch(origin: Vector3, direction: Vector3, thrower: string, power: number, shotBy: ShotBy) {
    if (disposed || !thrower || !validAim(origin, direction, power)) return false;
    if (shotBy === 'player' && (ammo === 0 || simulationTime + 1e-9 < nextThrow)) return false;
    let shot = shots[0];
    for (const candidate of shots) {
      if (!candidate.active) {
        shot = candidate;
        break;
      }
      if (candidate.id < shot.id) shot = candidate;
    }
    const strength = clampPower(power);
    shot.active = true;
    shot.id = ++shotId;
    shot.thrower = thrower;
    shot.shotBy = shotBy;
    shot.scoreable = canScoreAtLaunch?.(origin, thrower) !== false;
    shot.at.copy(origin);
    shot.previous.copy(origin);
    shot.age = 0;
    shot.velocity.copy(direction).normalize().multiplyScalar(snowballSpeed(strength));
    shot.duration = flightTime(shot.velocity);
    if (shotBy === 'player') {
      nextThrow = simulationTime + throwCooldown;
      ammo--;
      onChange?.(getState());
    }
    if (onEvent) {
      const time = now();
      onEvent({
        type: 'throw', id: shot.id, thrower, from: thrower, shotBy, time, t: time,
        origin: origin.clone(), dir: direction.clone().normalize(), power: strength,
        velocity: shot.velocity.clone(), scoreable: shot.scoreable,
      });
    }
    return true;
  }

  function throwBall(origin: Vector3, direction: Vector3, thrower = 'local', power = defaultPower) {
    hideAim();
    return launch(origin, direction, thrower, power, 'player');
  }

  function throwNpc(origin: Vector3, direction: Vector3, thrower: string, power = defaultPower) {
    return launch(origin, direction, thrower, power, 'npc');
  }

  function showAim(origin: Vector3, direction: Vector3, power: number, thrower = 'local') {
    if (disposed || !validAim(origin, direction, power)) {
      hideAim();
      return;
    }
    previewVelocity.copy(direction).normalize().multiplyScalar(snowballSpeed(power));
    const horizon = flightTime(previewVelocity);
    previewFrom.copy(origin);
    let arrival = 0;
    let target = false;
    // Inspect the same short sweep intervals as the released projectile, then
    // sample the visible arc evenly so a close obstacle still has a smooth guide.
    for (let segment = 1; arrival < horizon; segment++) {
      const time = Math.min(segment * tick, horizon);
      ballisticPosition(previewTo, origin, previewVelocity, time);
      const hit = sweep(previewFrom, previewTo, snowballRadius, thrower);
      if (hit) {
        const stepLength = previewFrom.distanceTo(previewTo);
        const fraction = stepLength > 0 ? Math.min(1, previewFrom.distanceTo(hit.at) / stepLength) : 0;
        arrival += fraction * (time - arrival);
        previewLanding.copy(hit.at);
        target = hit.kind === 'target';
        break;
      }
      arrival = time;
      previewFrom.copy(previewTo);
      previewLanding.copy(previewTo);
    }
    previewFrom.copy(origin);
    aimPositions.setXYZ(0, origin.x, origin.y, origin.z);
    aimDistances.setX(0, 0);
    let length = 0;
    for (let i = 1; i < aimSamples; i++) {
      if (i === aimSamples - 1) previewTo.copy(previewLanding);
      else ballisticPosition(previewTo, origin, previewVelocity, arrival * i / (aimSamples - 1));
      length += previewFrom.distanceTo(previewTo);
      aimPositions.setXYZ(i, previewTo.x, previewTo.y, previewTo.z);
      aimDistances.setX(i, length);
      previewFrom.copy(previewTo);
    }
    aimGeometry.setDrawRange(0, aimSamples);
    aimPositions.needsUpdate = true;
    aimDistances.needsUpdate = true;
    aim.visible = length > .01;
    aimMarker.position.copy(previewLanding);
    aimMarker.rotation.y = Math.atan2(direction.x, direction.z);
    aimMarker.material.color.set(target ? targetTint : landingTint);
    aimMarker.visible = true;
  }

  function hideAim() {
    aim.visible = false;
    aimMarker.visible = false;
  }

  function burst(at: Vector3, target: boolean, seed: number) {
    const count = compactEffects ? (target ? 7 : 4) : (target ? 12 : 7);
    for (let i = 0; i < count; i++) {
      const spark = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % sparks.length;
      const angle = seed * 1.37 + i * 2.4;
      const speed = 1.35 + (i % 4) * .58;
      spark.age = 0;
      spark.lifetime = .28 + (i % 3) * .075;
      spark.size = .041 + (i % 4) * .012;
      spark.at.copy(at);
      spark.velocity.set(Math.cos(angle) * speed, .7 + (i % 5) * .5, Math.sin(angle) * speed);
    }
  }

  function clearCombo() {
    if (combo === 0) return;
    combo = 0;
    onChange?.(getState());
  }

  function simulate() {
    simulationTime += tick;
    if (combo && simulationTime > tallyUntil) clearCombo();
    for (const shot of shots) {
      if (!shot.active) continue;
      const step = Math.min(tick, shot.duration - shot.age);
      shot.age += step;
      shot.previous.copy(shot.at);
      ballisticPosition(destination, shot.at, shot.velocity, step);
      const contact = sweep(shot.at, destination, snowballRadius, shot.thrower);
      if (contact) {
        const travel = shot.at.distanceTo(destination);
        const hitTime = travel > 0 ? step * Math.min(1, shot.at.distanceTo(contact.at) / travel) : 0;
        shot.velocity.y -= snowballGravity * hitTime;
        shot.active = false;
        const target = contact.kind === 'target';
        const scoreable = shot.scoreable && contact.score !== false;
        const scored = scoreable && target;
        burst(contact.at, target, shot.id);
        if (scored && shot.shotBy === 'player') {
          hits++;
          combo++;
          tallyUntil = simulationTime + comboWindow;
          onChange?.(getState());
        } else if (scoreable && (shot.shotBy === 'player' ||
          (scored && (contact.targetId === 'local' || contact.targetId === 'local-player')))) {
          clearCombo();
        }
        onEvent?.({
          ...contact, type: 'impact', id: shot.id, thrower: shot.thrower, time: now(),
          at: contact.at.clone(), velocity: shot.velocity.clone(), shotBy: shot.shotBy,
          combo, by: shot.thrower, target: contact.targetId,
          streak: shot.shotBy === 'player' ? combo : 0, scored, scoreable,
        });
        continue;
      }
      shot.at.copy(destination);
      shot.velocity.y -= snowballGravity * step;
      if (shot.age < shot.duration - 1e-9) continue;
      shot.active = false;
      if (shot.scoreable && shot.shotBy === 'player') clearCombo();
      onEvent?.({
        type: 'miss', id: shot.id, thrower: shot.thrower, by: shot.thrower, time: now(),
        at: shot.at.clone(), velocity: shot.velocity.clone(), shotBy: shot.shotBy, scoreable: shot.scoreable,
      });
    }
    for (const spark of sparks) {
      if (spark.age >= spark.lifetime) continue;
      spark.age += tick;
      spark.at.addScaledVector(spark.velocity, tick);
      spark.velocity.y -= snowballGravity * .55 * tick;
    }
  }

  function update(dt: number) {
    if (disposed || !(dt > 0) || !Number.isFinite(dt)) return 0;
    const start = performance.now();
    accumulator = Math.min(accumulator + dt, tick * 2);
    let steps = 0;
    while (steps < 2 && accumulator + 1e-9 >= tick) {
      accumulator = Math.max(0, accumulator - tick);
      simulate();
      steps++;
    }
    const physicsMs = performance.now() - start;
    const interpolation = accumulator / tick;
    let visibleShots = 0;
    pose.scale.setScalar(1);
    for (const shot of shots) {
      if (!shot.active) continue;
      pose.position.lerpVectors(shot.previous, shot.at, interpolation);
      pose.updateMatrix();
      shotMesh.setMatrixAt(visibleShots++, pose.matrix);
    }
    shotMesh.count = visibleShots;
    shotMesh.visible = visibleShots > 0;
    if (shotMesh.visible) shotMesh.instanceMatrix.needsUpdate = true;

    let visibleSparks = 0;
    for (const spark of sparks) {
      if (spark.age >= spark.lifetime) continue;
      pose.position.copy(spark.at);
      pose.scale.setScalar(spark.size * (1 - .85 * spark.age / spark.lifetime));
      pose.updateMatrix();
      sparkMesh.setMatrixAt(visibleSparks++, pose.matrix);
    }
    sparkMesh.count = visibleSparks;
    sparkMesh.visible = visibleSparks > 0;
    if (sparkMesh.visible) sparkMesh.instanceMatrix.needsUpdate = true;
    return physicsMs;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of [shotMesh, sparkMesh, aim, aimMarker]) {
      mesh.removeFromParent();
      if (mesh instanceof InstancedMesh) mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return { gather, throwBall, throwNpc, showAim, hideAim, update, getState, dispose };
}
