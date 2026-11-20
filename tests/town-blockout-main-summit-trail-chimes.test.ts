import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Group, Vector3, type BufferGeometry, type Material, type Mesh, type MeshLambertMaterial } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitSledRoute } from '../tools/voxel-tavern/town-blockout/main-summit-sled-route';
import { createMainSummitTrail, type MainSummitTrailPoint } from '../tools/voxel-tavern/town-blockout/main-summit-trail';
import { mountMainSummitTrailChimes } from '../tools/voxel-tavern/town-blockout/main-summit-trail-chimes';

type SurveyOptions = Parameters<typeof mountMainSummitTrailChimes>[1];

function close(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${label} expected ${expected}, measured ${actual}`);
}

function walkSurvey(points: readonly MainSummitTrailPoint[]) {
  const surveyed = [{ ...points[0], metres: 0 }];
  for (const point of points.slice(1)) {
    const previous = surveyed[surveyed.length - 1];
    const distance = Math.hypot(point.east - previous.east, point.north - previous.north, point.height - previous.height);
    surveyed.push({ ...point, metres: previous.metres + distance });
  }

  function atElevation(height: number) {
    const index = surveyed.findIndex(point => point.height >= height);
    const a = surveyed[index - 1];
    const b = surveyed[index];
    return a.metres + (b.metres - a.metres) * (height - a.height) / (b.height - a.height);
  }

  return {
    startMetres: atElevation(380),
    endMetres: atElevation(560),
    sample(metres: number) {
      const index = surveyed.findIndex(point => point.metres >= metres);
      const a = surveyed[index - 1];
      const b = surveyed[index];
      const u = (metres - a.metres) / (b.metres - a.metres);
      return {
        east: a.east + (b.east - a.east) * u,
        north: a.north + (b.north - a.north) * u,
        height: a.height + (b.height - a.height) * u,
      };
    },
  };
}

test('ZD-01 cloud-belt flags and bells follow both P-3 routes with the sound at the mounted bell', t => {
  const owner = new Group();
  const terrain = createMainSummitBlock(mainSummitLayout, 347, 50);
  t.after(terrain.dispose);
  const trail = createMainSummitTrail(terrain.heightAt, 347);
  const sled = createMainSummitSledRoute();
  const cloud = sled.arcs.find(arc => arc.id === 'through-cloud');
  assert.ok(cloud);
  const routes: readonly { options: SurveyOptions; walking: boolean }[] = [
    { options: { ...walkSurvey(trail.points), groundAt: terrain.heightAt }, walking: true },
    { options: { sample: sled.sampleAtDistance, startMetres: cloud.startMetres, endMetres: cloud.endMetres }, walking: false },
  ];

  for (const { options, walking } of routes) {
    const { sample, startMetres, endMetres } = options;
    const chimes = mountMainSummitTrailChimes(owner, options);
    t.after(chimes.dispose);
    assert.equal(chimes.group.parent, owner);
    assert.equal(chimes.group.children.length, chimes.sites.length);
    assert.deepEqual(chimes.sites.map(site => site.metres), Array.from(
      { length: Math.ceil((endMetres - startMetres) / 24) }, (_, index) => startMetres + index * 24,
    ));

    const releases = new Map<BufferGeometry | Material, number>();
    chimes.group.updateWorldMatrix(true, true);
    for (const [index, site] of chimes.sites.entries()) {
      const post = chimes.group.children[index];
      assert.equal(post.name, 'trail-chime-post');
      const flag = post.getObjectByName('trail-chime-red-flag') as Mesh<BufferGeometry, MeshLambertMaterial> | undefined;
      const bell = post.getObjectByName('trail-chime-bell');
      const bronze = bell?.getObjectByName('trail-chime-bronze') as Mesh<BufferGeometry, MeshLambertMaterial> | undefined;
      assert.ok(flag?.isMesh && bell?.isObject3D && bronze?.isMesh);
      assert.ok(flag.material.color.r > 2 * Math.max(flag.material.color.g, flag.material.color.b));
      assert.ok(bronze.material.color.r > bronze.material.color.g && bronze.material.color.g > bronze.material.color.b);

      const center = sample(site.metres);
      const next = sample(site.metres + 1);
      const de = next.east - center.east;
      const dn = next.north - center.north;
      const span = Math.hypot(de, dn);
      const e = -dn / span;
      const n = de / span;
      assert.ok(center.height >= 380 - 1e-7 && center.height <= 560 + 1e-7);
      const postBase = post.getWorldPosition(new Vector3());
      close(postBase.x, center.east + 2.25 * e, 'Post east offset from route');
      close(-postBase.z, center.north + 2.25 * n, 'Post north offset from route');
      close(postBase.y, options.groundAt?.(postBase.x, -postBase.z) ?? center.height, 'Post base elevation');
      const origin = bell.getWorldPosition(new Vector3());
      close(origin.x, postBase.x + .44 * e, 'Bell east offset from post');
      close(-origin.z, -postBase.z + .44 * n, 'Bell north offset from post');
      close(origin.y, postBase.y + 1.44, 'Bell elevation from post');
      close(site.east, origin.x, 'Sound source matches mounted bell east');
      close(site.north, -origin.z, 'Sound source matches mounted bell north');
      close(site.height, origin.y, 'Sound source matches mounted bell elevation');

      if (walking) {
        const bounds = new Box3().setFromObject(post);
        for (const east of [bounds.min.x, postBase.x, bounds.max.x]) {
          for (const north of [-bounds.max.z, -postBase.z, -bounds.min.z]) {
            assert.equal(trail.sampleSurface(east, north), undefined, `Post at ${site.metres} m clears the 3 m tread`);
          }
        }
      }

      post.traverse(object => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        for (const resource of [mesh.geometry, ...[mesh.material].flat()]) {
          if (releases.has(resource)) continue;
          releases.set(resource, 0);
          resource.addEventListener('dispose', () => releases.set(resource, releases.get(resource)! + 1));
        }
      });
    }

    assert.ok(releases.size > 0);
    chimes.dispose();
    chimes.dispose();
    assert.deepEqual(owner.children, []);
    assert.ok([...releases.values()].every(count => count === 1));
  }
});
