import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Color, Group, type Mesh, type MeshStandardMaterial } from 'three';
import {
  createOrbitalCabinSignage, mountOrbitalCabinSignage, orbitalCabinSignPlacements,
} from '../tools/voxel-tavern/town-blockout/orbital-cabin-signage';

test('the six opaque indoor signs use the crest on the two nameplates only', t => {
  const signs = createOrbitalCabinSignage();
  try {
    assert.equal(signs.group.parent, null);
    assert.equal(signs.inventory.length, 6);
    assert.equal(signs.group.children.length, 6);
    assert.deepEqual(signs.inventory.filter(sign => sign.kind === 'nameplate').map(sign => sign.text), ['未央号', '未央号']);
    assert.deepEqual(signs.inventory.filter(sign => sign.kind === 'cabin-door').map(sign => sign.text), ['驾驶舱', '气闸舱']);
    assert.deepEqual(signs.inventory.flatMap(sign => sign.kind === 'status' ? [[sign.text, sign.indicator]] : []),
      [['传送', 'status-teleport'], ['维生', 'status-life-support']]);
    const silver = new Color(0xd4ecf6);
    for (const child of signs.group.children) {
      const mesh = child as Mesh;
      const material = mesh.material as MeshStandardMaterial;
      const { sign } = mesh.userData;
      assert.equal(material.transparent, false);
      assert.equal(material.emissive.getHex(), 0);
      assert.equal(material.vertexColors, true);
      assert.ok(mesh.geometry.getIndex()!.count > 36);
      assert.ok(!mesh.name.includes('ring') && !mesh.name.includes('portal') && !mesh.name.includes('frame'));
      const { position, color } = mesh.geometry.attributes;
      const crest = [];
      for (let index = 0; index < color!.count; index++) {
        const rgb = [color!.getX(index), color!.getY(index), color!.getZ(index)];
        if (rgb.every((value, component) => Math.abs(value - [silver.r, silver.g, silver.b][component]!) < 1e-6)) {
          crest.push([position!.getX(index), position!.getY(index)]);
        }
      }
      if (sign.kind === 'nameplate') {
        assert.equal(sign.motif, 'half-moon-and-descending-arc');
        assert.ok(crest.some(([x, y]) => x! < -.56 && y! < .07 && y! > -.04));
        assert.ok(crest.some(([x, y]) => x! > -.5 && y! > .08));
        assert.ok(crest.some(([x, y]) => x! > -.36 && y! < -.04));
      } else assert.deepEqual(crest, []);
    }
    t.diagnostic('2 cold-silver crest nameplates, 2 internal direction signs, 2 static green-system captions; no light or portal nodes');
  } finally { signs.dispose(); }
});

test('the two header signs clear a standing capsule and remain supported at the authored bulkheads', t => {
  const signs = createOrbitalCabinSignage();
  try {
    const clearance = [];
    for (const placement of orbitalCabinSignPlacements) {
      const mesh = signs.group.getObjectByName(`orbital-sign-${placement.id}`)!;
      const bounds = new Box3().setFromObject(mesh);
      assert.ok(Math.abs(bounds.getCenter(mesh.position.clone()).z + placement.n) < .015);
      if (placement.kind !== 'cabin-door') continue;
      const floor = placement.room === 'airlock' ? 0 : .32;
      const gap = bounds.min.y - floor - 1.8;
      assert.ok(gap >= .69);
      assert.ok(Math.abs(bounds.max.y - placement.supportTop) < 1e-6);
      clearance.push({ id: placement.id, metres: Number(gap.toFixed(3)) });
    }
    t.diagnostic(JSON.stringify(clearance));
  } finally { signs.dispose(); }
});

test('mount reuses the S-2 status-wall plaque, leaves existing gates/indicators alone and cleans up independently', () => {
  const host = new Group();
  const add = (name: string) => { const node = new Group(); node.name = name; host.add(node); return node; };
  add('orbital-airlock');
  add('orbital-cockpit');
  const wall = add('orbital-status-wall');
  const gate = add('orbital-starport-frame');
  const light = add('status-teleport');
  wall.userData.nameplate = { text: '未央号', motif: 'half-moon-and-descending-arc', y: 2.62, north: -3.776 };
  const signs = mountOrbitalCabinSignage(host);
  try {
    assert.equal(signs.group.parent, host);
    assert.equal(signs.group.children.length, 5);
    assert.equal(signs.inventory[0]!.origin, 's2-wall');
    assert.equal(signs.group.getObjectByName('orbital-sign-airlock-nameplate'), undefined);
    assert.deepEqual(gate.children, []);
    assert.deepEqual(light.children, []);
    assert.throws(() => mountOrbitalCabinSignage(host), /bare two-room orbital host/);
  } finally {
    signs.dispose();
    signs.dispose();
  }
  assert.equal(host.children.length, 5);
  assert.equal(wall.userData.nameplate.text, '未央号');
  assert.equal(host.getObjectByName('orbital-cabin-signage'), undefined);
  assert.throws(() => mountOrbitalCabinSignage(new Group()), /bare two-room orbital host/);
});
