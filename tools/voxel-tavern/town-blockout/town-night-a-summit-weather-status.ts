import type {TownNightWeatherSkyFrame} from './town-night-weather-sky';
import type {TownOutdoorWeatherState} from '../../../src/shared/town-outdoor-weather';
import type {TownOutdoorWeatherFieldSample} from './town-weather-field-outdoor';
import type {TownSnowWeather} from './town-weather';

const phases={sunrise:'日出',day:'白昼',dusk:'黄昏',nightfall:'入夜','deep-night':'深夜'} as const;
const regions={town:'小镇',foothill:'山脚',alpine:'高山区',summit:'主峰',crater:'陨石坑','map-edge':'边缘地带'} as const;
const conditions={'clear-snow':'晴雪',wind:'风雪',whiteout:'白化'} as const;
/** Read-only settings-panel information, not an action or gate.
 * No warning/preview inside a cabin during the authored blind cloud crossing. */
export function southWeatherStatus(sky:TownNightWeatherSkyFrame,state:TownOutdoorWeatherState|undefined,local:TownOutdoorWeatherFieldSample|undefined,ceremony:boolean,concealed:boolean,sheltered:boolean){
 if(concealed)return '';
 if(ceremony)return '天气 · 跨年仪式';
 if(!state||!local)return '天气 · 等待联机天气同步';
 const place=regions[local.region],phase=phases[sky.sample.phaseName];
 return sheltered?`${phase} · ${place} · 室内避风`:`${phase} · ${place} · ${conditions[state.weather]} · 能见度约 ${Math.max(5,Math.round(local.visibilityMeters/5)*5)} m`;
}
export function southWeatherProfile(sky:TownNightWeatherSkyFrame,state:TownOutdoorWeatherState|undefined,weather:TownSnowWeather,local:TownOutdoorWeatherFieldSample|undefined){
 return {phase:sky.sample.phase,phaseName:sky.sample.phaseName,dawnEpoch:sky.sample.dawnEpoch,skyColor:sky.sample.skyColor,fogColor:sky.sample.fogColor,cloudColor:sky.sample.cloudColor,lampLevel:sky.lampLevel,
 authority:state?.weather,region:local?.region,severity:local?.severity,visibility:local?.visibilityMeters??weather.fogFar,snow:weather.intensity,windStrength:local?.windStrength??0};
}
