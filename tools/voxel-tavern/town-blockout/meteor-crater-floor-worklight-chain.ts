import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh,
  MeshStandardMaterial, NearestFilter, Object3D, PointLight,
  RGBAFormat, SRGBColorSpace,
} from 'three';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater.js';
import {craterFloorWorklightSites} from './meteor-crater-floor-worklight-sites.js';

/**
 * C-2 fixed lamppost chain on the authenticated B-01 crater-floor geometry.
 *
 * Visual/runtime light only. No inventory, portable camp lamp, player E,
 * healing, winch, ground collider, dynamic item or mine authority is created.
 * Night state is fed by the existing town setNight() -> road.craterActions.
 */
type Material = 'stone'|'timber'|'worn-iron'|'ochre'|'amber'|'frost';
type Piece = Readonly<{id:string; material:Material;
  position:readonly[number,number,number]; size:readonly[number,number,number]}>;
const crater=createMeteorCrater(meteorCraterFixturePlan);
const colors:Record<Material,readonly[number,number,number]> = {
  stone:[0x77736c,0x99968c,0x474a4b],
  timber:[0x72543e,0x997352,0x47362d],
  'worn-iron':[0x5f6262,0x86847b,0x3a4144],
  ochre:[0x9d784f,0xb99760,0x6f533a],
  amber:[0xe5af61,0xffd48a,0x91603d],
  frost:[0xb9cbd2,0xe8e6db,0x8295a1],
};
export type FloorWorklightPost = Readonly<{
  id:string; east:number; north:number; footHeight:number; bulbHeight:number;
}>;
export const craterFloorWorklightPosts:readonly FloorWorklightPost[] =
  Object.freeze(craterFloorWorklightSites.map(site=>{
    const height=crater.heightOffsetAt(site.east,site.north);
    if(height===undefined || Math.hypot(site.east,site.north)>=20)
      throw new RangeError('C2 worklight lacks accepted B-01 floor '+site.id);
    return Object.freeze({
      ...site,footHeight:height,bulbHeight:height+2.62,
    });
  }));

const pieces:Piece[]=[];
function append(id:string,material:Material,e:number,y:number,n:number,w:number,h:number,d:number){
  pieces.push(Object.freeze({id,material,position:[e,y,-n] as const,size:[w,h,d] as const}));
}
for(const post of craterFloorWorklightPosts){
  const {east:e,north:n,footHeight:y,id}=post;
  // Every core has a visible stone foot, four bolt-heads, an iron post,
  // a weathered lantern box, a roof/hood and a warm amber bulb. All locally
  // anchored to the same measured floor height (not floating y shortcuts).
  append(id+'/foot','stone',e,y+.08,n,.72,.17,.75);
  for(const [index,dx,dn] of [
    [0,-.26,-.28],[1,-.26,.28],[2,.26,-.28],[3,.26,.28],
  ] as const){
    append(id+'/bolt-'+index,'worn-iron',e+dx,y+.19,n+dn,.09,.12,.09);
  }
  append(id+'/shaft','timber',e,y+1.1,n,.22,2.03,.22);
  for(const [i,dx,dn] of [
    [0,-.16,0],[1,.16,0],[2,0,-.16],[3,0,.16],
  ] as const){
    append(id+'/stiffener-'+i,'worn-iron',e+dx,y+.63,n+dn,.07,.87,.08);
  }
  append(id+'/lantern-base','ochre',e,y+2.23,n,.60,.17,.60);
  for(const [i,dx,dn] of [
    [0,-.27,0],[1,.27,0],[2,0,-.27],[3,0,.27],
  ] as const){
    append(id+'/frame-'+i,'worn-iron',e+dx,y+2.51,n+dn,.058,.56,.058);
  }
  append(id+'/light-core','amber',e,y+2.59,n,.38,.46,.40);
  append(id+'/roof','stone',e,y+2.94,n,.85,.14,.84);
  append(id+'/roof-ridge','frost',e,y+3.02,n,.39,.075,.39);
  append(id+'/snow-foot','frost',e,y+.19,n,.88,.12,.82);
}
export const craterFloorWorklightGeometry = Object.freeze({
  posts:craterFloorWorklightPosts,
  pieces:Object.freeze(pieces),
  lampCount:craterFloorWorklightPosts.length,
  pieceCount:pieces.length,
  nearestPixelMaterialCount:Object.keys(colors).length,
});

function nearestPixelTexture(material:Material) {
  const [base,shine,outline]=colors[material];
  const pixels=new Uint8Array(16*16*4);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const border=x<1||y<1||x>14||y>14;
    const stripe=(Math.floor(x/4)*5+Math.floor(y/3)*7)%9;
    const color=border?outline:stripe<=2?shine:base;
    pixels.set([color>>16,(color>>8)&255,color&255,255],(y*16+x)*4);
  }
  const map=new DataTexture(pixels,16,16,RGBAFormat);
  map.magFilter=map.minFilter=NearestFilter;
  map.generateMipmaps=false;
  map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
  return map;
}

export function mountCraterFloorWorklightChain(owner:Group) {
  const group=new Group();
  group.name='c2-physical-worklights-authority-free';
  const geometry=new BoxGeometry(1,1,1);
  const materialMaps=new Map<Material,Piece[]>();
  for(const piece of pieces){
    const groupPieces=materialMaps.get(piece.material)??[];
    groupPieces.push(piece);
    materialMaps.set(piece.material,groupPieces);
  }
  const matrices=new Object3D();
  const meshes:InstancedMesh[]=[];
  const textures:DataTexture[]=[];
  const materials:MeshStandardMaterial[]=[];
  let lit=false;
  for(const [materialKind,members] of materialMaps){
    const texture=nearestPixelTexture(materialKind);
    const material=new MeshStandardMaterial({
      map:texture,roughness:1,metalness:materialKind==='worn-iron'?.22:0,
      ...(materialKind==='amber'?{emissive:new Color(0xffaa5f),emissiveIntensity:.04}:{}),
    });
    const mesh=new InstancedMesh(geometry,material,members.length);
    mesh.name='c2/physical-fixture/'+materialKind;
    for(const [index,piece] of members.entries()){
      matrices.position.set(...piece.position);
      matrices.scale.set(...piece.size);
      matrices.rotation.set(0,0,0);
      matrices.updateMatrix();
      mesh.setMatrixAt(index,matrices.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
    textures.push(texture);
    materials.push(material);
  }
  const lights=craterFloorWorklightPosts.map(post=>{
    const light=new PointLight(0xffc17f,1.5,13.5,2);
    light.name=post.id+'/light-source';
    light.position.set(post.east,post.bulbHeight,-post.north);
    light.visible=false;
    group.add(light);
    return light;
  });
  owner.add(group);
  let disposed=false;
  return {
    group,meshes,lights,
    data:craterFloorWorklightGeometry,
    get isNightLit(){return lit;},
    setNight(night:boolean){
      if(disposed)return;
      lit=night;
      for(const lamp of lights)lamp.visible=night;
      for(const material of materials){
        if(material.emissive.equals(new Color(0xffaa5f)))
          material.emissiveIntensity=night?1.55:.04;
      }
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      group.removeFromParent();
      meshes.forEach(mesh=>mesh.dispose());
      materials.forEach(material=>material.dispose());
      textures.forEach(texture=>texture.dispose());
      geometry.dispose();group.clear();
    },
  };
}
