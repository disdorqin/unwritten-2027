import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,InstancedMesh,Matrix4,Vector3,Color} from 'three';
import {createZa36CableRepair} from '../src/shared/za36-cable-repair';
import {mountNightBFrontRepairProps} from '../tools/voxel-tavern/town-blockout/town-night-b-front-repair-props';
const anchors={brake:{east:0,north:0},cableWheel:{east:10,north:0},weightTower:{east:20,north:0},weightFrame:{east:30,north:0}};
const cablePath=[{east:0,north:100,height:26},{east:40,north:100,height:26}];
test('physical front repair fixtures share one authoritative version, deform slack and transfer each real weight',()=>{
 const owner=new Group(),r=mountNightBFrontRepairProps({owner,anchors,cablePath,supportAt:()=>26,blocked:()=>false});
 assert.ok(r.ready);assert.equal(owner.children.length,1);assert.equal(r.group.children.length,4);
 for(const site of r.sites){assert.deepEqual(r.anchors[site.key],{east:site.east,north:site.north});assert.ok(r.blocked(site.east,site.north,site.height));}
 const moving=(key:keyof typeof anchors)=>r.group.getObjectByName('night-b-front-fault-'+key)!.getObjectByName('repair-authoritative-parts') as InstancedMesh;
 const mat=new Matrix4(),v=new Vector3(),col=new Color();
 const center=(key:keyof typeof anchors,i:number)=>{moving(key).getMatrixAt(i,mat);return new Vector3().setFromMatrixPosition(mat);};
 const scale=(key:keyof typeof anchors,i:number)=>{moving(key).getMatrixAt(i,mat);return v.setFromMatrixScale(mat).length();};
 const color=(key:keyof typeof anchors,i:number)=>{moving(key).getColorAt(i,col);return col.getHexString();};
 const authority=createZa36CableRepair(1),send=(event:Parameters<typeof authority.apply>[0])=>{const out=authority.apply(event);assert.ok(out.accepted);r.sync(out.state);};
 const initialColor=color('brake',0),initialSlack=center('cableWheel',15).y;
 assert.ok(scale('weightTower',0)>0);assert.equal(scale('weightFrame',0),0);
 send({kind:'wake',impact:'sled'});
 for(let i=0;i<9;i++)send({kind:'strike-rust'});
 assert.notEqual(color('brake',0),initialColor);
 send({kind:'pull-brake'});assert.ok(center('brake',10).y<1);
 send({kind:'pry-cable',effort:.5});assert.ok(center('cableWheel',15).y>initialSlack);
 const raised=center('cableWheel',15).y;
 send({kind:'release-cable'});assert.ok(center('cableWheel',15).y<raised);
 send({kind:'pry-cable',effort:.75});for(let i=0;i<3;i++)send({kind:'tighten-cable'});
 for(let i=0;i<4;i++){send({kind:'take-weight',index:i});assert.equal(scale('weightTower',i),0);assert.equal(scale('weightFrame',i),0);send({kind:'hang-weight',index:i});assert.ok(scale('weightFrame',i)>0);}
 assert.equal(authority.snapshot().stage,'full-line');assert.equal(r.group.userData.repairVersion,authority.snapshot().version);
 r.sync(createZa36CableRepair(1).snapshot());assert.equal(r.group.userData.repairVersion,authority.snapshot().version);
 assert.equal(scale('weightTower',0),0);assert.ok(scale('weightFrame',0)>0);
 r.sync(undefined);assert.ok(scale('weightFrame',0)>0);
 // A new authority lifetime can start at version zero after a gap.
 r.sync(createZa36CableRepair(1).snapshot());assert.ok(scale('weightTower',0)>0);assert.equal(scale('weightFrame',0),0);
 r.dispose();r.dispose();assert.equal(owner.children.length,0);assert.equal(r.blocked(r.sites[0]!.east,r.sites[0]!.north,26),false);
});
test('fixture placement refuses incomplete surface or swept cabin corridor without mounting partial bodies',()=>{
 const owner=new Group();
 assert.deepEqual(mountNightBFrontRepairProps({owner,anchors,cablePath,supportAt:()=>undefined,blocked:()=>false}),{ready:false,reason:'repair-fixture-site:brake'});
 assert.deepEqual(mountNightBFrontRepairProps({owner,anchors,cablePath:[],supportAt:()=>26,blocked:()=>false}),{ready:false,reason:'repair-fixture-missing-cable-survey'});
 const badPath=Array.from({length:11},(_,i)=>({east:0,north:i*.5-2.5,height:26}));
 const rejected=mountNightBFrontRepairProps({owner,anchors,cablePath:badPath,supportAt:()=>26,blocked:()=>false});
 assert.equal(rejected.ready,false);assert.equal(owner.children.length,0);
});
