import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CanvasTexture,Group,Mesh,MeshBasicMaterial,PlaneGeometry} from 'three';
import {createNightBFrontBoardPresenter} from '../tools/voxel-tavern/town-blockout/town-night-b-front-boards';
test('actual three existing board textures refresh only on authoritative status changes',()=>{
 const root=new Group(),faces:Mesh<PlaneGeometry,MeshBasicMaterial>[]=[];
 for(const name of ['ridge-cable-board-S-12','middle-station-direction-board','ridge-cable-board-S-19']){
  const canvas={width:1152,height:540,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})};
  const texture=new CanvasTexture(canvas as unknown as HTMLCanvasElement),mesh=new Mesh(new PlaneGeometry(2,1),new MeshBasicMaterial({map:texture}));
  mesh.name=name;faces.push(mesh);root.add(mesh);
 }
 const update=createNightBFrontBoardPresenter(root,{length:600,lowerMetres:250});
 update('dormant');const versions=faces.map(m=>m.material.map!.version);
 for(const m of faces)assert.match(m.userData.text.title,/未启/);
 update('dormant');assert.deepEqual(faces.map(m=>m.material.map!.version),versions);
 update('running');for(const m of faces)assert.match(m.userData.text.title,/正常运行/);
 assert.match(faces[1]!.userData.text.lines[0],/50秒.*70秒/);
 update('parked');for(const m of faces)assert.match(m.userData.text.title,/暂停发车/);
 update('offline');for(const m of faces)assert.match(m.userData.text.title,/暂停登乘/);
 assert.equal(root.children.length,3);for(const m of faces){m.geometry.dispose();m.material.map!.dispose();m.material.dispose();}
});
