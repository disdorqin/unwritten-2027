import assert from 'node:assert/strict';

const entry = 'overview.onclick = () => mode(false);';
const movement = 'function tryMove(nextX: number, nextN: number) {';
const activation = 'const verifiedMarketHomeIds = new Set<string>();';
const guard = `import.meta.env.MODE === 'town-rehearsal' && location.hostname === '127.0.0.1' &&
  new URLSearchParams(location.search).has('jx1ProductionProof')`;

const probe = `
let jx1Frame = 0;
let jx1LastFrame: Record<string, number> | undefined;
let jx1Segment: Record<string, unknown>[] | undefined;
function jx1Pose() { return { east: x, north: n, ground, yaw, air: airHeight ?? null }; }
function jx1Supports() {
  const geometry = geometryAt(x, n);
  const matches = { surface: surfaceAt(x, n), rawTerrain: grid.heightAt(x, n),
    floors: [] as Box[], ramps: [] as Box[], solids: [] as Box[] };
  for (const floor of geometry.floors) {
    if (Math.abs(floor.max[1] - ground) <= .001 && overlapsBody(x, n, floor)) matches.floors.push(floor);
  }
  for (const ramp of geometry.ramps) {
    const z = -n;
    if (x < ramp.min[0] || x > ramp.max[0] || z < ramp.min[2] || z > ramp.max[2]) continue;
    const axis = ramp.axis === 'x' ? 0 : 2;
    const unit = ((axis === 0 ? x : z) - ramp.min[axis]) / (ramp.max[axis] - ramp.min[axis]);
    const y = ramp.min[1] + (ramp.max[1] - ramp.min[1]) * (ramp.ascending > 0 ? unit : 1 - unit);
    if (Math.abs(y - ground) <= .001) matches.ramps.push(ramp);
  }
  for (const solid of geometry.colliders) {
    if (Math.abs(solid.max[1] - ground) <= .001 && overlapsBody(x, n, solid)) matches.solids.push(solid);
  }
  return matches;
}
function tryMove(nextX: number, nextN: number) {
  if (!jx1Segment) return jx1ProductionTryMove(nextX, nextN);
  const before = jx1Pose();
  const accepted = jx1ProductionTryMove(nextX, nextN);
  const after = jx1Pose();
  jx1Segment.push({ frame: jx1Frame, before, after, nextX, nextN, accepted,
    ...(accepted && after.air === null ? { support: jx1Supports() } : {}) });
  return accepted;
}
if (${guard}) {
  let staged = false;
  const marketHomes = () => (districts as typeof districts & {
    marketHomes?: Map<string, { approach: { east: number, north: number, ground: number } }>;
  }).marketHomes;
  renderer.domElement.addEventListener('town-frame-profile', event => {
    jx1Frame++;
    jx1LastFrame = (event as CustomEvent).detail;
  });
  const events: Record<string, unknown>[] = [];
  for (const type of ['keydown', 'pointerdown', 'click', 'touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(type, event => {
      const target = event.target instanceof Element ?
        event.target.closest('#world-action, #touch-walk, [data-market-home-action]') : undefined;
      const code = event instanceof KeyboardEvent ? event.code : undefined;
      if (target || code) events.push({ type, code, trusted: event.isTrusted,
        id: target?.id, action: (target as HTMLElement | undefined)?.dataset?.marketHomeAction,
        pointer: event instanceof PointerEvent ? event.pointerType : undefined });
    }, true);
  }
  Object.defineProperty(window, '__jx1ProductionProof', { value: {
    registry: async () => {
      await prepareExtensionStreets();
      return { doors: [...homeDoors.values()].map(door => ({ ...door, spots: activitySpots
        .filter(spot => Math.abs(spot.x - door.x) < 1e-9 && Math.abs(spot.n - door.n) < 1e-9 &&
          Math.abs(spot.ground - door.ground) < 1e-9)
        .map(({ label, range }) => ({ label, range })) })),
        active: [...(marketHomes()?.keys() ?? [])], approaches: [...(marketHomes()?.entries() ?? [])]
          .map(([id, home]) => ({ id, ...home.approach })) };
    },
    stage: (target: string | { east: number, north: number, ground?: number }) => {
      if (staged || !walking || houseDoorTravel || homeReturn || placeCard.open) throw new Error('Initial placement unavailable');
      staged = true;
      const door = typeof target === 'string' ? homeDoors.get(target) : undefined;
      const point = typeof target === 'string' ? door && { east: door.x, north: door.n, ground: door.ground } : target;
      if (!point) throw new Error('Invalid initial placement');
      const feet = dryTownLandingHeight(point.east, point.north, point.ground);
      if (feet === undefined || !settleTownLanding(point.east, point.north, point.ground)) throw new Error('Initial point is blocked');
      if (Math.hypot(x - point.east, n - point.north) > .001) throw new Error('Initial point required fallback');
      if (door) yaw = door.exitYaw + Math.PI;
      renderer.domElement.focus({ preventScroll: true });
      return jx1Pose();
    },
    aim: ({ east, north }: { east: number, north: number }) => {
      if (!moveAllowed()) throw new Error('Cannot aim while movement is unavailable');
      turnView(Math.atan2(east - x, north - n) - yaw, -pitch);
    },
    startSegment: () => { if (jx1Segment) throw new Error('Movement already monitored'); jx1Segment = []; },
    endSegment: () => { const frames = jx1Segment; jx1Segment = undefined; return frames; },
    events: () => events.slice(),
    sample: () => ({ ...jx1Pose(), frames: jx1Frame, lastFrame: jx1LastFrame,
      segmentRejected: Boolean(jx1Segment?.some(move => move.accepted === false)),
      mask: camera.layers.mask, home: homeReturn?.id ?? null, walking, travelling: houseDoorTravel,
      canMove: moveAllowed(), canvasFocused: document.activeElement === renderer.domElement,
      action: actionButton.hidden ? '' : actionButton.textContent,
      menuId: document.querySelector<HTMLElement>('#market-home-entrance')?.dataset.doorId ?? null,
      dialogOpen: placeCard.open,
      visits: (JSON.parse(localStorage.getItem('unwritten.houses.doors.v1') ?? '{}') as { items?: string[] }).items ?? [] }),
  } });
}
`;

function instrument(code, ids) {
  assert.equal(code.split(entry).length, 2, 'Ambiguous viewer probe anchor');
  assert.equal(code.split(movement).length, 2, 'Ambiguous viewer tryMove header');
  let source = code.replace(movement, 'function jx1ProductionTryMove(nextX: number, nextN: number) {')
    .replace(entry, entry + probe);
  if (ids.length) {
    assert.equal(source.split(activation).length, 2, 'Expected fail-closed market home activation anchor exactly once');
    source = source.replace(activation, `const verifiedMarketHomeIds = new Set<string>(
      (${guard}) ? ${JSON.stringify(ids)} : []);`);
  }
  return source;
}

export { instrument };
