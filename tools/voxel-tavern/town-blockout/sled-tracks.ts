import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, MeshBasicMaterial, type Scene } from 'three';

export const sledTrackCapacity = 400;
export const sledTrackLife = 20;
const verticesPerSlot = 12;
const spine = [-1, 1, -1, 1, 1, -1];
const ends = [0, 0, 1, 0, 1, 1];

export function createSledTracks(scene: Scene, ground: (x: number, n: number) => number) {
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(sledTrackCapacity * verticesPerSlot * 3), 3).setUsage(DynamicDrawUsage);
  const color = new BufferAttribute(new Float32Array(sledTrackCapacity * verticesPerSlot * 4), 4).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  mesh.name = 'town-sled-tracks';
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  const expiry = new Float64Array(sledTrackCapacity);
  const strength = new Float32Array(sledTrackCapacity);
  let now = 0, head = 0, used = 0, count = 0, nextFade = 0;
  let previous: { x: number; n: number } | undefined;

  function alpha(slot: number, opacity: number) {
    for (let i = 0; i < verticesPerSlot; i++) {
      color.setW(slot * verticesPerSlot + i, opacity);
    }
  }
  function mark(x: number, n: number, deepSnow: boolean) {
    if (!previous) { previous = { x, n }; return; }
    const east = x - previous.x, north = n - previous.n, distance = Math.hypot(east, north);
    if (distance < .42) return;
    const start = previous;
    previous = { x, n };
    if (distance > 2) return;
    const sideEast = north / distance, sideNorth = -east / distance;
    const slot = head++ % sledTrackCapacity;
    used = Math.min(sledTrackCapacity, used + 1);
    if (!expiry[slot]) count++;
    expiry[slot] = now + sledTrackLife;
    strength[slot] = deepSnow ? .52 : .30;
    const shade = deepSnow ? .29 : .43;
    for (const rail of [-1, 1]) for (let i = 0; i < 6; i++) {
      const offset = rail * .29 + spine[i] * (deepSnow ? .047 : .034);
      const px = start.x + east * ends[i] + sideEast * offset;
      const pn = start.n + north * ends[i] + sideNorth * offset;
      const vertex = slot * verticesPerSlot + (rail === -1 ? 0 : 6) + i;
      position.setXYZ(vertex, px, ground(px, pn) + .028, -pn);
      color.setXYZW(vertex, shade * .79, shade * .90, shade, strength[slot]);
    }
    geometry.setDrawRange(0, used * verticesPerSlot);
    position.needsUpdate = color.needsUpdate = true;
    mesh.visible = true;
  }

  function update(dt: number) {
    now += dt;
    if (!count || now < nextFade) return;
    nextFade = now + .05;
    let changed = false;
    for (let slot = 0; slot < used; slot++) {
      if (!expiry[slot]) continue;
      const remaining = expiry[slot] - now;
      if (remaining > 2) continue;
      alpha(slot, Math.max(0, remaining / 2) * strength[slot]);
      changed = true;
      if (remaining <= 0) { expiry[slot] = 0; count--; }
    }
    if (changed) color.needsUpdate = true;
    mesh.visible = count > 0;
  }

  return { mark, update, breakPath() { previous = undefined; }, get count() { return count; } };
}
