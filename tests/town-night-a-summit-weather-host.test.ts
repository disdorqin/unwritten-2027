import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AmbientLight,Color,DirectionalLight,Fog,Scene} from 'three';
import {createZa22CloudRoute} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';
import {createSouthSummitWeatherHost} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-weather-host';
import {createTownNightWeatherSky} from '../tools/voxel-tavern/town-blockout/town-night-weather-sky';
import {townNightWeatherDefaultDawnEpoch as epoch,townNightWeatherDayMs as day} from '../src/shared/town-night-weather-cycle';
test('real ZA22 independent scene follows the same clock without duplicate lights or fog-distance drift',()=>{
 const mountain=createZa22CloudRoute({now:()=>epoch,cloudStamp:{available:()=>false,request(){}},enterOrExit(){},view(){}});
 const scene=mountain.scene,children=scene.children.length,fog=scene.fog as Fog;
 const near=fog.near,far=fog.far,host=createSouthSummitWeatherHost(scene);
 const town=new Scene(),ambient=new AmbientLight(),sun=new DirectionalLight(),townFog=new Fog(0,360,1300);
 town.fog=townFog;town.add(ambient,sun);const rig=createTownNightWeatherSky({scene:town,ambient,sun,fog:townFog});
 for(const phase of [0,.3,.599,.6,.78,.99,1,.3]){
  const time=epoch+phase*day,a=host.update(time,epoch,.6),b=rig.update(time,epoch,{dim:.6});
  assert.deepEqual(a,b);
  assert.equal((scene.background as Color).getHex(),(town.background as Color).getHex());
  assert.equal(fog.color.getHex(),townFog.color.getHex());
  assert.equal(fog.near,near*a.fogNearScale);assert.equal(fog.far,far*a.fogFarScale);
  assert.equal(scene.children.length,children);
 }
});
