import {
  BoxGeometry, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry,
  Mesh, MeshLambertMaterial, MeshStandardMaterial, OctahedronGeometry, PointLight, Quaternion, Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = readonly [number, number, number];
const up = new Vector3(0, 1, 0);
const turn = Math.PI * 2;
const railRadius = 5.75;
const guardianPoint: Point = [10, 0, 8];
const watchPoints:readonly Point[]=[[-4.5,0,-24.2],[4.5,0,-24.2],[-8.0,0,43.5]];
const sandstone = '#c4c8b3';
const shadedStone = '#8c988b';
const capstone = '#e0dec3';
const copper = '#927547';
const bark = '#66503b';
const darkBark = '#493c30';
const lightBark = '#816342';
const lichen = '#99a564';
const foliage = ['#3c6654', '#548064', '#6f9360', '#83a766', '#aac080'] as const;
const olive = '#728761';

const radial = (radius: number, angle: number, height: number): Point =>
  [Math.cos(angle) * radius, height, Math.sin(angle) * radius];

function createSculpture() {
  const layers = new Map<string, BufferGeometry[]>();

  function add(geometry: BufferGeometry, center: Point, color: string) {
    geometry.translate(...center);
    const collection = layers.get(color);
    if (collection) collection.push(geometry);
    else layers.set(color, [geometry]);
  }

  function panel(center: Point, size: Point, color: string, yaw = 0) {
    add(new BoxGeometry(...size).rotateY(yaw), center, color);
  }

  function fragment(center: Point, size: Point, color: string, yaw = 0, stone = false) {
    const geometry = stone ? new DodecahedronGeometry(1, 0) : new IcosahedronGeometry(1, 0);
    add(geometry.scale(...size).rotateY(yaw), center, color);
  }

  function branch(from: Point, to: Point, base: number, tip: number, color: string, sides = 7) {
    const beginning = new Vector3(...from);
    const ending = new Vector3(...to);
    const axis = new Vector3().subVectors(ending, beginning);
    const rotation = new Quaternion().setFromUnitVectors(up, axis.clone().normalize());
    const geometry = new CylinderGeometry(tip, base, axis.length(), sides, 1, false)
      .applyQuaternion(rotation);
    add(geometry, beginning.lerp(ending, .5).toArray(), color);
  }

  function finish(owner: Group, name: string) {
    for (const [color, geometries] of layers) {
      // Standardize the index state so angular rubble and square masonry batch together.
      const parts = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
      const geometry = mergeGeometries(parts);
      if (!geometry) throw new Error(`Couldn't batch ${name} (${color})`);
      const mesh = new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true }));
      mesh.name = name;
      owner.add(mesh);
      for (const part of parts) part.dispose();
      for (const source of geometries) if (source.index) source.dispose();
    }
  }

  return { panel, fragment, branch, finish };
}

function buildRing(owner: Group) {
  const stone = createSculpture();
  const count = 32;
  for (let i = 0; i < count; i++) {
    const angle = i / count * turn;
    const yaw = Math.PI / 2 - angle;
    stone.panel(radial(railRadius, angle, .065), [1.17, .13, .96], i % 4 === 0 ? capstone : sandstone, yaw);
    stone.panel(radial(railRadius - .13, angle, .19), [1.12, .24, .33], shadedStone, yaw);
    stone.panel(radial(railRadius - .13, angle, .89), [1.135, .15, .36], capstone, yaw);
    if (i % 2 === 0) {
      stone.panel(radial(railRadius - .13, angle, .56), [.25, .69, .32], sandstone, yaw);
      stone.panel(radial(railRadius - .13, angle, 1.01), [.33, .1, .41], shadedStone, yaw);
    } else {
      stone.panel(radial(railRadius - .14, angle, .54), [.15, .62, .19], sandstone, yaw - Math.PI / 4);
    }
    if (i % 4 === 1 || i % 7 === 2) {
      stone.fragment(radial(railRadius + .34, angle, .11), [.34, .17, .27], olive, yaw);
    }
  }
  stone.finish(owner, 'sky-city-root-vault-rail');
}

const crownBoughs: readonly { shoulder: Point; tip: Point; spread: number }[] = [
  { shoulder: [-.4, 8.5, .1], tip: [-5.5, 12.3, -3.2], spread: 2.6 },
  { shoulder: [.5, 9.8, -.4], tip: [4.8, 12.9, -4.4], spread: 2.4 },
  { shoulder: [1.1, 10.1, .1], tip: [6.2, 11.8, 2.5], spread: 2.45 },
  { shoulder: [.3, 10.2, .6], tip: [.3, 13.6, 5.3], spread: 2.5 },
  { shoulder: [-.3, 10.8, .8], tip: [-4.6, 14.2, 3.8], spread: 2.28 },
  { shoulder: [-.85, 11.4, -.1], tip: [-1.5, 15.7, -3], spread: 2.56 },
  { shoulder: [.4, 12, -.35], tip: [2, 16.6, -.55], spread: 2.35 },
  { shoulder: [-.2, 12.9, .1], tip: [-2.1, 16.85, 1.3], spread: 1.95 },
];

function buildTree(owner: Group) {
  const living = createSculpture();
  const leaves = createSculpture();
  const crown = new Group(); crown.name = 'sky-city-crown-opening-axis'; crown.position.y = 12;
  const roots = createSculpture();
  for (let i = 0; i < 8; i++) {
    const a = .18 + i * turn / 8;
    const foot = radial(7.4 - (i % 3) * .32, a, .02);
    const slope = radial(5.38, a + .11 * (i % 2 ? 1 : -1), .12);
    const shoulder = radial(3.84, a, 2.04 + (i % 3) * .22);
    const inner = radial(1.27, a - .27, 5.77 + i % 2 * .63);
    living.branch(foot, slope, .08, .39, lightBark);
    living.branch(slope, shoulder, .45, .62, bark);
    living.branch(shoulder, inner, .62, .97, i % 2 ? bark : darkBark);
    living.fragment(slope, [.46, .47, .42], bark, a);
    living.fragment(shoulder, [.61, .53, .6], darkBark, a);
    living.branch(inner, [-.44, 9.63, .27], .97, 1.1, bark);

    const hanging = radial(2.81 + i % 3 * .24, a - .18, -2.75 - i % 2 * .47);
    const strand = radial(1.85 + i % 2 * .31, a + .13, -5.3 - i % 3 * .44);
    living.branch(slope, hanging, .25, .19, darkBark);
    living.branch(hanging, strand, .19, .045, lightBark);
    roots.branch(hanging, strand, .035, .008, '#9fdac2', 5);
    living.branch(shoulder, radial(4.42, a + .19, .64), .16, .06, lightBark, 5);
    living.fragment(radial(6.64 - i % 2 * .14, a + .09, .14), [.52, .30, .39], lichen, a);
  }
  living.branch([-.44, 9.63, .27], [.14, 13.25, .23], 1.29, .70, darkBark, 9);
  living.fragment([-.34, 9.85, .22], [1.41, 1.92, 1.28], bark, .25);
  for (const [index, { shoulder, tip, spread }] of crownBoughs.entries()) {
    const [x, y, z] = tip;
    const elbow: Point = [x * .66, Math.max(y - 1.2, shoulder[1]) - .37, z * .62];
    living.branch(shoulder, elbow, .67 - index * .035, .32, index % 2 ? lightBark : bark);
    living.branch(elbow, tip, .33, .12, lightBark);
    leaves.fragment([tip[0],tip[1]-12,tip[2]], [spread, spread * .66, spread * .93], foliage[index % 4]!, index, true);
    for (let twig = 0; twig < 6; twig++) {
      const angle = twig * turn / 6 + index * .67;
      const end: Point = [x + Math.cos(angle) * spread * .86, y + Math.sin(twig * 2.4) * .83,
        z + Math.sin(angle) * spread * .78];
      const tuft = .76 + (twig + index * 2) % 5 * .13;
      if (twig % 2 === 0) living.branch(elbow, end, .12, .037, lightBark, 5);
      leaves.fragment([end[0],end[1]-12,end[2]], [tuft * 1.35, tuft, tuft * 1.30], foliage[(twig + index * 2) % foliage.length]!, angle);
    }
  }
  living.finish(owner, 'sky-city-ancient-tree');
  leaves.finish(crown, 'sky-city-crown-leaves'); owner.add(crown);
  const rootGlow = new Group(); rootGlow.name='sky-city-root-pulse'; roots.finish(rootGlow,'sky-city-root-vein');
  rootGlow.traverse(object=>{ if(object instanceof Mesh && object.material instanceof MeshLambertMaterial){
    object.material.emissive.set('#94dac3'); object.material.emissiveIntensity=.05;
  }}); owner.add(rootGlow);
  const petals = new Group(); petals.name='sky-city-falling-petals-reserved'; owner.add(petals);
  const warm = new PointLight('#efb578',9,15,2); warm.position.set(0,8,0); owner.add(warm);
  crown.scale.set(.69,.78,.69); petals.visible=false; warm.visible=false;
  return {crown,rootGlow,petals,warm};
}

function buildCrystal(owner: Group) {
  const crystal = new Group();
  crystal.name = 'sky-city-stardust-crystal';
  crystal.position.y = .18;
  owner.add(crystal);
  const inner = new Mesh(
    new OctahedronGeometry(1, 0).scale(1.42, 4.02, 1.37),
    new MeshStandardMaterial({
      color: '#43cdbd', emissive: '#389c93', emissiveIntensity: .60,
      metalness: .13, roughness: .26, flatShading: true,
    }),
  );
  const facets = new Color();
  const vertexColors: number[] = [];
  const bands = ['#d1fbe0', '#91efce', '#66bbbd', '#75a7b8', '#aff2cf', '#64cbb9', '#46899e', '#94e4d0'];
  const vertexCount = inner.geometry.getAttribute('position').count;
  for (let i = 0; i < vertexCount; i++) {
    facets.set(bands[Math.floor(i / 3) % bands.length]!);
    vertexColors.push(facets.r, facets.g, facets.b);
  }
  inner.geometry.setAttribute('color', new Float32BufferAttribute(vertexColors, 3));
  inner.material.vertexColors = true;
  inner.material.color.set('#ffffff');
  crystal.add(inner);
  const rind = new Mesh(
    new OctahedronGeometry(1, 0).scale(1.62, 4.36, 1.54),
    new MeshStandardMaterial({ color: '#a8f9db', emissive: '#43ac9e', emissiveIntensity: .35,
      transparent: true, opacity: .17, depthWrite: false, side: DoubleSide, roughness: .25 }),
  );
  crystal.add(rind);
  const smaller = createSculpture();
  for (const [angle, y, radius] of [[.7, -.5, 1.72], [2.78, .3, 1.69], [4.01, -1.4, 1.89], [5.2, 1.42, 1.31]] as const) {
    smaller.fragment(radial(radius, angle, y), [.25, .62, .27], angle > 4 ? '#8ce8c3' : '#5ccbbb', angle);
  }
  smaller.finish(crystal, 'sky-city-crystal-satellites');
  return crystal;
}

function buildGuardian(owner: Group) {
  const guardian = new Group();
  guardian.name = 'sky-city-guardian-with-nest';
  guardian.position.set(...guardianPoint);
  guardian.rotation.y = .43;
  const rock = createSculpture();
  const darkSlab = '#68776d', skin = '#a6ae9c', weathered = '#b7bfaa';
  const eye = '#50695d', seed = '#e8e0b5', nest = '#87734c';
  for (const side of [-1, 1]) {
    const x = side * .34;
    rock.panel([x, .15, .12], [.48, .29, .71], darkSlab, side * .08);
    rock.fragment([x, .77, -.06], [.27, .64, .30], skin, side * .3, true);
    rock.panel([x, .57, .17], [.30, .37, .17], weathered, side * .12);
    rock.fragment([x, 1.07, .06], [.28, .26, .26], darkSlab, .35, true);
    const shoulder: Point = [side * .85, 2.05, 0];
    const arm: Point = [side * 1.07, 1.48, .08 + side * .12];
    const hand: Point = [side * .92, 1.14, .36 + side * .16];
    rock.fragment(shoulder, [.38, .33, .35], weathered, .55, true);
    rock.branch(shoulder, arm, .22, .17, skin, 5);
    rock.fragment(arm, [.20, .22, .18], darkSlab, .31);
    rock.branch(arm, hand, .18, .14, weathered, 5);
    rock.panel(hand, [.21, .24, .19], skin, side * .12);
  }
  rock.fragment([0, 1.83, -.02], [.76, .83, .42], skin, .21, true);
  rock.panel([0, 1.93, .35], [.72, .63, .19], weathered);
  rock.panel([0, 1.96, .46], [.345, .28, .041], darkSlab);
  rock.panel([0, 1.96, .49], [.19, .13, .039], copper);
  rock.fragment([0, 2.74, .005], [.47, .45, .42], weathered, .08, true);
  rock.panel([0, 2.71, .34], [.58, .25, .12], darkSlab);
  rock.panel([-.15, 2.73, .407], [.135, .068, .027], eye);
  rock.panel([.15, 2.73, .407], [.135, .068, .027], eye);
  rock.panel([0, 2.53, .32], [.22, .037, .065], skin);
  for (const [x, y, z, yaw] of [[-.63, 1.71, .25, 1], [.49, 1.54, .23, 3], [-.3, .17, .41, .7], [.2, 2.97, -.11, 2]] as const) {
    rock.fragment([x, y, z], [.18, .08, .17], olive, yaw);
  }
  for (let i = 0; i < 12; i++) {
    const angle = i * turn / 12;
    const adjacent = angle + .65;
    const nestPoint = (a: number, radius: number, y: number): Point =>
      [.91 + Math.cos(a) * radius, y, Math.sin(a) * radius];
    rock.branch(nestPoint(angle, .24, 2.37), nestPoint(adjacent, .24, 2.34),
      .032, .027, i % 2 ? nest : copper, 5);
    rock.branch(nestPoint(angle, .13, 2.29), nestPoint(adjacent, .22, 2.39), .030, .021, nest, 5);
  }
  rock.fragment([.88, 2.36, .025], [.055, .089, .054], seed, -.22);
  rock.fragment([1.00, 2.36, -.05], [.057, .079, .056], '#b1d3bd', .35);
  rock.finish(guardian, 'sky-city-guardian-stonework');
  // The flower stays in the same hand in the empty city; later animation
  // can move this attachment point without creating a second statue.
  const flower=new Group(); flower.name='sky-city-guardian-flower-hand'; flower.position.set(.94,1.16,.60);
  const stem=new Mesh(new CylinderGeometry(.018,.024,.37,5),new MeshLambertMaterial({color:'#648658'}));
  stem.position.y=.15; flower.add(stem);
  const petalMaterial=new MeshLambertMaterial({color:'#efd6a4'});
  for(let i=0;i<5;i++){
    const petal=new Mesh(new IcosahedronGeometry(.085,0),petalMaterial);
    petal.position.set(Math.cos(i*turn/5)*.075,.35,Math.sin(i*turn/5)*.075);flower.add(petal);
  }
  guardian.add(flower); owner.add(guardian);
  guardian.userData.patrolRoute=[[10,0,8],[13,0,8],[15,0,1],[10,0,-4]];
  return guardian;
}

/** Standalone tree, suspended crystal and guardian for the modelled sky city. */
export function buildSkyCityTree() {
  const group = new Group();
  group.name = 'sky-city-tree-court';
  buildRing(group);
  const tree = buildTree(group);
  const guardian = buildGuardian(group);
  for(const [i,point]of watchPoints.entries()){
    const watcher=guardian.clone(true);watcher.name=i===2?'sky-city-arrival-sentinel':'sky-city-star-terrace-guard-'+i;
    watcher.position.set(...point);watcher.rotation.y=i===2?0:Math.PI;
    watcher.getObjectByName('sky-city-guardian-flower-hand')?.removeFromParent();
    watcher.userData.patrolRoute=[];group.add(watcher);
  }
  const crystal = buildCrystal(group);
  const crystalMaterials:MeshStandardMaterial[]=[];
  crystal.traverse(object=>{if(object instanceof Mesh&&object.material instanceof MeshStandardMaterial)crystalMaterials.push(object.material)});
  let dream=false;
  function setDreamPresentation(active:boolean){
    dream=active;
    tree.crown.scale.set(active?1:.69,active?1:.78,active?1:.69);
    tree.petals.visible=active;tree.warm.visible=active;
    crystalMaterials.forEach(m=>m.emissiveIntensity=active?.60:.14);
    if(!active){crystal.rotation.y=0;crystal.position.y=.18;
      tree.rootGlow.traverse(object=>{if(object instanceof Mesh&&object.material instanceof MeshLambertMaterial)object.material.emissiveIntensity=.05});}
  }
  setDreamPresentation(false);

  return {
    group, guardian, setDreamPresentation,
    update(seconds: number) {
      if(!dream)return;
      crystal.rotation.y = seconds * .36;
      crystal.position.y = .18 + Math.sin(seconds * 1.07) * .15;
      crystalMaterials.forEach(m=>m.emissiveIntensity=.46+Math.sin(seconds*1.5)*.14);
      tree.rootGlow.traverse(object=>{if(object instanceof Mesh&&object.material instanceof MeshLambertMaterial)
        object.material.emissiveIntensity=.30+Math.sin(seconds*1.5)*.15});
    },
    blocked(x: number, z: number, feet: number, radius: number) {
      const insideRing = feet < 1.03 && feet > -8 && Math.hypot(x, z) < railRadius + radius;
      const atGuardian = feet < 3.2 && feet > -1.8 &&
        [guardianPoint,...watchPoints].some(point=>Math.hypot(x-point[0],z-point[2]) < .95 + radius);
      return insideRing || atGuardian;
    },
  };
}
