import {Group,Vector3} from 'three';
import {r30DeepFrames,r30DeepLocalFeet,r30DeepWorldFeet,r30DeepRoomProposals,r30DepthLinks,r30LayerWorld,r30LayerLocal,r30LinkPoint,type R30LayerFrame,type R30Point,type R30DepthLink} from './town-c-r30-deep-layer-contract.js';
import {mountR30DepthCorridor} from './town-c-r30-depth-corridor.js';
import {secondMineDomainId} from '../../../src/shared/underground-second-mine-presence-domain.js';

type Layer='minus165'|'minus190';
type Foot=R30Point&Readonly<{domainId:string}>;
type Room=Readonly<{origin:R30Point;bounds:Readonly<{width:number;depth:number;height:number}>}>;
type Passage=Readonly<{floor:number;clearance:number}>;
export const r30DeepDomains=Object.freeze({minus140:secondMineDomainId,minus165:'underground/warrior-city',minus190:'underground/palace'});
/** C2 consumes these exact sockets. For the first link, cut the actual
 * second-mine end wall at N198; don't remove the complete entry/exit wall. */
export const r30DeepMouths=Object.freeze({
 'minus140-to-minus165':{
  from:{layer:'minus140',axis:'north',at:198,centre:0,width:3.4,height:3.24},
  to:{layer:'minus165',axis:'east',at:0,centre:0,width:3.4,height:3.24},
 },
 'minus165-to-minus190':{
  from:{layer:'minus165',axis:'east',at:180,centre:0,width:3.4,height:3.24},
  to:{layer:'minus190',axis:'north',at:0,centre:0,width:3.4,height:3.24},
 },
} as const);
type LinkId=keyof typeof r30DeepMouths;
export type R30DeepMouth=typeof r30DeepMouths[LinkId]['from'|'to'];
type ScenePort=Readonly<{
 group:Group;
 /** C2's actual floor/collision query, in local ENH; not a clearance-only
  * canStand at an arbitrary supplied height. */
 passageLocal(east:number,north:number,radius:number,height:number):Passage|undefined;
 /** C2 certifies the actual opening mesh, including any attached art. */
 acceptsMouth(mouth:R30DeepMouth):boolean;
 sync?:()=>void;
 dispose:()=>void;
}>;
export type R30DeepAssemblyBridge=Readonly<{
 acceptsLayer(layer:Layer,frame:R30LayerFrame,room:Room):boolean;
 mountLayer(layer:Layer,frame:R30LayerFrame):ScenePort|undefined;
 acceptsSecondMineMouth(mouth:R30DeepMouth):boolean;
 acceptsLink(link:R30DepthLink,room:Room):boolean;
}>;
function includes(room:Room,p:R30Point){
 const o=room.origin,b=room.bounds;
 return [p.east,p.north,p.height].every(Number.isFinite)&&p.east>=o.east&&p.east<=o.east+b.width&&
  p.north>=o.north&&p.north<=o.north+b.depth&&p.height>=o.height&&p.height<=o.height+b.height;
}
export function r30LinkRoom(link:R30DepthLink):Room{
 const points=[0,link.length].flatMap(t=>[-link.width/2,link.width/2].map(s=>r30LinkPoint(link,t,s)!));
 const east=Math.floor(Math.min(...points.map(p=>p.east)))-1,north=Math.floor(Math.min(...points.map(p=>p.north)))-1,
 height=Math.floor(Math.min(link.start.height,link.end.height))-2;
 return {origin:{east,north,height},bounds:{
  width:Math.ceil(Math.max(...points.map(p=>p.east)))-east+1,
  depth:Math.ceil(Math.max(...points.map(p=>p.north)))-north+1,
  height:Math.ceil(Math.max(link.start.height,link.end.height))+4-height,
 }};
}
export const r30LinkDomain=(link:R30DepthLink)=>'underground/link/'+link.id;
export const r30DeepTransitContracts=Object.freeze(r30DepthLinks.map(link=>Object.freeze({
 id:link.id,domainId:r30LinkDomain(link),room:r30LinkRoom(link),
 entry:{domainId:r30DeepDomains[link.from],...link.start},
 exit:{domainId:r30DeepDomains[link.to],...link.end},
 /** The layer owner transfers at a physically shared foot, not a 25m jump. */
 intoLinkFromStart:{domainId:r30LinkDomain(link),...link.start},
 intoLinkFromEnd:{domainId:r30LinkDomain(link),...link.end},
 mouths:r30DeepMouths[link.id as LinkId],
})));
type MountedCorridor=Extract<ReturnType<typeof mountR30DepthCorridor>,{kind:'ready'}>;
const layers=['minus165','minus190'] as const;
function near(a:R30Point,b:R30Point,eps=.02){return Math.hypot(a.east-b.east,a.north-b.north,a.height-b.height)<=eps}
/** One lifecycle owner for C2-provided real scene roots and C's own corridors.
 * No scene factory is invoked without registered frames, and the default
 * runtime without a bridge stays closed. This is not a room server. */
export function createR30DeepAssembly(options:Readonly<{
 parent:Group;seamRegistered:boolean;bridge?:R30DeepAssemblyBridge;
 readAcceptedFoot?:()=>Foot|undefined;
 supportsSecondMine:(p:R30Point)=>boolean;
}>){
 const scenes=new Map<Layer,ScenePort>(),corridors=new Map<string,MountedCorridor>();
 const available=new Set<Layer>(),openLinks=new Set<string>();
 let activeDomain:string|undefined,acceptedFoot:Foot|undefined,disposed=false;
 function localPass(layer:Layer,p:R30Point,radius=.27,height=1.8){
  const s=scenes.get(layer),frame=r30DeepFrames[layer];
  if(!s||!available.has(layer)||!includes(r30DeepRoomProposals[layer],p))return;
  const l=r30LayerLocal(frame,p),q=s.passageLocal(l.east,l.north,radius,height);
  if(q&&[q.floor,q.clearance].every(Number.isFinite)&&q.clearance>=height)
   return {floor:q.floor+frame.worldOffset.height,clearance:q.clearance};
 }
 function supportsLayer(layer:Layer,p:R30Point){
  const q=localPass(layer,p);return !!q&&Math.abs(q.floor-p.height)<.02;
 }
 function registerLayer(layer:Layer){
  const bridge=options.bridge!,frame=r30DeepFrames[layer],room=r30DeepRoomProposals[layer];
  if(!bridge.acceptsLayer(layer,frame,room))return false;
  if(!scenes.has(layer)){
   const s=bridge.mountLayer(layer,frame);if(!s)return false;
   if(s.group.parent||s.group.position.lengthSq()>1e-10||Math.abs(s.group.rotation.x)+Math.abs(s.group.rotation.y)+Math.abs(s.group.rotation.z)>1e-8||
      s.group.scale.distanceTo(new Vector3(1,1,1))>1e-8){s.dispose();return false}
   s.group.position.set(frame.worldOffset.east,frame.worldOffset.height,-frame.worldOffset.north);
   s.group.rotation.y=frame.yaw;s.group.visible=false;
   options.parent.add(s.group);scenes.set(layer,s);
  }
  available.add(layer);
  const f=r30DeepWorldFeet[layer];
  if(!supportsLayer(layer,f.entry)||!supportsLayer(layer,f.exit)){
   available.delete(layer);return false;
  }
  return true;
 }
 function sync(){
  if(disposed)return;
  available.clear();openLinks.clear();activeDomain=undefined;acceptedFoot=undefined;
  if(options.seamRegistered&&options.bridge){
   for(const layer of layers)registerLayer(layer);
   for(const link of r30DepthLinks){
    const socket=r30DeepMouths[link.id as LinkId],room=r30LinkRoom(link);
    const from=link.from==='minus140'?
      options.supportsSecondMine(link.start)&&options.bridge.acceptsSecondMineMouth(socket.from):
      link.from==='minus165'&&supportsLayer('minus165',link.start)&&scenes.get('minus165')?.acceptsMouth(socket.from);
    const target=link.to==='minus165'?'minus165':'minus190';
    if(!from||!supportsLayer(target,link.end)||!scenes.get(target)?.acceptsMouth(socket.to)||
      !options.bridge.acceptsLink(link,room))continue;
    if(!corridors.has(link.id)){
     const m=mountR30DepthCorridor(options.parent,link,()=>true);if(m.kind!=='ready')continue;
     corridors.set(link.id,m);
    }
    openLinks.add(link.id);
   }
   const foot=options.readAcceptedFoot?.();acceptedFoot=foot&&{...foot};
   if(foot){
    for(const layer of available)if(foot.domainId===r30DeepDomains[layer]&&includes(r30DeepRoomProposals[layer],foot))activeDomain=foot.domainId;
    for(const link of r30DepthLinks)if(openLinks.has(link.id)&&foot.domainId===r30LinkDomain(link)&&includes(r30LinkRoom(link),foot))activeDomain=foot.domainId;
   }
  }
  // Show adjacent corridor/layer geometry for a physically connected mouth,
  // but never grant its movement query until accepted domain changes.
  for(const [layer,s] of scenes){
   const domain=r30DeepDomains[layer],adjacent=r30DepthLinks.some(l=>openLinks.has(l.id)&&
      (l.from===layer||l.to===layer)&&activeDomain===r30LinkDomain(l));
   s.group.visible=available.has(layer)&&(activeDomain===domain||adjacent);
   if(s.group.visible)s.sync?.();
  }
  const current=acceptedFoot?.domainId;
  for(const [id,c] of corridors){
   const l=c.link;
   c.group.visible=openLinks.has(id)&&(activeDomain===r30LinkDomain(l)||current===r30DeepDomains[l.from]||current===r30DeepDomains[l.to]);
  }
 }
 function preflight(domain:string,p:R30Point){
  if(disposed)return false;
  for(const layer of available)if(domain===r30DeepDomains[layer])return supportsLayer(layer,p);
  for(const link of r30DepthLinks)if(openLinks.has(link.id)&&domain===r30LinkDomain(link)&&includes(r30LinkRoom(link),p)){
   const q=corridors.get(link.id)?.passageAt(p.east,p.north);return !!q&&Math.abs(q.floor-p.height)<.02;
  }
  return false;
 }
 return {sync,contracts:r30DeepTransitContracts,activeDomain:()=>activeDomain,
  availableLayers:()=>[...available],openLinks:()=>[...openLinks],
  supportsArrival:preflight,
  passageAt(domain:string,east:number,north:number,radius=.27,height=1.8){
   if(disposed||activeDomain!==domain||![east,north,radius,height].every(Number.isFinite)||radius<=0||height<=0)return;
   for(const layer of available)if(domain===r30DeepDomains[layer]){
    // The frame height is a room datum, not a floor guess; passageLocal
    // returns the actual support height. Horizontal bounds are sufficient.
    return localPass(layer,{east,north,height:r30DeepFrames[layer].worldOffset.height},radius,height);
   }
   for(const link of r30DepthLinks)if(openLinks.has(link.id)&&domain===r30LinkDomain(link)){
    return corridors.get(link.id)?.passageAt(east,north,radius,height);
   }
  },
  /** Validate one of the physically shared socket pairs. The actual
   * authenticated transition/room switch belongs to the existing owner. */
  resolveHandoff(from:Foot,toDomain:string){
   if(disposed||!acceptedFoot||from.domainId!==acceptedFoot.domainId||!near(from,acceptedFoot,.02))return;
   for(const c of r30DeepTransitContracts){
    if(!openLinks.has(c.id))continue;
    for(const [a,b] of [[c.entry,c.intoLinkFromStart],[c.exit,c.intoLinkFromEnd],[c.intoLinkFromStart,c.entry],[c.intoLinkFromEnd,c.exit]] as const){
     if(from.domainId!==a.domainId||toDomain!==b.domainId||!near(from,a,.45))continue;
     const supported=b.domainId===secondMineDomainId?options.supportsSecondMine(b):preflight(b.domainId,b);
     if(supported)return {from:a,to:b};
    }
   }
  },
  dispose(){if(disposed)return;disposed=true;for(const c of corridors.values())c.dispose();for(const s of scenes.values()){s.group.removeFromParent();s.dispose()}
   corridors.clear();scenes.clear();available.clear();openLinks.clear();activeDomain=undefined},
 } as const;
}
