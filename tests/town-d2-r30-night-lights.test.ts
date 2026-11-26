import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PointLight, type Object3D } from 'three';
import { createTownD2R30NightLights, townD2R30NightLightBudget } from '../tools/voxel-tavern/town-blockout/town-d2-r30-night-lights';
import { createTownD2R30SummitFacilities } from '../tools/voxel-tavern/town-blockout/town-d2-r30-summit-facilities';
import { createTownD2R30Assembly } from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';

function cleanup<T extends { dispose(): void }>(context: TestContext, value: T): T {
  context.after(() => value.dispose());
  return value;
}

function lightsOf(root: Group) {
  const found: PointLight[] = [];
  root.traverse(object => {
    if ((object as { isPointLight?: boolean }).isPointLight) found.push(object as PointLight);
  });
  return found;
}

const trail = Array.from({ length: 40 }, (_, index) => ({
  east: 10 + index * 12, north: 100 + index * 3, height: 400 + index * 10,
}));

test('D2-R08 builds a trail lamp chain with a budgeted set of real lights', context => {
  const lights = cleanup(context, createTownD2R30NightLights({ trailPoints: trail, trailSpacing: 100 }));
  const stats = lights.stats();
  assert.ok(stats.trailLamps > 0, JSON.stringify(stats));
  assert.ok(stats.realLights > 0 && stats.realLights <= townD2R30NightLightBudget.maxPointLights,
    JSON.stringify(stats));
  assert.equal(stats.fixtures, stats.trailLamps);
  assert.ok(stats.meshes >= 2);
  assert.equal(stats.triangles > 0, true);

  // The lamp hardware and the emissive core are two instanced batches.
  const posts = lights.group.getObjectByName('town-d2-r30-trail-lamp-posts');
  const cores = lights.group.getObjectByName('town-d2-r30-trail-lamp-cores');
  assert.ok(posts && cores);
  assert.equal((posts as { count: number }).count, stats.trailLamps);
  assert.equal((cores as { count: number }).count, stats.trailLamps);
});

test('D2-R08 lights the summit at night and restores the daytime look exactly', context => {
  const lights = cleanup(context, createTownD2R30NightLights({ trailPoints: trail, trailSpacing: 100 }));
  const cores = lights.group.getObjectByName('town-d2-r30-trail-lamp-cores') as Mesh;
  const coreMaterial = cores.material as MeshBasicMaterial;
  const dayColour = coreMaterial.color.clone();
  const realLights = lightsOf(lights.group);

  // In daylight nothing burns.
  for (const light of realLights) assert.equal(light.visible, false);
  assert.equal(coreMaterial.color.getHexString(), dayColour.getHexString());

  lights.setNight(true);
  assert.equal(coreMaterial.color.getHexString(), 'ffb45c');
  for (const light of realLights) assert.equal(light.visible, true);

  lights.setNight(false);
  assert.equal(coreMaterial.color.getHexString(), dayColour.getHexString(),
    'the daytime core colour must be restored exactly');
  for (const light of realLights) assert.equal(light.visible, false);
});

test('D2-R08 rejects bad input and refuses to work after dispose', context => {
  assert.throws(() => createTownD2R30NightLights({ trailSpacing: 0 }), /positive/);
  const lights = createTownD2R30NightLights({ trailPoints: trail });
  assert.throws(() => lights.setNight(1 as unknown as boolean), TypeError);
  assert.throws(() => lights.setNight('yes' as unknown as boolean), TypeError);
  lights.dispose();
  lights.dispose();
  assert.throws(() => lights.setNight(true), /disposed/);
  context.after(() => {});
});

test('D2-R08 borrows the canonical emissive bodies and lights them at night only', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities());
  const lights = cleanup(context, createTownD2R30NightLights({
    hostGroup: facilities.group, trailPoints: trail, trailSpacing: 120,
  }));

  const pane = facilities.group.getObjectByName('hut-window-landmark-light') as Mesh;
  assert.ok(pane, 'the canonical hut window pane must be mounted');
  const paneMaterial = pane.material as MeshBasicMaterial;

  // The window reads as glass by day and turns into the summit beacon at
  // night, exactly like the D window's fog lamps.
  assert.equal(paneMaterial.color.getHexString(), '7d8ca0',
    'the pane must start on the daytime glass colour, not the warm night one');
  lights.setNight(true);
  assert.equal(paneMaterial.color.getHexString(), 'ffb45c');
  lights.setNight(false);
  assert.equal(paneMaterial.color.getHexString(), '7d8ca0',
    'the pane must go back to its daytime colour');

  // The bell-post cores belong to the rules module; the night switch asks
  // the module instead of touching its meshes.
  let switched: boolean | undefined;
  facilities.group.userData.bellLampSwitch = (on: boolean) => { switched = on; };
  const second = cleanup(context, createTownD2R30NightLights({
    hostGroup: facilities.group, trailPoints: trail, trailSpacing: 120,
  }));
  second.setNight(true);
  assert.equal(switched, true);
  second.setNight(false);
  assert.equal(switched, false);
});

test('D2-R08 darkens every lit facility surface and restores it exactly', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities());
  const materials = new Set<MeshLambertMaterial>();
  facilities.group.traverse((object: Object3D) => {
    const mesh = object as Mesh & { material?: unknown };
    if (mesh.material instanceof MeshLambertMaterial) materials.add(mesh.material);
  });
  assert.ok(materials.size > 3, 'expected the facility bodies to own lit materials');

  const before = [...materials].map(material => material.color.clone());
  facilities.setNight(true);
  [...materials].forEach((material, index) => {
    const day = before[index]!;
    const night = material.color;
    assert.ok(night.r <= day.r + 1e-6 && night.g <= day.g + 1e-6 && night.b <= day.b + 1e-6,
      'a night tint must darken every channel, never brighten one');
  });

  facilities.setNight(false);
  [...materials].forEach((material, index) => {
    const day = before[index]!;
    assert.ok(Math.abs(material.color.r - day.r) < 1e-6
      && Math.abs(material.color.g - day.g) < 1e-6
      && Math.abs(material.color.b - day.b) < 1e-6,
      'the daytime colour must be restored exactly');
  });
});

test('D2-R08 assembly mounts the night lights as an independent sub-package', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeSummitFacilities: true, includeNightLights: true,
  }));
  const stats = assembly.stats() as { subPackages: readonly string[]; budget: { packages: ReadonlyArray<{ package: string; meshes: number }> } };
  assert.ok(stats.subPackages.includes('town-d2-r30-night-lights'));

  const lights = assembly.group.getObjectByName('town-d2-r30-night-lights') as Group;
  assert.ok(lights);
  const realLights = lightsOf(lights);
  assert.ok(realLights.length > 0 && realLights.length <= townD2R30NightLightBudget.maxPointLights,
    `real light budget: ${realLights.length}`);
  // A real light must never burn in daylight.
  for (const light of realLights) assert.equal(light.visible, false);

  // The assembly night switch reaches the lights and the facility tint.
  assembly.setNight(true);
  for (const light of realLights) assert.equal(light.visible, true);
  assembly.setNight(false);
  for (const light of realLights) assert.equal(light.visible, false);

  const nightPackage = stats.budget.packages.find(item => item.package === 'town-d2-r30-night-lights');
  assert.ok(nightPackage && nightPackage.meshes >= 2);
});

test('D2-R08 no real light burns in daylight on the whole summit', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeSummitFacilities: true, includeNightLights: true,
  }));
  const all = lightsOf(assembly.group);
  assert.ok(all.length > 0, 'the summit must carry real night lights');
  // The canonical hut interior lamp and the two wind-ground oil lanterns all
  // used to burn at noon; R08 switches every one of them to the night.
  for (const light of all) assert.equal(light.visible, false, `${light.name} must be dark by day`);

  assembly.setNight(true);
  for (const light of all) assert.equal(light.visible, true, `${light.name} must light up at night`);

  assembly.setNight(false);
  for (const light of all) assert.equal(light.visible, false, `${light.name} must go dark again`);
});

test('D2-R08 keeps its own real lights inside the declared budget', context => {
  const assembly = cleanup(context, createTownD2R30Assembly({
    includeSummitFacilities: true, includeNightLights: true,
  }));
  const own = assembly.group.getObjectByName('town-d2-r30-night-lights') as Group;
  const owned = lightsOf(own);
  assert.ok(owned.length > 0);
  assert.ok(owned.length <= townD2R30NightLightBudget.maxPointLights,
    `R08 owns ${owned.length} lights, budget ${townD2R30NightLightBudget.maxPointLights}`);
  // The canonical lamps stay the canonical modules' own; R30 only switches them.
  const borrowed = lightsOf(assembly.group).length - owned.length;
  assert.ok(borrowed > 0, 'the canonical modules keep their own lamps');
});
