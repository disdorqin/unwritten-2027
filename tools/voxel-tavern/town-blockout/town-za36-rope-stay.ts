import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion,
  Vector3,
} from 'three';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
type Spot = Readonly<{ east: number; north: number; height: number }>;

// The accepted winch and well sites stay untouched. This site is the
// hands-on rope stabilizer's stage anchor, not the server-side action.
export function surveyZa36RopeStay(road: Ground) {
  const winch = surveyZa31CraterWinch(road);
  if (!winch) return;
  const { east, north, yaw } = road.anchor;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const localEast = 7.2, localSouth = 1.65;
  const steadyE = east + localEast * c - localSouth * s;
  const steadyN = north - localSouth * c - localEast * s;
  const height = road.heightAt(steadyE, steadyN);
  if (height === undefined || !Number.isFinite(height)) return;
  const steady: Spot = { east: steadyE, north: steadyN, height };
  const stayRadius = .46;
  const clear = [
    { ...winch.plinth, radius: 1.3 },
    { ...winch.useFoot, radius: 1.35 },
    winch.snakeStoneReservation,
  ];
  if (clear.some(item => Math.hypot(steadyE - item.east, steadyN - item.north) <
    stayRadius + item.radius + .4)) return;
  const shaft = { east, north, height: road.heightAt(east, north) ?? height };
  if (Math.hypot(steadyE - shaft.east, steadyN - shaft.north) < 4.4) return;
  return {
    steady,
    radius: stayRadius,
    winchPoint: winch.plinth,
    shaft,
    reserved: clear,
    actionKey: 'hold-E' as const,
    intendedRate: { onePlayer: 1.0, twoPlayers: 1.8 } as const,
    pendingAuthority: true as const,
  };
}

export function mountZa36RopeStay(road: Ground) {
  const site = surveyZa36RopeStay(road);
  if (!site) return;
  const group = new Group();
  group.name = 'za36-winch-rope-stay';
  const timber = new MeshStandardMaterial({ color: 0x5d4630, roughness: 1 });
  const rust = new MeshStandardMaterial({ color: 0x8a4a34, roughness: 1 });
  const rope = new MeshStandardMaterial({ color: 0xa98a56, roughness: 1 });
  const iron = new MeshStandardMaterial({ color: 0x2c3648, roughness: 1 });

  function box(name: string, x: number, y: number, n: number, w: number, h: number, d: number,
    mat: MeshStandardMaterial) {
    const m = new Mesh(new BoxGeometry(w, h, d), mat);
    m.name = name;
    m.position.set(x, y, -n);
    group.add(m);
  }
  function strand(name: string, a: Spot, offsetA: number, b: Spot, offsetB: number,
    radius: number, mat: MeshStandardMaterial) {
    const start = new Vector3(a.east, a.height + offsetA, -a.north);
    const end = new Vector3(b.east, b.height + offsetB, -b.north);
    const direction = end.clone().sub(start);
    const line = new Mesh(new CylinderGeometry(radius, radius, direction.length(), 6), mat);
    line.name = name;
    line.position.copy(start.clone().add(end).multiplyScalar(.5));
    line.quaternion.copy(new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0), direction.clone().normalize()));
    group.add(line);
  }

  const { east, north, height } = site.steady;
  box('za36-stay-post', east, height + .83, north, .3, 1.66, .3, timber);
  box('za36-stay-base', east, height + .17, north, .69, .34, .64, rust);
  box('za36-stay-cleat', east, height + 1.45, north, .48, .12, .35, iron);
  for (const delta of [-.12, .12]) {
    box('za36-stay-winding-pin', east + delta, height + 1.18, north,
      .09, .33, .1, iron);
  }
  // The stabilizing rope has two independently posed spans. With nobody
  // holding E its middle droops; a B-window accepted "hold" response
  // straightens both segments without triggering an authority transition.
  const start = new Vector3(site.steady.east, site.steady.height + 1.3, -site.steady.north);
  const end = new Vector3(site.winchPoint.east, site.winchPoint.height + .75, -site.winchPoint.north);
  const spanGeometry = new CylinderGeometry(.056, .056, 1, 6);
  const firstSpan = new Mesh(spanGeometry, rope);
  const secondSpan = new Mesh(spanGeometry, rope);
  firstSpan.name = 'za36-stay-working-rope';
  secondSpan.name = 'za36-stay-working-rope-return';
  group.add(firstSpan, secondSpan);
  function fitSpan(mesh: Mesh, from: Vector3, to: Vector3) {
    const vector = to.clone().sub(from);
    mesh.position.copy(from.clone().add(to).multiplyScalar(.5));
    mesh.scale.set(1, vector.length(), 1);
    mesh.quaternion.copy(new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0), vector.normalize()));
  }
  function setTension(held: boolean) {
    const midpoint = start.clone().add(end).multiplyScalar(.5);
    if (!held) midpoint.y -= .27;
    fitSpan(firstSpan, start, midpoint);
    fitSpan(secondSpan, midpoint, end);
    group.userData.ropeTaut = held;
  }
  setTension(false);
  strand('za36-winch-to-shaft-rope', site.winchPoint, 1.0, site.shaft, .75, .042, rope);
  group.userData.steadyRopeAnchor = {
    ...site.steady, radius: site.radius, actionKey: site.actionKey,
    pendingAuthority: site.pendingAuthority,
  };
  group.userData.ropeRatesReference = site.intendedRate;
  return { group, site, setTension };
}
