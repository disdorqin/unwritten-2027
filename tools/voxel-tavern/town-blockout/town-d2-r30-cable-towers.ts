import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshLambertMaterial,
  StaticDrawUsage,
} from 'three';
import { createMainSummitCable } from './main-summit-cable';
import { sampleTownD2R30Height } from './town-d2-r30-domain';
import {surveyNightBLatticeFoot,buildNightBLatticeMembers,nightBLatticeBlocked,type LatticeFoot} from './town-night-b-summit-lattice';

type SummitCable = ReturnType<typeof createMainSummitCable>;

/**
 * D2-R02: dense, terrain-supported towers for the canonical 1920 m line-two
 * cable on the R30 massif. The rope survey, cabin physics and station geometry
 * are untouched; this module only adds solid towers between rope and ground.
 * Every tower base sits on the R30 height field and every top reaches the rope,
 * so the line is never a floating wire over a 150 m void.
 *
 * D2-R10 (2026-11-25): the towers ship as three instanced batches (mast,
 * crossbar, brace) instead of 90 individual meshes. The per-tower transforms,
 * radii and heights are unchanged — only the draw submission is collapsed, so
 * a 1,920 m ropeway line no longer costs 90 draw calls for 1,452 triangles.
 */
export type TownD2R30CableTowersOptions = Readonly<{
  cable?: SummitCable;
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
  /** Metres between towers along the rope (default 60). */
  spacing?: number;
}>;

export type TownD2R30CableTowersStats = Readonly<{
  towers: number;
  spacing: number;
  ropeMetres: number;
  maxTowerHeight: number;
  minClearance: number;
  drawCalls: number;
  triangles: number;
  skipNearStation: number;
  westTowers: number;
  foundations: number;
  latticeMembers:number;
}>;

const DEFAULTS = Object.freeze({ spacing: 60, skipNearStation: 45, towerTop: .35, ropeHalfSpan: 3 });

export function createTownD2R30CableTowers(options: TownD2R30CableTowersOptions = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const spacing = options.spacing ?? DEFAULTS.spacing;
  if (!Number.isFinite(arrivalHeight) || !Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError('Invalid D2-R02 cable tower parameters.');
  }
  const cable = options.cable ?? createMainSummitCable(0, 10_000, arrivalHeight);
  const heightAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  const groundAt = (east: number, north: number) => {
    const value = heightAt(east, north, arrivalHeight);
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  };

  const group = new Group();
  group.name = 'town-d2-r30-cable-towers';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const iron = new MeshLambertMaterial({ color: '#5a6268' });
  const foundationMaterial=new MeshLambertMaterial({color:0xffffff});materials.add(foundationMaterial);
  foundationMaterial.name='town-d2-r30-cable-tower-foundation-palette';
  iron.name = 'town-d2-r30-cable-tower-iron';
  materials.add(iron);

  // Unit-height shapes carry the per-tower scale in the instance matrix, so
  // one geometry serves every tower while the silhouette stays identical.
  const mastShape = new CylinderGeometry(.28, .62, 1, 6);
  const unitBox=new BoxGeometry(1,1,1);
  geometries.add(mastShape);geometries.add(unitBox);

  const rope = cable.ropes[0],other=cable.ropes[1];
  // Use corresponding segment fraction, not a length ratio, so the beam
  // spans the actual pair at bends as well as on straight sections.
  const cumulative=[0];for(let i=1;i<rope.points.length;i++){const a=rope.points[i-1]!,b=rope.points[i]!;cumulative.push(cumulative.at(-1)!+Math.hypot(b.east-a.east,b.north-a.north,b.height-a.height));}
  function pairAt(distance:number){let i=1;while(i<cumulative.length-1&&distance>cumulative[i]!)i++;const t=(distance-cumulative[i-1]!)/(cumulative[i]!-cumulative[i-1]!);const a=rope.sample(distance),u=other.points[i-1]!,v=other.points[i]!;const b={east:u.east+(v.east-u.east)*t,north:u.north+(v.north-u.north)*t,height:u.height+(v.height-u.height)*t};return {east:(a.east+b.east)/2,north:(a.north+b.north)/2,height:(a.height+b.height)/2,heading:Math.atan2(b.north-a.north,b.east-a.east),width:Math.hypot(b.east-a.east,b.north-a.north)+1.5,ropeA:a,ropeB:b};}
  const ropeLength = rope.totalMetres;
  const towers: Array<LatticeFoot&{ east: number; north: number; heading: number; ground: number; ropeHeight: number; height: number; width:number;west:boolean }> = [];
  let maxHeight = 0, minClearance = Infinity, skipped = 0;
  for (let distance = DEFAULTS.skipNearStation; distance < ropeLength - DEFAULTS.skipNearStation; distance += spacing) {
    const at = pairAt(distance);
    const ground = groundAt(at.east, at.north);
    if (ground === undefined) { skipped++; continue; }
    const ropeHeight = at.height + DEFAULTS.towerTop;
    const height = ropeHeight - ground,foot=surveyNightBLatticeFoot(at.east,at.north,ground,ropeHeight,groundAt);
    if(!foot){skipped++;continue;}
    towers.push({ east: at.east, north: at.north, heading: at.heading, ground, ropeHeight, height,width:at.width,...foot,west:at.east< -300&&at.north>=480 });
    maxHeight = Math.max(maxHeight, height);
    minClearance = Math.min(minClearance, height);
  }

  const memberMatrices=buildNightBLatticeMembers(towers);
  const mastTriangles = (mastShape.getIndex()?.count ?? mastShape.getAttribute('position').count) / 3;
  const boxTriangles = (unitBox.getIndex()?.count ?? unitBox.getAttribute('position').count) / 3;

  const batches: InstancedMesh[] = [];
  const addBatch = (
    name: string, shape: BufferGeometry,
    list: ReadonlyArray<(typeof towers)[number]>,
    build: (tower: (typeof towers)[number], matrix: Matrix4) => void, material=iron,
  ) => {
    if (!list.length) return;
    const mesh = new InstancedMesh(shape, material, list.length);
    mesh.name = `town-d2-r30-cable-tower-${name}`;
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    const matrix = new Matrix4();
    list.forEach((tower, index) => {
      build(tower, matrix);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    batches.push(mesh);
  };

  const towerPlacement = new Matrix4();
  addBatch('mast', mastShape, towers, (tower, matrix) => {
    towerPlacement.makeTranslation(tower.east, 0, -tower.north);
    matrix.copy(towerPlacement)
      .multiply(new Matrix4().makeTranslation(0, tower.ground + tower.height / 2, 0))
      .multiply(new Matrix4().makeScale(1, tower.height, 1));
  });
  // Exact affine equivalence: fold the original box's dimensions into
  // each instance transform. No welded faces, reduced members or padding.
  const ironParts=new InstancedMesh(unitBox,iron,towers.length+memberMatrices.length);
  ironParts.name='town-d2-r30-cable-tower-iron-boxes';ironParts.instanceMatrix.setUsage(StaticDrawUsage);
  const mat=new Matrix4(),braceScale=new Matrix4().makeScale(.18,1,.18);
  towers.forEach((t,i)=>ironParts.setMatrixAt(i,mat.makeTranslation(t.east,t.ropeHeight,-t.north).multiply(new Matrix4().makeRotationY(t.heading)).multiply(new Matrix4().makeScale(t.width,.3,.35))));
  memberMatrices.forEach((m,i)=>ironParts.setMatrixAt(towers.length+i,mat.copy(m).multiply(braceScale)));
  ironParts.instanceMatrix.needsUpdate=true;ironParts.computeBoundingSphere();group.add(ironParts);batches.push(ironParts);
  // White base material multiplied by linear instance colors reproduces the
  // two old Lambert material colors. Both are opaque with identical flags.
  const foundations=new InstancedMesh(unitBox,foundationMaterial,towers.length*2);
  foundations.name='town-d2-r30-cable-tower-foundation-palette';foundations.instanceMatrix.setUsage(StaticDrawUsage);
  const tint=new Color();let currentNight:boolean|undefined;
  function tintFoundations(night:boolean){
    if(currentNight===night)return;currentNight=night;
    tint.set(night?'#53616c':'#7b858b');for(let i=0;i<towers.length;i++)foundations.setColorAt(i,tint);
    tint.set(night?'#93a9bd':'#d9e5e8');for(let i=towers.length;i<towers.length*2;i++)foundations.setColorAt(i,tint);
    if(foundations.instanceColor)foundations.instanceColor.needsUpdate=true;
  }
  towers.forEach((t,i)=>{
    foundations.setMatrixAt(i,mat.makeTranslation(t.east,(t.footBottom+t.footTop)/2,-t.north).multiply(new Matrix4().makeScale(t.footHalf*2,t.footTop-t.footBottom,t.footHalf*2)));
    foundations.setMatrixAt(towers.length+i,mat.makeTranslation(t.east,t.footTop+.045,-t.north).multiply(new Matrix4().makeScale(t.footHalf*2+.08,.09,t.footHalf*2+.08)));
  });
  tintFoundations(false);foundations.instanceMatrix.needsUpdate=true;foundations.computeBoundingSphere();group.add(foundations);batches.push(foundations);
  const triangles=towers.length*(mastTriangles+3*boxTriangles)+memberMatrices.length*boxTriangles;
  const stats: TownD2R30CableTowersStats = Object.freeze({
    towers: towers.length,
    spacing,
    ropeMetres: ropeLength,
    maxTowerHeight: towers.length ? maxHeight : 0,
    minClearance: towers.length ? minClearance : 0,
    drawCalls: batches.length,
    triangles,
    skipNearStation: skipped,
    westTowers:towers.filter(t=>t.west).length,foundations:towers.length,latticeMembers:memberMatrices.length,
  });
  group.userData = {
    owner: 'D2-R02', visualOnly: false, includesWorldCollision: true,
    modifiesHeightAt: false, modifiesCable: false, stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  return {
    group,
    cable,
    stats: () => stats,
    footprints:towers.map(t=>Object.freeze({east:t.east,north:t.north,bottom:t.footBottom,top:t.footTop+.09,halfWidth:t.footHalf+.04,mastTop:t.ropeHeight,latticeTop:t.latticeTop,legHalf:t.legHalf})),
    blocked(e:number,n:number,h:number,r=.27,body=1.8){if(![e,n,h,r,body].every(Number.isFinite)||r<0||body<=0)return true;return towers.some(t=>nightBLatticeBlocked(t,e,n,h,r,body)||h+body>t.ground&&h<t.ropeHeight&&Math.hypot(e-t.east,n-t.north)<.62+r);},
    setNight(value: boolean) {
      if (disposed) throw new Error('The D2-R02 cable towers are disposed.');
      if (typeof value !== 'boolean') throw new TypeError('setNight expects a boolean.');
      iron.color.set(value ? '#414951' : '#5a6268');tintFoundations(value);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for(const b of batches)b.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
