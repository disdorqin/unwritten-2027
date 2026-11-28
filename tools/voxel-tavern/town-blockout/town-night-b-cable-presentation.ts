import {Color,Fog,type Scene} from 'three';
import {summitCableSpec} from './main-summit-cable';
import type {CableRideFrame} from './town-night-b-summit-ride-host';
import type {Friend3TravelAudio} from './town-friend3-travel-audio';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const t=clamp(x);return t*t*(3-2*t);};
/** Phase and elapsed time come from the same car transform, never a second
 * clock. A disconnected ride retains its last valid presentation. */
export function nightBCableCloudAmount(frame?:CableRideFrame){
 if(frame?.line!==2||frame.station)return 0;
 if(frame.whiteout||frame.phase==='whiteout')return 1;
 const t=frame.elapsedMs;if(t===undefined||!Number.isFinite(t))return 0;
 if(frame.phase==='enter-cloud')return smooth((t-summitCableSpec.enterCloudMs)/(summitCableSpec.whiteoutMs-summitCableSpec.enterCloudMs));
 if(frame.phase==='arrival')return 1-smooth((t-summitCableSpec.emergeMs)/10000);
 return 0;
}
/** Call beginFrame BEFORE the ordinary weather presentation and apply AFTER.
 * No overlay or extra UI; whiteout is actual scene fog and sky. Nearby cabin
 * interior remains legible. The old scene values are restored on exit,
 * weather updates, and teardown; no other scene's fog is modified. */
export function createNightBCablePresentation(){
 let restore:(()=>void)|undefined;
 const white=new Color('#ffffff');
 function beginFrame(){restore?.();restore=undefined;}
 function apply(scene:Scene,frame?:CableRideFrame){
  beginFrame();
  const amount=nightBCableCloudAmount(frame);
  if(amount<=0||!(scene.fog instanceof Fog))return;
  const fog=scene.fog,background=scene.background,saved={near:fog.near,far:fog.far,color:fog.color.clone()};
  restore=()=>{fog.near=saved.near;fog.far=saved.far;fog.color.copy(saved.color);scene.background=background;};
  fog.near=saved.near*(1-amount)+.75*amount;
  fog.far=saved.far*(1-amount)+2.6*amount;
  fog.color.lerp(white,amount);
  scene.background=(background instanceof Color?background.clone():saved.color.clone()).lerp(white,amount);
 }
 return {beginFrame,apply,dispose:beginFrame};
}
/** Reuse Friend3's original travel synthesis and the caller's audio context.
 * No background timer or audio context owned here. Only pulley while moving;
 * the caller suppresses external weather and route hints during whiteout. */
export function createNightBCableAudio(audio:Pick<Friend3TravelAudio,'play'|'stop'|'isPlaying'>){
 let armed=false;
 function gesture(){armed=true;}
 function sync(frame:CableRideFrame|undefined,enabled:boolean){
  const moving=armed&&enabled&&!!frame?.synchronized&&!frame.station;
  if(moving&&!audio.isPlaying('cable-pulley'))audio.play('cable-pulley',true);
  if(!moving&&audio.isPlaying('cable-pulley'))audio.stop('cable-pulley');
 }
 function repair(id:string,accepted:boolean,enabled:boolean){
  if(!armed||!accepted||!enabled)return;
  if(id==='strike-rust')audio.play('hammer');
  else if(id==='tighten-cable'||id==='pull-brake')audio.play('winch');
 }
 return {gesture,sync,repair,dispose(){audio.stop('cable-pulley');audio.stop('hammer');audio.stop('winch');}};
}
