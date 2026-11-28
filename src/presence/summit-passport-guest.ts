import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {createSummitPassportAuthority,type SummitPassportPosition,type SummitPassportStore} from './summit-passport-authority.js';
import {fromSummitPresencePose} from '../shared/za22-summit-presence-domain.js';
import {mountainPresenceNorthOrigin} from '../shared/za22-mountain-domain.js';
import type {SummitPassportAction} from '../shared/summit-passport.js';
export type SummitPassportRoom='town'|'mountain'|'summit';
type Record=Readonly<{east:number;north:number;height:number}>;
/** Only for the passport, not an account, inventory or movement permit.
 * Issued by the server, verified by HMAC across rooms/restarts. A claimed
 * display name, profileKey or arbitrary client UUID cannot identify a player. */
export function createSummitPassportGuestAuthority(secret:Buffer,store:SummitPassportStore){
 if(secret.length!==32)throw Error('Passport secret must contain exactly 32 bytes');
 const sign=(id:string)=>createHmac('sha256',secret).update('summit-passport-v1:'+id).digest('hex');
 const valid=(value:unknown)=>{
  if(typeof value!=='string'||!/^v1\.[0-9a-f]{48}\.[0-9a-f]{64}$/.test(value))return;
  const [,id,mac]=value.split('.') as [string,string,string];
  if(timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(sign(id),'hex')))return id;
 };
 const authority=createSummitPassportAuthority({cloudDeckHeight:347,resolvePosition:()=>undefined,persistence:{resolveProfileKey:()=>undefined,store}});
 return {
  bind(value:unknown){
   const old=valid(value),id=old??randomBytes(24).toString('hex');
   return {profileKey:'guest-passport:'+id,credential:'v1.'+id+'.'+sign(id)};
  },
  request(profileKey:string|undefined,position:SummitPassportPosition|undefined,action:SummitPassportAction){return authority.requestProfile(profileKey,position,action);},
  flush:authority.flush,
 };
}
/** Decode the last server-accepted wire record in its true room frame.
 * This is a location gate, not proof of a native collision-checked hike.
 * Production must explicitly accept this trust model and certify the route
 * before enabling the guest passport. No client event coordinates are read. */
export function summitGuestPassportPosition(room:SummitPassportRoom,record:Record|undefined,ageMs:number,activityPose:number):SummitPassportPosition|undefined{
 if(!record||!Number.isFinite(ageMs)||ageMs<0||ageMs>1500||activityPose!==0)return;
 const p={east:record.east/100,north:record.north/100,height:record.height/100};
 if(!Object.values(p).every(Number.isFinite))return;
 if(room==='summit'){
  const world=fromSummitPresencePose(p);
  if(!world)return;
  return {area:'summit',east:world.east-300,north:world.north-676,height:world.height};
 }
 return {area:'cloud-deck',east:p.east,north:p.north+(room==='mountain'?mountainPresenceNorthOrigin:0),height:p.height};
}
