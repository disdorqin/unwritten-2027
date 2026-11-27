import {createFriend3WeatherAudio,type Friend3WeatherFieldSample} from './town-friend3-weather-audio';
const storageKey='unwritten.weather.audio.v1';
/** The viewer supplies the authoritative region and the actual shelter state.
 * No separate clock or audio context, no start from an animation frame. */
export function createSouthWeatherAudioHost(getContext:()=>AudioContext|undefined){
 const audio=createFriend3WeatherAudio({getContext,fadeSeconds:1.8});
 let enabled=false,volume=40,suspended=false,last=-Infinity;
 try{const raw=JSON.parse(localStorage.getItem(storageKey)??'null');enabled=raw?.enabled===true;if(Number.isFinite(raw?.volume))volume=Math.max(0,Math.min(100,Math.round(raw.volume)));}catch{}
 const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify({enabled,volume}));}catch{}};
 function gesture(){
  if(!enabled||suspended)return;
  if(!audio.isStarted())audio.start();
 }
 function sync(field:Friend3WeatherFieldSample|undefined,indoor:boolean,concealed:boolean,ordinary:boolean,now:number){
  if(!audio.isStarted()||!Number.isFinite(now)||now-last<100)return;
  last=now;
  const active=enabled&&!suspended&&!concealed&&ordinary&&!!field;
  if(field)audio.updateFromField(field,{indoor:indoor?1:0,enabled:active,masterVolume:volume});
  else audio.setEnabled(false);
 }
 function setEnabled(value:boolean){enabled=value;persist();if(!value)audio.stop();else gesture();}
 function setVolume(value:number){if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(100,Math.round(value)));persist();audio.setMasterVolume(volume);}
 function setSuspended(value:boolean){suspended=value;if(value)audio.stop();last=-Infinity;}
 return {gesture,sync,setEnabled,setVolume,setSuspended,settings:()=>({enabled,volume}),started:audio.isStarted,dispose:audio.dispose};
}
