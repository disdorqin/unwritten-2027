import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {readA31FrontCable,readA31UpperCable,type A31FrontCableOwner,type A31RearCableOwner} from '../tools/voxel-tavern/town-blockout/town-a31-cable-binding';
// Narrow ownership fixtures only. They cannot certify a real cable route.
test('only the installed owner can publish its exact accepted front operation',()=>{
 const root=new Group(),group=new Group();root.add(group);
 const facilities={group} as NonNullable<A31FrontCableOwner['facilities']>;
 const op={ready:true,facilities,service:{physical:true}} as NonNullable<A31FrontCableOwner['frontOperation']>;
 const p={east:1,north:2};const repair={anchors:{brake:p,cableWheel:p,weightTower:p,weightFrame:p},surfaceAt:()=>347,clear:()=>true};
 const owner={transportReady:true,facilities,frontOperation:op,frontRepair:repair};
 assert.deepEqual(readA31FrontCable({...owner,transportReady:false}),{});
 assert.deepEqual(readA31FrontCable({...owner,facilities:{...facilities}}),{});
 assert.deepEqual(readA31FrontCable({...owner,frontRepair:undefined}),{});
 assert.deepEqual(readA31FrontCable({...owner,frontRepair:{...repair,anchors:{...repair.anchors,brake:{east:NaN,north:2}}}}),{});
 assert.equal(readA31FrontCable(owner).front,op);
 group.removeFromParent();assert.deepEqual(readA31FrontCable(owner),{});
});
test('rear owner must have certified slot and both real mounted asset identities',()=>{
 const root=new Group(),ropeway=new Group(),workshop=new Group();root.add(ropeway,workshop);
 const op={ready:true,service:{physical:true},ropeway:{group:ropeway},workshop:{group:workshop}} as NonNullable<A31RearCableOwner['cableOperation']>;
 const state={installed:true,certified:true,boardable:true};
 const owner={group:root,cableState:()=>state,cableOperation:op};
 assert.equal(readA31UpperCable(owner),op);
 state.boardable=false;assert.equal(readA31UpperCable(owner),undefined);
 state.boardable=true;workshop.removeFromParent();assert.equal(readA31UpperCable(owner),undefined);
 assert.equal(readA31UpperCable({...owner,cableOperation:undefined}),undefined);
});
