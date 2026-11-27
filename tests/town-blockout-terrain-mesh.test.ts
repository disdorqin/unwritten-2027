import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import type { BufferAttribute, BufferGeometry, Group as ThreeGroup, Mesh } from 'three';
import { addTerrainMeshes } from '../tools/voxel-tavern/town-blockout/terrain-mesh';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';

const requireFromViewer = createRequire(new URL('../tools/voxel-tavern/package.json', import.meta.url));
const { Frustum, Group, Matrix4, PerspectiveCamera } = requireFromViewer('three');

test('walking draws upload only their local slices of the unchanged aerial terrain buffers', () => {
  const grid = createTerrainGrid();
  const scene = new Group();
  const prepare = addTerrainMeshes(scene, grid);
  const camera = new PerspectiveCamera(58, 1000 / 650, .1, 1400);
  camera.position.set(543.6, 11.8934618 + 1.65, -412);
  camera.lookAt(camera.position.x - 1, camera.position.y, camera.position.z);
  camera.updateMatrixWorld(true);

  prepare(543.6, 412, false, false);
  scene.updateMatrixWorld(true);
  const detail = scene.getObjectByName('Walkable terrain') as ThreeGroup;
  const visibleFrustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const visible = detail.children.filter(mesh => visibleFrustum.intersectsObject(mesh));
  const visibleAttributes = new Set(visible.flatMap(mesh =>
    Object.values((mesh as Mesh<BufferGeometry>).geometry.attributes)));
  const walkingUpload = [...visibleAttributes].reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0);
  const total = (grid.gridWidth - 1) * (grid.gridDepth - 1) * 6;
  const aggregateUpload = total * 37;
  assert.ok(detail.visible && visible.length > 0 && visible.length < detail.children.length);
  assert.equal(visibleAttributes.size, visible.length * 4);
  assert.ok(walkingUpload > 0 && walkingUpload < aggregateUpload);

  // Walking cull retains each original triangle that is not wholly
  // excluded by a camera plane, including subsequent cached small motion.
  const originals=new Map(detail.children.map(o=>[o,(o as Mesh<BufferGeometry>).geometry.getAttribute('position')]));
  function assertCoverage(){
    camera.updateMatrixWorld(true);
    const f=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let selected=0,full=0;
    for(const child of detail.children as Mesh<BufferGeometry>[]){
      const g=child.geometry,p=g.getAttribute('position');full+=p.count;
      if(originals.has(child))assert.equal(p,originals.get(child));
      const index=g.index,keep=child.visible?(index?new Set<number>(Array.from(index.array.subarray(0,g.drawRange.count))):undefined):new Set<number>();
      if(child.visible)selected+=g.drawRange.count;
      if(!keep)continue;
      for(let i=0;i<p.count;i+=3){
        if(keep.has(i)&&keep.has(i+1)&&keep.has(i+2))continue;
        assert.ok(f.planes.some((plane:import('three').Plane)=>[i,i+1,i+2].every(v=>plane.normal.x*p.getX(v)+plane.normal.y*p.getY(v)+plane.normal.z*p.getZ(v)+plane.constant<-.00001)),'walking cull removed potentially visible terrain triangle');
      }
    }
    assert.ok(selected>0&&selected<full);
  }
  prepare(543.6,412,false,false,.55,camera,true);assertCoverage();
  camera.position.x-=1;camera.rotateY(.035);prepare(542.6,412,false,false,.55,camera,true);assertCoverage();
  camera.rotateY(.9);prepare(542.6,412,false,false,.55,camera,true);assertCoverage();
  prepare(542.6,412,false,false);assert.ok(detail.children.every(o=>o.visible&&!(o as Mesh<BufferGeometry>).geometry.index));
  camera.position.set(543.6,11.8934618+1.65,-412);camera.lookAt(camera.position.x-1,camera.position.y,camera.position.z);
  prepare(543.6, 412, true, false, .55, camera);
  const aerial = scene.getObjectByName('Walkable terrain visible tiles') as Mesh<BufferGeometry>;
  assert.ok(!detail.visible && aerial.visible && aerial.geometry.drawRange.count > 0);
  assert.equal(aerial.geometry.getAttribute('position').count, total);
  let first = 0;
  for (const child of detail.children as Mesh<BufferGeometry>[]) {
    const { geometry } = child;
    const { count } = geometry.drawRange;
    assert.equal(geometry.drawRange.start, 0);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const backing = aerial.geometry.getAttribute(name) as BufferAttribute;
      assert.equal(attribute.count, count);
      assert.equal(attribute.normalized, backing.normalized);
      assert.equal(attribute.array.buffer, backing.array.buffer);
      assert.equal(attribute.array.byteOffset, backing.array.byteOffset +
        first * backing.itemSize * backing.array.BYTES_PER_ELEMENT);
    }
    first += count;
  }
  assert.ok(first <= total);
  assert.equal(aerial.geometry.getAttribute('snowRetention').normalized, true);
  console.log(`A6 camera fixture: ${visible.length} visible chunks, ${walkingUpload} walking attribute bytes vs ${aggregateUpload} aggregate bytes`);
});
