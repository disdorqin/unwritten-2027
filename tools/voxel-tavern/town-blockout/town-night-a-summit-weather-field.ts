import {Color,Fog,type Scene} from 'three';
import type {TownOutdoorWeatherState} from '../../../src/shared/town-outdoor-weather';
import type {TownNightWeatherSkyFrame} from './town-night-weather-sky';
import type {TownSnowWeather} from './town-weather';
import type {TownOutdoorWeatherFieldSample} from './town-weather-field-outdoor';
import {mainSummitBounds} from './main-summit-block';
import {summitAssemblyAnchor} from './main-summit-assembly';
import {craterWestSurvey} from './town-za22-crater-road';
import {worldBounds} from './town-extension';
import {townWeatherAreaAt,townWeatherExposureFor,townAreaWindWalkingScale} from './town-weather-exposure';
import {createTownWeatherVisualDriver,type SnowfallHandle} from './town-weather-visual-budget';
import {townOutdoorWeatherFieldAt} from './town-weather-field-outdoor';

/** Read existing physical bounds rather than treating the old E=0 and N=800
 * town rectangle as the edge of every newly mounted domain. */
export function sampleSouthRegionalWeather(state:TownOutdoorWeatherState,east:number,north:number,elevation:number,mountain:boolean){
 const anchor=summitAssemblyAnchor;
 const townDistance=Math.max(0,Math.min(east-craterWestSurvey.west,worldBounds.width-east,north,worldBounds.depth-north));
 const summitDistance=Math.max(0,Math.min(east-anchor.east-mainSummitBounds.west,anchor.east+mainSummitBounds.east-east,
  north-anchor.north-mainSummitBounds.south,anchor.north+mainSummitBounds.north-north));
 // The connected front deck overlaps the independent summit domain.
 // Its shared entry is not an outer edge. Max of the two interior
 // distances is continuous at that seam and conservative near the union.
 const edgeDistance=mountain?Math.max(townDistance,summitDistance):townDistance;
 const exposure=townWeatherExposureFor(mountain?'open-ground':townWeatherAreaAt(east,north));
 return {weather:townOutdoorWeatherFieldAt(state,{east,north,elevation,edgeDistance},{exposure,nightFogFar:Infinity}),exposure};
}

/** The shader always emits its base flakes at intensity <=1. Reduce its
 * existing draw range for light snow, never enlarge the quality budget.
 * Whiteout haze follows the same sky sample in both domains. */
const whiteoutTint=new Color('#d8e2e9');
export function applySouthWeatherPresentation(scene:Scene,fog:Fog,weather:TownSnowWeather,sky:TownNightWeatherSkyFrame,quality:number,local?:TownOutdoorWeatherFieldSample){
 fog.far=Math.max(.1,weather.fogFar*sky.fogFarScale);
 fog.near=Math.min(fog.far-.05,Math.max(0,weather.fogNear*sky.fogNearScale));
 // Reset from the sampled sky, not last frame's blended colour.
 fog.color.setHex(sky.sample.fogColor);
 const background=scene.background as Color|null;
 if(background?.isColor)background.setHex(sky.sample.skyColor);
 if(local?.skyColor){
  const blend=.35+.5*local.severity;
  fog.color.lerp(whiteoutTint,blend);
  if(background?.isColor)background.lerp(whiteoutTint,blend);
 }
 return quality*Math.max(.125,Math.min(1,Math.round(weather.intensity*64)/64));
}

/** F's eased budget retains A's light-snow thinning and never exceeds
 * the current quality tier, even after a live quality change. */
export function createSouthWeatherVisual(snowfall:SnowfallHandle,quality:()=>number){
 let budget=quality();
 const driver=createTownWeatherVisualDriver({
  setIntensity:i=>snowfall.setIntensity(i),
  setOutdoorWind:(e,n,s,x)=>snowfall.setOutdoorWind(e,n,s,x),
  setDensityScale:s=>{budget=s;},
 },{qualityScale:quality});
 return {update(weather:TownSnowWeather,local:TownOutdoorWeatherFieldSample|undefined,exposure:number,dt:number,now:number){
  driver.update({intensity:weather.intensity,visibilityMeters:local?.visibilityMeters??weather.fogFar,
   windEast:local?.windEast??0,windNorth:local?.windNorth??0,windStrength:local?.windStrength??0},dt,now,exposure);
  snowfall.setDensityScale(Math.min(quality(),budget)*Math.max(.125,Math.min(1,Math.round(weather.intensity*64)/64)));
 },reset(){driver.reset();budget=quality();},current:driver.current};
}

/** Shared authoritative walking rule; no local wind can authorize extra
 * movement, nor alter the sled, water, air or indoor mechanics. */
export function southWeatherWalkingScale(state:TownOutdoorWeatherState|undefined,east:number,north:number,moveEast:number,moveNorth:number,mountain:boolean,ordinary:boolean,sheltered:boolean){
 if(!state||!ordinary||sheltered)return 1;
 return townAreaWindWalkingScale(state,mountain?'summit':townWeatherAreaAt(east,north),moveEast,moveNorth);
}
