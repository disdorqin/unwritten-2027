import {
  BoxGeometry, DataTexture, Group, InstancedMesh, Matrix4, MeshStandardMaterial,
  NearestFilter, Object3D, RGBAFormat, SRGBColorSpace,
} from 'three';
import {
  createMeteorCrater, meteorCraterFixturePlan, meteorCraterRimRadius,
  meteorCraterDepth,
} from './meteor-crater.js';

/**
 * C3: survey-relative visual geology inside the already accepted B-01 crater.
 *
 * No alteration to its graded trail, terrain heights, colliders, sealed well,
 * E-press authority, underground room registration or item placement.
 * This companion is deliberately all InstancedMesh, only visual material.
 */
type Zone = 'terraces' | 'floor' | 'sealed-well';
type Family = 'basalt' | 'slate' | 'rust' | 'snow' | 'lichen' | 'crystal';
type Triple = readonly [number, number, number];
export type CraterDressingPiece = Readonly<{
  id: string; zone: Zone; family: Family; center: Triple; size: Triple;
}>;
export const craterInteriorSurvey = Object.freeze({
  terraceAreaM2: 6597.3,
  floorAreaM2: 1256.6,
  wellAreaM2: 10.6,
  sealedWellRadius: meteorCraterRimRadius / 30,
  minimumTrailBuffer: 3.8,
});
const crater = createMeteorCrater(meteorCraterFixturePlan);
const trail = Array.from({length: 1001}, (_,i)=>crater.mainTrailPoint(i/1000));
const palette: Record<Family, readonly [number,number,number]> = {
  basalt: [0x494e59,0x6a6a68,0x292e39],
  slate: [0x697b88,0x8fa0a8,0x4b5764],
  rust: [0x99704d,0xb78a58,0x5d4137],
  snow: [0xb9cad3,0xe7e5dc,0x899aaa],
  lichen: [0x647765,0x8b966d,0x42544c],
  crystal: [0x6bafbc,0xa6d4d3,0x426d83],
};
const families=Object.keys(palette) as Family[];
function stable(seed: number, salt: number) {
  const raw=Math.sin(seed*12.9898+salt*78.233)*43758.5453;
  return raw-Math.floor(raw);
}
function onTrail(east:number,north:number,buffer=craterInteriorSurvey.minimumTrailBuffer) {
  const threshold=buffer*buffer;
  for(const point of trail) {
    const dx=east-point.east,dn=north-point.north;
    if(dx*dx+dn*dn<threshold) return true;
  }
  return false;
}
function prepare(): readonly CraterDressingPiece[] {
  const pieces: CraterDressingPiece[]=[];
  function block(zone:Zone,family:Family,id:string,e:number,y:number,n:number,w:number,h:number,d:number){
    if(![e,y,n,w,h,d].every(Number.isFinite)||w<=0||h<=0||d<=0)
      throw new RangeError('invalid crater stone '+id);
    pieces.push(Object.freeze({id,zone,family,center:[e,y,n] as const,size:[w,h,d] as const}));
  }

  // 6,597.3 sqm: real three-ring terraces and steep slopes, subdivided into
  // worn strata and colored deposits, not a second floating layer of terrain.
  // Every candidate is surveyed against the actual spiral trail, not an
  // approximate straight corridor. The 3.8m buffer protects original 2m tread,
  // both shoulders, and a full standing avatar from decorated rocks.
  for(let band=0;band<15;band++) {
    const radius=24.0+band*2.12;
    for(let spoke=0;spoke<180;spoke++) {
      const angle=(spoke+.35*(band%3))*Math.PI*2/180;
      const e=radius*Math.sin(angle),n=radius*Math.cos(angle);
      if(onTrail(e,n,3.8))continue;
      const ground=crater.heightOffsetAt(e,n);
      if(ground===undefined)continue;
      const seed=band*181+spoke;
      const hew=.35+stable(seed,4)*.42;
      const shade=(seed%7===0?'rust':seed%11===0?'lichen':'basalt') as Family;
      const prefix='c3/terraces/'+band+'/'+spoke;
      for(let tier=0;tier<4;tier++){
        const side=tier%2?-1:1,offset=tier*.12;
        const h=.12+tier*.055+stable(seed,13+tier)*.13;
        const x=e+side*offset,north=n+(.11*(tier-2));
        block('terraces',tier%4===3?'slate':shade,prefix+'/bed-'+tier,
          x,ground+h/2-.025,north,hew+.20-tier*.045,h,.52+stable(seed,20+tier)*.27);
      }
      // Visible warm mineral and sharp icy strata amid the gray cliffs.
      block('terraces',seed%4===0?'crystal':seed%3===0?'snow':'rust',
        prefix+'/vein',e+.33,ground+.095,n-.24,.14,.19,.38);
      if(seed%4===0) {
        block('terraces','snow',prefix+'/snowcap',e-.21,ground+.17,n+.21,.32,.13,.27);
        block('terraces','lichen',prefix+'/lichen',e+.18,ground+.035,n-.08,.19,.07,.20);
      }
    }
  }

  // 1,256.6 sqm: a dense but legible floor with fractured mineral trays,
  // cooler quartz streaks and a clear protected circle round the well.
  // Physical mining sites must still be supplied by the U-8 authority.
  for(let ring=0;ring<8;ring++){
    const radius=6.1+ring*1.67;
    for(let sector=0;sector<100;sector++){
      const angle=(sector+.25*(ring%2))*Math.PI*2/100;
      const e=radius*Math.cos(angle),n=radius*Math.sin(angle);
      if(onTrail(e,n,3.8))continue;
      const ground=crater.heightOffsetAt(e,n);
      if(ground===undefined)continue;
      const key=ring*101+sector;
      const prefix='c3/floor/'+ring+'/'+sector;
      const baseFamily=(key%9===0?'rust':key%3===0?'slate':'basalt') as Family;
      for(let tier=0;tier<3;tier++) {
        const h=.12+tier*.045+stable(key,tier)*.08;
        block('floor',tier===2&&key%4===0?'snow':baseFamily,
          prefix+'/shard-'+tier,
          e+(tier-1)*.22,ground+h/2-.018,n+Math.sin(tier*1.6)*.24,
          .46+tier*.10,h,.33+.11*tier);
      }
      if(key%2===0)
        block('floor','crystal',prefix+'/quartz-grain',
          e+.12,ground+.145,n-.19,.15,.28,.19);
      if(key%7===0)
        block('floor','lichen',prefix+'/powder',
          e-.12,ground+.04,n+.23,.33,.06,.32);
    }
  }

  // 10.6 sqm official well footprint: CLOSED. The trim is a safe high-detail
  // visual perimeter OUTSIDE the existing shaft radius and never adds a door,
  // cover collision, E hotspot, light source or player inventory.
  const floor=-meteorCraterDepth;
  for(let spoke=0;spoke<48;spoke++){
    const angle=Math.PI*2*spoke/48;
    for(let course=0;course<5;course++){
      const radius=2.18+course*.21;
      const e=radius*Math.cos(angle),n=radius*Math.sin(angle);
      const h=.09+(course%3)*.045;
      block('sealed-well',course%4===0?'rust':course%4===2?'snow':'slate',
        'c3/well/apron-'+spoke+'-'+course,
        e,floor+h/2-.02,n,.21,h,.25);
    }
    if(spoke%4===0)for(let tier=0;tier<9;tier++){
      const r=3.55;
      const h=.16+tier*.06;
      block('sealed-well',tier%3===0?'rust':tier%3===2?'crystal':'basalt',
        'c3/well/brace-'+spoke+'-'+tier,
        Math.cos(angle)*r,floor+h/2+Math.max(0,tier-2)*.17,Math.sin(angle)*r,
        .43,h,.40);
    }
  }
  return Object.freeze(pieces);
}
export const craterInteriorDressingPieces=prepare();
export const craterInteriorDressingStats=Object.freeze({
  count:craterInteriorDressingPieces.length,
  terraces:craterInteriorDressingPieces.filter(x=>x.zone==='terraces').length,
  floor:craterInteriorDressingPieces.filter(x=>x.zone==='floor').length,
  sealedWell:craterInteriorDressingPieces.filter(x=>x.zone==='sealed-well').length,
  materialBatches:families.length,
});
function texture(family:Family) {
  const [base,grain,outline]=palette[family];
  const bytes=new Uint8Array(16*16*4);
  for(let row=0;row<16;row++)for(let col=0;col<16;col++){
    const pit=(row*11+col*17+row*col)%19;
    const color=col===0||row===0||col===15||row===15?outline:pit<4?grain:base;
    bytes.set([color>>16,(color>>8)&255,color&255,255],(row*16+col)*4);
  }
  const map=new DataTexture(bytes,16,16,RGBAFormat);
  map.magFilter=map.minFilter=NearestFilter;
  map.generateMipmaps=false;
  map.colorSpace=SRGBColorSpace;
  map.needsUpdate=true;
  return map;
}
export function mountCraterInteriorDressing(owner:Group) {
  const group=new Group();
  group.name='c3-crater-interior-dressing-visual-only';
  const geometry=new BoxGeometry(1,1,1);
  const instance=new Object3D();
  const matrices=new Map<Family,Matrix4[]>();
  for(const part of craterInteriorDressingPieces){
    instance.position.set(part.center[0],part.center[1],-part.center[2]);
    instance.scale.set(...part.size);
    instance.rotation.set(0,0,0);
    instance.updateMatrix();
    const list=matrices.get(part.family)??[];
    list.push(instance.matrix.clone());
    matrices.set(part.family,list);
  }
  const meshes:InstancedMesh[]=[];
  const maps:DataTexture[]=[];
  const materials:MeshStandardMaterial[]=[];
  for(const [family,values] of matrices){
    const map=texture(family);
    const luminous=family==='crystal';
    const material=new MeshStandardMaterial({map,roughness:.92,metalness:family==='rust'?.08:0,
      ...(luminous?{emissive:0x385f6d,emissiveIntensity:.17}:{}),
    });
    const mesh=new InstancedMesh(geometry,material,values.length);
    mesh.name='c3-crater-interior/'+family;
    values.forEach((value,i)=>mesh.setMatrixAt(i,value));
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);maps.push(map);materials.push(material);
  }
  owner.add(group);
  let released=false;
  return {group,meshes,stats:craterInteriorDressingStats,
    dispose(){
      if(released)return;
      released=true;
      group.removeFromParent();
      meshes.forEach(x=>x.dispose());
      materials.forEach(x=>x.dispose());
      maps.forEach(x=>x.dispose());
      geometry.dispose();
      group.clear();
    },
  };
}
