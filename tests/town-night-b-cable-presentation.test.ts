import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Color,Fog,Scene} from 'three';
import {createMainSummitCable} from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import {createNightBCablePresentation,nightBCableCloudAmount,createNightBCableAudio} from '../tools/voxel-tavern/town-blockout/town-night-b-cable-presentation';
import type {CableRideFrame} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-ride-host';
const c=createMainSummitCable(0,10000,347);
function at(t:number,back=false):CableRideFrame{
 const p=c.cabinsAt((back?c.legMs:0)+10000+t)[0];
 return {line:2,cabin:0,feet:{east:p.ropePoint.east,north:p.ropePoint.north,height:p.ropePoint.height-2.4},station:p.station,synchronized:true,phase:p.phase,elapsedMs:p.elapsedMs,direction:p.direction,whiteout:p.phase==='whiteout'};
}
test('same actual twin rope clock provides all four acts both ways without a local timer',()=>{
 for(const back of [false,true]){
  assert.equal(nightBCableCloudAmount(at(69999,back)),0);
  assert.equal(nightBCableCloudAmount(at(85000,back)),.5);
  assert.equal(nightBCableCloudAmount(at(100000,back)),1);
  assert.equal(nightBCableCloudAmount(at(129999,back)),1);
  assert.equal(nightBCableCloudAmount(at(130000,back)),1);
  assert.equal(nightBCableCloudAmount(at(135000,back)),.5);
  assert.equal(nightBCableCloudAmount(at(140000,back)),0);
 }
 const scene=new Scene(),fog=new Fog('#839ab9',112,620),sky=new Color('#aabbcc');
 scene.fog=fog;scene.background=sky;
 const p=createNightBCablePresentation();
 p.apply(scene,at(115000));assert.equal(fog.far,2.6);assert.equal(fog.color.getHexString(),'ffffff');assert.equal((scene.background as Color).getHexString(),'ffffff');
 p.beginFrame();assert.equal(fog.far,620);assert.equal(scene.background,sky);
 p.apply(scene,at(135000));assert.ok(fog.far>2.6&&fog.far<620);
 p.dispose();assert.equal(fog.far,620);assert.equal(fog.color.getHexString(),'839ab9');
});
test('reuse pulley sound, stop at disconnect/station, and no unarmed playback',()=>{
 const playing=new Set<string>(),events:string[]=[];
 const a=createNightBCableAudio({play(id){playing.add(id);events.push('play:'+id);return true;},stop(id){playing.delete(id);events.push('stop:'+id);},isPlaying:id=>playing.has(id)});
 a.sync(at(115000),true);assert.deepEqual(events,[]);
 a.gesture();a.sync(at(115000),true);a.sync(at(120000),true);assert.deepEqual(events,['play:cable-pulley']);
 a.sync({...at(120000),synchronized:false},true);assert.equal(playing.size,0);
 a.sync(at(120000),true);a.sync(undefined,true);assert.equal(playing.size,0);
 a.repair('strike-rust',false,true);assert.equal(playing.size,0);
 a.repair('strike-rust',true,true);assert.ok(playing.has('hammer'));a.dispose();assert.equal(playing.size,0);
});
