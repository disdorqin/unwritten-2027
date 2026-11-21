import {
  BoxGeometry, DataTexture, Group, InstancedMesh, Matrix4, MeshStandardMaterial,
  NearestFilter, Object3D, PointLight, SRGBColorSpace,
} from 'three';

/**
 * U-3/second underground chapter, full environmental geometry only.
 *
 * ENY local frame uses -north for Three's Z, with a survey-approved world pose
 * supplied by the U-15 host. This scene has NO teleport, loot, monster, mining,
 * collision registration, healing, or multiplayer authority.
 *
 * Reference: approved clay-factory art #05/#06/#07; underground layout draft
 * 180 × 120m, entry E0/N1/H-0.064 and exit E8.7/N98/H-2.960.
 * The old mine gate and YS city are NOT mounted by this module.
 */
export type CrystalCavernPoint = Readonly<{ east: number; north: number; height: number }>;
export type CrystalCavernFrame = CrystalCavernPoint & Readonly<{ yaw: number; domainId: string }>;
type Local = readonly [east: number, height: number, north: number];
type Family = 'rock' | 'shadow' | 'slate' | 'timber' | 'rust' | 'moss' | 'crystal' | 'water';
export type CrystalCavernBlock = Readonly<{
  name: string;
  family: Family;
  center: Local;
  size: Local;
  rotationZ: number;
  solid: boolean;
}>;
export const CRYSTAL_CAVERN_CANT_RAD = Math.PI / 9; // all growing crystals lean +20°
export const crystalCavernPlan = Object.freeze({
  width: 180,
  length: 120,
  minimumVaultHeight: 20,
  pathWidth: 6.4,
  entry: Object.freeze({ east: 0, north: 1, height: -.064 }),
  exit: Object.freeze({ east: 8.7, north: 98, height: -2.960 }),
  overlook: Object.freeze({ east: 10.3, north: 55, height: -1.676 }),
  quay: Object.freeze({ east: 24.5, north: 76, height: -2.302 }),
  mimicSight: Object.freeze({ east: 12.8, north: 55, height: -1.676 }),
  waterRange: Object.freeze({ minEast: 19, maxEast: 58, minNorth: 62, maxNorth: 96 }),
});

export function crystalCavernTrailEast(north: number): number {
  const bends: readonly (readonly [number, number])[] = [
    [1, 0], [23, 2.7], [40, 8.2], [55, 10.3], [73, 8.2], [98, 8.7],
  ];
  if (!Number.isFinite(north)) return NaN;
  if (north <= 1) return 0;
  for (let i = 1; i < bends.length; i++) {
    const [at, east] = bends[i]!;
    if (north <= at) {
      const [before, start] = bends[i - 1]!;
      return start + (east - start) * (north - before) / (at - before);
    }
  }
  return 8.7;
}
export function crystalCavernTrailHeight(north: number) {
  const t = Math.max(0, Math.min(1, (north - 1) / 97));
  return crystalCavernPlan.entry.height +
    (crystalCavernPlan.exit.height - crystalCavernPlan.entry.height) * t;
}
export function crystalCavernToWorld(frame: CrystalCavernFrame, point: Local): CrystalCavernPoint {
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  return {
    east: frame.east + c * point[0] - s * point[2],
    north: frame.north + s * point[0] + c * point[2],
    height: frame.height + point[1],
  };
}
function stable(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const objects: CrystalCavernBlock[] = [];
function add(
  family: Family, name: string,
  east: number, height: number, north: number,
  width: number, tall: number, length: number,
  solid = false, rotationZ = 0,
) {
  objects.push(Object.freeze({
    family, name, center: [east, height, north] as const,
    size: [width, tall, length] as const, solid, rotationZ,
  }));
}
function makeCavern() {
  // R2 / R3 screenshot correction: the whole 180×120m chamber must have real
  // rocky ground, not floating crystal pillars in a void beside a narrow
  // walkway. Ground is lower than the accepted main path and the shallow river;
  // the 4m centreline remains obstacle-free for standing avatars.
  for (let row = 0; row < 41; row++) {
    const north = -9.0 + row * 2.9;
    const h = crystalCavernTrailHeight(north);
    for (let col = 0; col < 61; col++) {
      const east = -88.5 + col * 2.92;
      const rough = stable(row * 61 + col, 9);
      const inRiver = east >= 18 && east <= 60 && north >= 60 && north <= 98;
      const shallow = Math.abs(east - crystalCavernTrailEast(north)) < 5;
      const base = inRiver ? h - .66 : shallow ? h - .43 : h - .35 - rough * .17;
      add((row + col) % 13 === 0 ? 'moss' : (row + col) % 4 ? 'rock' : 'slate',
        'u3/floor/rock-tile-' + row + '-' + col,
        east, base, north, 2.91, .3, 2.89);
      if (!inRiver && !shallow && (row * 13 + col * 17) % 29 === 0)
        add('shadow', 'u3/floor/lichen-boulder-' + row + '-' + col,
          east + .35, base + .23, north - .4, .52, .36, .65);
    }
  }
  // R1: 120m main passage, gently descending ~2.9m between the real source
  // entry and exit foot. Floor subtiles stay below the walking plane.
  for (let i = 0; i < 97; i++) {
    const north = 1 + (i + .5);
    const east = crystalCavernTrailEast(north), h = crystalCavernTrailHeight(north);
    for (let lane = -3; lane <= 3; lane++) {
      const width = lane % 2 === 0 ? 1.03 : .98;
      add((i + lane) % 11 === 0 ? 'moss' : 'slate',
        'u3/trail/slab-' + i + '-' + lane,
        east + lane * 1.06, h - .11, north,
        width, .20, .98);
    }
    for (const side of [-1, 1]) {
      if (i % 3 === 0) {
        const e = east + side * 4.7;
        add('rock', 'u3/trail/shoulder-' + i + '-' + side,
          e, h - .23, north, 2.2, .42, 1.24);
        if (i % 6 === 0) add('moss', 'u3/trail/lichen-' + i + '-' + side,
          e + side * .20, h + .008, north, .92, .04, .7);
      }
    }
  }

  // R1: 180×120m vaulted shell (24–33m visible vertical envelope).
  // Interleaving big planar layers gives faceted cave-scale silhouette without
  // smooth round spheres or invisible flat-wall backdrops.
  for (let section = 0; section <= 24; section++) {
    const north = -9 + section * 5.18;
    const twist = Math.sin(section * .48) * 4.8;
    const left = -76 - twist, right = 79 + twist;
    const vault = 25 + 5 * (1 + Math.sin(section * .41)) / 2;
    for (const side of [-1, 1]) {
      const wallE = side < 0 ? left : right;
      const nudge = .75 * Math.cos(section * .71 + side);
      for (let tier = 0; tier < 7; tier++) {
        const tierY = 1.05 + tier * 3.08;
        const inner = side * (tier < 4 ? -tier * 2.18 : -(8.72 + (tier - 3) * 4.45));
        add((section + tier) % 6 === 0 ? 'shadow' : 'rock',
          'u3/vault/edge-' + section + '-' + side + '-' + tier,
          wallE + inner + nudge, tierY,
          north + (tier % 3 - 1) * .46,
          11.8 - tier * .44, 3.68, 5.40, tier < 3);
        // Glaze-free cracks, weathered inclusions on a genuinely rock face.
        if (tier % 2 === 0) for (let chip = 0; chip < 4; chip++)
          add(chip % 3 === 0 ? 'moss' : 'shadow',
            'u3/vault/fissure-' + section + '-' + side + '-' + tier + '-' + chip,
            wallE + inner - side * 2.1 + chip * .42,
            tierY + (chip % 2 - .5) * .73, north + 2.77,
            .34, .33 + chip * .09, .20);
      }
      const peakE = wallE - side * 27.8;
      add('shadow', 'u3/vault/roof-ledge-' + section + '-' + side,
        peakE, vault - .31, north, 27.8, 1.8, 5.48);
      for (let slab = 0; slab < 5; slab++)
        add(slab % 4 === 0 ? 'rock' : 'shadow',
          'u3/vault/roof-strata-' + section + '-' + side + '-' + slab,
          peakE - side * (slab * 5.7 + 3), vault + .62 - slab * .28,
          north, 6.3, 1.55, 5.49);
    }
    add('shadow', 'u3/vault/crown-' + section, 0, vault + .42, north,
      21.4, 1.75, 5.52);
    // The first visual review exposed two lateral strips of raw sky between
    // crown and roof strata. Fill them with broad, irregular rock slabs,
    // keeping the 20m+ cavern silhouette rather than introducing a flat roof.
    for (const side of [-1, 1]) for (let bridge = 0; bridge < 4; bridge++) {
      const fromMiddle = 12.3 + bridge * 9.0;
      add((section + bridge) % 5 === 0 ? 'rock' : 'shadow',
        'u3/vault/shoulder-canopy-' + section + '-' + side + '-' + bridge,
        side * fromMiddle, vault - .31 + bridge * .07,
        north + (bridge % 2 ? .08 : -.08),
        9.2, 1.8 + (bridge % 3) * .15, 5.49);
    }
  }

  // R1: underground shadow basin and a shallow crystal-fed river. Thin water
  // panes create readable reflections; they do NOT grant a swimming mechanic.
  const { waterRange: basin } = crystalCavernPlan;
  for (let row = 0; row < 17; row++) {
    const north = basin.minNorth + row * 2;
    const h = crystalCavernTrailHeight(north) - .24;
    for (let col = 0; col < 17; col++) {
      const east = basin.minEast + col * 2.28;
      add('water', 'u3/river/cell-' + row + '-' + col,
        east, h - .06 + stable(row * 17 + col, 3) * .012, north,
        2.26, .027, 2.04);
      if ((row + col) % 5 === 0)
        add('shadow', 'u3/river/bed-rock-' + row + '-' + col,
          east, h - .31, north, 1.72, .38, 1.86);
    }
  }
  // R1/2: differentiated 3–7-crystal growth clusters, every crystal leaning
  // by EXACTLY the same +20° (confirmed canonical chapter motif).
  for (let cluster = 0; cluster < 62; cluster++) {
    const n = -4 + (cluster % 31) * 3.58;
    const west = cluster % 2 === 0;
    const walkE = crystalCavernTrailEast(Math.max(1, n));
    const e = walkE + (west ? -1 : 1) * (10 + stable(cluster, 1) * 45);
    if (n > 60 && n < 98 && e >= basin.minEast - 3 && e <= basin.maxEast + 3) continue;
    const h = crystalCavernTrailHeight(n);
    const count = 3 + (cluster % 5);
    const base = 'u3/crystals/' + String(cluster).padStart(2, '0');
    for (let t = 0; t < count; t++) {
      const angle = (t * 2.39996) + cluster * .17;
      const radius = .4 + Math.sqrt(t + 1) * .42;
      const cx = e + Math.cos(angle) * radius;
      const cn = n + Math.sin(angle) * radius;
      const height = .8 + stable(cluster * 11 + t, 5) * 5.3;
      add('shadow', base + '/socket-' + t, cx, h + .10, cn,
        .65, .22, .61);
      // The first visual review showed solid rectangular glowing sticks.
      // Rebuild each growth as three physically narrower tilted segments;
      // taper and offset are consistent with the single approved +20° cant.
      for (const [level, frac, span, scale] of [
        [0,.17,.34,1.00],[1,.51,.36,.72],[2,.84,.30,.42],
      ] as const) {
        const segmentHeight = height * span;
        add('crystal', base + '/spike-' + t + '-tier-' + level,
          // Three.js +Z rotation sends the segment's +Y towards -X.
          // Centre points MUST track that same tilted spine: otherwise the
          // three tier ends float apart despite identical 20° rotations.
          cx - Math.sin(CRYSTAL_CAVERN_CANT_RAD) * height * frac,
          h + Math.cos(CRYSTAL_CAVERN_CANT_RAD) * height * frac + .23, cn,
          (.4 + (t % 3) * .12) * scale, segmentHeight,
          (.42 + (t % 2) * .17) * scale,
          false, CRYSTAL_CAVERN_CANT_RAD);
      }
      add('moss', base + '/growth-moss-' + t,
        cx + .21, h + .07, cn - .20, .38, .09, .24);
      if (t % 3 === 0) {
        // Suspended miner-era molten droplets, frozen inside the mineral. No
        // exotic purple swatches or lore text on the ancient walls.
        add('rust', base + '/frozen-metal-' + t,
          cx + .22, h + height * .53, cn + .05,
          .12, .27, .13);
      }
    }
  }

  // R2: true artificial stacked dry-stone pier with dock side-ramp and three
  // mooring markers. The sculpture uses a DIFFERENT cut from the miner tracks
  // and town buildings; no writing on its ancient lintels.
  for (let stone = 0; stone < 22; stone++) {
    const e = 12.6 + stone * 1.0;
    const n = 76.0;
    const h = crystalCavernTrailHeight(n);
    for (let lane = -2; lane <= 2; lane++) {
      add(lane === -2 || lane === 2 ? 'rock' : 'slate',
        'u3/quay/dry-masonry-' + stone + '-' + lane,
        e, h - .14, n + lane * .87, .96, .25, .82);
      if ((stone + lane) % 4 === 0)
        add('moss', 'u3/quay/lichen-' + stone + '-' + lane,
          e, h - .008, n + lane * .87, .58, .035, .43);
    }
  }
  const quayY = crystalCavernTrailHeight(76);
  for (const pier of [15.5, 24.5, 32.5]) {
    for (let column = 0; column < 7; column++)
      add(column % 3 === 0 ? 'shadow' : 'rock',
        'u3/quay/mooring-' + pier + '-' + column,
        pier, quayY + .1 + column * .36, 73.24,
        .67, .44, .65);
    add('rust', 'u3/quay/metal-rim-' + pier,
      pier, quayY + 2.72, 73.24, .74, .13, .71);
  }
  // R2: an eye-height overlook and quiet rock terrace before the unique mimic
  // vista. No hardcoded spawn entity or fake reward.
  const outlookY = crystalCavernTrailHeight(55);
  for (let i = 0; i < 16; i++) {
    const e = 6.4 + (i % 4) * 2.07;
    const n = 52.5 + Math.floor(i / 4) * 1.73;
    add((i + 1) % 4 === 0 ? 'moss' : 'slate',
      'u3/overlook/terrace-' + i,
      e, outlookY - .13, n, 1.99, .22, 1.68);
  }
  for (let i = 0; i < 13; i++) {
    const north = 51.2 + i * .68;
    const y = outlookY + .83;
    add(i % 3 ? 'rock' : 'shadow', 'u3/overlook/hand-carved-guard-' + i,
      16.0, y, north, .47, 1.55, .57, true);
  }
  // R4: cold light anchors are born from crystal clusters; real light sources
  // are optional, host-budgeted, and remain attached to physical mineral props.
  for (const [i, e, n] of [[0,-21,21],[1,29,40],[2,-30,56],[3,31,74],[4,-23,90],[5,23,103]] as const) {
    const h = crystalCavernTrailHeight(n);
    add('shadow','u3/light/root-'+i,e,h+.15,n,2.1,.35,1.9);
    for(let point=0;point<7;point++){
      const theta=point*2.39996;
      const tall=2.7+point*.38;
      add('crystal','u3/light/attached-'+i+'-'+point,
        e+Math.cos(theta)*.77+tall*.17,h+tall/2+.32,
        n+Math.sin(theta)*.77,.39,tall,.46,false,CRYSTAL_CAVERN_CANT_RAD);
    }
  }
}
makeCavern();
export const crystalCavernArchitecture = Object.freeze({
  pieces: Object.freeze(objects),
  numbers: Object.freeze({
    cuboids: objects.length,
    clusters: 62,
    riverCells: objects.filter(part => part.name.startsWith('u3/river/cell-')).length,
    quayBlocks: objects.filter(part => part.name.startsWith('u3/quay/')).length,
    trailBlocks: objects.filter(part => part.name.startsWith('u3/trail/')).length,
    structuralColliders: objects.filter(part => part.solid).length,
  }),
});

const colors: Readonly<Record<Family, number>> = {
  rock: 0x8a8378, shadow: 0x2c3648, slate: 0x5d4630, timber: 0xa98a56,
  rust: 0x8a4a34, moss: 0x44503c, crystal: 0x7fd4c8, water: 0x2c3648,
};
const accent: Readonly<Record<Family, number>> = {
  ...colors, rock: 0x5d4630, shadow: 0x8a8378, slate: 0x8a8378,
  timber: 0x5d4630, rust: 0x5d4630, crystal: 0xe8ecf0, water: 0x7fd4c8,
};
function texture(family: Family) {
  const bytes = new Uint8Array(16 * 16 * 4);
  const primary = colors[family], second = accent[family];
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){
    const speck=(x*17+y*31+(x*y)%23)%37;
    const c=x===0||x===15||y===0||y===15||speck<4 ? second : primary;
    bytes.set([c>>16,(c>>8)&255,c&255,255],(y*16+x)*4);
  }
  const t=new DataTexture(bytes,16,16);
  t.minFilter=t.magFilter=NearestFilter;
  t.generateMipmaps=false;
  t.colorSpace=SRGBColorSpace;
  t.needsUpdate=true;
  return t;
}
type Options=Readonly<{
  parent: Group;
  frame?: CrystalCavernFrame;
  /** Host certifies this independent -140 layer volume and both transition feet. */
  acceptsCavern(frame: CrystalCavernFrame, plan: typeof crystalCavernPlan): boolean;
  supportsFoot(point: CrystalCavernPoint): boolean;
  acceptsCollider(box: Readonly<{ name: string; min: Local; max: Local }>): boolean;
  readLightBudget(): number;
}>;
export function mountUndergroundCrystalCavern(host: Options) {
  const frame=host.frame;
  if(!frame || !frame.domainId.trim() || ![frame.east,frame.north,frame.height,frame.yaw].every(Number.isFinite))
    return {kind:'unregistered'} as const;
  if(host.acceptsCavern(frame,crystalCavernPlan)!==true)
    return {kind:'unsupported-cavern'} as const;
  const getWorld=(p:Local)=>crystalCavernToWorld(frame,p);
  const waypoints=[
    crystalCavernPlan.entry,crystalCavernPlan.overlook,crystalCavernPlan.quay,crystalCavernPlan.exit,
  ];
  for(const w of waypoints){
    if(!host.supportsFoot(getWorld([w.east,w.height,w.north])))
      return {kind:'unsupported-foot'} as const;
  }
  const solids=crystalCavernArchitecture.pieces.filter(p=>p.solid);
  const colliders=solids.map(p=>{
    const [x,y,n]=p.center,[w,h,d]=p.size;
    const corners=[
      getWorld([x-w/2,y-h/2,n-d/2]),getWorld([x-w/2,y-h/2,n+d/2]),
      getWorld([x+w/2,y+h/2,n-d/2]),getWorld([x+w/2,y+h/2,n+d/2]),
    ];
    const min:Local=[
      Math.min(...corners.map(q=>q.east)),Math.min(...corners.map(q=>q.height)),
      Math.min(...corners.map(q=>-q.north))];
    const max:Local=[
      Math.max(...corners.map(q=>q.east)),Math.max(...corners.map(q=>q.height)),
      Math.max(...corners.map(q=>-q.north))];
    return {name:p.name,min,max};
  });
  if(colliders.some(box=>host.acceptsCollider(box)!==true))
    return {kind:'unsupported-collider'} as const;
  const root=new Group();
  root.name='u3-certified-crystal-cavern-'+frame.domainId;
  root.position.set(frame.east,frame.height,-frame.north);
  root.rotation.y=frame.yaw;
  const blocks=new Map<Family,Matrix4[]>();
  const temp=new Object3D();
  for(const b of crystalCavernArchitecture.pieces) {
    temp.position.set(b.center[0],b.center[1],-b.center[2]);
    temp.scale.set(...b.size);
    temp.rotation.set(0,0,b.rotationZ);
    temp.updateMatrix();
    const batch=blocks.get(b.family)??[];
    batch.push(temp.matrix.clone());
    blocks.set(b.family,batch);
  }
  const geo=new BoxGeometry();
  const meshes:InstancedMesh[]=[];
  const maps:DataTexture[]=[];
  const mats:MeshStandardMaterial[]=[];
  for(const [family,matrices] of blocks) {
    const t=texture(family);
    const luminous=family==='crystal';
    const m=new MeshStandardMaterial({
      map:t,roughness:family==='water'?.30:.95,
      metalness:family==='rust'?.12:0,
      flatShading:true,
      ...(family==='water'?{transparent:true,opacity:.62,depthWrite:false}:{}),
      ...(luminous?{emissive:0x7fd4c8,emissiveIntensity:.23}:{}),
    });
    const batch=new InstancedMesh(geo,m,matrices.length);
    batch.name='u3-crystal-cavern/'+family;
    matrices.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));
    batch.instanceMatrix.needsUpdate=true;
    batch.computeBoundingSphere();
    root.add(batch);
    meshes.push(batch);maps.push(t);mats.push(m);
  }
  const lights:PointLight[]=[];
  for(const [e,n] of [[-21,21],[29,40],[-30,56],[31,74],[-23,90],[23,103]]) {
    const lamp=new PointLight(0x7fd4c8,1.4,8,2);
    lamp.name='u3-attached-certified-cold-crystal';
    lamp.position.set(e,crystalCavernTrailHeight(n)+3.6,-n);
    lamp.visible=false;
    root.add(lamp);lights.push(lamp);
  }
  host.parent.add(root);
  let disposed=false;
  const isClearLocal=(foot:Local,radius=.27,height=1.8)=>{
    if(![...foot,radius,height].every(Number.isFinite)||radius<=0||height<=0)return false;
    return !solids.some(p=>{
      const [e,y,n]=p.center,[w,h,d]=p.size;
      if(y+h/2<=foot[1]+.025||y-h/2>=foot[1]+height)return false;
      const de=Math.max(0,Math.abs(foot[0]-e)-w/2), dn=Math.max(0,Math.abs(foot[2]-n)-d/2);
      return Math.hypot(de,dn)<radius;
    });
  };
  const sync=()=>{
    if(disposed)return false;
    const n=host.readLightBudget();
    const visible=Number.isFinite(n)?Math.max(0,Math.min(lights.length,Math.floor(n))):0;
    lights.forEach((lamp,i)=>{lamp.visible=i<visible});
    return true;
  };
  sync();
  return {
    kind:'ready',group:root,
    plan:crystalCavernPlan,architecture:crystalCavernArchitecture.numbers,
    meshes,lights,colliders,toWorld:getWorld,isClearLocal,sync,
    dispose(){
      if(disposed)return;
      disposed=true;
      root.removeFromParent();
      meshes.forEach(m=>m.dispose());
      mats.forEach(m=>m.dispose());
      maps.forEach(m=>m.dispose());
      geo.dispose();
      root.clear();
    },
  } as const;
}
