const chimeNotes=[329.63,261.63,293.66,196,196,293.66,329.63,261.63];
const partials=[[.50,.23,3.9],[1,.31,4.8],[1.196,.16,3.6],[1.495,.086,2.8],[2.002,.14,1.8],[2.482,.048,1.1]];
export const towerChimeDuration=34_000;

export function playTowerChime(context:AudioContext,elapsedMs:number,strikes:number) {
 if(context.state!=='running')return;
 const start=context.currentTime+.045;
 const age=elapsedMs/1000;
 // Catch up from the shared event timestamp for reconnecting players.
 for(const [i,frequency] of chimeNotes.entries())bell(i*.68,frequency,.12);
 for(let i=0;i<strikes;i++)bell(6.05+i*2.02,164.81,.36);
 function bell(beat:number,frequency:number,weight:number){
  if(beat<age-.18)return;
  const time=start+Math.max(0,beat-age);
  for(const [ratio,level,length] of partials){
   const tone=context.createOscillator(),gain=context.createGain();
   tone.frequency.value=frequency*ratio;
   gain.gain.setValueAtTime(.0001,time);
   gain.gain.exponentialRampToValueAtTime(weight*level,time+.022);
   gain.gain.exponentialRampToValueAtTime(.0001,time+length);
   tone.connect(gain).connect(context.destination);
   tone.start(time);tone.stop(time+length+.03);
  }
 }
}
