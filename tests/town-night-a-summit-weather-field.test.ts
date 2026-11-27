import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {TownOutdoorWeatherState} from '../src/shared/town-outdoor-weather';
import {sampleSouthRegionalWeather} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-weather-field';
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
