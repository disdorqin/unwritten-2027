import assert from 'node:assert/strict';
import {test} from 'node:test';
import {a31OutdoorRoom,syncA31OutdoorRoom,a31OutdoorMountainNorth} from '../tools/voxel-tavern/town-blockout/town-a31-outdoor-presence';
import {writePresencePose} from '../tools/voxel-tavern/town-blockout/town-presence-motion';
import {mountainPresenceNorthOrigin} from '../src/shared/za22-mountain-domain';
test('ordinary northern routes select the real mountain frame before uint16 saturation',()=>{
 const p={east:300,north:752,height:87.5};
 assert.equal(a31OutdoorRoom(p),'mountain');
 const data=new DataView(new ArrayBuffer(12));
 writePresencePose({...p,north:p.north-mountainPresenceNorthOrigin,yaw:0},1,data);
 assert.equal(data.getUint16(4,true)/100+mountainPresenceNorthOrigin,p.north);
 assert.equal(a31OutdoorRoom({...p,north:a31OutdoorMountainNorth-.01}),'town');
 assert.equal(a31OutdoorRoom({...p,north:a31OutdoorMountainNorth}),'mountain');
 assert.equal(a31OutdoorRoom({...p,north:800.1}),undefined);
 assert.equal(a31OutdoorRoom({...p,height:800}),undefined);
});
test('front-to-town and west round trip chooses the correct room without changing feet',()=>{
 let room='town';const calls:string[]=[];
 const port={setMountainDomain(on:boolean){calls.push('m:'+on);if(on)room='mountain';else if(room==='mountain')room='town';},
 setWestDomain(on:boolean){calls.push('w:'+on);if(on&&room!=='mountain')room='west';else if(!on&&room==='west')room='town';}};
 for(const [p,want] of [[{east:300,north:666,height:347},'mountain'],[{east:300,north:649,height:347},'town'],[{east:-40,north:159,height:10.78},'west'],[{east:2,north:159,height:10.8},'town']] as const){
  const before={...p};assert.equal(syncA31OutdoorRoom(p,port),true);assert.equal(room,want);assert.deepEqual(p,before);
 }
 const count=calls.length;assert.equal(syncA31OutdoorRoom({east:300,north:801,height:347},port),false);assert.equal(calls.length,count);
});
