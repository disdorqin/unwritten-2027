import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { buildMainSummitPaint } from '../tools/voxel-tavern/town-blockout/main-summit-paint';
import { createMainSummitBannerCloud } from '../tools/voxel-tavern/town-blockout/main-summit-banner-cloud';

test('summit paint carries the four-band grammar as vertex alpha', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const paint = buildMainSummitPaint(block.heightAt, 40);
  context.after(() => paint.dispose());
  const colors = paint.mesh.geometry.getAttribute('color');
  assert.equal(colors.itemSize, 4);
  let ochre = 0, snow = 0, dark = 0, clear = 0;
  const positions = paint.mesh.geometry.getAttribute('position');
  for (let i = 0; i < colors.count; i++) {
    const alpha = colors.getW(i);
    if (alpha === 0) { clear++; continue; }
    const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
    // Attribute values are linear-space (three colour management), so the
    // ochre #b08d4f reads back near (0.44, 0.27, 0.08) and snow near 0.8+.
    if (r > .35 && g > .2 && b < .12) ochre++;
    else if (r > .75 && g > .75) snow++;
    else dark++;
    assert.ok(positions.getY(i) > 300, 'paint only lands on the upper massif');
  }
  assert.ok(ochre > 0, 'ochre waist band present');
  assert.ok(snow > 0, 'ledge snow present');
  assert.ok(dark > 0, 'dark rock present');
  assert.ok(clear > 0, 'lower slopes stay unpainted');
});

test('summit paint night version darkens the material tint', context => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  context.after(() => block.dispose());
  const paint = buildMainSummitPaint(block.heightAt, 60);
  context.after(() => paint.dispose());
  const material = paint.mesh.material;
  assert.equal(material.color.getHexString(), 'ffffff');
  paint.setNight(true);
  assert.equal(material.color.getHexString(), '5f7186');
  paint.setNight(false);
  assert.equal(material.color.getHexString(), 'ffffff');
});

test('banner cloud streams nine segments and updates without error', context => {
  const banner = createMainSummitBannerCloud();
  context.after(() => banner.dispose());
  const segments = banner.group.getObjectByName('banner-cloud-segments') as { count?: number } | undefined;
  assert.equal(segments?.count, 9, 'nine plume segments in one instanced draw');
  banner.update(0);
  banner.update(37.5);
  assert.ok(Number.isFinite(banner.group.position.x));
});
