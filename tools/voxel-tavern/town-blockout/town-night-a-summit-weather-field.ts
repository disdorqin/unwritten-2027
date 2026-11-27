import type {TownOutdoorWeatherState} from '../../../src/shared/town-outdoor-weather';
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
