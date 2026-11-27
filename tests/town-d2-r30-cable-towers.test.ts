import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Color, Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import {buildNightBLatticeMembers} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-lattice';
import { createTownD2R30CableTowers } from '../tools/voxel-tavern/town-blockout/town-d2-r30-cable-towers';
import { createMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

type Towers = ReturnType<typeof createTownD2R30CableTowers>;

function cleanup(context: TestContext, towers: Towers) {
  context.after(() => towers.dispose());
  return towers;
}

test('D2-R02 cable towers densely support the canonical 1920 m line on R30 terrain', context => {
  const towers = cleanup(context, createTownD2R30CableTowers());
  assert.equal(towers.group.userData.owner, 'D2-R02');
  assert.equal(towers.group.userData.modifiesCable, false);
  assert.equal(towers.group.userData.modifiesHeightAt, false);
  const stats = towers.stats();
  assert.ok(stats.ropeMetres > 1900 && stats.ropeMetres < 2000, `rope ${stats.ropeMetres}`);
  assert.ok(stats.towers >= 25, JSON.stringify(stats));
  assert.ok(stats.maxTowerHeight < 200, JSON.stringify(stats));
  assert.ok(stats.drawCalls > 0 && stats.triangles > 0);
  assert.ok(stats.minClearance >= 1);

  // D2-R10: the towers ship as three instanced batches, so the whole 1,920 m
  // line costs three draw calls instead of one mesh per tower part.
  const batches = towers.group.children.filter(child => child instanceof InstancedMesh);
  assert.equal(batches.length, 3, 'mast, unified iron boxes, foundation palette');
  assert.equal(stats.drawCalls, 3, JSON.stringify(stats));
  assert.equal(stats.foundations,stats.towers);assert.ok(stats.westTowers>0);assert.ok(stats.latticeMembers>stats.towers*20);
  const lattice=batches.find(batch=>batch.name.endsWith('-iron-boxes'))!;assert.equal(lattice.count,stats.latticeMembers+stats.towers);
  for(const foot of towers.footprints.filter(f=>f.legHalf>0)){
    assert.ok(foot.halfWidth>=foot.legHalf+.7);assert.ok(foot.mastTop-foot.latticeTop>=3.64);
    for(const x of [-foot.halfWidth+.04,0,foot.halfWidth-.04])for(const z of [-foot.halfWidth+.04,0,foot.halfWidth-.04]){
      const h=sampleTownD2R30Height(foot.east+x,foot.north+z)!;assert.ok(h>foot.bottom&&h<foot.top);
    }
    assert.ok(towers.blocked(foot.east+foot.legHalf*.8,foot.north,foot.top+.4));
  }
  for(const foot of towers.footprints){for(const x of [-1.2,-.6,0,.6,1.2])for(const z of [-1.2,-.6,0,.6,1.2]){const h=sampleTownD2R30Height(foot.east+x,foot.north+z)!;assert.ok(h>foot.bottom&&h<foot.top);}assert.ok(towers.blocked(foot.east,foot.north,foot.top-.1));}
  const mast = batches.find(batch => batch.name.endsWith('-mast'))!;
  const foundation=batches.find(batch=>batch.name.endsWith('-foundation-palette'))!;
  assert.ok(mast && lattice && foundation);
  assert.equal(mast.count,stats.towers);assert.equal(foundation.count,2*stats.towers);
  assert.equal(stats.triangles,batches.reduce((sum,m)=>sum+m.count*m.geometry.getIndex()!.count/3,0));
  const expected=buildNightBLatticeMembers(towers.footprints.map(f=>({east:f.east,north:f.north,footBottom:f.bottom,footTop:f.top-.09,footHalf:f.halfWidth-.04,legHalf:f.legHalf,latticeTop:f.latticeTop})));
  assert.equal(expected.length,stats.latticeMembers);
  const actual=new Matrix4(),old=new Matrix4(),v=new Vector3(),ref=new Vector3();
  for(let i=0;i<expected.length;i++){
    lattice.getMatrixAt(stats.towers+i,actual);old.copy(expected[i]!);
    for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){
      v.set(x,y,z).applyMatrix4(actual);ref.set(x*.18,y,z*.18).applyMatrix4(old);assert.ok(v.distanceTo(ref)<.0002,'brace corner changed');
    }
  }
  for(const [i,f] of towers.footprints.entries()){
    foundation.getMatrixAt(i,actual);
    v.set(.5,.5,.5).applyMatrix4(actual);assert.ok(v.distanceTo(ref.set(f.east+f.halfWidth-.04,f.top-.09,-f.north+f.halfWidth-.04))<.0002);
    foundation.getMatrixAt(stats.towers+i,actual);v.set(.5,.5,.5).applyMatrix4(actual);assert.ok(v.distanceTo(ref.set(f.east+f.halfWidth,f.top,-f.north+f.halfWidth))<.0002);
  }
  const c=new Color(),target=new Color();
  for(const night of [false,true,false]){
    towers.setNight(night);foundation.getColorAt(0,c);target.set(night?'#53616c':'#7b858b');assert.ok(Math.abs(c.r-target.r)+Math.abs(c.g-target.g)+Math.abs(c.b-target.b)<1e-6);
    foundation.getColorAt(stats.towers,c);target.set(night?'#93a9bd':'#d9e5e8');assert.ok(Math.abs(c.r-target.r)+Math.abs(c.g-target.g)+Math.abs(c.b-target.b)<1e-6);
  }

  // Every tower is positioned over the domain and its mast base sits on the
  // R30 ground directly below the sampled rope point.
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  for (let index = 0; index < mast.count; index++) {
    mast.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    const east = position.x, north = -position.z;
    const ground = sampleTownD2R30Height(east, north);
    assert.ok(ground !== undefined, `tower outside domain E${east}/N${north}`);
    const base = position.y - scale.y / 2;
    assert.ok(Math.abs(base - ground) < 1.5, `tower base ${base} != ground ${ground}`);
    assert.ok(scale.y > 1, `mast height ${scale.y}`);
  }
});

test('D2-R02 cable towers honor custom rope and terrain without touching cabins', context => {
  const cable = createMainSummitCable(0, 10_000, 347);
  const ropeBefore = cable.ropes[0].points.map(point => ({ ...point }));
  const towers = cleanup(context, createTownD2R30CableTowers({
    cable,
    spacing: 30,
    heightAt: (east, north) => 300 + (north ?? 0) * .3,
  }));
  const coarse = createTownD2R30CableTowers({ cable, spacing: 60 });
  context.after(() => coarse.dispose());
  assert.deepEqual(cable.ropes[0].points, ropeBefore, 'cable rope survey must stay identical');
  const stats = towers.stats();
  assert.equal(stats.spacing, 30);
  assert.ok(stats.towers > coarse.stats().towers);
  assert.ok(summitCableSpec.speedMetresPerSecond === 8);
});

test('D2-R02 cable towers validate inputs and dispose GPU resources exactly once', context => {
  const parent = new Group();
  const towers = createTownD2R30CableTowers({ spacing: 80 });
  parent.add(towers.group);
  const resources = new Set<unknown>();
  towers.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    resources.add(object.material);
  });
  let disposals = 0;
  for (const resource of resources) {
    (resource as { addEventListener(type: 'dispose', cb: () => void): void })
      .addEventListener('dispose', () => { disposals++; });
  }
  towers.dispose();
  towers.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(towers.group.children.length, 0);
  assert.equal(disposals, resources.size);
  assert.equal(towers.group.userData.disposed, true);

  assert.throws(() => createTownD2R30CableTowers({ spacing: 0 }), /Invalid/);
  context.after(() => {});
});
