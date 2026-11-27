import {
  BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshLambertMaterial, MeshBasicMaterial, Object3D, PointLight, TorusGeometry,
} from 'three';

import {createCableRepairHost, type RepairAnchors} from './town-cable-repair-host';
import {r30WorkshopAnchor,r30WorkshopRepairAnchors} from '../../../src/shared/za22-summit-repair-position';
import type {Za36CableRepairState} from './town-za36-cable-repair';

type GroundAt = (east: number, north: number) => number | undefined;
type Family = 'stone' | 'wood' | 'tile' | 'bronze' | 'iron' | 'snow' | 'glow';
type Part = { family: Family; tint: string; x: number; y: number; z: number; w: number; h: number; d: number };
type Solid = { x: number; z: number; w: number; d: number; low: number; high: number };
export const mainSummitCableWorkshopAnchor = Object.freeze({east:-21,north:7,floor:347});
/** The old expedition hall overlaps the R30 rope sweep. The new hall is
 * north of the lower dock, on the same surveyed terrace. */
export const mainSummitR30CableWorkshopAnchor=r30WorkshopAnchor;
type WorkshopAnchor=Readonly<{east:number;north:number;floor:number}>;

/**
 * Complete second-line workshop beside the certified P-7 cloud station.
 * Local +Z is east, facing the station's west service door. The original
 * station footprint E[-10,-3], N[-2.5,15] remains wholly unmodified.
 */
export function mountMainSummitCableWorkshop(owner: Group, groundAt: GroundAt, anchor:WorkshopAnchor=mainSummitCableWorkshopAnchor) {
  if (Math.abs((groundAt(anchor.east, anchor.north) ?? Infinity) - anchor.floor) > .01) {
    throw new RangeError('The workshop needs the certified 347 m cloud terrace');
  }
  if(anchor===mainSummitR30CableWorkshopAnchor){
    for(let x=-5.4;x<=5.4;x+=.3)for(let z=-4.7;z<=10.7;z+=.3){
      if(Math.abs(x)>1.2&&z>4.7)continue;
      const h=groundAt(anchor.east+z,anchor.north+x);
      if(h===undefined||!Number.isFinite(h)||Math.abs(h-anchor.floor)>.04)throw new RangeError('R30 workshop footprint or service path lacks canonical support');
    }
  }
  const group = new Group();
  group.name = 'main-summit-cable-machine-workshop';
  group.position.set(anchor.east, anchor.floor, -anchor.north);
  group.rotation.y = Math.PI / 2;
  owner.add(group);
  const buckets: Record<Family, Part[]> = {
    stone: [], wood: [], tile: [], bronze: [], iron: [], snow: [], glow: [],
  };
  const solids: Solid[] = [];
  const palette = {
    stone: ['#697982', '#87949a', '#4b5d67'],
    wood: ['#49392f', '#795641', '#a17b52'],
    tile: ['#344855', '#4d6270', '#5f7684'],
    bronze: ['#a77c46', '#d0aa6d', '#e6c694'],
    iron: ['#3c464c', '#606d72'],
    snow: ['#cad7dc', '#e2e6e7'],
    glow: ['#e8b574', '#ffdfa5'],
  } as const;
  function part(family: Family, tint: string, x: number, y: number, z: number,
    w: number, h: number, d: number) {
    buckets[family].push({ family, tint, x, y, z, w, h, d });
  }
  function solid(x: number, z: number, w: number, d: number, low: number, high: number) {
    solids.push({ x, z, w, d, low, high });
  }
  // R1 body: fully sealed rear and gables, 2.3 m genuine opening in the front.
  part('stone', palette.stone[0], 0, -.19, 0, 10.8, .38, 9.4);
  for (let i = 0; i < 24; i++) {
    part('wood', palette.wood[i % 3]!, -4.8 + i * .42, .035, 0, .40, .07, 8.93);
  }
  for (const z of [-4.55, 4.55]) {
    if (z < 0) {
      part('stone', palette.stone[0], 0, 1.5, z, 10.4, 3, .37);
      solid(0, z, 10.4, .37, 0, 3);
    } else {
      for (const side of [-1, 1]) {
        part('stone', palette.stone[1], side * 3.16, 1.52, z, 4.05, 3.04, .37);
        solid(side * 3.16, z, 4.05, .37, 0, 3.04);
      }
      part('wood', palette.wood[0], 0, 3.17, z, 2.27, .42, .41);
      part('bronze', palette.bronze[1], 0, 3.45, z + .28, 2.15, .11, .12);
    }
  }
  for (const x of [-5.18, 5.18]) {
    part('stone', palette.stone[0], x, .61, 0, .38, 1.22, 8.85);
    // Window bays (glazing is deliberately thin and translucent blue, not white walls).
    for (const z of [-3.7, -.7, 2.4, 3.75]) {
      part('wood', palette.wood[0], x, 2.12, z, .42, 2.62, .29);
      part('iron', palette.iron[1], x, 2.20, z + .41, .13, .27, .17);
    }
    part('wood', palette.wood[0], x, 3.52, 0, .44, .30, 8.85);
    solid(x, 0, .38, 8.85, 0, 3.1);
  }
  for (let course = 0; course < 11; course++) {
    for (const side of [-1, 1]) {
      const x = side * (5.55 - course * .48);
      const y = 3.77 + course * .212;
      part('tile', palette.tile[course % 3]!, x, y, 0, .94, .23, 9.7);
      if (course % 3 === 0) part('snow', palette.snow[1], x, y + .135, 0, .96, .07, 9.67);
    }
  }
  part('wood', palette.wood[0], 0, 6.23, 0, .41, .28, 9.9);
  for (const x of [-4.86, 4.86]) for (const z of [-4.24, 4.24]) {
    part('wood', palette.wood[0], x, 1.82, z, .31, 3.64, .29);
    part('bronze', palette.bronze[1], x, 3.66, z, .43, .12, .42);
  }

  // R2 interior: two actual independently detailed 24-tooth pulley wheels,
  // clutch drums, gear spokes, driven shafts and suspended counterweight.
  for (const [index, wheelZ] of [-2.28, 1.25].entries()) {
    const wheelX = -3.45 + index * .23;
    part('stone', palette.stone[2], wheelX, .30, wheelZ, 3.24, .45, 2.6);
    solid(wheelX, wheelZ, 3.15, 2.55, 0, 3.54);
    part('wood', palette.wood[0], wheelX, 1.45, wheelZ, .52, 2.5, .53);
    for (let tooth = 0; tooth < 24; tooth++) {
      const theta = tooth * Math.PI / 12;
      const x = wheelX + 1.22 * Math.cos(theta);
      const y = 2.22 + 1.22 * Math.sin(theta);
      part('bronze', palette.bronze[tooth % 3]!, x, y, wheelZ, .36, .34, .43);
    }
    for (let spoke = 0; spoke < 8; spoke++) {
      const theta = spoke * Math.PI / 4;
      part('wood', palette.wood[2], wheelX + Math.cos(theta) * .64,
        2.22 + Math.sin(theta) * .64, wheelZ, .23, .25, .27);
    }
    part('bronze', palette.bronze[0], wheelX, 2.22, wheelZ, .52, .52, .94);
  }
  for (let chain = 0; chain < 12; chain++) {
    part('iron', palette.iron[0], 1.9, 1.2 + chain * .23, -3.18, .14, .19, .15);
  }
  part('stone', palette.stone[1], 1.9, .67, -3.18, .88, 1.34, .85);
  solid(1.9, -3.18, .88, .85, 0, 1.36);
  for (const x of [2.5, 4.06]) {
    part('wood', palette.wood[1], x, .46, -1.9, .39, .92, 2.18);
    solid(x, -1.9, .39, 2.18, 0, 1.1);
    part('bronze', palette.bronze[1], x, 1.03, -1.9, .45, .15, 2.25);
  }
  for (let i = 0; i < 20; i++) {
    part(i % 4 === 0 ? 'bronze' : 'wood',
      i % 4 === 0 ? palette.bronze[0] : palette.wood[i % 3]!,
      2.4 + (i % 5) * .44, 1.08 + Math.floor(i / 5) * .26, -3.62 + (i % 3) * .22,
      .27, .22, .26);
  }
  for (let i = 0; i < 16; i++) {
    part('wood', palette.wood[i % 3]!, 2.7 + (i % 4) * .41, .22, 1.18 + Math.floor(i / 4) * .52,
      .39, .40, .37);
  }
  // R4/5: a readable, not empty, approach forecourt and four material families.
  for (let step = 0; step < 16; step++) {
    part('stone', palette.stone[step % 3]!, 0, -.035, 4.80 + step * .39, 2.36, .13, .38);
  }
  for (const x of [-3.7, 3.7]) {
    part('wood', palette.wood[0], x, 2.45, 4.18, .22, 1.37, .22);
    part('glow', palette.glow[1], x, 2.49, 4.38, .22, .32, .16);
    part('bronze', palette.bronze[1], x, 2.72, 4.20, .40, .09, .34);
  }
  const crateText = Object.freeze([
    '缆车二线检修房', '锈闸—轮组—配重', '先验后开车', '停机时请走山路',
  ] as const);
  part('wood', palette.wood[0], 0, 2.28, 4.8, 2.36, .57, .22);
  for (let i = 0; i < 3; i++) part('bronze', palette.bronze[i]!, -.55 + i * .52, 2.30, 4.93, .31, .08, .11);

  const cube = new BoxGeometry(1, 1, 1);
  const transform = new Object3D();
  const color = new Color();
  const meshes: InstancedMesh[] = [];
  for (const family of Object.keys(buckets) as Family[]) {
    const voxels = buckets[family];
    if (!voxels.length) continue;
    const material = family === 'glow' ? new MeshBasicMaterial({ color: '#ffffff' })
      : new MeshLambertMaterial({ color: '#ffffff' });
    const mesh = new InstancedMesh(cube, material, voxels.length);
    mesh.name = 'summit-workshop-' + family;
    for (const [index, part] of voxels.entries()) {
      transform.position.set(part.x, part.y, part.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(part.w, part.h, part.d);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, color.set(part.tint));
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }
  const lights: PointLight[] = [];
  for (const x of [-3.7, 3.7]) {
    const point = new PointLight('#f8ca87', 2.4, 12, 2);
    point.position.set(x, 2.5, 4.5);
    point.name = 'workshop-visible-source-light';
    lights.push(point);
    group.add(point);
  }
  // Repair pieces are independent of the static instance batches: the
  // authority drives the handle, pulley lift, and each actual weight.
  const faultMaterial=new MeshLambertMaterial({color:'#a56e41'}),weightMaterial=new MeshLambertMaterial({color:'#7e8589'});
  const wheelGeometry=new TorusGeometry(.58,.075,6,16);
  const brake=new Mesh(wheelGeometry,faultMaterial);brake.name='night-b-line2-rust-brake';brake.position.set(-1.92,1.48,-2.28);group.add(brake);
  const pulley=new Mesh(wheelGeometry,faultMaterial);pulley.name='night-b-line2-slack-pulley';pulley.position.set(-1.92,1.65,1.25);group.add(pulley);
  const weightMesh=new InstancedMesh(cube,weightMaterial,4);weightMesh.name='night-b-line2-repair-weights';weightMesh.frustumCulled=false;group.add(weightMesh);
  const global=(x:number,z:number)=>({east:anchor.east+z,north:anchor.north+x});
  const repairAnchors:RepairAnchors=anchor===mainSummitR30CableWorkshopAnchor?r30WorkshopRepairAnchors:Object.freeze({brake:global(-1.25,-2.28),cableWheel:global(-1.25,1.25),weightTower:global(1.25,2.2),weightFrame:global(.8,-2.8)});
  const repair=createCableRepairHost(2,repairAnchors);
  let state:Za36CableRepairState|undefined;
  function sync(next:Za36CableRepairState|undefined){
    if(next?.line!==2)next=undefined;
    if(state&&next&&next.version<state.version)return;
    state=next;if(next)repair.sync(next);
    brake.rotation.z=-(next?.impacts??0)*.12-(next?.brakePulled?1.15:0);
    faultMaterial.color.set(next?.brakePulled?'#b8a077':'#a56e41');
    pulley.position.y=1.65+.58*(next?.cableHeight??0);
    pulley.rotation.set(0,0,.38*(1-(next?.cableHeight??0))+(next?.cableTurns??0)*Math.PI*2/3);
    for(let i=0;i<4;i++){
      const hung=next?.weightMounted[i],carried=next?.carriedWeight===i;
      transform.position.set(hung?2.06:2.48+i*.60,hung?.55+i*.43:.30,hung?-3.18:2.95);
      transform.rotation.set(0,0,0);transform.scale.set(carried?0:.48,carried?0:.42,carried?0:.49);transform.updateMatrix();weightMesh.setMatrixAt(i,transform.matrix);
    }
    weightMesh.instanceMatrix.needsUpdate=true;
  }
  sync(undefined);
  function coordinates(east: number, north: number) {
    // Workshop yaw=PI/2, so +local Z is east and +local X is north.
    return { x: north - anchor.north, z: east - anchor.east };
  }
  let disposed = false;
  return {
    group, lights, repairAnchors, sync, anchor,
    repairActions(feet:{east:number;north:number;height:number}){
      if(!state||!Number.isFinite(feet.height)||Math.abs(feet.height-anchor.floor)>.43)return [];
      const {x,z}=coordinates(feet.east,feet.north);
      if(Math.abs(x)>4.85||Math.abs(z)>4.1||solids.some(w=>Math.abs(x-w.x)<w.w/2+.27&&Math.abs(z-w.z)<w.d/2+.27&&w.low<1.8&&w.high>.065))return [];
      return repair.actions(state,feet);
    },
    pieceCount: Object.values(buckets).reduce((sum, v) => sum + v.length, 0),
    drawBudget: meshes.length, text: crateText,
    surfaceAt(east: number, north: number, radius = .27) {
      if (![east, north, radius].every(Number.isFinite) || radius < 0 || radius > .5) return;
      const { x, z } = coordinates(east, north);
      if (Math.abs(x) <= 4.95 - radius && Math.abs(z) <= 4.2 - radius) return anchor.floor + .065;
      if (Math.abs(x) <= 1.17 - radius && z >= 4.62 && z <= 10.70) {
        return groundAt(east, north);
      }
    },
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (![east, north, feet, radius, bodyHeight].every(Number.isFinite)) return true;
      const { x, z } = coordinates(east, north);
      return solids.some(wall => feet + bodyHeight > anchor.floor + wall.low + .02 &&
        feet < anchor.floor + wall.high - .02 &&
        Math.abs(x - wall.x) < wall.w / 2 + radius &&
        Math.abs(z - wall.z) < wall.d / 2 + radius);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes) {
        mesh.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) for (const value of material) value.dispose();
        else (material as MeshLambertMaterial).dispose();
      }
      weightMesh.dispose();wheelGeometry.dispose();faultMaterial.dispose();weightMaterial.dispose();
      cube.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
