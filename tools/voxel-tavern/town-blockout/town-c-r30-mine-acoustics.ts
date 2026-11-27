type Point=Readonly<{east:number;north:number;height:number}>;
type Foot=Point&Readonly<{domainId:string}>;
type SoundSite=Readonly<{id:string;kind:'drip'|'rumble'|'hearth';point:Point;radius:number}>;
type Cue=Readonly<{actorId:string;sequence:number;kind:'walk'|'run'|'mining';domainId:string;point:Point}>;
export type R30MineAudioBridge=Readonly<{
 getContext():BaseAudioContext|undefined;
 output(context:BaseAudioContext):AudioNode;
 // Accepted existing activity edge, not a new mining/noise authority.
 readCues?():readonly Cue[];
 reaches?(source:Point,listener:Point):boolean;
}>;
const domain='underground/mine',valid=(p:Point)=>[p.east,p.north,p.height].every(Number.isFinite);
const distance=(a:Point,b:Point)=>Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height);
const tau=2*Math.PI;
type Voice={source:AudioBufferSourceNode;panner:PannerNode;gain:GainNode;context:BaseAudioContext;volume:number};
function makeBuffer(context:BaseAudioContext,kind:SoundSite['kind']|'echo-walk'|'echo-mining'){
 // Original procedural sounds. No downloaded samples, playback of music
 // or browser-created second context. Quiet levels leave the UI mix room.
 const duration=kind==='drip'?7.2:kind==='rumble'?12:kind==='hearth'?5.6:2.3;
 const rate=context.sampleRate,b=context.createBuffer(1,Math.ceil(duration*rate),rate),out=b.getChannelData(0);
 let seed=kind.length*973+41,low=0,slow=0;
 for(let i=0;i<out.length;i++){
  const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/2147483648-1;low+=.12*(noise-low);slow+=.011*(noise-slow);
  let value=0;
  if(kind==='drip'){
   for(const [at,pitch,volume] of [[.44,880,.075],[2.1,1170,.047],[4.72,760,.061],[5.92,1320,.042]]){
    const x=t-at;if(x<0||x>.74)continue;
    const env=Math.min(1,x/.004)*Math.exp(-10*x);
    value+=volume*env*(.69*Math.sin(tau*(pitch*x+95*x*x))+.23*Math.sin(tau*2.1*pitch*x)+.08*noise);
   }
  }else if(kind==='rumble'){
   const env=Math.sin(Math.PI*t/duration)**2*(.42+.26*Math.sin(tau*t/3.7));
   value=env*(.033*Math.sin(tau*43*t)+.021*Math.sin(tau*61*t)+.026*slow);
  }else if(kind==='hearth'){
   const edge=Math.min(1,t/.07,(duration-t)/.07);
   value=edge*(.026*low+.013*noise);
   for(const [at,vol] of [[.24,.08],[.71,.032],[1.46,.064],[2.13,.045],[3.2,.085],[3.39,.045],[4.79,.067]]){
    const x=t-at;if(x>=0&&x<.09)value+=vol*Math.min(1,x/.001)*Math.exp(-90*x)*noise;
   }
  }else{
   // Only the echo tail, never duplicate the source's immediate hit/step.
   const mining=kind==='echo-mining';
   for(const [j,at] of [.18,.37,.64,1.03,1.51].entries()){
    const x=t-at;if(x<0||x>.45)continue;
    const env=Math.min(1,x/.012)*Math.exp(-(mining?12:18)*x)*Math.pow(.57,j);
    value+=(mining?.045:.028)*env*(mining?.55*Math.sin(tau*590*x)+.25*Math.sin(tau*1013*x)+.2*noise:low*.85+.15*noise);
   }
  }
  out[i]=Math.max(-.18,Math.min(.18,value));
 }
 return b;
}
/** Mine-only presentation. At most three ambient voices + two short
 * accepted echoes; no automatic resume, survival event, or source sound.
 * The viewer's AudioContext, listener, master volume and mute are sole owners. */
export function createR30MineAcoustics(sites:readonly SoundSite[],bridge:R30MineAudioBridge,readFoot:()=>Foot|undefined,readSeated:()=>boolean){
 if(sites.some(s=>!s.id||!valid(s.point)||!Number.isFinite(s.radius)||s.radius<=0)||new Set(sites.map(s=>s.id)).size!==sites.length)throw RangeError('Invalid mine sound sites');
 const buffers=new WeakMap<BaseAudioContext,Map<string,AudioBuffer>>();
 const loops=new Map<string,Voice>(),echoes=new Set<Voice>(),seen=new Map<string,number>();
 let disposed=false,activeContext:BaseAudioContext|undefined,wasInside=false;
 function buffer(ctx:BaseAudioContext,kind:Parameters<typeof makeBuffer>[1]){
  let cache=buffers.get(ctx);if(!cache){cache=new Map();buffers.set(ctx,cache)}
  let b=cache.get(kind);if(!b){b=makeBuffer(ctx,kind);cache.set(kind,b)}return b;
 }
 function stop(v:Voice){
  v.source.onended=null;
  try{v.source.stop()}catch{/* Already ended. */}
  v.source.disconnect();v.panner.disconnect();v.gain.disconnect();
 }
 function stopAll(){for(const v of loops.values())stop(v);for(const v of echoes)stop(v);loops.clear();echoes.clear()}
 function start(ctx:BaseAudioContext,out:AudioNode,p:Point,r:number,kind:Parameters<typeof makeBuffer>[1],loop:boolean,volume:number){
  const source=ctx.createBufferSource(),panner=ctx.createPanner(),gain=ctx.createGain();
  source.buffer=buffer(ctx,kind);source.loop=loop;
  panner.panningModel='equalpower';panner.distanceModel='linear';panner.refDistance=.9;panner.maxDistance=r;
  panner.positionX.value=p.east;panner.positionY.value=p.height;panner.positionZ.value=-p.north;
  gain.gain.value=volume;source.connect(panner).connect(gain).connect(out);
  const v={source,panner,gain,context:ctx,volume};
  if(!loop)source.onended=()=>{if(echoes.delete(v)){source.disconnect();panner.disconnect();gain.disconnect()}};
  source.start();return v;
 }
 function sync(){
  if(disposed)return;
  const f=readFoot(),inside=!!f&&f.domainId===domain&&valid(f);
  const ctx=inside?bridge.getContext():undefined;
  if(!inside||!ctx||ctx.state!=='running'){
   stopAll();activeContext=undefined;wasInside=false;return;
  }
  const out=bridge.output(ctx);if(!out||out.context!==ctx){stopAll();activeContext=undefined;wasInside=false;return}
  if(ctx!==activeContext){stopAll();activeContext=ctx;wasInside=false}
  const hear=(p:Point)=>bridge.reaches?.(p,f!)!==false;
  const selected=sites.map(s=>({s,d:distance(s.point,f!)}))
   .filter(({s,d})=>d<s.radius&&hear(s.point)).sort((a,b)=>a.d-b.d).slice(0,3);
  const ids=new Set(selected.map(p=>p.s.id));
  for(const [id,v] of loops)if(!ids.has(id)){stop(v);loops.delete(id)}
  const seated=readSeated();
  for(const {s,d} of selected){
   // Panner owns physical rolloff; gain is a gentle local mix rather
   // than a second inverse distance calculation. Camp sitting reduces
   // room sound and gently raises the hearth within the original mix.
   const volume=(s.kind==='hearth'?(seated?.38:.20):(seated?.63:1))*Math.min(1,(s.radius-d)/1.5);
   let voice=loops.get(s.id);
   if(!voice){voice=start(ctx,out,s.point,s.radius,s.kind,true,0);loops.set(s.id,voice)}
   if(Math.abs(voice.volume-volume)>.015){voice.gain.gain.setTargetAtTime(volume,ctx.currentTime,.08);voice.volume=volume}
  }
  // The first snapshot on entry/reconnect establishes a baseline:
  // historical accepted cues are not replayed into the current visit.
  for(const e of bridge.readCues?.()??[]){
   if(!e.actorId||!['walk','run','mining'].includes(e.kind)||!Number.isSafeInteger(e.sequence)||e.sequence<=0)continue;
   const key=e.actorId+'/'+e.kind,old=seen.get(key)??0;
   if(e.sequence<=old)continue;
   seen.set(key,e.sequence);
   if(!wasInside||e.domainId!==domain||!valid(e.point)||distance(e.point,f!)>15||bridge.reaches?.(e.point,f!)!==true||echoes.size>=2)continue;
   const v=start(ctx,out,e.point,15,e.kind==='mining'?'echo-mining':'echo-walk',false,seated?.63:1);echoes.add(v);
  }
  // Keep the replay frontier bounded without retaining historical buffers.
  if(seen.size>256)for(const key of [...seen.keys()].slice(0,seen.size-256))seen.delete(key);
  wasInside=true;
 }
 return {sites,sync,stats:()=>({ambient:[...loops.keys()],echoes:echoes.size}),
  dispose(){if(disposed)return;disposed=true;stopAll();seen.clear();activeContext=undefined}};
}
