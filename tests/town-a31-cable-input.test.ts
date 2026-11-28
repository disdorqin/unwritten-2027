import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createA31CableInput} from '../tools/voxel-tavern/town-blockout/town-a31-cable-input';
test('keyboard and touch are exclusive, pry starts once and release never triggers a second action',()=>{
 let action={id:'pry-cable',label:'按住 E'},calls:string[]=[],hold:boolean[]=[];
 const c=createA31CableInput({current:()=>action,invoke:id=>{calls.push(id);return true},hold:h=>hold.push(h)});
 assert.equal(c.down('KeyE'),true);assert.equal(c.down('KeyE',true),true);
 assert.equal(c.down('touch-1'),true);assert.equal(c.up('touch-1'),true);c.tick();assert.equal(hold.at(-1),true);
 assert.equal(c.up('KeyE'),true);assert.equal(hold.at(-1),false);assert.deepEqual(calls,['pry-cable']);
 assert.equal(c.click(),true);action={id:'board-0',label:'登乘'};
 assert.equal(c.down('touch-1'),true);c.tick();assert.equal(hold.at(-1),false);
 c.cancel();assert.equal(c.claimed(),false);assert.equal(c.up('touch-1'),false);
 assert.deepEqual(calls,['pry-cable','board-0']);
});
test('absent actions fall through; rejected selected actions do not trigger another activity',()=>{
 let available=false;
 const c=createA31CableInput({current:()=>available?{id:'exit',label:'下车'}:undefined,invoke:()=>false,hold:()=>{}});
 assert.equal(c.down('KeyE'),false);assert.equal(c.up('KeyE'),false);assert.equal(c.click(),false);
 available=true;assert.equal(c.down('KeyE'),true);assert.equal(c.up('KeyE'),true);assert.equal(c.click(),true);
});
