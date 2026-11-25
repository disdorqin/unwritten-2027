import assert from 'node:assert/strict';
import test from 'node:test';
import {InstancedMesh,MeshStandardMaterial,NearestFilter} from 'three';
import {createWarriorForgeHall,warriorForgeHallSite} from '../tools/voxel-tavern/town-blockout/underground-warrior-forge-hall.js';
import {warriorForgeDressing} from '../tools/voxel-tavern/town-blockout/underground-warrior-forge-dressing.js';

test('batch91 forge is furnished with an empty core seat, water-filled trough and three unfinished boosters',()=>{
  const hall=createWarriorForgeHall();
  try{
    const {pieces,solids,coreSeat,boosterRack,quench}=warriorForgeDressing;
    assert.ok(pieces.length>=450);
    assert.equal(new Set(pieces.map(p=>p.id)).size,pieces.length);
    assert.equal(coreSeat.installed,false);
    assert.equal(boosterRack.collectible,false);
    assert.equal(boosterRack.housings,3);
    for(const prefix of ['core-seat/empty-recess','quench/water','rack/nozzle/','table/anvil','ceiling/rib/','wall/'])
      assert.ok(pieces.some(p=>p.id.startsWith(prefix)),prefix);
    assert.equal(solids.length,2);
    for(const site of [quench,boosterRack]){
      assert.equal(hall.canStand(warriorForgeHallSite.east+site.east,warriorForgeHallSite.north+site.north),false);
    }
    assert.equal(hall.dressing.group.children.length,7);
    for(const mesh of hall.dressing.group.children){
      assert.ok(mesh instanceof InstancedMesh);
      const material=mesh.material as MeshStandardMaterial;
      assert.equal(material.map?.image.width,16);
      assert.equal(material.map?.magFilter,NearestFilter);
      assert.equal(material.map?.minFilter,NearestFilter);
    }
    assert.equal(hall.dressing.group.children.reduce((n,mesh)=>n+(mesh as InstancedMesh).count,0),pieces.length);
  }finally{hall.dispose()}
});

test('batch91 physical furniture leaves the original accepted three-foot routes unchanged',()=>{
  const hall=createWarriorForgeHall();
  try{
    assert.deepEqual(hall.stand,{
      place:{east:140,north:8.99,height:-165},
      stoke:{east:142+3.46,north:4.9+5.86,height:-165},
      collect:{east:144,north:10.91,height:-165},
    });
    const aisle={east:142,north:8.8};
    for(const [a,b] of [[hall.entry,aisle],...Object.values(hall.stand).map(b=>[aisle,b])] as const){
      const steps=Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.05);
      for(let i=0;i<=steps;i++)assert.ok(hall.canStand(a.east+(b.east-a.east)*i/steps,a.north+(b.north-a.north)*i/steps));
    }
    const group=hall.dressing.group;hall.dispose();
    assert.equal(group.parent,null);
  }finally{if(hall.dressing.group.parent)hall.dispose()}
});
