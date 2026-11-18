import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import {
  addMarketStallBanners, marketBannerCopy, type MarketStallLayout,
} from '../tools/voxel-tavern/town-blockout/market-stall-banners.ts';

test('market banner copy follows every Muse row exactly', () => {
  const source = readFileSync(new URL('../docs/交流区/Claude/2026-11-18-集市幌子文案-v1.md', import.meta.url), 'utf8');
  const rows = [...source.matchAll(/^\| (.+?) \| (.+?) \| (.+?) \|$/gm)].slice(1);
  assert.equal(rows.length, 9);
  assert.deepEqual(Object.entries(marketBannerCopy), rows.map(([, kind, title, subtitle]) => [kind, [title, subtitle]]));
  for (const [title] of Object.values(marketBannerCopy)) assert.equal([...title].length, 4);
});

class FixtureCanvas {
  width = 384;
  height = 112;
  readonly drawn: string[] = [];
  getContext() {
    return {
      createLinearGradient() { return { addColorStop() {} }; },
      fillRect() {}, strokeRect() {}, drawImage() {},
      fillText: (text: string) => this.drawn.push(text),
    };
  }
}

test('untyped stalls leave the entrance sign in place and nine typed banners share its draw', () => {
  const canvases: FixtureCanvas[] = [];
  const fixtureDocument = {
    createElement() {
      const canvas = new FixtureCanvas();
      canvases.push(canvas);
      return canvas;
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fixtureDocument });
  try {
    function entranceSign() {
      const map = new CanvasTexture(new FixtureCanvas() as unknown as HTMLCanvasElement);
      const material = new MeshStandardMaterial({ map, emissiveMap: map, emissiveIntensity: .4 });
      const sign = new Mesh(new PlaneGeometry(3.4, .74), material);
      sign.position.set(0, 4.35, 6.71);
      return sign;
    }
    const unknown: MarketStallLayout[] = [[-12.5, -4.8, 6.8, '#a1342d'], [37, 0, 6.8, '#a1342d', '糖水']];
    const originalSign = entranceSign();
    const unchanged = new Group();
    addMarketStallBanners(unchanged, unknown, originalSign);
    assert.deepEqual(unchanged.children, [originalSign]);
    assert.equal(canvases.length, 0);

    const typed: MarketStallLayout[] = Object.keys(marketBannerCopy).map((kind, index) => [index * 8, -4.8, 6.8, '#a1342d', kind]);
    const market = new Group();
    addMarketStallBanners(market, [...typed, ...unknown], entranceSign());
    assert.equal(canvases.length, 10, 'one atlas page serves nine cloth tiles plus the original entrance');
    assert.equal(market.children.length, 1);
    const batch = market.children[0] as Mesh<PlaneGeometry, MeshStandardMaterial>;
    assert.ok(batch.material.isMeshStandardMaterial);
    assert.equal(batch.material.emissiveIntensity, .4);
    assert.equal(batch.material.map, batch.material.emissiveMap);
    assert.equal(batch.geometry.getAttribute('position').count, 4 * (9 + 1));
    assert.equal(batch.geometry.index?.count, 6 * (9 + 1));
    assert.deepEqual(canvases.slice(0, 9).map(canvas => canvas.drawn),
      Object.values(marketBannerCopy).map(([title, subtitle]) => [...title, subtitle]));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
