import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, NearestFilter, type MeshStandardMaterial } from 'three';
import {
  CRYSTAL_CAVERN_CANT_RAD,
  crystalCavernArchitecture,
  crystalCavernPlan,
  crystalCavernTrailEast,
  crystalCavernTrailHeight,
  crystalCavernToWorld,
  mountUndergroundCrystalCavern,
} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';

const frame = {
  domainId: 'review-only/crystal-cavern', east: -260, north: 86,
  height: -140, yaw: .37,
};
function fixture() {
  const parent = new Group();
  let acceptance = true, footing = true, collision = true, budget = 3;
  const seen: string[] = [];
  const host: Parameters<typeof mountUndergroundCrystalCavern>[0] = {
    parent, frame,
    acceptsCavern: () => acceptance,
    supportsFoot: p => {
      assert.ok([p.east, p.north, p.height].every(Number.isFinite));
      return footing;
    },
    acceptsCollider: b => {
      seen.push(b.name);
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Number.isFinite(b.min[axis]));
        assert.ok(Number.isFinite(b.max[axis]));
        assert.ok(b.min[axis] < b.max[axis]);
      }
      return collision;
    },
    readLightBudget: () => budget,
  };
  return {
    parent, host, seen,
    setAcceptance(v: boolean) { acceptance = v; },
    setFooting(v: boolean) { footing = v; },
    setCollision(v: boolean) { collision = v; },
    setBudget(v: number) { budget = v; },
  };
}

test('U-3 R1 models the entire 180×120m layer, 97m path, vault, clusters, river and artificial quay', () => {
  const { pieces, numbers } = crystalCavernArchitecture;
  assert.deepEqual([crystalCavernPlan.width, crystalCavernPlan.length], [180, 120]);
  assert.equal(crystalCavernPlan.minimumVaultHeight, 20);
  assert.deepEqual(crystalCavernPlan.entry, { east: 0, north: 1, height: -.064 });
  assert.deepEqual(crystalCavernPlan.exit, { east: 8.7, north: 98, height: -2.960 });
  assert.ok(numbers.cuboids >= 6500, 'complete cavern floor, roof and crystal clumps, not floating props');
  assert.equal(numbers.riverCells, 289);
  assert.ok(numbers.trailBlocks >= 775);
  assert.ok(numbers.quayBlocks > 150);
  assert.ok(numbers.structuralColliders > 150 && numbers.structuralColliders < 230);
  assert.equal(numbers.clusters, 62);
  const vault = pieces.filter(p => p.name.startsWith('u3/vault/'));
  assert.ok(vault.length > 1450);
  assert.equal(vault.filter(p => p.name.includes('/crown-')).length, 25);
  assert.equal(pieces.filter(p => p.name.includes('/river/cell-')).length, 289);
  assert.equal(pieces.filter(p => p.name.includes('/quay/dry-masonry-')).length, 110);
  assert.ok(pieces.filter(p => p.name.startsWith('u3/crystals/')).length > 400);
  const materials = new Set(pieces.map(p => p.family));
  assert.deepEqual([...materials].sort(),
    ['crystal','moonstone','moss','rock','rust','shadow','slate','water'].sort());
});

test('U-3 R2 all crystalline growth is tilted exactly +20° and grouped, 6 cold fixtures have physical crystals', () => {
  const pieces = crystalCavernArchitecture.pieces;
  const crystalSpikes = pieces.filter(p => p.name.includes('/spike-'));
  assert.ok(crystalSpikes.length > 120);
  assert.ok(crystalSpikes.every(p => p.rotationZ === CRYSTAL_CAVERN_CANT_RAD));
  assert.equal(Math.round(CRYSTAL_CAVERN_CANT_RAD * 180 / Math.PI), 20);
  const families = new Set(crystalSpikes.map(p => p.name.split('/')[2]));
  assert.ok(families.size >= 48);
  assert.ok(pieces.filter(p => p.name.startsWith('u3/light/attached-')).length === 42);
  assert.ok(pieces.some(p => p.name.includes('/frozen-metal-')));
  assert.ok(!pieces.some(p => /placeholder|lorem|loot-grant|lore-text|spawn-monster/.test(p.name)));
});

test('U-3 R2/R5 complete faceted ceiling, side strata and both river banks without path colliders', () => {
  const pieces=crystalCavernArchitecture.pieces;
  const family=(prefix:string)=>pieces.filter(p=>p.name.startsWith(prefix));
  const teeth=family('u3/vault/hanging-shale-');
  assert.equal(teeth.filter(p=>p.name.includes('-tier-')).length,576,
    '24 roof bays × 2 sides × 3 geological ridges × 4 taper tiers');
  assert.equal(teeth.filter(p=>p.name.includes('-fracture-')).length,288);
  assert.equal(family('u3/vault/wall-strata-').length,192,
    'rock bedding must cover both walls along the full cave length');
  assert.equal(family('u3/river/shore-course-').length,102);
  assert.equal(family('u3/river/shore-cap-').length,48);
  assert.ok(teeth.every(p=>!p.solid), 'overhead geological ornament is not a fake route obstruction');
  assert.ok(family('u3/river/shore-').every(p=>!p.solid));
  assert.equal(crystalCavernArchitecture.numbers.cuboids,9046);
  assert.ok(teeth.filter(p=>p.name.includes('-tier-')).every(p=>p.center[1]-p.size[1]/2>=20.4),
    'ceiling teeth must not invade the 20m traversable envelope');
});

test('U-3 R2 hall has exactly three eight-metre faceted monoliths and a visual moonstone spur', () => {
  const pieces=crystalCavernArchitecture.pieces;
  const named=(prefix:string)=>pieces.filter(p=>p.name.startsWith(prefix));
  assert.equal(named('u3/hall/monolith-').length,420);
  assert.equal(named('u3/hall/monolith-').filter(p=>p.name.includes('/spine-')).length,60);
  assert.equal(named('u3/hall/monolith-').filter(p=>p.name.includes('/facet-')).length,240);
  assert.equal(named('u3/hall/monolith-').filter(p=>p.name.includes('/root-')).length,120);
  for(let index=0;index<3;index++){
    const spine=named('u3/hall/monolith-'+index+'/spine-');
    assert.equal(spine.length,20);
    assert.ok(Math.max(...spine.map(p=>p.center[1]))-Math.min(...spine.map(p=>p.center[1]))>6.9);
    assert.ok(spine.every(p=>p.rotationZ===CRYSTAL_CAVERN_CANT_RAD));
  }
  assert.equal(named('u3/moonstone-spur/floor-').length,125);
  assert.equal(named('u3/moonstone-spur/bank-').length,150);
  assert.equal(named('u3/moonstone-spur/cap-').length,25);
  assert.equal(named('u3/moonstone-spur/natural-mirror-').length,90);
  assert.equal(named('u3/moonstone-spur/mirror-jamb-').length,18);
  assert.equal(named('u3/moonstone-spur/mirror-crown-').length,10);
  assert.equal(crystalCavernArchitecture.numbers.cuboids,9046);
  assert.equal(named('u3/moonstone-spur/').filter(p=>p.solid).length,0,
    'the visual spur cannot claim host-certified colliders or playable passage');
  assert.ok(named('u3/moonstone-spur/').every(p=>p.family!=='water'),
    'do not disguise the photo wall as water/real reflections');
  assert.equal(crystalCavernArchitecture.numbers.clusters,62);
  assert.equal(crystalCavernArchitecture.numbers.riverCells,289);
});

test('U-3 tapered crystals have real continuous segment tips under the exact rotated +20° spine', () => {
  const groups = new Map<string, Array<typeof crystalCavernArchitecture.pieces[number]>>();
  for (const piece of crystalCavernArchitecture.pieces) {
    const matched = piece.name.match(/^(u3\/crystals\/\d+\/spike-\d+)-tier-(\d)$/);
    if (!matched) continue;
    const entries = groups.get(matched[1]) ?? [];
    entries.push(piece);
    groups.set(matched[1], entries);
  }
  assert.ok(groups.size >= 140, 'all the flora must use three actual tapered segments');
  const sin = Math.sin(CRYSTAL_CAVERN_CANT_RAD), cos = Math.cos(CRYSTAL_CAVERN_CANT_RAD);
  for (const [name, raw] of groups) {
    assert.equal(raw.length, 3, name);
    const tiers = [...raw].sort((a,b)=>a.name.localeCompare(b.name));
    for (let i=0;i<2;i++) {
      const lower=tiers[i]!, upper=tiers[i+1]!;
      const tipX = lower.center[0] - sin * lower.size[1] / 2;
      const tipY = lower.center[1] + cos * lower.size[1] / 2;
      const nextX = upper.center[0] + sin * upper.size[1] / 2;
      const nextY = upper.center[1] - cos * upper.size[1] / 2;
      assert.ok(Math.hypot(tipX-nextX,tipY-nextY) < .085,
        name + ' crystal geometry split at tier ' + i);
    }
  }
});

test('U-3 R3 all supported path samples are clear to a standing 27cm avatar, graded gently to the source exit', () => {
  const f = fixture();
  const scene = mountUndergroundCrystalCavern(f.host);
  assert.equal(scene.kind, 'ready');
  if (scene.kind !== 'ready') assert.fail();
  let previous = -0.064;
  for (let n = 1; n <= 98; n += .12) {
    const h = crystalCavernTrailHeight(n);
    const e = crystalCavernTrailEast(n);
    assert.ok(scene.isClearLocal([e, h, n], .27, 1.8),
      'standing avatar snagged at north=' + n.toFixed(2));
    assert.ok(h <= previous + 1e-8 && previous - h < .01,
      'unexpected lip in the easy-to-walk descent');
    previous = h;
  }
  const guestPass = [crystalCavernPlan.entry, crystalCavernPlan.overlook,
    crystalCavernPlan.quay, crystalCavernPlan.exit];
  for (const item of guestPass) {
    assert.ok(scene.isClearLocal([item.east,item.height,item.north]),
      'official chapter point is blocked: ' + JSON.stringify(item));
  }
  scene.dispose();
});

test('U-3 R3 wrong world layer, unsupported foot or rejected rock collision leaves no rendered stage', () => {
  const f = fixture();
  assert.deepEqual(mountUndergroundCrystalCavern({
    ...f.host, frame: undefined,
  }), { kind:'unregistered' });
  assert.deepEqual(mountUndergroundCrystalCavern({
    ...f.host, frame: {...frame, domainId:''},
  }), { kind:'unregistered' });
  assert.deepEqual(mountUndergroundCrystalCavern({
    ...f.host, frame: {...frame, yaw:Infinity},
  }), { kind:'unregistered' });
  f.setAcceptance(false);
  assert.deepEqual(mountUndergroundCrystalCavern(f.host), { kind:'unsupported-cavern' });
  f.setAcceptance(true);
  f.setFooting(false);
  assert.deepEqual(mountUndergroundCrystalCavern(f.host), { kind:'unsupported-foot' });
  f.setFooting(true);
  f.setCollision(false);
  assert.deepEqual(mountUndergroundCrystalCavern(f.host), { kind:'unsupported-collider' });
  assert.equal(f.parent.children.length, 0, 'failed host approval must not leave orphan geometry');
  assert.ok(f.seen.length > 0, 'the actual collider list must be checked, not silently assumed');
});

test('U-3 R4/R5 eight-or-fewer instanced nearest pixel palettes and six attached cold lights never bypass the host budget', () => {
  const f = fixture();
  const scene = mountUndergroundCrystalCavern(f.host);
  assert.equal(scene.kind, 'ready');
  if (scene.kind !== 'ready') assert.fail();
  assert.equal(f.parent.children.length, 1);
  assert.equal(scene.group.position.y, -140);
  assert.equal(scene.meshes.length, 8);
  assert.equal(scene.lights.length, 6);
  assert.equal(scene.lights.filter(l=>l.visible).length, 3);
  assert.equal(scene.colliders.length, crystalCavernArchitecture.numbers.structuralColliders);
  for(const mesh of scene.meshes) {
    assert.ok(mesh.isInstancedMesh);
    assert.ok(mesh.count > 0);
    assert.ok(mesh.material instanceof Object);
    const material = mesh.material as MeshStandardMaterial;
    assert.ok(material.map);
    assert.equal(material.map.image.width,16);
    assert.equal(material.map.image.height,16);
    assert.equal(material.map.magFilter, NearestFilter);
    assert.equal(material.map.minFilter, NearestFilter);
    assert.equal(material.map.generateMipmaps,false);
    assert.equal(material.map.image.data.length,16*16*4);
  }
  const at=scene.toWorld([8.7,-2.960,98]);
  const check=crystalCavernToWorld(frame,[8.7,-2.960,98]);
  assert.deepEqual(at,check);
  f.setBudget(0);
  scene.sync();
  assert.equal(scene.lights.filter(l=>l.visible).length,0);
  f.setBudget(Infinity);
  scene.sync();
  assert.equal(scene.lights.filter(l=>l.visible).length,0);
  f.setBudget(6);
  scene.sync();
  assert.equal(scene.lights.filter(l=>l.visible).length,6);
  scene.dispose(); scene.dispose();
  assert.equal(f.parent.children.length,0);
  assert.equal(scene.sync(),false);
});

test('U-3 route geometry stays decoupled from unauthorized mining, crystal-mimic AI and passage switching', () => {
  const pieces = crystalCavernArchitecture.pieces;
  assert.ok(pieces.every(p => [
    ...p.center,...p.size,p.rotationZ].every(Number.isFinite) &&
    p.size.every(x=>x>0)));
  assert.ok(pieces.filter(p => p.solid).every(p => p.name.startsWith('u3/vault/') ||
    p.name.startsWith('u3/overlook/')));
  assert.ok(pieces.every(p => p.center[0] >= -90 && p.center[0] <= 90));
  assert.ok(pieces.every(p => p.center[2] >= -12 && p.center[2] <= 120));
  assert.ok(crystalCavernArchitecture.numbers.cuboids*12 < 110000,
    'mobile-friendly instanced geometry should have a budget');
  assert.equal(crystalCavernTrailEast(98),8.7);
  assert.equal(crystalCavernTrailHeight(98),-2.960);
  assert.ok(Number.isNaN(crystalCavernTrailEast(NaN)));
});
