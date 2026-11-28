import {AmbientLight,DirectionalLight,Fog,type Scene} from 'three';
import {createTownNightWeatherSky} from './town-night-weather-sky';

/** Use the actual ZA22 scene lights. Do not allocate another sun, fog or
 * weather clock. Keep its authored visibility range separate from town. */
export function createSouthSummitWeatherHost(scene:Scene){
 const ambient=scene.children.find((o):o is AmbientLight=>(o as AmbientLight).isAmbientLight===true);
 const sun=scene.children.find((o):o is DirectionalLight=>(o as DirectionalLight).isDirectionalLight===true);
 const fog=scene.fog as Fog|null;
 if(!ambient||!sun||!fog?.isFog)throw Error('ZA22 scene lighting contract missing');
 const near=fog.near,far=fog.far;
 const sky=createTownNightWeatherSky({scene,ambient,sun,fog});
 return {update(now:number,epoch:number,dim:number){
  const frame=sky.update(now,epoch,{dim});
  // A separate transport whiteout may override visibility after this
  // normal atmospheric baseline; it must not create another day cycle.
  fog.near=near*frame.fogNearScale;
  fog.far=far*frame.fogFarScale;
  return frame;
 }};
}
