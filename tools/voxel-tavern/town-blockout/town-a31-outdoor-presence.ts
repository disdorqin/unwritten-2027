import {isMountainPresenceFoot} from '../../../src/shared/za22-mountain-domain';
import {isWestPresenceFoot} from '../../../src/shared/za22-west-domain';
type Foot=Readonly<{east:number;north:number;height:number}>;
type Room='town'|'mountain'|'west';
// The town pose is uint16 centimetres (max 655.35m), not the 800m
// terrain bound. Use one deterministic overlap boundary so two players
// standing at the same foot select the same room. No world teleport.
export const a31OutdoorMountainNorth=650;
export function a31OutdoorRoom(p:Foot):Room|undefined{
 if(![p.east,p.north,p.height].every(Number.isFinite))return;
 if(p.east<0)return isWestPresenceFoot(p.east,p.north,p.height)?'west':undefined;
 if(p.north>=a31OutdoorMountainNorth)return isMountainPresenceFoot(p.east,p.north,p.height)?'mountain':undefined;
 if(p.east<=640&&p.north>=0&&p.height>=0&&p.height<=655.35)return 'town';
}
/** Call only for ordinary outdoor movement (including the actual train
 * seat). Rear summit, underground, home and cable ride have their own owners.
 * The router performs the room handoff before the very same pose is sampled. */
export function syncA31OutdoorRoom(p:Foot,port:{setMountainDomain(enabled:boolean):void;setWestDomain(enabled:boolean):void}){
 const room=a31OutdoorRoom(p);
 if(!room)return false;
 if(room==='mountain')port.setMountainDomain(true);
 else {port.setMountainDomain(false);port.setWestDomain(room==='west');}
 return true;
}
