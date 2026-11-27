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
  // Iron hood underside, warm reflector and four bolted ribs; the amber
  // core remains the only emissive glass and the existing source stays put.
  append(id+'/hood-reflector','ochre',e,y+2.843,n,.57,.045,.57);
  for(const [i,dx,dn,w,d] of [[0,-.32,0,.055,.66],[1,.32,0,.055,.66],[2,0,-.32,.66,.055],[3,0,.32,.66,.055]] as const){
    append(id+'/hood-edge-'+i,'worn-iron',e+dx,y+2.859,n+dn,w,.08,d);
    append(id+'/hood-bolt-'+i,'ochre',e+dx,y+2.812,n+dn,.055,.035,.055);
  }
  append(id+'/snow-foot','frost',e,y+.19,n,.88,.12,.82);
  // Recessed industrial base plate, four clamping cleats and a small
  // conduit/strain relief. Keep the complete assembly inside the old
  // reserved lamp footprint; no new action or collision authority.
  append(id+'/mounting-plate','worn-iron',e,y+.29,n,.51,.08,.51);
  for(const [i,dx,dn] of [[0,-.19,0],[1,.19,0],[2,0,-.19],[3,0,.19]] as const)
    append(id+'/base-cleat-'+i,'worn-iron',e+dx,y+.37,n+dn,.10,.20,.10);
  append(id+'/conduit','worn-iron',e+.14,y+.87,n,.055,1.06,.058);
  append(id+'/strain-relief','ochre',e+.14,y+1.42,n,.13,.16,.13);
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

export function mountCraterFloorWorklightChain(owner:Group,
  surfaceHeightAt?:(east:number,north:number)=>number|undefined) {
  // The rebuilt mound can meet a lamp site. Anchor the visible carrier to
  // the highest sampled point of its existing foundation, embed the lower
  // plinth into the slope, and move the actual light with its housing.
  const posts=craterFloorWorklightPosts.map(post=>{
    const h=[post.footHeight];
    if(surfaceHeightAt){
      h.length=0;
      for(const de of [-.36,0,.36])for(const dn of [-.36,0,.36]){
        const y=surfaceHeightAt(post.east+de,post.north+dn);
        if(y!==undefined&&Number.isFinite(y))h.push(y);
      }
    }
    const high=h.length?Math.max(...h):post.footHeight;
    const low=h.length?Math.min(...h):post.footHeight;
    return {...post,footHeight:high,bulbHeight:high+2.62,foundationDepth:high-low};
  });
  const fittedPieces=pieces.map(piece=>{
    const post=posts.find(p=>piece.id.startsWith(p.id+'/'))!;
    const original=craterFloorWorklightPosts.find(p=>p.id===post.id)!;
    const delta=post.footHeight-original.footHeight;
    const foot=piece.id===post.id+'/foot';
    const extra=foot?post.foundationDepth:0;
    return {...piece,position:[piece.position[0],piece.position[1]+delta-extra/2,piece.position[2]] as const,
      size:[piece.size[0],piece.size[1]+extra,piece.size[2]] as const};
  });
  const data={...craterFloorWorklightGeometry,posts,pieces:fittedPieces};
  const group=new Group();
  group.name='c2-physical-worklights-authority-free';
  // Physical envelopes are extracted from the fitted visible parts, not
  // the broad rock-exclusion circle. A's existing west index consumes
  // these via the B physical-kit adapter after the final host transform.
  const solids=posts.flatMap(post=>{
    const own=fittedPieces.filter(p=>p.id.startsWith(post.id+'/'));
    const level=(p:Piece)=>p.position[1]+p.size[1]/2<=post.footHeight+.45?'base':
      p.position[1]-p.size[1]/2>=post.footHeight+2.1?'hood':'shaft';
    return (['base','shaft','hood'] as const).map(role=>{
      const members=own.filter(p=>level(p)===role);
      return {id:post.id+'/'+role,
        min:[0,1,2].map(i=>Math.min(...members.map(p=>p.position[i]-p.size[i]/2))),
        max:[0,1,2].map(i=>Math.max(...members.map(p=>p.position[i]+p.size[i]/2)))};
    });
  });
  group.userData.bR30PhysicalSolids=solids;
  const geometry=new BoxGeometry(1,1,1);
  const materialMaps=new Map<Material,Piece[]>();
  for(const piece of fittedPieces){
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
  const lights=posts.map(post=>{
    // Match the existing warm chain (6–8 intensity) for orientation;
    // the three actual workface-side sources have stronger work light.
    // No added light, shadow caster, range, coordinate or phase authority.
    const workside=['c2/winch-watch','c2/south-brace','c2/haulage-turn'].includes(post.id);
    const light=new PointLight(0xffc17f,workside?12:6,13.5,2);
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
    data,
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
