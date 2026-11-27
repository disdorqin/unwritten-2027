import {Color,Fog,type Scene} from 'three';
import type {TownOutdoorWeatherState} from '../../../src/shared/town-outdoor-weather';
import type {TownNightWeatherSkyFrame} from './town-night-weather-sky';
import type {TownSnowWeather} from './town-weather';
import type {TownOutdoorWeatherFieldSample} from './town-weather-field-outdoor';
import {mainSummitBounds} from './main-summit-block';
import {summitAssemblyAnchor} from './main-summit-assembly';
import {craterWestSurvey} from './town-za22-crater-road';
import {worldBounds} from './town-extension';
import {townWeatherAreaAt,townWeatherExposureFor} from './town-weather-exposure';
import {townOutdoorWeatherFieldAt} from './town-weather-field-outdoor';

/** Read existing physical bounds rather than treating the old E=0 and N=800
 * town rectangle as the edge of every newly mounted domain. */
export function sampleSouthRegionalWeather(state:TownOutdoorWeatherState,east:number,north:number,elevation:number,mountain:boolean){
 const anchor=summitAssemblyAnchor;
 const bounds=mountain&&north>=anchor.north+mainSummitBounds.south
  ? {west:anchor.east+mainSummitBounds.west,east:anchor.east+mainSummitBounds.east,south:anchor.north+mainSummitBounds.south,north:anchor.north+mainSummitBounds.north}
  : {west:craterWestSurvey.west,east:worldBounds.width,south:0,north:worldBounds.depth};
 const edgeDistance=Math.max(0,Math.min(east-bounds.west,bounds.east-east,north-bounds.south,bounds.north-north));
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
