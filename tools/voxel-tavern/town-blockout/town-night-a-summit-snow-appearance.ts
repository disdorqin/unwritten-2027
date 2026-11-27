import {advanceWeatherCover,type TownSnowWeather} from './town-weather';
/** Visual-only accumulation for existing authored snow caps. Ground height,
 * weather authority and the snow/character physics remain with their owners.
 * Sample fixed terrain points, never the camera, and share the existing
 * accumulation/melt law. The cap is quantized to avoid frequent GPU writes. */
export type SouthSnowVisualSample=(e:number,n:number,h:number)=>Pick<TownSnowWeather,'targetCover'|'pilingRate'>;
export function createSouthSnowAppearance(e:number,n:number,h:number,apply:(cover:number)=>void){
 let cover=1,level=16;
 return {update(seconds:number,sample:SouthSnowVisualSample){
  const weather=sample(e,n,h);
  if(!Number.isFinite(weather.targetCover)||!Number.isFinite(weather.pilingRate))return;
  cover=advanceWeatherCover(cover,seconds,{targetCover:Math.max(0,Math.min(1,weather.targetCover)),pilingRate:Math.max(0,weather.pilingRate)});
  const next=Math.round(16*cover);
  if(next===level)return;
  level=next;apply(level/16);
 },cover:()=>cover};
}
