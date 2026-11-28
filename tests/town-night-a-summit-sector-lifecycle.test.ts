import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {mountSouthSector} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-sector';
test('south sector release cannot retain old blocking geometry or route support',()=>{
 const owner=new Group(),s=mountSouthSector({heightAt:()=>347,reserved:()=>false,legacySouthVegetationExcluded:true});
 owner.add(s.group);
 assert.ok(s.blocked(24,23,347));assert.ok(s.group.children.length>=3);
 s.dispose();s.dispose();s.updateView(0,0);s.setNight(true);
 assert.equal(owner.children.length,0);assert.equal(s.group.children.length,0);
 assert.equal(s.blocked(24,23,347),false);assert.equal(s.supportAt(24,23),undefined);
});
