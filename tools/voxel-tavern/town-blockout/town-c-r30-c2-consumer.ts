import {createTownC2R30DeepBridge} from './town-c2-r30-deep-bridge.js';
import {r30DeepDomains,r30LinkDomain,type R30DeepAssemblyBridge,type R30DeepMouth} from './town-c-r30-deep-assembly.js';
import type {R30LayerFrame,R30DepthLink,R30Point} from './town-c-r30-deep-layer-contract.js';
type Room=Readonly<{origin:R30Point;bounds:Readonly<{width:number;depth:number;height:number}>}>;
/** Existing A/total-control room registry only. Geometry certification and
 * room acceptance are independent. No room is minted by this adapter. */
export type R30DeepRoomPort=Readonly<{
 acceptsRoom(domainId:string,room:Room):boolean;
 acceptsFrame(layer:R30LayerFrame['layer'],frame:R30LayerFrame):boolean;
 acceptsLink(link:R30DepthLink):boolean;
 readNight?:()=>boolean;
 readLightBudget?:()=>number;
}>;
export function createR30C2Consumer(port:R30DeepRoomPort,secondMine:Readonly<{acceptsMouth(mouth:unknown):boolean}>){
 const c2=createTownC2R30DeepBridge({secondMine,readNight:port.readNight,readLightBudget:port.readLightBudget});
 const bridge:R30DeepAssemblyBridge={
  acceptsLayer(layer,frame,room){
   return port.acceptsFrame(layer,frame)===true&&port.acceptsRoom(r30DeepDomains[layer],room)===true&&c2.acceptsLayer(layer,frame,room);
  },
  mountLayer(layer,frame){
   if(port.acceptsFrame(layer,frame)!==true)return;
   const scene=c2.mountLayer(layer,frame);if(!scene)return;
   // These pinned shell mouths are immutable for this mount. Cache only
   // physical geometry probes, never the live room/frame/link acceptance.
   const mouths=new Map<string,boolean>();let disposed=false;
   return {...scene,acceptsMouth(mouth){
    if(disposed)return false;
    const key=[mouth.layer,mouth.axis,mouth.at,mouth.centre,mouth.width,mouth.height].join('/');
    if(!mouths.has(key))mouths.set(key,scene.acceptsMouth(mouth));
    return mouths.get(key)===true;
   },dispose(){if(disposed)return;disposed=true;mouths.clear();scene.dispose()}};
  },
  acceptsSecondMineMouth(mouth:R30DeepMouth){return c2.acceptsSecondMineMouth(mouth)},
  acceptsLink(link,room){
   return port.acceptsLink(link)===true&&port.acceptsRoom(r30LinkDomain(link),room)===true&&c2.acceptsLink(link,room);
  },
 };
 return {bridge,stats:c2.stats,dispose:c2.dispose} as const;
}
