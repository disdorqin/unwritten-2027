import assert from 'node:assert/strict';
import {test} from 'node:test';
import {townNightWeatherAt} from '../src/shared/town-night-weather-cycle';
import type {TownOutdoorWeatherState} from '../src/shared/town-outdoor-weather';
import {sampleSouthRegionalWeather} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-weather-field';
import {southWeatherStatus,southWeatherProfile} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-weather-status';
test('read-only regional weather HUD does not expose cloud crossing, and profile records same authority',()=>{
 const epoch=Date.UTC(2026,0,1),sample=townNightWeatherAt(epoch+180000,epoch);
 const sky={sample,nightSide:!sample.daylight,lampLevel:sample.lampLevel,fogNearScale:sample.fogNearScale,fogFarScale:sample.fogFarScale};
 const state:TownOutdoorWeatherState={weather:'whiteout',startedAt:epoch,nextChangeAt:epoch+600000,windEast:1,windNorth:0,windStrength:1};
 const local=sampleSouthRegionalWeather(state,350,1676,800,true).weather;
 assert.equal(southWeatherStatus(sky,state,local,false,true,false),'');
 assert.match(southWeatherStatus(sky,state,local,false,false,false),/白化.*能见度/);
 assert.match(southWeatherStatus(sky,state,local,false,false,true),/室内避风/);
 assert.match(southWeatherStatus(sky,undefined,undefined,false,false,false),/同步/);
 assert.match(southWeatherStatus(sky,state,local,true,false,false),/仪式/);
 const p=southWeatherProfile(sky,state,local,local);
 assert.equal(p.phase,.3);assert.equal(p.dawnEpoch,epoch);assert.equal(p.authority,'whiteout');assert.equal(p.visibility,local.visibilityMeters);
});
