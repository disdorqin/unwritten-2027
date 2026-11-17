import {
  Color, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, OctahedronGeometry, Vector3, type Scene,
} from 'three';

export type SnowballState = { ammo: number; hits: number; combo: number };
export type SnowballContact = { at: Vector3; kind: 'world' | 'target'; targetId?: string };
type EventBase = { id: number; thrower: string; time: number; velocity: Vector3 };
export type SnowballEvent =
  | (EventBase & { type: 'throw'; origin: Vector3 })
  | (EventBase & SnowballContact & { type: 'impact'; combo: number });

type SnowballOptions = {
  scene: Scene;
  /** Return the nearest contact in this sweep. The input vectors are owned by the simulator. */
  sweep(from: Vector3, to: Vector3, radius: number): SnowballContact | undefined;
  onEvent?(event: SnowballEvent): void;
  onChange?(state: SnowballState): void;
  now?(): number;
};

const ammoLimit = 10;
const shotLimit = 12;
const sparkLimit = 72;
const snowballRadius = .115;
const tossSpeed = 19.5;
const gravity = 14;
const tick = 1 / 90;
const shotLifetime = 2.6;
const throwCooldown = .27;
const comboWindow = 5;

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

export function createTownSnowballFight({ scene, sweep, onEvent, onChange, now = Date.now }: SnowballOptions) {
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
  scene.add(shotMesh, sparkMesh);

  const shots = Array.from({ length: shotLimit }, () => ({
    id: 0, thrower: '', active: false, age: 0, at: new Vector3(), velocity: new Vector3(),
  }));
  const sparks = Array.from({ length: sparkLimit }, () => ({
    age: 0, lifetime: 0, size: 0, at: new Vector3(), velocity: new Vector3(),
  }));
  const destination = new Vector3();
  const pose = new Object3D();
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

  function gather() {
    if (disposed || ammo >= ammoLimit) return false;
    ammo++;
    onChange?.(getState());
    return true;
  }

  function throwBall(origin: Vector3, direction: Vector3, thrower = 'local') {
    if (disposed || ammo === 0 || simulationTime < nextThrow ||
      ![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite) ||
      direction.lengthSq() <= 1e-10) return false;
    const shot = shots.find(candidate => !candidate.active);
    if (!shot) return false;
    shot.active = true;
    shot.id = ++shotId;
    shot.thrower = thrower;
    shot.at.copy(origin);
    shot.age = 0;
    shot.velocity.copy(direction).normalize().multiplyScalar(tossSpeed);
    nextThrow = simulationTime + throwCooldown;
    ammo--;
    onChange?.(getState());
    onEvent?.({
      type: 'throw', id: shot.id, thrower, time: now(), origin: origin.clone(), velocity: shot.velocity.clone(),
    });
    return true;
  }

  function burst(at: Vector3, target: boolean, seed: number) {
    const count = target ? 12 : 7;
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
      shot.age += tick;
      destination.copy(shot.at).addScaledVector(shot.velocity, tick);
      destination.y -= .5 * gravity * tick * tick;
      const contact = sweep(shot.at, destination, snowballRadius);
      if (contact) {
        const hitTime = Math.min(tick, tick * shot.at.distanceTo(contact.at) / shot.at.distanceTo(destination));
        shot.velocity.y -= gravity * hitTime;
        shot.active = false;
        const target = contact.kind === 'target';
        burst(contact.at, target, shot.id);
        if (target) {
          hits++;
          combo++;
          tallyUntil = simulationTime + comboWindow;
          onChange?.(getState());
        } else clearCombo();
        onEvent?.({
          type: 'impact', id: shot.id, thrower: shot.thrower, time: now(),
          at: contact.at.clone(), velocity: shot.velocity.clone(),
          kind: contact.kind, targetId: contact.targetId, combo,
        });
      } else if (shot.age >= shotLifetime) {
        shot.active = false;
        clearCombo();
      } else {
        shot.at.copy(destination);
        shot.velocity.y -= gravity * tick;
      }
    }
    for (const spark of sparks) {
      if (spark.age >= spark.lifetime) continue;
      spark.age += tick;
      spark.at.addScaledVector(spark.velocity, tick);
      spark.velocity.y -= gravity * .55 * tick;
    }
  }

  function update(dt: number) {
    if (disposed || !(dt > 0) || !Number.isFinite(dt)) return;
    accumulator += Math.min(.1, dt);
    // Use substeps independent of the drawing rate, with a bounded catch-up cost.
    while (accumulator >= tick) {
      accumulator -= tick;
      simulate();
    }
    let visibleShots = 0;
    pose.scale.setScalar(1);
    for (const shot of shots) {
      if (!shot.active) continue;
      pose.position.copy(shot.at);
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
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of [shotMesh, sparkMesh]) {
      mesh.removeFromParent();
      mesh.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return { gather, throwBall, update, getState, dispose };
}
