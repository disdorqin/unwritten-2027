import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight } from 'three';
import { mountTownC2R30Tavern } from '../tools/voxel-tavern/town-blockout/town-c2-r30-tavern.js';
import { mountTownC2R30Domestic } from '../tools/voxel-tavern/town-blockout/town-c2-r30-warrior-domestic.js';
import { mountTownC2R30VaultApproach } from '../tools/voxel-tavern/town-blockout/town-c2-r30-vault-approach.js';
import { buildTownC2R30WaterworksTrace } from '../tools/voxel-tavern/town-blockout/town-c2-r30-waterworks-trace.js';
import { buildTownC2R30Enclosure } from '../tools/voxel-tavern/town-blockout/town-c2-r30-enclosure.js';
import { c2R30SeamAudit } from '../tools/voxel-tavern/town-blockout/town-c2-r30-layer-seams.js';

test('C2 R04 all deep art prefabs mount together as local fixtures with no registered world', () => {
  const host = new Group();
  const enclosure = buildTownC2R30Enclosure();
  host.add(enclosure.group);
  const waterworks = buildTownC2R30WaterworksTrace(host);
  const tavern = mountTownC2R30Tavern({ parent: host });
  const domestic = mountTownC2R30Domestic({ parent: host });
  const vault = mountTownC2R30VaultApproach({ parent: host });
  try {
    assert.equal(enclosure.group.parent, host);
    assert.equal(waterworks.group.parent, host);
    assert.equal(tavern.group.parent, host);
    assert.equal(domestic.group.parent, host);
    assert.equal(vault.group.parent, host);
    // All three art prefabs stay hidden until a host certifies their site.
    assert.equal(tavern.group.visible, false);
    assert.equal(domestic.group.visible, false);
    assert.equal(vault.group.visible, false);
    for (const scene of [tavern, domestic, vault]) {
      const stats = scene.stats();
      assert.equal(stats.worldAnchor, false);
      assert.equal(stats.lootCount, 0);
      assert.equal(stats.presenceChanges, 0);
    }
    // The two city modules expose registrationChanges; the vault uses the
    // equivalent gateAuthorityChanges flag. Neither may mutate authority.
    assert.equal(tavern.stats().registrationChanges, 0);
    assert.equal(domestic.stats().registrationChanges, 0);
    assert.equal(vault.stats().gateAuthorityChanges, 0);
    // Hidden fixtures may prebuild bounded warm pools for a certified host, but
    // none may be visible while the site remains uncertified.
    assert.equal(tavern.stats().visibleLightCount, 0, 'hidden fixture must not emit visible lights');
    assert.ok(tavern.stats().realLightCount <= 2, 'warm pool budget stays bounded');
    assert.equal(vault.stats().realLightCount, 0, 'the vault must stay cold');
  } finally {
    enclosure.dispose(); waterworks.dispose(); tavern.dispose(); domestic.dispose(); vault.dispose();
  }
  assert.equal(host.children.length, 0, 'dispose must detach every module');
});

test('C2 R04 certified sites reveal only the modules the host explicitly approves', () => {
  const host = new Group();
  const tavern = mountTownC2R30Tavern({
    parent: host,
    site: { domainId: 'host:u10:tavern', east: 0, north: 0, height: 0, yaw: 0 },
    supportsSite: () => true,
    readNight: () => true,
    readLightBudget: () => 2,
  });
  const vault = mountTownC2R30VaultApproach({ parent: host });
  try {
    assert.equal(tavern.group.visible, true);
    assert.equal(tavern.stats().siteCertified, true);
    assert.equal(tavern.stats().realLightCount, 2);
    assert.equal(vault.group.visible, false, 'an uncertified neighbour stays hidden');
    assert.equal(vault.stats().siteCertified, false);
  } finally {
    tavern.dispose(); vault.dispose();
  }
});

test('C2 R04 deep layers remain production-unwired until C publishes frames', () => {
  const audit = c2R30SeamAudit();
  assert.equal(audit.allLocalFixtures, true);
  assert.equal(audit.productionReady, false);
  assert.ok(audit.links.some(link => link.id === 'minus140-to-minus165' && !link.wireable));
  assert.ok(audit.links.some(link => link.id === 'minus140-ferry' && link.wireable));
  // No module may put a real light into the vault approach.
  const host = new Group();
  const vault = mountTownC2R30VaultApproach({ parent: host });
  try {
    let lights = 0;
    host.traverse(object => { if (object instanceof PointLight) lights++; });
    assert.equal(lights, 0);
  } finally { vault.dispose(); }
});
