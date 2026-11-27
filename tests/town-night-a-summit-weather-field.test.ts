import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {TownOutdoorWeatherState} from '../src/shared/town-outdoor-weather';
import {Color,Fog,Scene} from 'three';
import {sampleSouthRegionalWeather,applySouthWeatherPresentation,createSouthWeatherVisual,southWeatherWalkingScale} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-weather-field';
import {townNightWeatherAt} from '../src/shared/town-night-weather-cycle';
test('production domain weather respects actual west ground and summit bounds, and preserves Presence input',()=>{
 const state:TownOutdoorWeatherState={weather:'whiteout',startedAt:0,nextChangeAt:600000,windEast:1,windNorth:0,windStrength:1};
 const before=JSON.stringify(state);
 const at=(e:number,n:number,h:number,m=false)=>sampleSouthRegionalWeather(state,e,n,h,m).weather;
 const plaza=at(223,180,12),west=at(-10,450,12),crater=at(-120,185,10),summit=at(350,1676,800,true);
 assert.ok(plaza.visibilityMeters>55);assert.ok(west.visibilityMeters>55);
 assert.ok(crater.visibilityMeters<=12);assert.ok(summit.visibilityMeters<=12);
 assert.ok(summit.intensity>plaza.intensity&&summit.windStrength>plaza.windStrength);
 assert.deepEqual(at(350,1676,800,true),summit);assert.equal(JSON.stringify(state),before);
 for(const v of [plaza,west,crater,summit])assert.ok(v.fogNear<v.fogFar);
});
test('connected front and summit weather do not create an artificial storm wall at the mountain gate',()=>{
 const state:TownOutdoorWeatherState={weather:'whiteout',startedAt:0,nextChangeAt:600000,windEast:1,windNorth:0,windStrength:1};
 const at=(e:number,n:number,h:number,m:boolean)=>sampleSouthRegionalWeather(state,e,n,h,m).weather;
 const before=at(300,665.99,347,true),after=at(300,666.01,347,true),town=at(300,666.01,347,false);
 assert.ok(Math.abs(before.severity-after.severity)<.001);
 assert.ok(Math.abs(before.visibilityMeters-after.visibilityMeters)<.1);
 assert.equal(after.severity,town.severity);
 const outer=at(-799,900,170,true);assert.equal(outer.region,'map-edge');assert.ok(outer.severity>.95);
});
test('regional haze is non-accumulating and light snow actually thins the existing particle budget',()=>{
 const scene=new Scene(),fog=new Fog(0,1,100);scene.background=new Color();
 const sample=townNightWeatherAt(Date.UTC(2026,0,1)+180000);
 const sky={sample,nightSide:!sample.daylight,lampLevel:sample.lampLevel,fogNearScale:sample.fogNearScale,fogFarScale:sample.fogFarScale};
 const state:TownOutdoorWeatherState={weather:'whiteout',startedAt:0,nextChangeAt:600000,windEast:1,windNorth:0,windStrength:1};
 const high=sampleSouthRegionalWeather(state,350,1676,800,true).weather;
 assert.equal(applySouthWeatherPresentation(scene,fog,high,sky,.5,high),.5);
 const color=fog.color.getHex();
 assert.equal(applySouthWeatherPresentation(scene,fog,high,sky,.5,high),.5);assert.equal(fog.color.getHex(),color);
 const clear=sampleSouthRegionalWeather({...state,weather:'clear-snow'},223,180,12,false).weather;
 assert.ok(applySouthWeatherPresentation(scene,fog,clear,sky,.5,clear)<.5);
 assert.equal(fog.color.getHex(),sample.fogColor);
 assert.ok(fog.near<fog.far);
});
test('production driver eases wind and density while keeping the player quality cap and light snow',()=>{
 let quality=.5,density=0,windWrites=0;
 const snow={setIntensity(){},setOutdoorWind(){windWrites++;},setDensityScale(v:number){density=v;}};
 const driver=createSouthWeatherVisual(snow,()=>quality);
 const state:TownOutdoorWeatherState={weather:'whiteout',startedAt:0,nextChangeAt:600000,windEast:1,windNorth:0,windStrength:1};
 const high=sampleSouthRegionalWeather(state,350,1676,800,true).weather;
 for(let i=0;i<120;i++){driver.update(high,high,1,1/60,i*1000/60);assert.ok(density<=quality);}
 assert.ok(windWrites<=22);assert.ok(density<.5);
 quality=1.25;driver.reset();
 const clear=sampleSouthRegionalWeather({...state,weather:'clear-snow'},223,180,12,false).weather;
 driver.update(clear,clear,1,1/60,2100);assert.ok(density<1.0);
 quality=.5;driver.update(high,high,1,1/60,2117);assert.ok(density<=.5);
});
test('foot wind respects authority, direction, exposure and shelter without affecting ceremony',()=>{
 const state:TownOutdoorWeatherState={weather:'whiteout',startedAt:0,nextChangeAt:600000,windEast:1,windNorth:0,windStrength:1};
 assert.equal(southWeatherWalkingScale(state,350,1676,-1,0,true,true,false),.6);
 assert.equal(southWeatherWalkingScale(state,350,1676,1,0,true,true,false),1.1);
 assert.equal(southWeatherWalkingScale(state,350,1676,0,1,true,true,false),1);
 assert.equal(southWeatherWalkingScale(state,350,1676,-1,0,true,true,true),1);
 assert.equal(southWeatherWalkingScale(state,350,1676,-1,0,true,false,false),1);
 assert.equal(southWeatherWalkingScale(undefined,350,1676,-1,0,true,true,false),1);
 const town=southWeatherWalkingScale(state,223,180,-1,0,false,true,false);
 assert.ok(town>=.6&&town<=1);
});
