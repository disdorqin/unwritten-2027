import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, PointLight, Matrix4, Vector3 } from 'three';
import {createZa36CableRepair} from '../src/shared/za36-cable-repair';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { mountMainSummitCableWorkshop } from '../tools/voxel-tavern/town-blockout/main-summit-cable-workshop';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';

test('R2: new ropeway workshop has a roof, real 2.3-m clear door, machinery and lit forecourt', t => {
  const block = createMainSummitBlock(mainSummitLayout, 347, 100);
  t.after(block.dispose);
  const root = new Group();
  const workshop = mountMainSummitCableWorkshop(root, block.heightAt);
  t.after(workshop.dispose);
  assert.equal(workshop.group.parent, root);
  assert.equal(workshop.group.name, 'main-summit-cable-machine-workshop');
  assert.ok(workshop.pieceCount > 200);
  assert.ok(workshop.drawBudget <= 7);
  assert.equal(workshop.lights.length, 2);
  assert.ok(workshop.lights.every(light => light instanceof PointLight && light.intensity > 0));
  assert.ok(workshop.group.children.filter(child => child instanceof InstancedMesh).length >= 6);
  assert.ok(workshop.text.includes('缆车二线检修房'));

  // The P-7 lower station begins at E=-10. All workshop solids stay E<=-16.
  for (let n = 6.2; n <= 7.8; n += .2) {
    for (let e = -14; e >= -25; e -= .2) {
      const blocked = workshop.blocked(e, n, 347, .27, 1.8);
      assert.equal(blocked, false, 'Workshop central 2.3-m entrance/aisle blocked at ' + [e,n]);
    }
  }
  assert.ok(workshop.blocked(-16.45, 11.6, 347, .27, 1.8), 'Front wall must be solid');
  assert.equal(workshop.surfaceAt(-21, 7), 347.065);
  assert.equal(workshop.surfaceAt(-9, 7), undefined, 'Existing station surface owned by P-7');
  workshop.dispose();
  assert.equal(root.children.length, 0);
});

test('line two machine room renders authoritative repair progress and offers reachable actions',t=>{
 const root=new Group(),workshop=mountMainSummitCableWorkshop(root,()=>347),authority=createZa36CableRepair(2);
 t.after(workshop.dispose);
 const anchors=workshop.repairAnchors,feet=(id:keyof typeof anchors)=>({...anchors[id],height:347.065});
 const brake=workshop.group.getObjectByName('night-b-line2-rust-brake')!;
 const pulley=workshop.group.getObjectByName('night-b-line2-slack-pulley')!;
 const weights=workshop.group.getObjectByName('night-b-line2-repair-weights') as InstancedMesh;
 const matrix=new Matrix4(),p=new Vector3();const weight=(i:number)=>{weights.getMatrixAt(i,matrix);return p.setFromMatrixPosition(matrix).clone()};
 const start=weight(0);
 for(const id of Object.keys(anchors) as (keyof typeof anchors)[])assert.equal(workshop.blocked(feet(id).east,feet(id).north,347.065,.27,1.8),false,id);
 assert.deepEqual(workshop.repairActions(feet('brake')),[]);
 authority.apply({kind:'wake',impact:'sled'});workshop.sync(authority.snapshot());
 function act(id:keyof typeof anchors,kind:string){const action=workshop.repairActions(feet(id)).find(a=>a.id===kind);assert.ok(action,kind);assert.equal(authority.apply(action.event).accepted,true);workshop.sync(authority.snapshot());}
 for(let i=0;i<9;i++)act('brake','strike-rust');
 act('brake','pull-brake');assert.ok(brake.rotation.z< -2);
 act('cableWheel','pry-cable');assert.ok(pulley.position.y>2);
 for(let i=0;i<3;i++)act('cableWheel','tighten-cable');
 for(let i=0;i<4;i++){act('weightTower','take-weight');weights.getMatrixAt(i,matrix);assert.equal(matrix.elements[0],0);act('weightFrame','hang-weight');assert.ok(weight(i).z<0);}
 assert.notDeepEqual(weight(0),start);assert.equal(authority.snapshot().stage,'full-line');
 assert.deepEqual(workshop.repairActions(feet('weightTower')),[]);
 workshop.sync(undefined);assert.deepEqual(workshop.repairActions(feet('brake')),[]);
});

test('R7: ordinary player world mounts no unapproved new expedition scenery or puzzles', t => {
  const root = new Group();
  const assembly = mountMainSummitAssembly(root, 0);
  t.after(assembly.dispose);
  assert.equal(assembly.expedition, undefined);
  assert.equal(assembly.workshop, undefined);
  assert.equal(assembly.cloudBells, undefined);
  assert.equal(assembly.plaques, undefined);
  assert.equal(assembly.expeditionDynamics, undefined);
  assert.equal(assembly.expeditionActivities, undefined);
  assert.equal(assembly.group.getObjectByName('main-summit-expedition-sites'), undefined);
  assert.equal(assembly.group.getObjectByName('main-summit-cable-machine-workshop'), undefined);
  assert.equal(assembly.group.getObjectByName('main-summit-nine-cloud-bell-array'), undefined);
  assert.deepEqual(assembly.mountedParts(), ['P-1', 'P-2', 'P-3', 'P-4', 'P-7', 'P-8', 'P-9']);
});

test('R3: live main summit mounts scenery in same local survey without damaging P-7 dock', t => {
  const root = new Group();
  const assembly = mountMainSummitAssembly(root, 0, undefined, { expeditionPreview: true });
  t.after(assembly.dispose);
  assert.ok(assembly.expedition && assembly.workshop && assembly.cloudBells,
    'The review must require explicit candidate opt-in');
  assert.equal(assembly.expedition.group.parent, assembly.group);
  assert.equal(assembly.workshop.group.parent, assembly.group);
  assert.equal(assembly.mountedParts().length, 7, 'Approved original P-1/2/3/4/7/8/9 stay present');
  assert.equal(assembly.trailSurfaceAt(-21, 7), 347.065);
  assert.ok(!assembly.blocked(-17, 7, 347, .27, 1.8),
    'The new hall entrance remains open in the actual host geometry');
  assert.ok(!assembly.blocked(-12, 7, 347, .27, 1.8),
    'Walk from machine shop to P-7 station remains clear');
  assert.ok(assembly.workshop.lights.length === 2);
});
