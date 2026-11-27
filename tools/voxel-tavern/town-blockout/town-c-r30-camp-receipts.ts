type Point=Readonly<{east:number;north:number;height:number;domainId:string}>;
export type R30CampStorySnapshot=Readonly<{
 playerId:string;domainId:string;holdsLamp:boolean;bowlKnown:boolean;litNicheIds:readonly string[];
}>;
export type R30CampStoryBridge=Readonly<{
 read():R30CampStorySnapshot|undefined;
 // Existing catalogue and lamp ledger transactions; never grant locally.
 recordBowl(playerId:string,id:'mine-canteen-left-bowl'):Promise<'recorded'|'already-recorded'|'rejected'>;
 offerLamp(playerId:string,nicheId:string):Promise<boolean>;
 // Public residual budget after the headlamp and other light consumers.
 readLightBudget():number;
}>;
/** Read-only projection of accepted camp story receipts. A lost response
 * cannot cause a locally lit niche or another profile's catalogue state. */
export function createR30CampReceiptReader(bridge:R30CampStoryBridge,niches:ReadonlySet<string>,readFoot:()=>Point|undefined){
 const domain='underground/mine';
 function read(){
  const f=readFoot(),s=bridge.read();
  if(!f||f.domainId!==domain||![f.east,f.north,f.height].every(Number.isFinite)||!s||s.domainId!==domain||
   typeof s.playerId!=='string'||!s.playerId.trim()||typeof s.holdsLamp!=='boolean'||typeof s.bowlKnown!=='boolean'||
   !Array.isArray(s.litNicheIds)||s.litNicheIds.some(id=>!niches.has(id))||new Set(s.litNicheIds).size!==s.litNicheIds.length)return;
  return s;
 }
 function canOffer(id:string){
  const s=read();return !!s&&s.holdsLamp&&niches.has(id)&&!s.litNicheIds.includes(id);
 }
 return {read,canOffer,
  lights(){
   const s=read(),budget=s?bridge.readLightBudget():0;
   return {litNicheIds:new Set(s?.litNicheIds??[]),extraCampLightCount:(s?.litNicheIds.length??0)>=3?2:0,
    remainingBudget:Number.isFinite(budget)?Math.min(4,Math.max(0,Math.floor(budget))):0};
  },
  async recordBowl(id:string){
   const s=read();if(!s||id!=='mine-canteen-left-bowl')return 'rejected' as const;
   if(s.bowlKnown)return 'already-recorded' as const;
   const result=await bridge.recordBowl(s.playerId,id);
   if(read()?.playerId!==s.playerId)return 'rejected' as const;
   return result==='recorded'||result==='already-recorded'?result:'rejected' as const;
  },
  async offerLamp(id:string){
   const s=read();if(!s||!canOffer(id))return false;
   const ok=await bridge.offerLamp(s.playerId,id);
   return ok===true&&read()?.playerId===s.playerId;
  }
 };
}
