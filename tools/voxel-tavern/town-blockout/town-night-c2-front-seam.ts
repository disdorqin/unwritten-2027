import { BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4, MeshLambertMaterial, NearestFilter, Object3D, RGBAFormat, StaticDrawUsage } from 'three';

/**
 * C32 seam apron: the front-ridge side of the airlock A relayed on 2026-11-28.
 *
 * Ownership as A stated it: C2 owns the production terrace/roadbed and is
 * responsible for the controllable opening at the existing N663.25 barrier,
 * plus real front-ridge support and collision from the actual cloud terrace to
 * N666.5, net width >= 2.5 m. D2 owns N666.5..669 with certifySeamCrossing /
 * enterRear / exitRear; A owns the N668 same-foot crossing and Presence. Both
 * sides must support the same foot at 347 m within 0.08 m before either side
 * lifts the barrier, and `domainReady` is never hard-set true.
 *
 * Measured on the live field: the 347 m plateau at this seam occupies
 * E300-354, N662-668. The apron therefore runs E327 at 2.8 m width from
 * N663.25 to N666.5, emitting the exact same-foot contact points D2 and A
 * must agree on. The gate bar blocks only while it is closed; opening it is a
 * host decision, not something this module grants.
 */

export type SeamHeightAt = (east: number, north: number) => number | undefined;

export const c2FrontSeamSpec = Object.freeze({
  east: 327,
  seamNorth: 663.25,
  gateNorth: 666,
  contactNorth: 666.5,
  halfWidth: 1.4,
  deckHeight: 347,
  supportTolerance: .08,
  step: .5,
  palette: ['#b8b2a2', '#d6d0bd', '#98948a', '#e5dfcc'] as const,
});

export type SeamPiece = Readonly<{
  family: 'apron' | 'post' | 'bar' | 'contact';
  east: number; north: number; y: number;
  w: number; h: number; d: number;
  yaw: number; shade: number;
}>;

export type SeamContact = Readonly<{ role: 'c2' | 'd2' | 'a'; east: number; north: number; height: number }>;

export type SeamPlan = Readonly<{
  pieces: readonly SeamPiece[];
  contacts: readonly SeamContact[];
  supported: boolean;
  maxDeviation: number;
  width: number;
  metres: number;
}>;

export function planC2FrontSeam(heightAt: SeamHeightAt): SeamPlan {
  const spec = c2FrontSeamSpec;
  const pieces: SeamPiece[] = [];
  let maxDeviation = 0, supported = true;
  const stations: { north: number; height: number }[] = [];
  for (let north = spec.seamNorth; north <= spec.contactNorth + 1e-9; north += spec.step) {
    const height = heightAt(spec.east, north);
    if (height === undefined || !Number.isFinite(height)) { supported = false; continue; }
    const deviation = Math.abs(height - spec.deckHeight);
    maxDeviation = Math.max(maxDeviation, deviation);
    if (deviation > spec.supportTolerance) supported = false;
    stations.push({ north, height });
    pieces.push({
      family: 'apron', east: spec.east, north, y: height,
      w: spec.halfWidth * 2, h: .16, d: spec.step + .05, yaw: 0,
      shade: Math.round(north * 2) % spec.palette.length,
    });
  }
  // The barrier sits where the existing solid rail already is.
  for (const side of [-1, 1]) {
    const east = spec.east + spec.halfWidth * side;
    const height = heightAt(east, spec.seamNorth) ?? spec.deckHeight;
    pieces.push({
      family: 'post', east, north: spec.seamNorth, y: height, w: .16, h: 1.1, d: .16, yaw: 0, shade: 0,
    });
  }
  pieces.push({
    family: 'bar', east: spec.east, north: spec.seamNorth, y: spec.deckHeight + .82,
    w: spec.halfWidth * 2, h: .12, d: .12, yaw: 0, shade: 2,
  });
  const contactHeight = heightAt(spec.east, spec.contactNorth) ?? spec.deckHeight;
  pieces.push({
    family: 'contact', east: spec.east, north: spec.contactNorth, y: contactHeight,
    w: spec.halfWidth * 2, h: .06, d: .5, yaw: 0, shade: 3,
  });
  const metres = spec.contactNorth - spec.seamNorth;
  return {
    pieces,
    // The three same-foot roles, on the c2 side of the seam. D2/A confirm
    // their own feet against these rather than re-surveying.
    contacts: [
      { role: 'c2', east: spec.east, north: spec.contactNorth, height: contactHeight },
      { role: 'd2', east: spec.east, north: spec.contactNorth, height: contactHeight },
      { role: 'a', east: spec.east, north: spec.contactNorth, height: contactHeight },
    ],
    supported,
    maxDeviation,
    width: spec.halfWidth * 2,
    metres,
  };
}

function paletteTexture() {
  const data = new Uint8Array(c2FrontSeamSpec.palette.length * 16);
  for (let i = 0; i < c2FrontSeamSpec.palette.length; i++) {
    const color = new Color(c2FrontSeamSpec.palette[i]!);
    for (let texel = 0; texel < 16; texel++) {
      const offset = i * 16 + texel * 4;
      data[offset] = Math.round(color.r * 255);
      data[offset + 1] = Math.round(color.g * 255);
      data[offset + 2] = Math.round(color.b * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, 4, c2FrontSeamSpec.palette.length, RGBAFormat);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mountC2FrontSeam(heightAt: SeamHeightAt) {
  const plan = planC2FrontSeam(heightAt);
  const group = new Group();
  group.name = 'town-night-c2-front-seam';
  const texture = paletteTexture();
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial({ color: '#ffffff', map: texture });
  const bar = plan.pieces.find(piece => piece.family === 'bar')!;
  const posts = plan.pieces.filter(piece => piece.family === 'post');
  // The bar and posts are the only solid parts, and the bar is removable.
  const mesh = new InstancedMesh(geometry, material, Math.max(1, plan.pieces.length));
  mesh.instanceMatrix.setUsage(StaticDrawUsage);
  mesh.name = 'c2-front-seam-boxes';
  const transform = new Object3D();
  const tint = new Color();
  let index = 0, closed = true;
  const write = () => {
    index = 0;
    for (const piece of plan.pieces) {
      if (piece.family === 'bar' && !closed) continue;
      transform.position.set(piece.east, piece.y + piece.h / 2, -piece.north);
      transform.rotation.set(0, piece.yaw, 0);
      transform.scale.set(piece.w, piece.h, piece.d);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, tint.set(c2FrontSeamSpec.palette[piece.shade % c2FrontSeamSpec.palette.length]!));
      index++;
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  write();
  group.add(mesh);

  const solids = () => closed ? [...posts, bar] : posts;
  function blocked(east: number, north: number, feet: number, radius = .27, body = 1.8) {
    for (const piece of solids()) {
      const dx = Math.max(Math.abs(east - piece.east) - piece.w / 2, 0);
      const dn = Math.max(Math.abs(north - piece.north) - piece.d / 2, 0);
      if (Math.hypot(dx, dn) < radius && feet + body > piece.y && feet < piece.y + piece.h) return true;
    }
    return false;
  }
  function open() { if (closed) { closed = false; write(); } }
  function close() { if (!closed) { closed = true; write(); } }
  function dispose() {
    group.removeFromParent();
    mesh.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
  }
  return {
    group, mesh, plan, open, close, closed: () => closed, blocked, dispose,
    stats: () => ({
      pieces: mesh.count,
      metres: plan.metres,
      width: plan.width,
      supported: plan.supported,
      maxDeviation: plan.maxDeviation,
      closed: closed,
      batches: 1,
      lights: 0,
    }),
  };
}
